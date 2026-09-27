/**
 * 精修系统 Controller
 */
import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RefinementTemplatesService, templateStandardContext } from './refinement-templates.service';
import { DeAiEngineService } from './de-ai-engine.service';
import { DescribePolishService } from './describe-polish.service';
import type { PolishLlmGenerate } from './describe-polish.service';
import { QualityInspectionService } from './quality-inspection.service';
import { SpellCheckService } from './spell-check.service';
import { SensitiveWordService } from './sensitive-word.service';
import { CopyrightCheckService } from './copyright-check.service';
import { ExportService } from './export.service';
import { ScriptExportService } from './script-export.service';
import { SocialExportService } from './social-export.service';
import { RealLLMService } from '../../chain/real-llm.service';
import { DatabaseService } from '../../database/database.service';
import { projectStandardBlock, resolveProjectStandardDirective } from '../project/creative-constitution';
import {
  GetTemplatesQueryDto,
  ApplyTemplateDto,
  DeAIDetectDto,
  DeAIPolishDto,
  DescribePolishDto,
  QualityInspectDto,
  SpellCheckDto,
  BatchFixDto,
  SensitiveCheckDto,
  SensitiveReplaceDto,
  CopyrightCheckDto,
  ExportDto,
  ScriptExportDto,
  SocialAdaptDto,
} from './dto/refinement.dto';

@ApiTags('refinement')
@Controller('refinement')
export class RefinementController {
  constructor(
    private readonly templatesService: RefinementTemplatesService,
    private readonly deAiEngine: DeAiEngineService,
    private readonly describePolish: DescribePolishService,
    private readonly qualityInspection: QualityInspectionService,
    private readonly spellCheck: SpellCheckService,
    private readonly sensitiveWord: SensitiveWordService,
    private readonly copyrightCheck: CopyrightCheckService,
    private readonly exportService: ExportService,
    private readonly scriptExport: ScriptExportService,
    private readonly socialExport: SocialExportService,
    private readonly realLLM: RealLLMService,
    private readonly db: DatabaseService,
  ) {}

  // ─── 精修模板 ───

  @Get('templates')
  getTemplates(@Query() query: GetTemplatesQueryDto) {
    // 带 projectId = 按该项目的执行标准标注适用性；不带 = 只给清单（界面不得据此直接执行）。
    // 适用性必须由服务端判定：模板能否执行取决于项目卡片上的平台/分类/基调/文风/流派/视角。
    if (query.projectId) {
      const standard = resolveProjectStandardDirective(this.db.getDb(), query.projectId);
      return this.templatesService.annotateForStandard(templateStandardContext(standard), query.category);
    }
    return this.templatesService.findAll(query.category);
  }

  @Get('templates/categories')
  getTemplateCategories() {
    return this.templatesService.getCategories();
  }

  @Get('templates/:id')
  getTemplate(@Param('id') id: string) {
    const template = this.templatesService.findById(id);
    if (!template) return { error: `Template "${id}" not found` };
    return template;
  }

  /**
   * 应用精修模板：标准驱动。
   *
   * 旧实现是纯正则替换（还会把「地方」拆成「方」），且与项目执行标准无关。
   * 现在：先解析执行标准（缺 projectId → 400 / 项目不存在 → 404 / 六维缺 → 422），
   * 再做模板适用性判定（与标准冲突 → 422），最后分块走 DescribePolishService.polishBlock。
   */
  @Post('templates/apply')
  async applyTemplate(@Body() dto: ApplyTemplateDto) {
    const standard = resolveProjectStandardDirective(this.db.getDb(), dto.projectId ?? '');
    const options = (dto.options ?? {}) as { chunkChars?: number; concurrency?: number };
    return this.templatesService.applyWithStandard(
      {
        templateId: dto.templateId,
        content: dto.content,
        standard: templateStandardContext(standard),
        chunkChars: options.chunkChars,
        concurrency: options.concurrency,
      },
      this.polishLlm(dto.projectId),
    );
  }

  /** 二次加工入口共用的模型调用装配（场景/记账口径一致）。 */
  private polishLlm(projectId: string): PolishLlmGenerate {
    return async (prompt: string, temperature: number, maxTokens?: number) => {
      const resp = await this.realLLM.generate({
        prompt,
        metrics: { projectId, stepKey: 'refinement' },
        scenario: 'refinement',
        // 本工厂的三个入口（模板分块改写 / 局部降 AI 改写 / 逐句精修）输入输出都是片段而不是整章：
        // 必须声明 segment，否则 22–47 字片段会被套整章口径（3000–5000 字、对话占比 30%–55%、
        // 开篇 500 字字位、章尾留钩）并据此把整条调用阻断（实证：三条 refinement 记录全部 failed）。
        // 整章口径仍在 stage='chapter' 的整章 Gate 上逐条执行，此处不降低任何严重度。
        evaluationUnit: 'segment',
        temperature,
        maxTokens: maxTokens ?? 1200,
      });
      return resp?.content || '';
    };
  }

  // ─── 去AI味 ───

  @Post('de-ai/detect')
  detectAi(@Body() dto: DeAIDetectDto): any {
    return this.deAiEngine.detect(dto.content);
  }

  @Post('de-ai/polish')
  polishDeAi(@Body() dto: DeAIPolishDto) {
    return this.deAiEngine.polish(dto.content, dto.intensity, dto.focusTags);
  }

  /**
   * LLM驱动的局部降AI改写
   * 先用detect找到AI特征段落，然后只改写问题段落+上下文各100字
   * 不改动全文结构，只做局部精修
   */
  @Post('de-ai/llm-rewrite')
  async llmRewriteDeAi(@Body() dto: { content: string; maxRewrites?: number; projectId?: string }) {
    // 执行标准先解析、后执行：缺 projectId → 400，项目不存在 → 404，六维未齐备 → 422。
    // 这个端点会直接改写正文，必须与主生成链共用同一份「平台/分类/基调/文风/流派/视角」标准，
    // 不得因为它只是一个工具按钮，就退化成通用的降AI词表（那是「配置是配置、怎么做是另一回事」的老毛病）。
    const standard = resolveProjectStandardDirective(this.db.getDb(), dto.projectId ?? '');
    if (!dto.content || dto.content.length < 100) {
      return { result: dto.content || '', changes: [] };
    }
    // 标准块拼装同样只有一份实现：与逐句精修、模板批量改写共用 projectStandardBlock。
    const standardBlock = projectStandardBlock(standard);
    const rewriteLlm = this.polishLlm(dto.projectId ?? '');
    const llmGenerate = async (prompt: string): Promise<string> => rewriteLlm(prompt, 0.6, 2000);
    return this.deAiEngine.llmLocalRewrite(dto.content, llmGenerate, dto.maxRewrites || 3, standardBlock);
  }

  // ─── Describe逐句精修 ───

  @Get('describe/styles')
  getDescribeStyles(@Query('projectId') projectId?: string): any {
    // 方向清单来自唯一来源，但必须连同「这个项目在哪个平台、什么文风/视角下执行」一起返回：
    // 旧实现返回的是一份与项目无关的通用菜单，作者无从判断结果是否对得上项目卡片。
    const standard = resolveProjectStandardDirective(this.db.getDb(), projectId ?? '');
    return {
      projectId,
      platform: standard.platformLabel,
      category: standard.constitution.category,
      categoryPlacement: standard.categoryPlacement,
      writingStyle: standard.constitution.writingStyle,
      storyTone: standard.constitution.storyTone,
      webNovelGenre: standard.constitution.webNovelGenre,
      pov: standard.constitution.pov,
      styleTags: standard.styleTags,
      isLong: standard.isLong,
      styles: this.describePolish.getStyles(),
    };
  }

  @Post('describe/polish')
  async describePolishSentence(@Body() dto: DescribePolishDto) {
    // 逐句精修会直接改句子，必须先解析执行标准；缺 projectId → 400，六维未齐备 → 422。
    const standard = resolveProjectStandardDirective(this.db.getDb(), dto.projectId ?? '');
    return this.describePolish.polish(
      {
        sentence: dto.sentence,
        standardBlock: projectStandardBlock(standard),
        platformLabel: standard.platformLabel,
        writingStyle: String(standard.constitution.writingStyle ?? ''),
        pov: String(standard.constitution.pov ?? ''),
        styleTags: standard.styleTags,
        context: dto.context,
        axes: dto.styles,
        variants: dto.variants,
      },
      this.polishLlm(dto.projectId),
    );
  }

  // ─── AI质检 ───

  @Post('quality/inspect')
  inspect(@Body() dto: QualityInspectDto) {
    return this.qualityInspection.inspect(dto.content, dto.context);
  }

  @Post('quality/logic')
  checkLogic(@Body() dto: QualityInspectDto) {
    return { status: 'not_evaluated', reason: '尚未完成有证据的上下文语义评审', issues: this.qualityInspection.checkLogic(dto.content, dto.context) };
  }

  @Post('quality/character-drift')
  checkCharacterDrift(@Body() dto: QualityInspectDto) {
    return { status: 'not_evaluated', reason: '尚未完成有证据的上下文语义评审', issues: this.qualityInspection.checkCharacterDrift(dto.content, dto.context) };
  }

  @Post('quality/foreshadowing')
  checkForeshadowing(@Body() dto: QualityInspectDto) {
    return { status: 'not_evaluated', reason: '尚未完成有证据的上下文语义评审', issues: this.qualityInspection.checkForeshadowing(dto.content, dto.context) };
  }

  // ─── 错别字/语法检查 ───

  @Post('spell-check/check')
  checkSpell(@Body() dto: SpellCheckDto) {
    return {
      errors: this.spellCheck.check(dto.content, dto.mode),
      totalErrors: this.spellCheck.check(dto.content, dto.mode).length,
    };
  }

  @Post('spell-check/auto-fix')
  autoFix(@Body() dto: SpellCheckDto) {
    return this.spellCheck.autoFix(dto.content);
  }

  @Post('spell-check/batch-fix')
  batchFix(@Body() dto: SpellCheckDto & BatchFixDto) {
    const result = this.spellCheck.batchFix(dto.content, dto.errors);
    return { original: dto.content, result, fixes: dto.errors.length };
  }

  // ─── 敏感词检测 ───

  @Get('sensitive/categories')
  getSensitiveCategories() {
    return this.sensitiveWord.getCategories();
  }

  @Post('sensitive/check')
  checkSensitive(@Body() dto: SensitiveCheckDto) {
    return this.sensitiveWord.check(dto.content, dto.level, dto.categories);
  }

  @Post('sensitive/process')
  processSensitive(@Body() dto: SensitiveReplaceDto) {
    return this.sensitiveWord.processContent(dto.content, dto.strategy);
  }

  @Post('sensitive/ai-context')
  aiContextCheck(@Body() body: { content: string; word: string }) {
    return this.sensitiveWord.aiContextCheck(body.content, body.word);
  }

  @Post('sensitive/replacement-history')
  getReplacementHistory(@Body() body: { limit?: number }) {
    return { history: this.sensitiveWord.getReplacementHistory(body.limit) };
  }

  @Post('sensitive/undo-last')
  undoLastReplacement() {
    const result = this.sensitiveWord.undoLastReplacement();
    if (!result) {
      return { original: null, success: false, message: '没有可撤销的替换记录' };
    }
    return result;
  }

  // ─── 版权检测 ───

  @Post('copyright/check')
  checkCopyright(@Body() dto: CopyrightCheckDto): any {
    return this.copyrightCheck.checkFull(dto.content, dto.title, dto.characterNames);
  }

  @Post('copyright/check-title')
  checkTitle(@Body() body: { title: string }) {
    return this.copyrightCheck.checkTitle(body.title);
  }

  @Post('copyright/check-characters')
  checkCharacters(@Body() body: { characterNames: string[] }) {
    return this.copyrightCheck.checkCharacters(body.characterNames);
  }

  @Get('copyright/platform-search')
  platformSearch(@Query('q') query: string, @Query('type') type: string) {
    if (!query || query.length === 0) {
      return { platforms: this.copyrightCheck.getPlatforms() };
    }
    switch (type) {
      case 'platform':
        return { results: this.copyrightCheck.searchByPlatform(query) };
      case 'keyword':
        return { results: this.copyrightCheck.searchByKeyword(query) };
      case 'character':
        return { results: this.copyrightCheck.searchByCharacter(query) };
      default:
        // 智能搜索：尝试匹配关键词和角色名
        const byKeyword = this.copyrightCheck.searchByKeyword(query);
        const byCharacter = this.copyrightCheck.searchByCharacter(query);
        return { results: [...byKeyword, ...byCharacter.map((r) => r.work)] };
    }
  }

  // ─── 多格式导出 ───

  @Get('export/formats')
  getExportFormats() {
    return this.exportService.getSupportedFormats();
  }

  @Post('export')
  export(@Body() dto: ExportDto) {
    return this.exportService.export(dto.content, dto.format, dto.options);
  }

  // ─── 短剧/分镜输出 ───

  @Post('script/convert')
  convertToScript(@Body() dto: ScriptExportDto) {
    const mode = dto.mode || 'script';
    const { scenes, rawScript } = this.scriptExport.convertToScript(dto.content, dto.options);

    if (mode === 'script') {
      return { mode, scenes, rawScript };
    }

    const storyboard = this.scriptExport.generateStoryboard(scenes, dto.options);
    const storyboardTable = this.scriptExport.formatStoryboardTable(storyboard);

    if (mode === 'storyboard') {
      return { mode, storyboard, storyboardTable };
    }

    return { mode, scenes, rawScript, storyboard, storyboardTable };
  }

  @Post('script/storyboard')
  generateStoryboard(@Body() dto: ScriptExportDto) {
    const { scenes } = this.scriptExport.convertToScript(dto.content, dto.options);
    const storyboard = this.scriptExport.generateStoryboard(scenes, dto.options);
    const table = this.scriptExport.formatStoryboardTable(storyboard);
    return { storyboard, table };
  }

  // ─── 社交平台适配 ───

  @Post('social/adapt')
  adaptForSocial(@Body() body: SocialAdaptDto) {
    const { text, platform } = body;
    switch (platform) {
      case 'douyin':
        return this.socialExport.adaptForDouyin(text);
      case 'xiaohongshu':
        return this.socialExport.adaptForXiaohongshu(text);
      case 'wechat':
        return this.socialExport.adaptForWechat(text);
      default:
        return { error: `Unsupported platform: ${platform}` };
    }
  }

  @Get('social/platforms')
  getSocialPlatforms() {
    return {
      platforms: [
        {
          id: 'douyin',
          name: '抖音',
          icon: '🎵',
          description: '短视频文案适配，精简内容 + 话题标签',
          color: '#00d4ff',
        },
        {
          id: 'xiaohongshu',
          name: '小红书',
          icon: '📕',
          description: '图文笔记适配，标题 + 正文 + 话题标签',
          color: '#ff6b6b',
        },
        {
          id: 'wechat',
          name: '微信公众号',
          icon: '💬',
          description: '长文适配，标题 + 摘要 + 正文',
          color: '#07c160',
        },
      ],
    };
  }

  // ─── 版权黑名单/白名单管理 ───

  @Post('copyright/blacklist/add')
  addToBlacklist(@Body() body: { title: string }) {
    this.copyrightCheck.addToBlacklist(body.title);
    return { success: true };
  }

  @Post('copyright/blacklist/remove')
  removeFromBlacklist(@Body() body: { title: string }) {
    this.copyrightCheck.removeFromBlacklist(body.title);
    return { success: true };
  }

  @Post('copyright/whitelist/add')
  addToWhitelist(@Body() body: { term: string }) {
    this.copyrightCheck.addToWhitelist(body.term);
    return { success: true };
  }

  @Post('copyright/whitelist/remove')
  removeFromWhitelist(@Body() body: { term: string }) {
    this.copyrightCheck.removeFromWhitelist(body.term);
    return { success: true };
  }
}
