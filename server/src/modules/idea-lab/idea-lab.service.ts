/**
 * IdeaLabService - 想法孵化核心服务
 *
 * 职责：
 * 1. 想法草稿 CRUD
 * 2. AI 追问生成（含 fallback）
 * 3. AI 想法完善 + 成熟度评分（含 fallback）
 * 4. 想法确认
 * 5. 转换为项目（复用 ProjectService）
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IdeaDraftRepository, IdeaDraftRow } from '../../database/repositories/idea-draft.repository';
import { ProjectService } from '../project/project.service';
import { RealLLMService } from '../../chain/real-llm.service';
import type { LLMRequest } from '../../chain/chain.types';
import { CreateIdeaDraftDto } from './dto/create-idea-draft.dto';
import { SaveAnswersDto } from './dto/save-answers.dto';
import { ConfirmIdeaDto } from './dto/confirm-idea.dto';
import { ConvertToProjectDto } from './dto/convert-to-project.dto';

// ========== 类型定义 ==========

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
}

export interface IdeaDraftResponse {
  id: string;
  rawIdea: string;
  title: string;
  projectType: string;
  targetPlatform: string;
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

  // ==================== 公共 CRUD ====================

  /**
   * 创建想法草稿
   */
  createDraft(dto: CreateIdeaDraftDto): IdeaDraftResponse {
    const now = new Date().toISOString();
    const id = uuid();

    this.repo.insert({
      id,
      raw_idea: dto.rawIdea,
      title: dto.title || '',
      project_type: dto.projectType || 'long_novel',
      target_platform: dto.targetPlatform || 'generic',
      target_words: dto.targetWords || 0,
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

  /**
   * 获取草稿详情
   */
  getDraft(id: string): IdeaDraftResponse {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);
    return this.toResponse(row);
  }

  /**
   * 获取所有草稿
   */
  getAllDrafts(): IdeaDraftResponse[] {
    return this.repo.findAll().map((r) => this.toResponse(r));
  }

  // ==================== AI 追问生成 ====================

  /**
   * 生成追问问题
   * 优先调用 LLM，失败时使用模板 fallback
   */
  generateQuestions(id: string): { questions: QuestionItem[]; status: string; isFallback: boolean } {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    let questions: QuestionItem[] = [];
    let isFallback = false;

    try {
      // 尝试 LLM 生成
      const prompt = this.buildQuestionsPrompt(row);
      // 使用同步方式 - 用 LLM generate
      const llmPromise = this.llm.generate({
        prompt,
        systemPrompt: '你是一个专业的创作编辑，帮助作者完善小说想法。请生成有针对性的追问问题。',
        temperature: 0.8,
        maxTokens: 2000,
        scenario: 'idea_questions',
      });

      // 注: 由于 RealLLMService.generate 是异步的，我们在调用时 handle 异常
      // 这里我们只尝试同步路径，异步路径通过 Promise 处理
      // 实际我们使用 generateQuestionsAsync 方法
    } catch (err) {
      this.logger.warn(`[IdeaLab] LLM 追问生成失败，使用 fallback: ${err}`);
      isFallback = true;
    }

    // 使用 fallback 模板
    questions = this.fallbackQuestions(row);
    isFallback = true;

    this.repo.update(id, {
      questions_json: JSON.stringify(questions),
      status: 'questioning',
      updated_at: new Date().toISOString(),
    });

    return {
      questions,
      status: 'questioning',
      isFallback,
    };
  }

  /**
   * 异步生成追问（推荐路径）
   */
  async generateQuestionsAsync(id: string): Promise<{ questions: QuestionItem[]; status: string; isFallback: boolean }> {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    let questions: QuestionItem[] = [];
    let isFallback = false;

    try {
      const prompt = this.buildQuestionsPrompt(row);
      const response = await this.llm.generate({
        prompt,
        systemPrompt: '你是一个专业的创作编辑，帮助作者完善小说想法。请生成有针对性的追问问题。返回格式为 JSON 数组，每个元素包含 id、question、reason 字段。',
        temperature: 0.8,
        maxTokens: 3000,
        scenario: 'idea_questions',
      });

      questions = this.parseQuestionsResponse(response.content);
      if (!questions || questions.length === 0) {
        throw new Error('LLM 返回的问题为空');
      }
    } catch (err) {
      this.logger.warn(`[IdeaLab] LLM 追问生成失败，使用 fallback: ${err}`);
      questions = this.fallbackQuestions(row);
      isFallback = true;
    }

    this.repo.update(id, {
      questions_json: JSON.stringify(questions),
      status: 'questioning',
      updated_at: new Date().toISOString(),
    });

    return {
      questions,
      status: 'questioning',
      isFallback,
    };
  }

  // ==================== 保存回答 ====================

  /**
   * 保存用户回答
   */
  saveAnswers(id: string, dto: SaveAnswersDto): { answers: AnswerItemData[]; status: string } {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    const answers: AnswerItemData[] = dto.answers.map((a) => ({
      questionId: a.questionId,
      answer: a.answer,
    }));

    this.repo.update(id, {
      answers_json: JSON.stringify(answers),
      status: 'answered',
      updated_at: new Date().toISOString(),
    });

    const updated = this.repo.findById(id)!;
    return {
      answers: JSON.parse(updated.answers_json),
      status: updated.status,
    };
  }

  // ==================== 完善想法 + 成熟度评分 ====================

  /**
   * 完善想法（同步 fallback 版本）
   */
  refineIdea(id: string): {
    refinedIdea: RefinedIdea;
    maturityScore: number;
    maturityReport: MaturityReport;
    status: string;
    isFallback: boolean;
  } {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    const answers: AnswerItemData[] = JSON.parse(row.answers_json || '[]');
    const questions: QuestionItem[] = JSON.parse(row.questions_json || '[]');

    // 生成完善版想法 (使用 fallback)
    const refinedIdea = this.fallbackRefinedIdea(row, questions, answers);
    const maturityReport = this.computeMaturityReport(refinedIdea, row);
    const maturityScore = this.computeMaturityScore(maturityReport);

    this.repo.update(id, {
      refined_idea_json: JSON.stringify(refinedIdea),
      maturity_score: maturityScore,
      maturity_report_json: JSON.stringify(maturityReport),
      status: 'refined',
      updated_at: new Date().toISOString(),
    });

    return {
      refinedIdea,
      maturityScore,
      maturityReport,
      status: 'refined',
      isFallback: true,
    };
  }

  /**
   * 异步完善想法（推荐路径 - 使用 LLM）
   */
  async refineIdeaAsync(id: string): Promise<{
    refinedIdea: RefinedIdea;
    maturityScore: number;
    maturityReport: MaturityReport;
    status: string;
    isFallback: boolean;
  }> {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    const answers: AnswerItemData[] = JSON.parse(row.answers_json || '[]');
    const questions: QuestionItem[] = JSON.parse(row.questions_json || '[]');

    let refinedIdea: RefinedIdea;
    let isFallback = false;

    try {
      const prompt = this.buildRefinePrompt(row, questions, answers);
      const response = await this.llm.generate({
        prompt,
        systemPrompt: '你是一个专业的创作编辑，帮助作者把模糊想法完善为可创作的小说设定。输出 JSON 格式的完善结果。',
        temperature: 0.7,
        maxTokens: 4000,
        scenario: 'idea_refine',
      });

      const parsed = this.parseRefinedIdeaResponse(response.content);
      if (!parsed || !parsed.oneLineHook) {
        throw new Error('LLM 返回的完善想法不完整');
      }
      refinedIdea = parsed;
    } catch (err) {
      this.logger.warn(`[IdeaLab] LLM 完善想法失败，使用 fallback: ${err}`);
      refinedIdea = this.fallbackRefinedIdea(row, questions, answers);
      isFallback = true;
    }

    const maturityReport = this.computeMaturityReport(refinedIdea, row);
    const maturityScore = this.computeMaturityScore(maturityReport);

    this.repo.update(id, {
      refined_idea_json: JSON.stringify(refinedIdea),
      maturity_score: maturityScore,
      maturity_report_json: JSON.stringify(maturityReport),
      status: 'refined',
      updated_at: new Date().toISOString(),
    });

    return {
      refinedIdea,
      maturityScore,
      maturityReport,
      status: 'refined',
      isFallback,
    };
  }

  // ==================== 确认想法 ====================

  /**
   * 确认想法
   */
  confirmIdea(id: string, dto: ConfirmIdeaDto): { confirmedIdea: string; status: string } {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    const refinedIdea: RefinedIdea = JSON.parse(row.refined_idea_json || '{}');
    const confirmedIdea = dto.confirmedIdea ||
      refinedIdea.oneLineHook ||
      row.raw_idea;

    // 检查成熟度
    if (row.maturity_score < 70) {
      // 允许确认，但标记为低分确认
      this.logger.log(`[IdeaLab] 低分确认: ${id}, score=${row.maturity_score}`);
    }

    this.repo.update(id, {
      confirmed_idea: confirmedIdea,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    });

    return {
      confirmedIdea,
      status: 'confirmed',
    };
  }

  // ==================== 转换为项目 ====================

  /**
   * 转换为项目
   */
  convertToProject(id: string, dto: ConvertToProjectDto): { projectId: string; project: any } {
    const row = this.repo.findById(id);
    if (!row) throw new NotFoundException(`想法草稿不存在: ${id}`);

    if (row.status === 'converted') {
      throw new BadRequestException(`该想法草稿已转换为项目: ${row.converted_project_id}`);
    }

    const refinedIdea: RefinedIdea = JSON.parse(row.refined_idea_json || '{}');
    const confirmedIdea = dto.confirmedIdea || row.confirmed_idea ||
      refinedIdea.oneLineHook || row.raw_idea;
    const title = dto.title || row.title ||
      (refinedIdea.titleSuggestions && refinedIdea.titleSuggestions[0]) ||
      '未命名作品';

    // 调用 ProjectService.create 复用第一阶段逻辑
    const project = this.projectService.create({
      title,
      type: row.project_type as any,
      projectMode: row.project_type as any,
      creationSource: 'idea',
      targetPlatform: row.target_platform as any,
      platformStyle: row.target_platform,
      targetWords: row.target_words,
      currentWorkflowStage: row.project_type === 'short_story' ? 'topic' : 'idea_or_inspiration',
      ideaStatus: 'converted',
      ideaSeed: row.raw_idea,
      confirmedIdea: confirmedIdea,
      description: row.description || refinedIdea.oneLineHook || '',
    });

    // 更新草稿状态
    this.repo.update(id, {
      status: 'converted',
      converted_project_id: project.id,
      confirmed_idea: confirmedIdea,
      updated_at: new Date().toISOString(),
    });

    return {
      projectId: project.id,
      project,
    };
  }

  // ==================== Prompt 构建 ====================

  private buildQuestionsPrompt(row: IdeaDraftRow): string {
    const isShort = row.project_type === 'short_story';
    const platform = row.target_platform;

    let prompt = `# 小说想法追问生成\n\n`;
    prompt += `作者原始想法：${row.raw_idea}\n\n`;
    prompt += `作品类型：${isShort ? '短篇' : '长篇'}\n`;
    prompt += `目标平台：${platform}\n\n`;

    if (isShort) {
      prompt += `请针对短篇故事生成 5-7 个追问问题，帮助作者完善故事设定。\n\n`;
      prompt += `关注维度：\n`;
      prompt += `1. 第一人称主角身份——主角是"我"时，"我"是谁？\n`;
      prompt += `2. 故事发生地点——具体在什么环境？\n`;
      prompt += `3. 核心异常事件——是什么打破了日常？\n`;
      prompt += `4. 核心冲突——主角最强烈的内心或外在冲突？\n`;
      prompt += `5. 情绪卖点——读者看完最强烈的情绪是什么？\n`;
      prompt += `6. 主要反转——有没有预想的反转或意外？\n`;
      prompt += `7. 结尾冲击——想让读者在结尾感受到什么？\n`;
    } else {
      prompt += `请针对长篇小说生成 6-8 个追问问题，帮助作者完善故事设定。\n\n`;
      prompt += `关注维度：\n`;
      prompt += `1. 主角身份和长期目标——主角是谁？他想达到什么？\n`;
      prompt += `2. 时代/地域/世界背景——故事发生在什么世界？\n`;
      prompt += `3. 核心金手指或核心机制——主角的独特优势是什么？\n`;
      prompt += `4. 长线冲突——贯穿全书的主要矛盾是什么？\n`;
      prompt += `5. 反派/对手/阻力——谁在阻碍主角？\n`;
      prompt += `6. 势力组织——有哪些阵营或组织？\n`;
      prompt += `7. 地图/成长空间——故事的世界有多大？\n`;
      prompt += `8. 前 30 章抓人点——开篇如何快速吸引读者？\n`;
    }

    prompt += `\n请以 JSON 数组格式返回，每个元素包含 id、question、reason 字段。`;

    return prompt;
  }

  private buildRefinePrompt(row: IdeaDraftRow, questions: QuestionItem[], answers: AnswerItemData[]): string {
    const isShort = row.project_type === 'short_story';
    const platform = row.target_platform;

    let prompt = `# 小说想法完善\n\n`;
    prompt += `## 原始想法\n${row.raw_idea}\n\n`;
    prompt += `作品类型：${isShort ? '短篇' : '长篇'}\n`;
    prompt += `目标平台：${platform}\n\n`;

    if (questions.length > 0 && answers.length > 0) {
      prompt += `## 追问与回答\n`;
      for (const q of questions) {
        const answer = answers.find((a) => a.questionId === q.id);
        if (answer) {
          prompt += `问：${q.question}\n答：${answer.answer}\n\n`;
        }
      }
    }

    if (isShort) {
      prompt += `请生成以下 JSON 格式的完善结果：\n\n`;
      prompt += `{\n`;
      prompt += `  "titleSuggestions": ["标题建议1", "标题建议2", "标题建议3"],\n`;
      prompt += `  "oneLineHook": "一句话钩子",\n`;
      prompt += `  "protagonist": "第一人称主角身份",\n`;
      prompt += `  "coreConflict": "核心冲突描述",\n`;
      prompt += `  "worldSeed": "发生地点/环境",\n`;
      prompt += `  "characterSeed": "关键角色设定",\n`;
      prompt += `  "organizationSeed": "",\n`;
      prompt += `  "sellingPoints": ["卖点1", "卖点2"],\n`;
      prompt += `  "platformFit": "适合的平台及原因",\n`;
      prompt += `  "storyType": "故事类型（悬疑/情感/反转/现实等）",\n`;
      prompt += `  "targetAudience": "目标读者群体",\n`;
      prompt += `  "shortStoryFit": "短篇适配建议",\n`;
      prompt += `  "longNovelFit": "长篇扩展可能性",\n`;
      prompt += `  "recommendedType": "short_story",\n`;
      prompt += `  "nextStep": "下一步建议"\n`;
      prompt += `}\n`;
    } else {
      prompt += `请生成以下 JSON 格式的完善结果：\n\n`;
      prompt += `{\n`;
      prompt += `  "titleSuggestions": ["标题建议1", "标题建议2", "标题建议3"],\n`;
      prompt += `  "oneLineHook": "一句话钩子",\n`;
      prompt += `  "protagonist": "主角设定（身份、目标、特质）",\n`;
      prompt += `  "coreConflict": "核心冲突描述",\n`;
      prompt += `  "worldSeed": "世界观种子",\n`;
      prompt += `  "characterSeed": "角色种子",\n`;
      prompt += `  "organizationSeed": "势力/组织种子",\n`;
      prompt += `  "sellingPoints": ["卖点1", "卖点2", "卖点3"],\n`;
      prompt += `  "platformFit": "适合的平台及原因",\n`;
      prompt += `  "storyType": "故事类型",\n`;
      prompt += `  "targetAudience": "目标读者群体",\n`;
      prompt += `  "shortStoryFit": "短篇适配判断",\n`;
      prompt += `  "longNovelFit": "长篇适配判断",\n`;
      prompt += `  "recommendedType": "long_novel",\n`;
      prompt += `  "nextStep": "下一步建议"\n`;
      prompt += `}\n`;
    }

    return prompt;
  }

  // ==================== Fallback 逻辑 ====================

  /**
   * Fallback 追问问题模板
   */
  private fallbackQuestions(row: IdeaDraftRow): QuestionItem[] {
    const isShort = row.project_type === 'short_story';
    const prefix = isShort ? '短' : '长';

    const questions: QuestionItem[] = [];

    if (isShort) {
      questions.push(
        { id: 'sq1', question: '主角"我"是谁？年龄、职业、当前的生活状态是怎样的？', reason: '明确第一人称视角的代入感' },
        { id: 'sq2', question: '故事发生在什么时间、什么地点？有什么特别的环境氛围？', reason: '确定故事舞台和氛围基调' },
        { id: 'sq3', question: '是什么异常事件打破了主角的日常生活？', reason: '找到故事的起爆点' },
        { id: 'sq4', question: '主角内心最强烈的冲突是什么？外在的主要阻力来自哪里？', reason: '明确矛盾推动力' },
        { id: 'sq5', question: '你希望读者看完后最强烈的情绪是什么？感动、恐惧、愤怒还是释然？', reason: '锁定情绪卖点' },
        { id: 'sq6', question: '故事有没有预想的反转或意外结局？', reason: '确认故事结构' },
        { id: 'sq7', question: '结尾想让读者感受到什么？有没有最后一击的冲击力？', reason: '确保结尾力量' },
      );
    } else {
      questions.push(
        { id: 'lq1', question: '主角是谁？他/她最想改变或实现什么？', reason: '明确主角动机和长期目标' },
        { id: 'lq2', question: '故事发生在什么时代、地域或世界？有什么独特的世界观设定？', reason: '确定故事背景框架' },
        { id: 'lq3', question: '主角有什么独特的能力、金手指或核心优势？', reason: '明确爽点来源' },
        { id: 'lq4', question: '贯穿全书的主要矛盾是什么？主角面临的终极挑战是什么？', reason: '确定长线冲突' },
        { id: 'lq5', question: '主要的反派或对手是谁？阻力系统如何设计？', reason: '完善对抗体系' },
        { id: 'lq6', question: '故事世界中有哪些势力、阵营或组织？', reason: '构建势力格局' },
        { id: 'lq7', question: '故事地图有多大？主角的成长空间和活动范围如何扩展？', reason: '规划故事格局' },
        { id: 'lq8', question: '开篇前 30 章（或前几万字）用什么快速吸引读者？', reason: '确保开篇抓人' },
      );
    }

    return questions;
  }

  /**
   * Fallback 完善想法
   */
  private fallbackRefinedIdea(row: IdeaDraftRow, questions: QuestionItem[], answers: AnswerItemData[]): RefinedIdea {
    const isShort = row.project_type === 'short_story';
    const platform = row.target_platform;
    const rawIdea = row.raw_idea;

    // 收集用户回答内容
    const answerTexts = answers.map((a) => a.answer).filter(Boolean);

    return {
      titleSuggestions: [
        `${rawIdea.slice(0, 20)}...`,
        `基于「${rawIdea.slice(0, 10)}」的故事`,
        `新${isShort ? '短篇' : '长篇'}创作`,
      ],
      oneLineHook: rawIdea.length > 50 ? rawIdea.slice(0, 50) + '...' : rawIdea,
      protagonist: isShort
        ? '第一人称主角（需要进一步设定身份）'
        : '主角（需要进一步设定身份和目标）',
      coreConflict: answerTexts.length > 0
        ? `基于回答：${answerTexts[0].slice(0, 40)}...`
        : '核心冲突需要进一步明确',
      worldSeed: isShort
        ? '短篇场景设定（需要根据故事具体设定）'
        : '世界观种子（需要根据故事具体完善）',
      characterSeed: isShort
        ? '关键角色设定'
        : '核心角色与关系网络',
      organizationSeed: isShort
        ? ''
        : '势力/组织设定（长篇建议构建 2-3 个主要势力）',
      sellingPoints: [
        isShort ? '强情绪共鸣' : '长线成长与升级',
        '独特故事视角',
        platform ? `适配${platform}风格` : '多平台适配',
      ],
      platformFit: platform ? `适合在${platform}发布${isShort ? '短篇' : '长篇'}故事` : '需要选择目标平台',
      storyType: isShort ? '短篇故事' : '长篇小说',
      targetAudience: isShort ? '喜欢短篇沉浸式阅读的读者' : '喜欢长篇连载的网文读者',
      shortStoryFit: isShort
        ? '当前设定适合短篇创作，建议按题材 → 大纲 → 正文流程推进'
        : '当前设偏长篇叙事，如需改为短篇需要聚焦单一事件和核心反转',
      longNovelFit: isShort
        ? '当前设定偏短篇，如需改为长篇需要扩展世界观和角色体系'
        : '当前设定适合长篇创作，建议按设定 → 世界观 → 角色 → 大纲流程推进',
      recommendedType: isShort ? 'short_story' : 'long_novel',
      nextStep: isShort
        ? '完善题材设定，进入短篇大纲阶段'
        : '建议进入基础设定阶段，逐步构建世界观和角色体系',
    };
  }

  private parseQuestionsResponse(content: string): QuestionItem[] {
    try {
      // 尝试直接解析 JSON
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item.id && item.question);
      }
      // 尝试从嵌套对象中提取
      if (parsed.questions && Array.isArray(parsed.questions)) {
        return parsed.questions.filter((item: any) => item.id && item.question);
      }
      return [];
    } catch {
      // 尝试从 markdown 代码块中提取 JSON
      const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return this.parseQuestionsResponse(jsonMatch[1]);
      }
      return [];
    }
  }

  private parseRefinedIdeaResponse(content: string): RefinedIdea | null {
    try {
      const parsed = JSON.parse(content);
      return parsed as RefinedIdea;
    } catch {
      const jsonMatch = content.match(/```(?:json)?\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        return this.parseRefinedIdeaResponse(jsonMatch[1]);
      }
      return null;
    }
  }

  // ==================== 成熟度评分 ====================

  /**
   * 计算成熟度报告
   */
  private computeMaturityReport(idea: RefinedIdea, row: IdeaDraftRow): MaturityReport {
    const strengths: string[] = [];
    const missingItems: string[] = [];
    const risks: string[] = [];

    if (idea.oneLineHook && idea.oneLineHook.length > 10) {
      strengths.push('有清晰的一句话钩子');
    } else {
      missingItems.push('需要明确一句话钩子');
    }

    if (idea.protagonist && idea.protagonist.length > 4) {
      strengths.push('主角设定基本明确');
    } else {
      missingItems.push('需要明确主角设定');
    }

    if (idea.coreConflict && idea.coreConflict.length > 4) {
      strengths.push('核心冲突已定义');
    } else {
      missingItems.push('需要明确核心冲突');
    }

    if (idea.sellingPoints && idea.sellingPoints.length > 0) {
      strengths.push(`有 ${idea.sellingPoints.length} 个卖点`);
    } else {
      missingItems.push('需要提炼故事卖点');
    }

    if (idea.platformFit && idea.platformFit.length > 4) {
      strengths.push('有平台适配判断');
    } else {
      missingItems.push('需要确认目标平台适配性');
    }

    if (row.target_platform && row.target_platform !== 'generic') {
      strengths.push(`目标平台明确：${row.target_platform}`);
    } else {
      missingItems.push('建议选择具体目标平台');
    }

    if (row.target_words > 0) {
      strengths.push(`目标字数设定：${row.target_words}`);
    } else {
      missingItems.push('建议设定目标字数');
    }

    if (row.project_type === 'short_story') {
      if (!idea.shortStoryFit || idea.shortStoryFit.length < 4) {
        risks.push('短篇适配评估不完整');
      }
    } else {
      if (!idea.longNovelFit || idea.longNovelFit.length < 4) {
        risks.push('长篇扩展性评估不完整');
      }
      if (!idea.worldSeed || idea.worldSeed.length < 4) {
        risks.push('世界观种子需要进一步丰富以保证长篇可持续性');
      }
    }

    const canConvertToProject = missingItems.length <= 2;

    return {
      strengths,
      missingItems,
      risks,
      canConvertToProject,
    };
  }

  /**
   * 计算成熟度总分
   */
  private computeMaturityScore(report: MaturityReport): number {
    let score = 50; // 基础分

    // 每个优势 +5
    score += report.strengths.length * 5;

    // 每个缺失项 -10
    score -= report.missingItems.length * 10;

    // 每个风险 -5
    score -= report.risks.length * 5;

    // 可以创建项目 +10
    if (report.canConvertToProject) {
      score += 10;
    }

    // 限制范围 0-100
    return Math.max(0, Math.min(100, score));
  }

  // ==================== 响应转换 ====================

  private toResponse(row: IdeaDraftRow): IdeaDraftResponse {
    return {
      id: row.id,
      rawIdea: row.raw_idea,
      title: row.title || '',
      projectType: row.project_type,
      targetPlatform: row.target_platform,
      targetWords: row.target_words,
      description: row.description || '',
      status: row.status,
      questions: JSON.parse(row.questions_json || '[]'),
      answers: JSON.parse(row.answers_json || '[]'),
      refinedIdea: this.parseRefinedIdeaSafe(row.refined_idea_json),
      maturityScore: row.maturity_score,
      maturityReport: JSON.parse(row.maturity_report_json || '{}'),
      confirmedIdea: row.confirmed_idea || '',
      convertedProjectId: row.converted_project_id || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseRefinedIdeaSafe(json: string): RefinedIdea | null {
    try {
      const parsed = JSON.parse(json);
      if (parsed && parsed.oneLineHook) {
        return parsed as RefinedIdea;
      }
      return null;
    } catch {
      return null;
    }
  }
}
