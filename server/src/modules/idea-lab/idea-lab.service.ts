/**
 * IdeaLabService - 想法孵化核心服务
 *
 * 想法成熟度只回答“故事想法是否足够清楚”；平台、六维执行标准、分类归位与体量
 * 只由 ProjectService.create 统一判定，避免旧 IdeaLab 与主创建向导维护两套 Gate。
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IdeaDraftRepository, type IdeaDraftRow } from '../../database/repositories/idea-draft.repository';
import { RealLLMService } from '../../chain/real-llm.service';
import { ProjectService } from '../project/project.service';
import { ConfirmIdeaDto } from './dto/confirm-idea.dto';
import { ConvertToProjectDto } from './dto/convert-to-project.dto';
import { CreateIdeaDraftDto } from './dto/create-idea-draft.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';

export interface QuestionItem {
  id: string;
  question: string;
  reason: string;
}

export interface AnswerItemData {
  questionId: string;
  answer: string;
}

export interface RefinedIdea {
  titleSuggestions: string[];
  oneLineHook: string;
  protagonist: string;
  coreConflict: string;
  worldSeed: string;
  characterSeed: string;
  organizationSeed: string;
  sellingPoints: string[];
  platformFit: string;
  storyType: string;
  targetAudience: string;
  shortStoryFit: string;
  longNovelFit: string;
  recommendedType: string;
  nextStep: string;
}

export interface MaturityReport {
  strengths: string[];
  missingItems: string[];
  risks: string[];
  canConvertToProject: boolean;
  evaluatedItems: number;
  satisfiedItems: number;
}

export interface IdeaDraftResponse {
  id: string;
  rawIdea: string;
  title: string;
  projectType: string;
  targetPlatform: string;
  customPlatformNote: string;
  targetWords: number;
  description: string;
  status: string;
  questions: QuestionItem[];
  answers: AnswerItemData[];
  refinedIdea: RefinedIdea | null;
  maturityScore: number;
  maturityReport: MaturityReport | null;
  confirmedIdea: string;
  convertedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class IdeaLabService {
  private readonly logger = new Logger(IdeaLabService.name);

  constructor(
    private readonly repo: IdeaDraftRepository,
    private readonly projectService: ProjectService,
    private readonly llm: RealLLMService,
  ) {}

  createDraft(dto: CreateIdeaDraftDto): IdeaDraftResponse {
    const now = new Date().toISOString();
    const id = uuid();
    this.repo.insert({
      id,
      raw_idea: dto.rawIdea,
      title: dto.title || '',
      project_type: dto.projectType || 'long_novel',
      target_platform: dto.targetPlatform || '',
      custom_platform_note: dto.customPlatformNote || '',
      target_words: dto.targetWords,
      description: dto.description || '',
      status: 'draft',
      questions_json: '[]',
      answers_json: '[]',
      refined_idea_json: '{}',
      maturity_score: 0,
      maturity_report_json: '{}',
      confirmed_idea: '',
      converted_project_id: null,
      created_at: now,
      updated_at: now,
    });
    return this.toResponse(this.repo.findById(id)!);
  }

  getDraft(id: string): IdeaDraftResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);
    return this.toResponse(row);
  }

  getAllDrafts(): IdeaDraftResponse[] {
    return this.repo.findAll().map(row => this.toResponse(row));
  }

  async generateQuestionsAsync(id: string): Promise<{ questions: QuestionItem[]; status: string }> {
    const row = this.requireDraft(id);
    try {
      const response = await this.llm.generate({
        prompt: this.buildQuestionsPrompt(row),
        systemPrompt: '你是专业创作编辑。只根据作者当前想法提出能消除关键创作歧义的追问；返回 JSON 数组，每项包含 id、question、reason。',
        temperature: 0.8,
        scenario: 'idea_questions',
      });
      const questions = this.parseQuestionsResponse(response.content);
      if (!questions.length) throw new Error('LLM 返回的问题为空');
      this.repo.update(id, {
        questions_json: JSON.stringify(questions),
        status: 'questioning',
        updated_at: new Date().toISOString(),
      });
      return { questions, status: 'questioning' };
    } catch (err) {
      this.logger.warn(`[IdeaLab] LLM 追问生成失败，未使用模板降级: ${err}`);
      throw new BadRequestException(`AI追问生成失败，未使用模板降级：${this.errorMessage(err)}`);
    }
  }

  saveAnswers(id: string, dto: SaveAnswersDto): { answers: AnswerItemData[]; status: string } {
    this.requireDraft(id);
    const answers = dto.answers.map(item => ({ questionId: item.questionId, answer: item.answer }));
    this.repo.update(id, {
      answers_json: JSON.stringify(answers),
      status: 'answered',
      updated_at: new Date().toISOString(),
    });
    return { answers, status: 'answered' };
  }

  async refineIdeaAsync(id: string): Promise<{
    refinedIdea: RefinedIdea;
    maturityScore: number;
    maturityReport: MaturityReport;
    status: string;
  }> {
    const row = this.requireDraft(id);
    const answers = this.parseJsonArray<AnswerItemData>(row.answers_json);
    const questions = this.parseJsonArray<QuestionItem>(row.questions_json);
    try {
      const response = await this.llm.generate({
        prompt: this.buildRefinePrompt(row, questions, answers),
        systemPrompt: '你是专业创作编辑。把已有灵感与作者回答收敛成可执行的小说核心，不替作者补造未提供的硬事实；输出 JSON。',
        temperature: 0.7,
        scenario: 'idea_refine',
      });
      const refinedIdea = this.parseRefinedIdeaResponse(response.content);
      if (!refinedIdea?.oneLineHook) throw new Error('LLM 返回的完善想法不完整');
      const maturityReport = this.computeMaturityReport(refinedIdea, row.project_type);
      const maturityScore = this.computeMaturityScore(maturityReport);
      this.repo.update(id, {
        refined_idea_json: JSON.stringify(refinedIdea),
        maturity_score: maturityScore,
        maturity_report_json: JSON.stringify(maturityReport),
        status: 'refined',
        updated_at: new Date().toISOString(),
      });
      return { refinedIdea, maturityScore, maturityReport, status: 'refined' };
    } catch (err) {
      this.logger.warn(`[IdeaLab] LLM 完善想法失败，未使用模板降级: ${err}`);
      throw new BadRequestException(`AI完善想法失败，未使用模板降级：${this.errorMessage(err)}`);
    }
  }

  confirmIdea(id: string, dto: ConfirmIdeaDto): { confirmedIdea: string; status: string } {
    const row = this.requireDraft(id);
    const refinedIdea = this.parseRefinedIdeaSafe(row.refined_idea_json);
    const confirmedIdea = dto.confirmedIdea || refinedIdea?.oneLineHook || row.raw_idea;
    if (row.maturity_score < 70) this.logger.log(`[IdeaLab] 低分确认: ${id}, score=${row.maturity_score}`);
    this.repo.update(id, {
      confirmed_idea: confirmedIdea,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    });
    return { confirmedIdea, status: 'confirmed' };
  }

  convertToProject(id: string, dto: ConvertToProjectDto): { projectId: string; project: any } {
    const row = this.requireDraft(id);
    if (row.status === 'converted') {
      throw new BadRequestException(`该想法草稿已转换为项目: ${row.converted_project_id}`);
    }

    // 成熟度报告是编辑提示，不再充当第二套项目创建 Gate。转项目时用户可能刚补齐平台、分类、
    // 六维与目标体量；真正的硬阻断必须只由 ProjectService.create 的统一创作宪法判据执行。
    const refinedIdea = this.parseRefinedIdeaSafe(row.refined_idea_json);
    const confirmedIdea = dto.confirmedIdea || row.confirmed_idea || refinedIdea?.oneLineHook || row.raw_idea;
    const title = dto.title || row.title || refinedIdea?.titleSuggestions?.[0] || '未命名作品';
    const creationInput: Record<string, any> = {
      title,
      type: row.project_type as any,
      creationSource: 'idea',
      targetPlatform: dto.targetPlatform || row.target_platform,
      customPlatformNote: dto.customPlatformNote ?? row.custom_platform_note,
      targetWords: dto.targetWords ?? row.target_words,
      categoryWordScaleDeviation: dto.categoryWordScaleDeviation,
      category: dto.category,
      storyTone: dto.storyTone,
      writingStyle: dto.writingStyle,
      webNovelGenre: dto.webNovelGenre,
      submissionTags: dto.submissionTags,
      plotTags: dto.plotTags,
      genreFitNote: dto.genreFitNote,
      pov: dto.pov,
      targetAudience: dto.targetAudience ?? refinedIdea?.targetAudience ?? undefined,
      currentWorkflowStage: row.project_type === 'short_story' ? 'topic' : 'idea_or_inspiration',
      ideaStatus: 'converted',
      ideaSeed: row.raw_idea,
      confirmedIdea,
      description: row.description || refinedIdea?.oneLineHook || '',
      settings: {},
    };

    let project: ReturnType<ProjectService['create']>;
    try {
      project = this.projectService.create(creationInput as any);
    } catch (err) {
      if (err instanceof BadRequestException) {
        this.logger.error(`想法转项目前置阻断 draft=${id} 原因=${err.message}`);
      }
      throw err;
    }

    this.repo.update(id, {
      status: 'converted',
      converted_project_id: project.id,
      confirmed_idea: confirmedIdea,
      updated_at: new Date().toISOString(),
    });
    return { projectId: project.id, project };
  }

  private requireDraft(id: string): IdeaDraftRow {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);
    return row;
  }

  private buildQuestionsPrompt(row: IdeaDraftRow): string {
    const short = row.project_type === 'short_story';
    const dimensions = short
      ? ['第一人称/主角身份', '具体发生环境', '打破日常的异常事件', '核心冲突', '核心情绪卖点', '主要反转', '结尾冲击']
      : ['主角身份与长期目标', '时代/地域/世界背景', '核心机制', '长线冲突', '主要阻力', '势力组织', '成长空间', '开篇抓人点'];
    return [
      '# 小说想法追问',
      `原始想法：${row.raw_idea}`,
      `作品类型：${short ? '短篇' : '长篇'}`,
      `当前目标平台：${row.target_platform || '尚未确定'}`,
      `围绕以下维度提出 ${short ? '5-7' : '6-8'} 个真正需要作者决定的问题：${dimensions.join('；')}`,
      '不要替作者预设答案，不要把平台推荐当成作者已经确认的事实。',
      '返回 JSON 数组，每项包含 id、question、reason。',
    ].join('\n\n');
  }

  private buildRefinePrompt(row: IdeaDraftRow, questions: QuestionItem[], answers: AnswerItemData[]): string {
    const short = row.project_type === 'short_story';
    const qa = questions.map(question => {
      const answer = answers.find(item => item.questionId === question.id);
      return answer ? `问：${question.question}\n答：${answer.answer}` : '';
    }).filter(Boolean).join('\n\n');
    return [
      '# 小说想法完善',
      `原始想法：${row.raw_idea}`,
      `作品类型：${short ? '短篇' : '长篇'}`,
      `当前目标平台：${row.target_platform || '尚未确定'}`,
      qa ? `追问与回答：\n${qa}` : '',
      '把作者已确认的信息收敛成一个故事核心；没有答案的内容保持开放，不擅自写成硬事实。',
      '返回 JSON 对象，字段必须包含：titleSuggestions、oneLineHook、protagonist、coreConflict、worldSeed、characterSeed、organizationSeed、sellingPoints、platformFit、storyType、targetAudience、shortStoryFit、longNovelFit、recommendedType、nextStep。',
      `recommendedType 必须为 ${short ? 'short_story' : 'long_novel'}。`,
    ].filter(Boolean).join('\n\n');
  }

  private computeMaturityReport(idea: RefinedIdea, projectType: string): MaturityReport {
    const strengths: string[] = [];
    const missingItems: string[] = [];
    const risks: string[] = [];
    const check = (ok: boolean, yes: string, no: string) => ok ? strengths.push(yes) : missingItems.push(no);

    check(!!idea.oneLineHook && idea.oneLineHook.trim().length > 10, '有清晰的一句话钩子', '需要明确一句话钩子');
    check(!!idea.protagonist && idea.protagonist.trim().length > 4, '主角设定基本明确', '需要明确主角设定');
    check(!!idea.coreConflict && idea.coreConflict.trim().length > 4, '核心冲突已定义', '需要明确核心冲突');
    check(Array.isArray(idea.sellingPoints) && idea.sellingPoints.length > 0, `有 ${idea.sellingPoints?.length || 0} 个卖点`, '需要提炼故事卖点');
    check(!!idea.platformFit && idea.platformFit.trim().length > 4, '有平台适配判断', '需要补充平台适配判断');

    if (projectType === 'short_story') {
      if (!idea.shortStoryFit || idea.shortStoryFit.trim().length < 4) risks.push('短篇适配评估不完整');
    } else {
      if (!idea.longNovelFit || idea.longNovelFit.trim().length < 4) risks.push('长篇扩展性评估不完整');
      if (!idea.worldSeed || idea.worldSeed.trim().length < 4) risks.push('世界观种子需要进一步明确以支撑长篇');
    }

    const satisfiedItems = strengths.length;
    const evaluatedItems = satisfiedItems + missingItems.length + risks.length;
    return {
      strengths,
      missingItems,
      risks,
      canConvertToProject: evaluatedItems > 0 && missingItems.length === 0 && risks.length === 0,
      evaluatedItems,
      satisfiedItems,
    };
  }

  private computeMaturityScore(report: MaturityReport): number {
    return report.evaluatedItems > 0 ? Math.round((report.satisfiedItems / report.evaluatedItems) * 100) : 0;
  }

  private parseQuestionsResponse(content: string): QuestionItem[] {
    const parsed = this.parseJsonContent(content);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.questions) ? parsed.questions : [];
    return rows.filter((item: any) => item?.id && item?.question)
      .map((item: any) => ({ id: String(item.id), question: String(item.question), reason: String(item.reason || '') }));
  }

  private parseRefinedIdeaResponse(content: string): RefinedIdea | null {
    const parsed = this.parseJsonContent(content);
    return parsed && typeof parsed === 'object' ? parsed as RefinedIdea : null;
  }

  private parseJsonContent(content: string): any {
    const text = String(content || '').trim();
    try { return JSON.parse(text); } catch { /* try fenced JSON below */ }
    const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!match) return null;
    try { return JSON.parse(match[1]); } catch { return null; }
  }

  private parseJsonArray<T>(json: string): T[] {
    try {
      const parsed = JSON.parse(json || '[]');
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch {
      return [];
    }
  }

  private toResponse(row: IdeaDraftRow): IdeaDraftResponse {
    return {
      id: row.id,
      rawIdea: row.raw_idea,
      title: row.title || '',
      projectType: row.project_type,
      targetPlatform: row.target_platform,
      customPlatformNote: row.custom_platform_note || '',
      targetWords: row.target_words,
      description: row.description || '',
      status: row.status,
      questions: this.parseJsonArray<QuestionItem>(row.questions_json),
      answers: this.parseJsonArray<AnswerItemData>(row.answers_json),
      refinedIdea: this.parseRefinedIdeaSafe(row.refined_idea_json),
      maturityScore: row.maturity_score,
      maturityReport: this.parseMaturityReportSafe(row.maturity_report_json),
      confirmedIdea: row.confirmed_idea || '',
      convertedProjectId: row.converted_project_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseRefinedIdeaSafe(json: string): RefinedIdea | null {
    try {
      const parsed = JSON.parse(json || '{}');
      return parsed?.oneLineHook ? parsed as RefinedIdea : null;
    } catch {
      return null;
    }
  }

  private parseMaturityReportSafe(json: string): MaturityReport | null {
    try {
      const parsed = JSON.parse(json || '{}');
      if (!Array.isArray(parsed?.strengths) || !Array.isArray(parsed?.missingItems) || !Array.isArray(parsed?.risks)) return null;
      const satisfiedItems = Number.isFinite(parsed.satisfiedItems) ? Math.max(0, Number(parsed.satisfiedItems)) : parsed.strengths.length;
      const evaluatedItems = Number.isFinite(parsed.evaluatedItems)
        ? Math.max(satisfiedItems, Number(parsed.evaluatedItems))
        : satisfiedItems + parsed.missingItems.length + parsed.risks.length;
      return {
        strengths: parsed.strengths,
        missingItems: parsed.missingItems,
        risks: parsed.risks,
        canConvertToProject: parsed.canConvertToProject === true && parsed.missingItems.length === 0 && parsed.risks.length === 0,
        evaluatedItems,
        satisfiedItems,
      };
    } catch {
      return null;
    }
  }

  private errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
