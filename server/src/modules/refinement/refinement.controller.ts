/**
 * 精修系统 Controller
 */
import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RefinementTemplatesService } from './refinement-templates.service';
import { DeAiEngineService } from './de-ai-engine.service';
import { DescribePolishService } from './describe-polish.service';
import { QualityInspectionService } from './quality-inspection.service';
import { SpellCheckService } from './spell-check.service';
import { SensitiveWordService } from './sensitive-word.service';
import { CopyrightCheckService } from './copyright-check.service';
import { ExportService } from './export.service';
import { ScriptExportService } from './script-export.service';
import { SocialExportService } from './social-export.service';
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
  ) {}

  // ─── 精修模板 ───

  @Get('templates')
  getTemplates(@Query() query: GetTemplatesQueryDto) {
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

  @Post('templates/apply')
  applyTemplate(@Body() dto: ApplyTemplateDto) {
    try {
      const result = this.templatesService.applyTemplate(dto.templateId, dto.content, dto.options);
      const template = this.templatesService.findById(dto.templateId);
      return {
        templateId: dto.templateId,
        templateName: template?.name,
        original: dto.content,
        result,
        appliedRules: template?.rules.map((r) => r.description || r.type) || [],
      };
    } catch (e: any) {
      return { error: e.message };
    }
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

  // ─── Describe逐句精修 ───

  @Get('describe/styles')
  getDescribeStyles(): any {
    return this.describePolish.getStyles();
  }

  @Post('describe/polish')
  describePolishSentence(@Body() dto: DescribePolishDto) {
    return this.describePolish.polish(dto.sentence, dto.styles, dto.context);
  }

  // ─── AI质检 ───

  @Post('quality/inspect')
  inspect(@Body() dto: QualityInspectDto) {
    return this.qualityInspection.inspect(dto.content, dto.context);
  }

  @Post('quality/logic')
  checkLogic(@Body() dto: QualityInspectDto) {
    return this.qualityInspection.checkLogic(dto.content, dto.context);
  }

  @Post('quality/character-drift')
  checkCharacterDrift(@Body() dto: QualityInspectDto) {
    return this.qualityInspection.checkCharacterDrift(dto.content, dto.context);
  }

  @Post('quality/foreshadowing')
  checkForeshadowing(@Body() dto: QualityInspectDto) {
    return this.qualityInspection.checkForeshadowing(dto.content, dto.context);
  }

  @Get('quality/standards')
  getQualityStandards() {
    return this.qualityInspection.getStandards();
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
