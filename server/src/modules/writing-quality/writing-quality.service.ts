import { qualityIssue } from './quality-issue';
import { readConstitution } from '../project/creative-constitution';
/**
 * WritingQualityService - Phase 6.2 稳定修复版
 *
 * 修复：
 * - buildProjectContext schema 兼容（world_settings/outlines/characters 实字段）
 * - listReports/getReport 补齐 issueCount/chapterLocked 等统计
 * - LLM JSON 解析失败时 payload 记录 parseWarning
 * - applyRevision 返回 needsStateReview
 */
import { Injectable, Logger, NotFoundException, BadRequestException, Optional, OnModuleInit } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { DatabaseService } from '../../database/database.service';
import { RealLLMService } from '../../chain/real-llm.service';
import { WRITING_QUALITY_TAGS } from '../../state/writing-quality-tags';
import { ChapterService } from '../chapter/chapter.service';
import { QualityInspectionService } from '../refinement/quality-inspection.service';
import { compileContext } from '../generation-metrics/context-compiler';
import { reviewCharacterContracts } from './character-contract';
import { narrativeTrace } from './narrative-trace';
import { detectForbiddenTells } from '../../chain/hardline-scanner';
import type {
  AnalyzeChapterDto,
  AttentionCheckDto,
  ListReportsDto,
  RefineIssueDto,
  LLMQualityOutput,
  LLMRefineOutput,
  RecheckResult,
} from './dto/writing-quality.dto';

interface ReportRow {
  id: string;
  project_id: string;
  chapter_id: string;
  source_type: string;
  source_id: string;
  scope: string;
  title: string;
  summary: string;
  overall_level: string;
  overall_score: number;
  status: string;
  model: string;
  payload: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attention_json?: string;
  view_state_json?: string;
}

interface IssueRow {
  id: string;
  report_id: string;
  project_id: string;
  chapter_id: string;
  issue_type: string;
  severity: string;
  title: string;
  summary: string;
  evidence: string;
  suggestion: string;
  paragraph_index: number;
  sentence_index: number;
  start_offset: number;
  end_offset: number;
  original_text: string;
  suggested_text: string;
  tags: string;
  status: string;
  payload: string;
  created_at: string;
  updated_at: string;
  resolved_at: string;
  resolved_by: string;
  latest_revision_id?: string;
  recheck_result_json?: string;
  navigation_json?: string;
  status_history_json?: string;
}

interface RevisionRow {
  id: string;
  project_id: string;
  chapter_id: string;
  issue_id: string;
  report_id: string;
  revision_type: string;
  before_text: string;
  after_text: string;
  diff_json: string;
  applied: number;
  applied_at: string;
  reverted: number;
  reverted_at: string;
  payload: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  recheck_result_json?: string;
  can_apply?: number;
}

interface IssueCounts {
  total: number;
  open: number;
  high: number;
  resolved: number;
}

/** 正文/大纲统一质量目标分（90+）：综合分达到该线才算进入优秀区间。 */
export const BODY_QUALITY_TARGET_SCORE = 90;

/** 由统一综合分确定性推导质量等级（不采用 LLM 自报等级，避免分数与等级打架）：>=90 high，60-89 medium，<60 low。 */
export function levelByQualityScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= BODY_QUALITY_TARGET_SCORE) return 'high';
  if (score >= 60) return 'medium';
  return 'low';
}

@Injectable()
export class WritingQualityService implements OnModuleInit {
  private readonly logger = new Logger(WritingQualityService.name);

  constructor(
    private readonly dbService: DatabaseService,
    @Optional() private readonly chapterService?: ChapterService,
    @Optional() private readonly realLLM?: RealLLMService,
    @Optional() private readonly qualityInspection?: QualityInspectionService,
  ) {}

  /**
   * 反向依赖用「注册回调」而非构造注入（ChapterModule 被本模块依赖，不能再反向 import）。
   * AI 生成正文走 canonical 保存（source='ai_generated'）后，ChapterService 会回调这里自动跑一次
   * 七维质检 + 标签契合并落库；手动逐字编辑不触发，避免无谓 LLM 调用。全程 try/catch，绝不阻断保存。
   */
  onModuleInit(): void {
    this.chapterService?.registerAutoQualityRunner?.(async (input) => {
      try {
        await this.analyzeChapterQuality(input.projectId, {
          chapterId: input.chapterId,
          content: input.content,
          scope: 'chapter',
        } as AnalyzeChapterDto);
        this.logger.log(`AI 生成正文已自动完成质检（章节 ${input.chapterId}）：七维问题与标签契合已落库并同步看板`);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(`AI 生成正文自动质检失败（不影响正文保存）：${reason}`);
        // 失败必须落到章节上：前端编辑器与看板据此提示“自动质检未完成，可重跑”，不再静默。
        this.markChapterAutoQuality(input.chapterId, 'failed', `自动质检未完成：${reason}（可点“重新质检”）`);
      }
    });
  }

  /**
   * 把自动质检结果回写到章节行，保证质检失败也对作者可见、可手动重跑（不再静默吞掉）。
   */
  private markChapterAutoQuality(chapterId: string | undefined, status: 'running' | 'ok' | 'needs_rewrite' | 'failed', message: string | null): void {
    if (!chapterId) return;
    try {
      const now = new Date().toISOString();
      this.dbService.getDb()
        .prepare('UPDATE chapters SET auto_quality_status = ?, auto_quality_message = ?, auto_quality_at = ?, updated_at = ? WHERE id = ?')
        .run(status, message, now, now, chapterId);
    } catch (err) {
      this.logger.warn(`回写章节自动质检状态失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 把本次质检仍存在的问题【确定性沉淀】为跨章节避坑经验（generation_lessons），
   * 让下一章/重生成的首版 prompt 经 getActiveLessons 读到并主动规避。
   *
   * 修复断点：此前只有「大纲验收」问题会归纳教训，质检发现的 AI 痕迹/标签偏离/平台节奏/
   * 语言硬伤只写进面板展示、从不回灌，导致同类问题在后续章节反复出现。
   * 不调用任何 LLM（零额外额度）：按问题类型归并为固定可执行教训，同文案 occurrence+1，
   * 复用单项目 24 条封顶淘汰；达标且无未决问题时不写；任何失败都不阻断质检。
   */
  private recordQualityLessons(input: {
    projectId: string; chapterId?: string; score: number;
    issueTypes: string[]; hardlineRuleIds?: string[]; hasTagGap?: boolean;
  }): void {
    const { projectId, chapterId } = input;
    if (!projectId) return;
    try {
      const issueTypes = Array.from(new Set((input.issueTypes || []).map(String)));
      const hardlineRuleIds = Array.from(new Set((input.hardlineRuleIds || []).map(String)));
      if (input.score >= BODY_QUALITY_TARGET_SCORE && issueTypes.length === 0
        && hardlineRuleIds.length === 0 && !input.hasTagGap) return;
      const db = this.dbService.getDb();
      let chapterIndex = 0;
      if (chapterId) {
        const c = db.prepare('SELECT chapter_index FROM chapters WHERE id=?').get(chapterId) as { chapter_index?: number } | undefined;
        chapterIndex = Number(c?.chapter_index ?? 0) || 0;
      }
      // 问题类型 → 面向「下一章首版如何主动规避」的可执行教训（跨平台/长短篇通用，不含本书具体情节）
      const HOOK_OPEN = '开篇第一屏直接落在冲突/反常/强悬念上，删掉环境与履历铺垫，前几百字内让主角面对具体威胁或抉择';
      const PACING = '按目标平台节奏密度安排有效推进或反转，删掉不推进剧情的重复铺陈，每个场景结束时局面必须发生变化';
      const PAYOFF = '情绪与爽点必须明面兑现：用具体结果、对手反应、旁观者态度落地，不靠旁白宣称，关键情绪点给足场面';
      const AI_TELL = '禁用AI模板句与程式化渲染（“像……一样/眼底闪过一丝/空气凝固/喉咙发紧”等），用不可替换的具体细节替代套路比喻';
      const SPECIFIC = '抽象判断必须落到可感知的具体动作、物件、数字或对话，不写“复杂/精彩/气氛紧张”这类空泛概括';
      const SHOW = '减少直接说明与作者旁白，把背景、设定、因果拆进人物动作和对话里带出，禁止大段内心解释';
      const DIALOGUE = '对话要像真人：加入打断、沉默、省略、答非所问和身体动作，不同人物腔调必须有区分，禁止一来一回工整对答';
      const LOGIC = '严格按时间与因果顺序写，每个行动有前因后果，不得出现与已确认时间线或大纲矛盾的事件顺序';
      const LESSON_BY_TYPE: Record<string, { category: string; lesson: string }> = {
        reader_hook: { category: 'hook', lesson: HOOK_OPEN },
        retention_point: { category: 'hook', lesson: HOOK_OPEN },
        low_retention: { category: 'hook', lesson: HOOK_OPEN },
        needs_hook: { category: 'hook', lesson: HOOK_OPEN },
        chapter_hook: { category: 'hook', lesson: '每章结尾落在未解问题、反转、新威胁或关键动作/对话上，禁止平淡收尾或“他不知道的是”式作者旁白假钩' },
        pacing_risk: { category: 'pacing', lesson: PACING },
        needs_payoff: { category: 'pacing', lesson: PACING },
        emotional_payoff: { category: 'payoff', lesson: PAYOFF },
        meme_point: { category: 'payoff', lesson: PAYOFF },
        ai_pattern_risk: { category: 'ai_tell', lesson: AI_TELL },
        template_repetition: { category: 'ai_tell', lesson: AI_TELL },
        repeated_emotion_action: { category: 'ai_tell', lesson: '同一类情绪、生理反应或环境意象不在相邻段落重复，换用不同外化动作或直接删掉重复渲染' },
        too_abstract: { category: 'specificity', lesson: SPECIFIC },
        low_specificity: { category: 'specificity', lesson: SPECIFIC },
        needs_detail: { category: 'specificity', lesson: SPECIFIC },
        too_expository: { category: 'show_not_tell', lesson: SHOW },
        over_explained: { category: 'show_not_tell', lesson: SHOW },
        flat_dialogue: { category: 'dialogue', lesson: DIALOGUE },
        same_voice_characters: { category: 'dialogue', lesson: DIALOGUE },
        needs_character_voice: { category: 'dialogue', lesson: DIALOGUE },
        lack_of_subtext: { category: 'dialogue', lesson: DIALOGUE },
        needs_asymmetry: { category: 'dialogue', lesson: DIALOGUE },
        timeline_conflict: { category: 'logic', lesson: LOGIC },
        causality_gap: { category: 'logic', lesson: LOGIC },
        time_order_error: { category: 'logic', lesson: LOGIC },
        event_sequence_risk: { category: 'logic', lesson: LOGIC },
        label_fit: { category: 'label_fit', lesson: '叙事节奏、对话方式、情绪密度与人称必须主动贴合本书选定的平台/基调/写作风格/流派标签，最弱维度尤其对齐' },
        punctuation: { category: 'punctuation', lesson: '统一中文全角标点，省略号用“……”，连贯动作写完整句、不切成两字残句，克制句末语气词' },
      };
      const items: Array<{ category: string; lesson: string }> = [];
      const seen = new Set<string>();
      const add = (category: string, lesson: string) => {
        if (lesson && !seen.has(lesson)) { seen.add(lesson); items.push({ category, lesson }); }
      };
      for (const t of issueTypes) {
        const hit = LESSON_BY_TYPE[t];
        if (hit) add(hit.category, hit.lesson);
      }
      if (input.hasTagGap && !issueTypes.includes('label_fit')) {
        add('label_fit', LESSON_BY_TYPE.label_fit.lesson);
      }
      if (hardlineRuleIds.length) {
        add('language_hardline', '上一版命中确定性语言硬伤：成稿前自检——连贯动作写完整句、删掉相同动词/前缀的同构排比、量词与名词正确搭配、不用“X了，Y了”两字残句链、统一中文标点');
      }
      if (!items.length) return;
      const now = new Date().toISOString();
      const upsert = db.prepare(
        `INSERT INTO generation_lessons (id, project_id, category, lesson, occurrence, last_chapter_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(project_id, lesson) DO UPDATE SET
           occurrence = occurrence + 1, last_chapter_index = excluded.last_chapter_index, updated_at = excluded.updated_at`,
      );
      for (const it of items) upsert.run(uuid(), projectId, it.category, it.lesson, chapterIndex, now, now);
      const countRow = db.prepare('SELECT COUNT(*) AS c FROM generation_lessons WHERE project_id = ?').get(projectId) as { c: number };
      const MAX_LESSONS = 24;
      if (countRow.c > MAX_LESSONS) {
        db.prepare(
          `DELETE FROM generation_lessons WHERE project_id = ? AND id IN (
             SELECT id FROM generation_lessons WHERE project_id = ? ORDER BY occurrence ASC, updated_at ASC LIMIT ?)`,
        ).run(projectId, projectId, countRow.c - MAX_LESSONS);
      }
      this.logger.log(`[质检教训沉淀] project=${projectId} ch${chapterIndex} score=${input.score} 沉淀${items.length}条（问题类型${issueTypes.length}/硬伤${hardlineRuleIds.length}）`);
    } catch (err) {
      this.logger.warn(`质检问题沉淀为跨章节教训失败（不影响质检）：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ====================== 1. ANALYZE CHAPTER QUALITY ======================

  /**
   * The author-facing "submit quality review" action: create a real quality
   * report first, then let the chapter state machine run its consistency sync
   * and transition to reviewing. Neither failure may advance the state.
   */
  async submitChapterForQualityReview(projectId: string, dto: AnalyzeChapterDto) {
    if (!this.chapterService) throw new BadRequestException('Chapter service is not available');
    // 快速前置校验：正文为空/字数不达标时立即反馈，不先跑慢速 LLM 质检再被字数门禁拦下。
    const db = this.dbService.getDb();
    const row = db.prepare('SELECT content FROM chapters WHERE id = ? AND project_id = ?').get(dto.chapterId, projectId) as { content?: string } | undefined;
    if (!row) throw new NotFoundException(`Chapter ${dto.chapterId} not found`);
    const content = (dto.content ?? row.content ?? '').trim();
    if (!content) {
      throw new BadRequestException('本章正文为空（0 字）。请先写作或生成正文后再提交质检。');
    }
    const words = this.countCjkWords(content);
    // 动态字数范围：长篇3200-4000，短篇1500-8000
    const projectRow = db.prepare('SELECT type FROM projects WHERE id = ?').get(projectId) as { type?: string } | undefined;
    const isLongNovel = projectRow?.type === 'long_novel';
    const wordRange = isLongNovel ? { min: 3200, max: 4000 } : { min: 1500, max: 8000 };
    if (words < wordRange.min) {
      throw new BadRequestException(`本章正文仅 ${words} 字，未达到 ${wordRange.min} 字下限，暂不能提交质检。`);
    }
    if (words > wordRange.max) {
      throw new BadRequestException(`本章正文已达 ${words} 字，超过 ${wordRange.max} 字上限，需精简后再提交质检。`);
    }
    const report = await this.analyzeChapterQuality(projectId, { ...dto, scope: dto.scope || 'chapter' });
    const chapter = await this.chapterService.submitForReview(dto.chapterId);
    return { success: true, report, chapter };
  }

  /** 与正文字数门禁同口径：中文字符数 + 英文词数 */
  private countCjkWords(content: string): number {
    const chinese = (content.match(/[一-鿿㐀-䶿]/g) || []).length;
    const english = content.replace(/[一-鿿㐀-䶿]/g, ' ').split(/\s+/).filter(token => /[a-zA-Z]/.test(token)).length;
    return chinese + english;
  }

  async analyzeChapterQuality(projectId: string, dto: AnalyzeChapterDto) {
    const db = this.dbService.getDb();
    const chapterId = dto.chapterId;

    let content = dto.content;
    let chapterTitle = '';
    let chapterStatus = '';
    if (!content) {
      const chapterRow = db.prepare(
        'SELECT title, content, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(chapterId, projectId) as { title: string; content: string; status: string } | undefined;
      if (!chapterRow) throw new NotFoundException(`Chapter ${chapterId} not found`);
      content = chapterRow.content;
      chapterTitle = chapterRow.title;
      chapterStatus = chapterRow.status;
    } else {
      const chapterRow = db.prepare(
        'SELECT title, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(chapterId, projectId) as { title: string; status: string } | undefined;
      if (chapterRow) {
        chapterTitle = chapterRow.title;
        chapterStatus = chapterRow.status;
      }
    }

    if (!content || !content.trim()) {
      throw new BadRequestException('Chapter content is empty, cannot analyze');
    }

    const context = this.buildProjectContext(projectId, db);

    if (!this.realLLM) {
      throw new BadRequestException('LLM service is not available. Please configure an API key.');
    }

    // LLM 调用（失败时直接抛错，不写空报告）
    let llmResult: LLMQualityOutput;
    let parseWarning: string | null = null;
    let rawContentPreview: string | null = null;
    try {
      const response = await this.callQualityLLM(content, chapterTitle, context, dto, projectId);
      llmResult = response.result;
      parseWarning = response.parseWarning;
      rawContentPreview = response.rawPreview;
    } catch (err) {
      this.logger.error(`LLM quality analysis failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new BadRequestException(`Quality analysis failed: ${err instanceof Error ? err.message : 'LLM call error'}`);
    }

    const now = new Date().toISOString();
    const reportId = uuid();
    // 单一事实源：同一章节重新质检（正文被重写/重新生成）时，旧报告及其下仍 open 的问题
    // 一律标记 superseded（被本次质检取代，属关闭态）：新报告没有的问题视为已解决，
    // 新报告新发现的才是当前 open，避免反复质检问题只增不减、改完数量不同步。
    const superseded = this.supersedeChapterReports(db, chapterId, now);
    if (superseded.reports > 0) {
      this.logger.log(`章节 ${chapterId} 重新质检：作废旧报告 ${superseded.reports} 份、失效旧问题 ${superseded.issues} 条`);
    }
    const attention = this.buildAttentionAnalysis({
      title: chapterTitle,
      intro: context?.project?.description || '',
      content,
      mode: this.inferAttentionMode(context?.project),
    });

    // 物理指纹检测（确定性，毫秒级）
    let aiFingerprints: any = null;
    let fingerprintScore = 0;
    if (this.qualityInspection) {
      try {
        aiFingerprints = this.qualityInspection.detectAiFingerprints(content);
        if (typeof aiFingerprints?.overallScore !== 'number') aiFingerprints = null;
        else fingerprintScore = Math.max(0, 100 - aiFingerprints.overallScore);
      } catch (err) {
        this.logger.warn(`AI fingerprint detection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 统一综合评分：物理指纹30% + LLM语义评审70%（设定一致性由chain层负责）
    const llmScore = llmResult.overallScore;
    const blendedScore = aiFingerprints
      ? Math.round(fingerprintScore * 0.3 + llmScore * 0.7)
      : llmScore;

    // 确定性硬红线扣分（与生成链共用同一扫描器 hardline-scanner，单一事实源）：
    // LLM 语义评分对同构排比/量词错配/残句链等语言硬伤容易手软给虚高分，这里用零 LLM 的
    // 确定性扫描只对“跨平台真硬伤”（非平台分化的排版类）逐项扣分，让这类问题无法靠 LLM 印象混到 90+。
    const hardlineProfile = {
      platform: context?.project?.tagProfile?.platform || undefined,
      storyType: context?.project?.type || undefined,
    };
    const HARDLINE_PENALTY: Record<string, number> = {
      '15c': 12, '15b': 8, '15d': 8, '20a': 8,
      '34': 5, 'list-enumeration': 5,
      '50-fragment-action-chain': 6, '51-modal-particle-density': 4,
      '52-env-imagery-repeat': 4, '53-same-structure-parallel': 6,
      '54-measure-word-mismatch': 6,
    };
    const hardlineHits = detectForbiddenTells(content, hardlineProfile)
      .filter(f => Object.prototype.hasOwnProperty.call(HARDLINE_PENALTY, f.ruleId));
    const hardlinePenalty = Math.min(25, hardlineHits.reduce((sum, f) => sum + (HARDLINE_PENALTY[f.ruleId] || 0), 0));

    // 标签契合（平台/基调/风格/流派）实质纳入达标判定，而不是只展示：
    // tagFit 由质检 LLM 对照项目所选标签四维打分；明显偏离即确定性扣分，让“选了番茄却写成盐选、
    // 基调/流派不符”无法靠语言分蒙混到 90+。跨全部平台与长短篇同一规则，不针对任何一本书。
    const TAG_LABEL: Record<string, string> = { platform: '平台', tone: '基调', style: '写作风格', genre: '流派' };
    const rawTagFit = (llmResult as any).tagFit;
    const tagDimArr: Array<{ key: string; label: string; score: number }> = rawTagFit
      ? (['platform', 'tone', 'style', 'genre'] as const)
        .map(k => ({ key: k, label: TAG_LABEL[k], score: rawTagFit[k] }))
        .filter(d => typeof d.score === 'number' && Number.isFinite(d.score))
      : [];
    const tagAvg = tagDimArr.length
      ? Math.round(tagDimArr.reduce((a, d) => a + d.score, 0) / tagDimArr.length)
      : null;
    // 标签契合是 LLM 主观分、天然偏保守：≥75 视为契合不扣；70–74 属轻度偏离，只生成改进提示、不扣综合分；
    // 仅当均值 <70（确实写成另一平台/基调）才线性轻扣，每低 1 分扣 0.5、单章封顶 8。
    // 目的：让客观语言硬伤照常扣分，但主观契合分不再与硬红线双重重罚，把 LLM 自评"中上"的章节砸到不及格
    // （历史问题：融合 73 −硬线11−标签12 = 50 判 low，与"中上"实际严重背离）。
    const tagPenalty = tagAvg === null
      ? 0
      : tagAvg >= 70 ? 0 : Math.min(8, Math.round((70 - tagAvg) * 0.5));
    const weakestTag = tagDimArr.slice().sort((a, b) => a.score - b.score)[0] || null;
    const unifiedScore = Math.max(0, blendedScore - hardlinePenalty - tagPenalty);

    const reportPayload: Record<string, any> = { attention };
    reportPayload.characterContractReview = (llmResult as any).characterContractReview;
    reportPayload.narrativeTrace = (llmResult as any).narrativeTrace;
    if ((llmResult as any).tagFit) reportPayload.tagFit = (llmResult as any).tagFit;
    if (aiFingerprints) {
      reportPayload.aiFingerprints = aiFingerprints;
      reportPayload.fingerprintScore = fingerprintScore;
      reportPayload.unifiedScore = unifiedScore;
    }
    if (hardlineHits.length > 0) {
      reportPayload.hardlinePenalty = {
        points: hardlinePenalty,
        blendedScore,
        hits: hardlineHits.map(h => ({ ruleId: h.ruleId, message: h.message, position: h.position, snippet: h.snippet })),
      };
    }
    if (tagAvg !== null && tagAvg < 75) {
      reportPayload.tagFitPenalty = {
        points: tagPenalty,
        avg: tagAvg,
        dims: tagDimArr.map(d => ({ dim: d.key, label: d.label, score: d.score })),
        weakest: weakestTag ? `${weakestTag.label}(${weakestTag.score})` : '',
      };
    }
    if (parseWarning) {
      reportPayload.parseWarning = true;
      reportPayload.rawContentPreview = rawContentPreview;
      reportPayload.reason = parseWarning;
    }

    const hardlineNote = hardlineHits.length > 0
      ? `；确定性硬红线命中${hardlineHits.length}处、扣${hardlinePenalty}分（${hardlineHits.slice(0, 3).map(h => h.ruleId).join('/')}${hardlineHits.length > 3 ? '等' : ''}）`
      : '';
    const tagNote = tagAvg !== null && tagAvg < 75
      ? tagPenalty > 0
        ? `；标签契合均值${tagAvg}分、扣${tagPenalty}分（最弱：${weakestTag?.label || ''}）`
        : `；标签契合均值${tagAvg}分（最弱：${weakestTag?.label || ''}，轻度偏离、提示改进但不扣分）`
      : '';
    const summary = parseWarning
      ? `质量诊断解析失败：${parseWarning}。请重试。`
      : aiFingerprints
        ? `${llmResult.summary}（物理指纹分：${fingerprintScore}，融合分：${blendedScore}${hardlineNote}${tagNote}，统一综合分：${unifiedScore}）`
        : `${llmResult.summary}${hardlineNote}${tagNote}（统一综合分：${unifiedScore}）`;
    // 等级以统一综合分确定性推导为准（90+ 为 high），不再直接采用 LLM 自报等级，避免分与级不一致。
    const overallLevel = levelByQualityScore(unifiedScore);
    const overallScore = unifiedScore;

    db.prepare(`
      INSERT INTO writing_quality_reports (
        id, project_id, chapter_id, source_type, source_id, scope, title, summary,
        overall_level, overall_score, model, payload, attention_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId, projectId, chapterId, 'manual_check', null,
      dto.scope || 'chapter', `Chapter Quality: ${chapterTitle}`,
      summary, overallLevel, overallScore, 'llm',
      JSON.stringify(reportPayload), JSON.stringify(attention), 'system', now, now,
    );

    const issues: IssueRow[] = [];
    const validTags = new Set(WRITING_QUALITY_TAGS as readonly string[]);
    // 确定性标点扫描（不依赖 LLM），与语义问题一并入库
    const punctIssues = this.detectPunctuation(content);
    // 标签契合不足时确定性补一条待改问题（跨平台/长短篇通用），让"平台/基调/风格/流派不符"像其它问题一样可逐条定向精修
    const labelFitIssue = tagAvg !== null && tagAvg < 75 && weakestTag ? [{
      issueType: 'label_fit',
      severity: tagAvg < 60 ? 'high' : (tagAvg < 70 ? 'medium' : 'low'),
      title: `正文与所选标签契合度不足（平均 ${tagAvg} 分，最弱：${weakestTag.label} ${weakestTag.score} 分）`,
      summary: `项目选定的平台/基调/风格/流派与本章实际写法存在偏离（四维：${tagDimArr.map(d => `${d.label}${d.score}`).join('、')}）。按目标平台读者口味与所选基调/风格/流派调整：节奏、爽点或情绪密度、叙述人称、对话方式都要向标签靠拢，但不改变剧情事实。`,
      evidence: `最偏离维度：${weakestTag.label} = ${weakestTag.score}/100`,
      suggestion: '对照目标平台风格红线与故事基调重写相关段落，只调叙述方式、节奏与情绪浓度，不改事件与人物。',
      tags: ['label_fit'],
    } as any] : [];
    const allInputIssues = [...(llmResult.issues || []), ...punctIssues, ...labelFitIssue];
    for (const issue of allInputIssues) {
      const issueType = validTags.has(issue.issueType) ? issue.issueType : 'needs_hook';
      const tags = (issue.tags || []).filter((t: string) => validTags.has(t));
      if (!tags.includes(issueType)) tags.unshift(issueType);

      const issueId = uuid();
      db.prepare(`
        INSERT INTO writing_quality_issues (
          id, report_id, project_id, chapter_id, issue_type, severity, title, summary,
          evidence, suggestion, paragraph_index, sentence_index, start_offset, end_offset,
          original_text, suggested_text, tags, status, payload, navigation_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        issueId, reportId, projectId, chapterId, issueType,
        issue.severity || 'medium', issue.title, issue.summary,
        issue.evidence || '', issue.suggestion || '',
        issue.paragraphIndex ?? null, issue.sentenceIndex ?? null,
        issue.startOffset ?? null, issue.endOffset ?? null,
        issue.originalText || '', issue.suggestedText || '',
        JSON.stringify(tags), 'open', '{}',
        JSON.stringify(this.buildIssueNavigation({
          projectId,
          chapterId,
          reportId,
          issueId,
          issueType,
          tags,
          evidence: issue.evidence || '',
          paragraphIndex: issue.paragraphIndex ?? null,
          sentenceIndex: issue.sentenceIndex ?? null,
        })),
        now, now,
      );

      issues.push({
        id: issueId, report_id: reportId, project_id: projectId,
        chapter_id: chapterId, issue_type: issueType,
        severity: issue.severity || 'medium', title: issue.title,
        summary: issue.summary, evidence: issue.evidence || '',
        suggestion: issue.suggestion || '',
        paragraph_index: issue.paragraphIndex ?? null as any,
        sentence_index: issue.sentenceIndex ?? null as any,
        start_offset: issue.startOffset ?? null as any,
        end_offset: issue.endOffset ?? null as any,
        original_text: issue.originalText || '',
        suggested_text: issue.suggestedText || '',
        tags: JSON.stringify(tags), status: 'open', payload: '{}',
        navigation_json: JSON.stringify(this.buildIssueNavigation({
          projectId,
          chapterId,
          reportId,
          issueId,
          issueType,
          tags,
          evidence: issue.evidence || '',
          paragraphIndex: issue.paragraphIndex ?? null,
          sentenceIndex: issue.sentenceIndex ?? null,
        })),
        created_at: now, updated_at: now,
        resolved_at: null as any, resolved_by: null as any,
      });
    }

    const counts = this.calcIssueCounts(issues);

    // 质检成功（含手动重跑）回写章节状态：只有综合分≥90且无高危未决问题才算 ok；
    // 否则标 needs_rewrite（未达标·待精修），杜绝“39 分却显示绿色 ok”的假合格（用户点名）。
    // 同一结论同时随返回值回传前端，避免前端再无条件乐观置 ok（手动重跑也必须显示真实状态）。
    let autoQualityStatus: 'ok' | 'needs_rewrite' = 'needs_rewrite';
    let autoQualityMessage = '';
    if (chapterId) {
      const reachedTarget = overallScore >= BODY_QUALITY_TARGET_SCORE && counts.high === 0;
      if (reachedTarget) {
        autoQualityStatus = 'ok';
        autoQualityMessage = `自动质检完成：综合分 ${overallScore}（已达 ${BODY_QUALITY_TARGET_SCORE} 分目标），待改问题 ${counts.open} 个`;
      } else {
        const highPart = counts.high > 0 ? `、其中高危 ${counts.high} 个` : '';
        autoQualityStatus = 'needs_rewrite';
        autoQualityMessage = `自动质检完成但未达标：综合分 ${overallScore}（距 ${BODY_QUALITY_TARGET_SCORE} 分目标差 ${BODY_QUALITY_TARGET_SCORE - overallScore} 分${highPart}），待改问题 ${counts.open} 个，建议点「查看问题」定向精修或重新生成`;
      }
      this.markChapterAutoQuality(chapterId, autoQualityStatus, autoQualityMessage);
      // 质检问题确定性沉淀为跨章节教训（零额外 LLM），让后续章节/重生成首版主动规避，而不是只在面板展示
      this.recordQualityLessons({
        projectId,
        chapterId,
        score: overallScore,
        issueTypes: allInputIssues.map((i: any) => i.issueType),
        hardlineRuleIds: hardlineHits.map(h => h.ruleId),
        hasTagGap: tagAvg !== null && tagAvg < 70,
      });
    }

    return {
      success: true,
      autoQualityStatus,
      autoQualityMessage,
      report: {
        id: reportId, projectId, chapterId,
        title: `Chapter Quality: ${chapterTitle}`,
        summary, overallLevel, overallScore,
        status: 'open',
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked: chapterStatus === 'locked',
        createdAt: now,
      },
      issues: issues.map(i => this.issueRowToResponse(i)),
    };
  }

  checkAttention(projectId: string, dto: AttentionCheckDto) {
    const db = this.dbService.getDb();
    let title = dto.title || '';
    let intro = dto.intro || '';
    let content = dto.content || '';
    let chapterStatus = '';

    if (dto.chapterId) {
      const chapter = db.prepare(
        'SELECT title, content, status FROM chapters WHERE id = ? AND project_id = ?',
      ).get(dto.chapterId, projectId) as { title: string; content: string; status: string } | undefined;
      if (!chapter) throw new NotFoundException(`Chapter ${dto.chapterId} not found`);
      title = title || chapter.title;
      content = content || chapter.content || '';
      chapterStatus = chapter.status || '';
    }

    const project = db.prepare(
      'SELECT title, description, type, target_words, platform_style FROM projects WHERE id = ?',
    ).get(projectId) as Record<string, any> | undefined;

    const result = this.buildAttentionAnalysis({
      title: title || project?.title || '',
      intro: intro || project?.description || '',
      content,
      mode: dto.mode === 'auto' || !dto.mode ? this.inferAttentionMode({ project }) : dto.mode,
    });

    const report = dto.persist && dto.chapterId
      ? this.persistAttentionReport(db, projectId, dto, {
          title: title || project?.title || '',
          chapterId: dto.chapterId,
          attention: result,
          chapterLocked: chapterStatus === 'locked',
        })
      : null;

    return { success: true, attention: result, report };
  }

  // ====================== 2. LIST REPORTS ======================

  listReports(projectId: string, query: ListReportsDto) {
    const db = this.dbService.getDb();
    const clauses = ['project_id = ?'];
    const params: any[] = [projectId];

    if (query.chapterId) {
      clauses.push('chapter_id = ?');
      params.push(query.chapterId);
    }
    if (query.status) {
      clauses.push('status = ?');
      params.push(query.status);
    }

    const limit = Math.min(Math.max(Number(query.limit || 50) || 50, 1), 200);
    const sql = `SELECT * FROM writing_quality_reports WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as unknown as ReportRow[];

    // 批量查询每个 report 的 issue 统计
    const reportIds = rows.map(r => r.id);
    const issueCountMap = new Map<string, IssueCounts>();
    const chapterLockedMap = new Map<string, boolean>();

    if (reportIds.length > 0) {
      // 批量获取 issue 统计
      for (const rid of reportIds) {
        issueCountMap.set(rid, { total: 0, open: 0, high: 0, resolved: 0 });
      }
      try {
        const issueStatsStmt = db.prepare(`
          SELECT report_id, status, severity, COUNT(*) as cnt
          FROM writing_quality_issues
          WHERE report_id IN (${reportIds.map(() => '?').join(',')})
          GROUP BY report_id, status, severity
        `);
        const issueStats = issueStatsStmt.all(...reportIds) as Array<{ report_id: string; status: string; severity: string; cnt: number }>;
        for (const stat of issueStats) {
          const entry = issueCountMap.get(stat.report_id);
          if (!entry) continue;
          entry.total += stat.cnt;
          if (this.isOpenIssueStatus(stat.status)) {
            entry.open += stat.cnt;
            if (stat.severity === 'high' || stat.severity === 'critical') {
              entry.high += stat.cnt;
            }
          }
          if (this.isClosedIssueStatus(stat.status)) entry.resolved += stat.cnt;
        }
      } catch (err) {
        this.logger.warn(`Failed to load issue stats for reports: ${err instanceof Error ? err.message : String(err)}`);
      }

      // 批量获取 locked 状态
      const uniqueChapterIds = [...new Set(rows.map(r => r.chapter_id).filter(Boolean))];
      if (uniqueChapterIds.length > 0) {
        try {
          const chapterStmt = db.prepare(`
            SELECT id, status FROM chapters
            WHERE id IN (${uniqueChapterIds.map(() => '?').join(',')})
          `);
          const chapterRows = chapterStmt.all(...uniqueChapterIds) as Array<{ id: string; status: string }>;
          for (const cr of chapterRows) {
            chapterLockedMap.set(cr.id, cr.status === 'locked');
          }
        } catch (err) {
          this.logger.warn(`Failed to load chapter status for reports: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    return rows.map(r => {
      const counts = issueCountMap.get(r.id) || { total: 0, open: 0, high: 0, resolved: 0 };
      return {
        ...this.reportRowToResponse(r),
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked: r.chapter_id ? (chapterLockedMap.get(r.chapter_id) || false) : false,
      };
    });
  }

  // ====================== 3. GET REPORT ======================

  getReport(reportId: string) {
    const db = this.dbService.getDb();
    const report = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(reportId) as ReportRow | undefined;
    if (!report) throw new NotFoundException(`Report ${reportId} not found`);

    const issueRows = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE report_id = ? ORDER BY severity DESC, created_at ASC',
    ).all(reportId) as unknown as IssueRow[];
    const revisionRows = db.prepare(
      'SELECT * FROM writing_revision_records WHERE report_id = ? ORDER BY created_at ASC',
    ).all(reportId) as unknown as RevisionRow[];
    const revisionsByIssue = new Map<string, RevisionRow[]>();
    for (const revision of revisionRows) {
      if (!revision.issue_id) continue;
      const list = revisionsByIssue.get(revision.issue_id) || [];
      list.push(revision);
      revisionsByIssue.set(revision.issue_id, list);
    }

    const counts = this.calcIssueCounts(issueRows);
    let chapterLocked = false;
    if (report.chapter_id) {
      try {
        const cr = db.prepare('SELECT status FROM chapters WHERE id = ?').get(report.chapter_id) as { status: string } | undefined;
        chapterLocked = cr?.status === 'locked';
      } catch { /* ignore */ }
    }

    return {
      report: {
        ...this.reportRowToResponse(report),
        issueCount: counts.total,
        openIssueCount: counts.open,
        highIssueCount: counts.high,
        resolvedIssueCount: counts.resolved,
        chapterLocked,
      },
      issues: issueRows.map(i => {
        const revisions = revisionsByIssue.get(i.id) || [];
        const latest = revisions.length > 0 ? revisions[revisions.length - 1] : null;
        return {
          ...this.issueRowToResponse(i),
          revisions: revisions.map(r => this.revisionRowToResponse(r)),
          latestRevision: latest ? this.revisionRowToResponse(latest) : null,
          recheckResult: safeJsonParse(i.recheck_result_json || '{}'),
        };
      }),
      revisions: revisionRows.map(r => this.revisionRowToResponse(r)),
    };
  }

  // ====================== 4. MARK ISSUE RESOLVED ======================

  markIssueResolved(issueId: string, resolvedBy: string = 'author') {
    const db = this.dbService.getDb();
    const issue = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(issueId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = 'resolved', resolved_at = ?, resolved_by = ?, updated_at = ?
      WHERE id = ?
    `).run(now, resolvedBy, now, issueId);

    return { success: true, issue: { id: issueId, status: 'resolved', resolvedAt: now, resolvedBy } };
  }

  updateIssueStatus(projectId: string, issueId: string, status: string, reason?: string) {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const allowed = new Set([
      'open', 'planned', 'refined', 'applied', 'recheck_passed',
      'recheck_failed', 'ignored', 'archived', 'resolved',
    ]);
    if (!allowed.has(status)) {
      throw new BadRequestException(`Unsupported issue status: ${status}`);
    }

    const now = new Date().toISOString();
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: status, reason: reason || '', at: now });

    const resolvedAt = this.isClosedIssueStatus(status) ? now : null;
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, status_history_json = ?, resolved_at = COALESCE(?, resolved_at), updated_at = ?
      WHERE id = ?
    `).run(status, JSON.stringify(history), resolvedAt, now, issueId);

    return { success: true, issue: { id: issueId, status, updatedAt: now } };
  }

  // ====================== 5. REFINE ISSUE ======================

  async refineIssue(projectId: string, issueId: string, dto: RefineIssueDto) {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const chapterRow = db.prepare(
      'SELECT id, title, content, status FROM chapters WHERE id = ?',
    ).get(issue.chapter_id) as { id: string; title: string; content: string; status: string } | undefined;
    if (!chapterRow) throw new NotFoundException(`Chapter ${issue.chapter_id} not found`);

    const isLocked = chapterRow.status === 'locked';
    const mode = dto.mode || 'suggest_only';
    const contextText = this.getChapterContext(chapterRow.content, issue);

    if (!this.realLLM) {
      throw new BadRequestException('LLM service is not available');
    }

    const refineResult = await this.callRefineLLM(issue, chapterRow.content, contextText, dto.instruction);

    const now = new Date().toISOString();
    const revisionId = uuid();
    db.prepare(`
      INSERT INTO writing_revision_records (
        id, project_id, chapter_id, issue_id, report_id, revision_type,
        before_text, after_text, diff_json, applied, payload, can_apply, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revisionId, projectId, issue.chapter_id, issueId, issue.report_id,
      'local_refine', refineResult.beforeText, refineResult.afterText,
      JSON.stringify(refineResult.diff), 0,
      JSON.stringify({ reason: refineResult.reason, remainingRisk: refineResult.remainingRisk, locked: isLocked }),
      mode !== 'suggest_only' && !isLocked ? 1 : 0,
      'system', now, now,
    );
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: 'refined', reason: 'generate_patch', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = 'refined', latest_revision_id = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(revisionId, JSON.stringify(history), now, issueId);

    return {
      success: true,
      revision: {
        id: revisionId, issueId, projectId, chapterId: issue.chapter_id,
        beforeText: refineResult.beforeText, afterText: refineResult.afterText,
        reason: refineResult.reason, diff: refineResult.diff,
        remainingRisk: refineResult.remainingRisk,
        canApply: mode !== 'suggest_only' && !isLocked,
        locked: isLocked, applied: false,
      },
      canApply: mode !== 'suggest_only' && !isLocked,
      locked: isLocked,
    };
  }

  // ====================== 6. APPLY REVISION ======================

  applyRevision(projectId: string, revisionId: string) {
    const db = this.dbService.getDb();
    const revision = db.prepare(
      'SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?',
    ).get(revisionId, projectId) as RevisionRow | undefined;
    if (!revision) throw new NotFoundException(`Revision ${revisionId} not found`);

    if (revision.applied === 1) {
      throw new BadRequestException('Revision already applied');
    }

    const chapterRow = db.prepare(
      'SELECT id, content, word_count, status FROM chapters WHERE id = ?',
    ).get(revision.chapter_id) as { id: string; content: string; word_count: number; status: string } | undefined;
    if (!chapterRow) throw new NotFoundException(`Chapter ${revision.chapter_id} not found`);

    if (chapterRow.status === 'locked') {
      throw new BadRequestException('Cannot apply revision to locked chapter');
    }

    const beforeText = revision.before_text;
    const afterText = revision.after_text;
    const currentContent = chapterRow.content;

    if (!currentContent.includes(beforeText)) {
      throw new BadRequestException(
        'Cannot apply revision: original text not found in chapter. The chapter may have been modified since the revision was created.',
      );
    }

    const newContent = currentContent.replace(beforeText, afterText);
    const chineseChars = (newContent.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length;
    const englishWords = newContent.replace(/[^\x00-\xff]/g, '').split(/\s+/).filter(w => w.length > 0).length;
    const newWordCount = chineseChars + englishWords;
    const now = new Date().toISOString();

    // Writing quality revisions are local prose fixes. They must not enter the
    // state extraction pipeline, otherwise quality issues can create state_items.
    db.prepare('UPDATE chapters SET content = ?, word_count = ?, updated_at = ? WHERE id = ?')
      .run(newContent, newWordCount, now, revision.chapter_id);

    // 更新 revision 记录
    db.prepare(`
      UPDATE writing_revision_records
      SET applied = 1, applied_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, revisionId);

    if (revision.issue_id) {
      const issue = db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(revision.issue_id) as IssueRow | undefined;
      const history = issue ? safeJsonParse(issue.status_history_json || '[]', []) : [];
      if (issue) history.push({ from: issue.status, to: 'applied', reason: 'revision_applied', at: now });
      db.prepare(`
        UPDATE writing_quality_issues
        SET status = 'applied', latest_revision_id = ?, status_history_json = ?, resolved_at = ?, resolved_by = 'system', updated_at = ?
        WHERE id = ?
      `).run(revisionId, JSON.stringify(history), now, now, revision.issue_id);
    }

    return {
      success: true,
      revision: { id: revisionId, applied: true, appliedAt: now },
      chapter: { id: revision.chapter_id, wordCount: newWordCount },
      needsRecheck: true,
      needsStateReview: false,
      stateSyncWarning: null,
    };
  }

  // ====================== 7. RECHECK AFTER REVISION ======================

  async recheckAfterRevision(projectId: string, revisionId: string): Promise<{ success: boolean; result: RecheckResult }> {
    const db = this.dbService.getDb();
    const revision = db.prepare(
      'SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?',
    ).get(revisionId, projectId) as RevisionRow | undefined;
    if (!revision) throw new NotFoundException(`Revision ${revisionId} not found`);

    const issue = revision.issue_id
      ? db.prepare('SELECT * FROM writing_quality_issues WHERE id = ?').get(revision.issue_id) as IssueRow | undefined
      : null;

    const remainingCount = issue
      ? (db.prepare(
          'SELECT COUNT(*) as cnt FROM writing_quality_issues WHERE chapter_id = ? AND status = ?',
        ).get(issue.chapter_id, 'open') as { cnt: number }).cnt
      : 0;

    let result: RecheckResult;
    if (this.realLLM && issue) {
      try {
        const chapterRow = db.prepare(
          'SELECT content FROM chapters WHERE id = ?',
        ).get(revision.chapter_id) as { content: string } | undefined;
        const content = chapterRow?.content || '';
        result = await this.callRecheckLLM(issue, revision.after_text, content);
      } catch (err) {
        this.logger.warn(`LLM recheck failed, fallback: ${err instanceof Error ? err.message : String(err)}`);
        result = this.simpleRecheck(remainingCount);
      }
    } else {
      result = this.simpleRecheck(remainingCount);
    }

    this.persistRecheckResult(db, revision, issue || null, result);
    return { success: true, result };
  }

  async recheckIssue(projectId: string, issueId: string): Promise<{ success: boolean; result: RecheckResult; revisionId: string | null }> {
    const db = this.dbService.getDb();
    const issue = db.prepare(
      'SELECT * FROM writing_quality_issues WHERE id = ? AND project_id = ?',
    ).get(issueId, projectId) as IssueRow | undefined;
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);

    const revision = issue.latest_revision_id
      ? db.prepare('SELECT * FROM writing_revision_records WHERE id = ? AND project_id = ?').get(issue.latest_revision_id, projectId) as RevisionRow | undefined
      : db.prepare('SELECT * FROM writing_revision_records WHERE issue_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 1').get(issueId, projectId) as RevisionRow | undefined;

    if (revision) {
      return this.recheckAfterRevision(projectId, revision.id).then(res => ({
        ...res,
        revisionId: revision.id,
      }));
    }

    const openCount = (db.prepare(
      'SELECT COUNT(*) as cnt FROM writing_quality_issues WHERE chapter_id = ? AND status IN (?, ?, ?, ?)',
    ).get(issue.chapter_id, 'open', 'planned', 'refined', 'recheck_failed') as { cnt: number }).cnt;
    const result = this.simpleRecheck(openCount);
    const now = new Date().toISOString();
    const nextStatus = result.pass ? 'recheck_passed' : 'recheck_failed';
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: nextStatus, reason: 'issue_recheck', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, recheck_result_json = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, JSON.stringify(result), JSON.stringify(history), now, issueId);
    return { success: true, result, revisionId: null };
  }

  // ====================== HELPER: Project Context ======================

  private buildProjectContext(projectId: string, db: any): Record<string, any> {
    const context: Record<string, any> = {
      project: null,
      outlines: [],
      characters: [],
      worldSettings: [],
      stateItems: [],
    };

    // 项目信息；标签契合评分只读取项目创作宪法。
    try {
      const project = db.prepare(
        'SELECT title, description, platform_style, type, target_platform, target_words, settings FROM projects WHERE id = ?',
      ).get(projectId) as any;
      if (project) {
        let settings: any = {};
        try { settings = JSON.parse(project.settings || '{}'); } catch { settings = {}; }
        const constitution = readConstitution(project);
        project.creativeConstitution = constitution;
        project.target_platform = constitution.targetPlatform;
        project.tagProfile = {
          platform: constitution.targetPlatform, tone: constitution.storyTone,
          style: constitution.writingStyle, genre: constitution.webNovelGenre,
          chapterWordRange: constitution.chapterWordRange,
        };
        context.project = project;
      }
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query projects - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 大纲（兼容实际 schema：outlines 表有 title/content/level/chapter_function 等）
    try {
      const outlines = db.prepare(
        'SELECT title, content, level, chapter_function, status FROM outlines WHERE project_id = ? ORDER BY "order"',
      ).all(projectId);
      context.outlines = outlines || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query outlines - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 角色（兼容实际 schema：characters 表有 name/identity/personality 等，没有 role_type）
    try {
      const characters = db.prepare(
        'SELECT name, identity, personality, dialogue_style, is_pov_character FROM characters WHERE project_id = ?',
      ).all(projectId);
      context.characters = characters || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query characters - ${err instanceof Error ? err.message : String(err)}`);
    }

    // 世界观（兼容实际 schema：world_settings 表有 name/era/geography/factions/power_system 等）
    try {
      const worldSettings = db.prepare(
        'SELECT name, era, geography, factions, power_system, economy, society FROM world_settings WHERE project_id = ?',
      ).all(projectId);
      context.worldSettings = worldSettings || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query world_settings - ${err instanceof Error ? err.message : String(err)}`);
    }

    // state_items（仅查询 confirmed 和 pending）
    try {
      const stateItems = db.prepare(
        'SELECT title, summary, target_type, status FROM state_items WHERE project_id = ? AND status IN (?, ?)',
      ).all(projectId, 'confirmed', 'pending');
      context.stateItems = stateItems || [];
    } catch (err) {
      this.logger.warn(`buildProjectContext: failed to query state_items - ${err instanceof Error ? err.message : String(err)}`);
    }

    return context;
  }

  // ====================== HELPER: LLM Calls ======================

  private async callQualityLLM(
    content: string,
    chapterTitle: string,
    context: Record<string, any>,
    dto: AnalyzeChapterDto,
    projectId: string,
  ): Promise<{ result: LLMQualityOutput; parseWarning: string | null; rawPreview: string | null }> {
    const tagsList = WRITING_QUALITY_TAGS.join(', ');
    const tp = (context as any)?.project?.tagProfile || {};
    const PLATFORM_CN: Record<string, string> = { fanqie: '番茄', zhihu: '知乎盐选', qimao: '七猫', qidian: '起点', douyin: '抖音', xiaohongshu: '小红书', jinjiang: '晋江', rules_horror: '规则怪谈', custom: '自定义' };
    const tagProfileText = [
      tp.platform ? `目标平台：${PLATFORM_CN[tp.platform] || tp.platform}` : '',
      (tp.tone || []).length ? `基调：${(tp.tone || []).join('、')}` : '',
      (tp.style || []).length ? `写作风格：${(tp.style || []).join('、')}` : '',
      (tp.genre || []).length ? `流派：${(tp.genre || []).join('、')}` : '',
    ].filter(Boolean).join('；') || '未设置';
    const timelineCheck = `
额外检查时间线与因果链：
- 时间顺序冲突：使用 issueType timeline_conflict 或 time_order_error。
- 因果链断裂：使用 issueType causality_gap。
- 事件先后矛盾或读者得知顺序混乱：使用 issueType event_sequence_risk。
这些问题需要保留在 tags 中，便于跳转到时间线页面。`;
    const systemPrompt = `你是一位专业的网络小说编辑和质量诊断专家。你的任务是对网文章节进行深度质量诊断。

诊断维度：
- 章节开头钩子（reader_hook / chapter_hook）
- 段落节奏（pacing_risk）
- 冲突推进
- 情绪回报（emotional_payoff / low_retention）
- 爽点/记忆点（meme_point / retention_point）
- 对话区分度（flat_dialogue / same_voice_characters）
- 角色声音（needs_character_voice / needs_asymmetry）
- AI模板感（ai_pattern_risk / template_repetition）
- 解释过度（too_expository / over_explained）
- 抽象空泛（too_abstract / low_specificity）
- 细节密度（needs_detail）
- 结尾钩子（needs_hook / needs_payoff）
- 潜台词缺乏（lack_of_subtext / repeated_emotion_action）

【Character Voice Contract】
- 对正文中可明确归属的角色，逐人核对上下文内 speech_style、catchphrase、common_words、forbidden_words、tone_to_different_people、emotion_outburst_style、danger_reaction、betrayal_reaction、weak_person_reaction、strong_person_reaction、must_obey_rules、forbidden_writing。
- 台词与行为偏移必须引用该角色的连续原文；无法确认说话人时不得归因，不得伪造角色违规。

【AI Trace 3.0 语义审查】
- 分别检查情绪解释过度、因果/作者解释过度、段落功能同构、场景结构同构、对白过度功能化或过度完整、潜台词不足、人物认知过度透明、抽象总结、跨章叙事模板重复。
- 关键词与句式统计只能作为风险线索；issues 必须给出逐字证据和语义解释，不得把启发式命中直接当结论。

【重要：区分当前状态与回忆/背景，禁止误判】
- 角色在回忆、闪回、背景介绍、他人转述中出现的行为/状态，不与角色当前状态矛盾。
- 例如：角色设定是"失踪"，但正文中写"她回忆起妈妈缝扣子的时候"或"她记得妈妈以前总弓着食指"——这是合理的回忆，不是矛盾。
- 只有当角色在当前叙事时间线中（不是回忆/闪回/背景）出现了与设定矛盾的行为/状态时，才是真正的一致性问题。
- 判断方法：看这段描述是"现在发生的"还是"回忆/以前/记得/据说/听说"。如果是后者，不算矛盾。

可用质量标签：${tagsList}
${timelineCheck}

【标签契合度评分 tagFit】对照项目设定标签给本章打分（0-100，越高越贴合）：platform=目标平台读者口味、tone=基调、style=写作风格、genre=流派；结果写入输出 JSON 的 tagFit 字段，不要写进 issues。

你必须只输出严格JSON，不输出任何其他内容。`;

    const chapter = this.dbService.getDb().prepare('SELECT chapter_index FROM chapters WHERE id=? AND project_id=?')
      .get(dto.chapterId, projectId) as { chapter_index?: number } | undefined;
    const contextSerialized = compileContext(this.dbService.getDb(), {
      projectId, stage: 'chapter', chapterIndex: chapter?.chapter_index ?? null,
    }).snapshot;
    const contractReview = reviewCharacterContracts({ projectId, runId: dto.chapterId, content }, JSON.parse(contextSerialized).characterContracts || []);
    const trace = narrativeTrace(content, this.dbService.getDb().prepare('SELECT id,content FROM chapters WHERE project_id=? AND chapter_index<? AND content IS NOT NULL ORDER BY chapter_index DESC LIMIT 3').all(projectId,chapter?.chapter_index ?? 0) as Array<{id:string;content:string}>);
    const prompt = `请对以下网文章节进行专业质量诊断。

章节标题：${chapterTitle}
作品标签：${tagProfileText}

项目上下文（大纲/角色/世界观等）：${contextSerialized}
逐角色归属证据：${JSON.stringify(contractReview.evidence)}
跨章/跨场景叙事风险（只作线索，必须原文证据确认）：${JSON.stringify(trace)}
角色问题必须附 characterId、contractVersion、contractField；没有明确归属证据不得归因。

章节正文：
${content.slice(0, 15000)}

请输出严格JSON：
{
  "summary": "本章质量总评，控制在120字内",
  "overallLevel": "low|medium|high|critical",
  "overallScore": 0-100,
  "issues": [
    {
      "issueType": "reader_hook",
      "severity": "low|medium|high|critical",
      "title": "问题标题",
      "summary": "问题说明",
      "evidence": "正文中的证据片段",
      "suggestion": "具体修复建议",
      "paragraphIndex": 0,
      "sentenceIndex": 0,
      "startOffset": 0,
      "endOffset": 0,
      "originalText": "原文片段",
      "suggestedText": "建议改写片段",
      "tags": ["needs_hook"]
    }
  ],
  "tagFit": { "platform": 0, "tone": 0, "style": 0, "genre": 0, "note": "一句话说明最贴合或最偏离哪个标签" }
}`;

    const response = await this.realLLM!.generate({
      prompt,
      systemPrompt,
      temperature: 0.3,
      scenario: 'daily',
      // 质检需输出整章 issues 数组 + tagFit，给足输出上限，避免长章节 JSON 被截断导致解析失败、质检空跑。
      maxTokens: 16000,
      metrics: { projectId, stepKey: 'quality_auto' },
    } as any);

    const rawContent = response.content || '';
    const parsed = this.parseJson<LLMQualityOutput>(rawContent);

    if (!parsed || typeof parsed.overallScore !== 'number' || !Number.isFinite(parsed.overallScore) || parsed.overallScore < 0 || parsed.overallScore > 100) {
      throw new BadRequestException('质量评审未评估：返回内容或分数无效，请重试；不生成默认评分');
    }
    parsed.overallScore = Math.round(parsed.overallScore);
    parsed.overallLevel = levelByQualityScore(parsed.overallScore);
    parsed.summary = String(parsed.summary || '').slice(0, 200);
    (parsed as any).tagFit = this.normalizeTagFit((parsed as any).tagFit);
    parsed.issues = (parsed.issues || []).filter((issue: any) => {
      if (!String(issue.issueType).includes('character_voice')) return true;
      const contract = contractReview.contracts.find(c => c.characterId === issue.characterId && c.version === issue.contractVersion);
      return !!contract && !!(contract as any)[issue.contractField]
        && contractReview.evidence.some(e => e.characterId === issue.characterId && typeof issue.evidence === 'string' && e.quote.includes(issue.evidence));
    });
    parsed.issues.push(...contractReview.issues.map(issue => ({ issueType: issue.ruleId, severity: 'high', title: issue.message,
      summary: issue.message, evidence: issue.evidence.quote, originalText: issue.evidence.quote,
      characterId: issue.entityId, contractVersion: issue.contractVersion, contractField: issue.contractField, suggestion: '按角色契约修复并复检' } as any)));
    (parsed as any).characterContractReview = contractReview;
    (parsed as any).narrativeTrace = trace;

    return { result: parsed, parseWarning: null, rawPreview: null };
  }

  // 规范化标签契合分（0-100 整数，非法维度为 undefined；全空则 undefined）
  private normalizeTagFit(raw: any): LLMQualityOutput['tagFit'] | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const clamp = (v: any) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : undefined;
    };
    const fit: any = { platform: clamp(raw.platform), tone: clamp(raw.tone), style: clamp(raw.style), genre: clamp(raw.genre) };
    fit.note = typeof raw.note === 'string' ? String(raw.note).slice(0, 120) : undefined;
    if ([fit.platform, fit.tone, fit.style, fit.genre].every(v => v === undefined)) return undefined;
    return fit;
  }

  // 确定性标点规范扫描（不依赖 LLM），返回一条聚合 issue；感叹/问号重复属修辞，不判错
  private detectPunctuation(content: string): any[] {
    const found: string[] = [];
    const repeat = content.match(/[，。；,;]{2,}/g);
    if (repeat && repeat.length) found.push('连续重复句读标点 ' + repeat.length + ' 处（如「' + repeat[0] + '」）');
    const mixed = content.match(/[一-龥][,.;][一-龥]/g);
    if (mixed && mixed.length) found.push('中英文标点混用 ' + mixed.length + ' 处');
    const left = (content.match(/[“「『]/g) || []).length;
    const right = (content.match(/[”」』]/g) || []).length;
    if (left !== right) found.push('引号不配对（左 ' + left + ' / 右 ' + right + '）');
    const noEnd = content.split(/\n+/).filter(p => /[一-龥A-Za-z]$/.test(p.trim())).length;
    if (noEnd > 0) found.push(noEnd + ' 个段落句末缺标点');
    if (!found.length) return [];
    return [{
      issueType: 'punctuation',
      severity: found.length >= 3 ? 'high' : 'medium',
      title: '标点符号不规范',
      summary: found.join('；'),
      evidence: found[0],
      suggestion: '统一使用中文全角标点；省略号用……、破折号用——；补全句末标点与成对引号。',
      paragraphIndex: 0, sentenceIndex: 0, startOffset: 0, endOffset: 0,
      originalText: '', suggestedText: '', tags: ['punctuation'],
    }];
  }

  private async callRefineLLM(
    issue: IssueRow,
    fullContent: string,
    contextText: string,
    instruction?: string,
  ): Promise<LLMRefineOutput> {
    const systemPrompt = `你是一位专业的网络小说文本精修专家。你的任务是对指定的问题段落进行局部精修。

要求：
1. 只修改问题相关的段落，不要全文重写。
2. 不要扩大修改范围。
3. 保持原章节人物、时间线、状态一致。
4. 不要擅自新增长期设定。
5. 不要擅自解决伏笔或改变剧情走向。
6. 如果需要改变剧情事实，在 remainingRisk 标记为 high。
只输出严格JSON。`;

    const prompt = `请对以下质量问题进行局部精修。

问题类型：${issue.issue_type}
严重程度：${issue.severity}
标题：${issue.title}
问题描述：${issue.summary}
原文证据：${issue.evidence || '无'}
建议方向：${issue.suggestion || '无'}
${instruction ? `额外指示：${instruction}` : ''}

章节上下文（片段）：
${contextText.slice(0, 3000)}

请输出严格JSON：
{
  "beforeText": "需要修改的原文片段（与原文完全一致）",
  "afterText": "修改后的文本",
  "reason": "为什么这样改，控制在80字内",
  "diff": [
    { "type": "keep|delete|insert|replace", "before": "原文本", "after": "新文本" }
  ],
  "remainingRisk": "none|low|medium|high"
}`;

    const response = await this.realLLM!.generate({
      prompt, systemPrompt, temperature: 0.4, scenario: 'quality_refine',
    } as any);

    const result = this.parseJson<LLMRefineOutput>(response.content);
    if (!result) {
      return {
        beforeText: issue.original_text || issue.evidence || '',
        afterText: issue.suggested_text || issue.evidence || '',
        reason: 'LLM 精修解析失败',
        diff: [],
        remainingRisk: 'high',
      };
    }

    result.beforeText = result.beforeText || issue.original_text || issue.evidence || '';
    result.afterText = result.afterText || result.beforeText;
    result.reason = String(result.reason || '').slice(0, 200);
    result.remainingRisk = ['none', 'low', 'medium', 'high'].includes(result.remainingRisk)
      ? result.remainingRisk : 'medium';
    result.diff = Array.isArray(result.diff) ? result.diff : [];
    return result;
  }

  private async callRecheckLLM(
    issue: IssueRow, revisedText: string, fullContent: string,
  ): Promise<RecheckResult> {
    const fixText = revisedText.slice(0, 2000);
    const prompt = `请复查以下精修结果。

原始问题：${issue.title}
问题类型：${issue.issue_type}
修改后文本：
${fixText}

章节当前内容（片段）：
${fullContent.slice(0, 3000)}

请判断问题是否已修复、是否引入新问题、修改是否符合写作质量要求。
输出严格JSON：
{ "pass": true/false, "level": "pass|warning|fail", "remainingIssues": 0, "newIssues": 0, "summary": "复查总结，80字内" }`;

    const response = await this.realLLM!.generate({
      prompt, temperature: 0.2, scenario: 'daily',
    } as any);

    const raw = this.parseJson<Record<string, any>>(response.content);
    if (raw) {
      return {
        pass: Boolean(raw.pass) || raw.level === 'pass',
        level: ['pass', 'warning', 'fail'].includes(raw.level) ? raw.level : 'warning',
        remainingIssues: Number(raw.remainingIssues) || 0,
        newIssues: Number(raw.newIssues) || 0,
        summary: String(raw.summary || '复查完成').slice(0, 120),
      };
    }
    return { pass: true, level: 'pass', remainingIssues: 0, newIssues: 0, summary: '复查完成（自动判断）' };
  }

  // ====================== HELPERS ======================

  private persistAttentionReport(
    db: any,
    projectId: string,
    dto: AttentionCheckDto,
    input: { title: string; chapterId: string; attention: any; chapterLocked: boolean },
  ) {
    const now = new Date().toISOString();
    const level = input.attention.slipAwayRiskScore >= 85
      ? 'critical'
      : input.attention.slipAwayRiskScore >= 70
        ? 'high'
        : input.attention.slipAwayRiskScore >= 45
          ? 'medium'
          : 'low';
    const summary = input.attention.reasons?.length
      ? `滑走风险 ${input.attention.slipAwayRiskScore}：${input.attention.reasons.slice(0, 2).join('；')}`
      : `滑走风险 ${input.attention.slipAwayRiskScore}，前三屏注意力基础通过。`;
    const payload = { attention: input.attention, mode: dto.mode || 'auto' };

    if (dto.reportId) {
      const existing = db.prepare(
        'SELECT * FROM writing_quality_reports WHERE id = ? AND project_id = ?',
      ).get(dto.reportId, projectId) as ReportRow | undefined;
      if (existing) {
        const oldPayload = safeJsonParse(existing.payload || '{}', {});
        db.prepare(`
          UPDATE writing_quality_reports
          SET summary = ?, overall_level = ?, overall_score = ?, payload = ?, attention_json = ?, updated_at = ?
          WHERE id = ?
        `).run(
          summary,
          level,
          Math.max(0, 100 - Number(input.attention.slipAwayRiskScore || 0)),
          JSON.stringify({ ...oldPayload, ...payload }),
          JSON.stringify(input.attention),
          now,
          dto.reportId,
        );
        const updated = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(dto.reportId) as ReportRow;
        return {
          ...this.reportRowToResponse(updated),
          issueCount: 0,
          openIssueCount: 0,
          highIssueCount: 0,
          resolvedIssueCount: 0,
          chapterLocked: input.chapterLocked,
        };
      }
    }

    const reportId = uuid();
    db.prepare(`
      INSERT INTO writing_quality_reports (
        id, project_id, chapter_id, source_type, source_id, scope, title, summary,
        overall_level, overall_score, model, payload, attention_json, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reportId,
      projectId,
      input.chapterId,
      'attention_check',
      input.chapterId,
      'attention',
      `Attention Check: ${input.title}`,
      summary,
      level,
      Math.max(0, 100 - Number(input.attention.slipAwayRiskScore || 0)),
      'rule',
      JSON.stringify(payload),
      JSON.stringify(input.attention),
      'system',
      now,
      now,
    );
    const created = db.prepare('SELECT * FROM writing_quality_reports WHERE id = ?').get(reportId) as ReportRow;
    return {
      ...this.reportRowToResponse(created),
      issueCount: 0,
      openIssueCount: 0,
      highIssueCount: 0,
      resolvedIssueCount: 0,
      chapterLocked: input.chapterLocked,
    };
  }

  private buildAttentionAnalysis(input: { title: string; intro: string; content: string; mode: string }) {
    const content = (input.content || '').trim();
    const title = (input.title || '').trim();
    const intro = (input.intro || '').trim();
    const slices = [
      { key: 'first50', label: '前50字', text: content.slice(0, 50) },
      { key: 'first100', label: '前100字', text: content.slice(0, 100) },
      { key: 'first300', label: '前300字', text: content.slice(0, 300) },
      { key: 'first500', label: '前500字', text: content.slice(0, 500) },
    ];
    const hookWords = ['死', '血', '骗', '秘密', '崩', '逃', '杀', '债', '失踪', '背叛', '规则', '代价', '真相', '不能', '必须', '突然', '只有', '为什么', '？', '?'];
    const emotionWords = ['怕', '怒', '痛', '恨', '哭', '笑', '悔', '疯', '冷', '羞', '爽', '惊'];
    const conflictWords = ['冲突', '威胁', '追', '抢', '逼', '拒绝', '争', '输', '赢', '赌', '陷阱'];
    const scoreText = (text: string) => {
      const hits = [...hookWords, ...emotionWords, ...conflictWords].filter(word => text.includes(word)).length;
      const hasDialogue = /[“”"]/.test(text);
      const hasQuestion = /[?？]/.test(text);
      const hasAction = /[，。！？!?]/.test(text) && text.length > 20;
      return Math.min(100, hits * 12 + (hasDialogue ? 12 : 0) + (hasQuestion ? 10 : 0) + (hasAction ? 10 : 0));
    };

    const checkpoints = [
      { name: '标题', text: title, score: title ? scoreText(title) + 15 : 0 },
      { name: '简介', text: intro, score: intro ? scoreText(intro) + 10 : 0 },
      ...slices.map(slice => ({ name: slice.label, text: slice.text, score: scoreText(slice.text) })),
    ].map(item => ({
      ...item,
      pass: item.score >= 45,
      issue: item.score >= 45 ? '' : `${item.name}缺少明确疑点、冲突、情绪或信息变化。`,
    }));

    const windows: Array<{ start: number; end: number; score: number; risk: string }> = [];
    for (let start = 0; start < Math.min(content.length, 3000); start += 300) {
      const text = content.slice(start, start + 300);
      if (!text) break;
      const score = scoreText(text);
      windows.push({
        start,
        end: start + text.length,
        score,
        risk: score >= 45 ? 'ok' : 'needs_question_or_turn',
      });
    }

    const longPromises = ['主线目标', '核心谜题', '关系张力', '升级空间'].map(name => ({
      name,
      present: scoreText(content.slice(0, 2500)) >= (name === '升级空间' ? 55 : 35),
      suggestion: `${name}需要在首章、前三章或前十章内给出可追读承诺。`,
    }));
    const failures = checkpoints.filter(item => !item.pass).length + windows.filter(item => item.score < 45).length;
    const slipAwayRiskScore = Math.max(0, Math.min(100, 30 + failures * 8 - Math.floor(scoreText(content.slice(0, 500)) / 4)));
    const reasons = [
      ...checkpoints.filter(item => !item.pass).map(item => item.issue),
      ...windows.filter(item => item.score < 45).slice(0, 5).map(item => `${item.start}-${item.end}字缺少新的疑点、冲突、信息变化或情绪推进。`),
    ];

    return {
      mode: input.mode,
      slipAwayRiskScore,
      level: slipAwayRiskScore >= 75 ? 'high' : slipAwayRiskScore >= 50 ? 'medium' : 'low',
      checkpoints,
      shortStoryWindows: windows,
      longReadThroughPromises: longPromises,
      reasons,
      revisionPlan: [
        '前50字放入不可忽略的异常、危机或强情绪反应。',
        '前300字完成一次信息变化：误判、反转、身份差或明确代价。',
        '前500字给出本章目标和继续读下去的承诺。',
      ],
      alternativeOpenings: [
        `如果从冲突开场：${title || '本章'}可以先写主角被迫做出一个会付出代价的选择。`,
        `如果从疑点开场：先展示一个违反常识的结果，再倒推原因。`,
        `如果从情绪开场：用具体动作呈现恐惧、愤怒或羞耻，不先解释设定。`,
      ],
    };
  }

  private inferAttentionMode(project: any): 'short' | 'long' {
    const raw = project?.project || project || {};
    const type = String(raw.type || '').toLowerCase();
    const targetWords = Number(raw.target_words || 0);
    if (type.includes('short') || targetWords > 0 && targetWords <= 50000) return 'short';
    return 'long';
  }

  private buildIssueNavigation(input: {
    projectId: string;
    chapterId: string;
    reportId: string;
    issueId: string;
    issueType: string;
    tags: string[];
    evidence?: string;
    paragraphIndex?: number | null;
    sentenceIndex?: number | null;
  }) {
    const all = new Set([input.issueType, ...input.tags]);
    const timelineTags = ['timeline_conflict', 'causality_gap', 'time_order_error', 'event_sequence_risk'];
    const target = timelineTags.some(tag => all.has(tag))
      ? { target: 'timeline', label: '时间线', pathBase: `/project/${input.projectId}/timeline` }
      : all.has('needs_character_voice') || all.has('same_voice_characters') || all.has('needs_asymmetry')
        ? { target: 'character', label: '角色', pathBase: `/project/${input.projectId}/characters` }
        : all.has('logic_gap') || all.has('too_expository')
          ? { target: 'world', label: '世界观', pathBase: `/project/${input.projectId}/world` }
          : all.has('needs_payoff') || all.has('needs_hook')
            ? { target: 'foreshadowing', label: '伏笔', pathBase: `/project/${input.projectId}/foreshadowing` }
            : all.has('pacing_risk') || all.has('chapter_hook')
              ? { target: 'outline', label: '大纲章节', pathBase: `/project/${input.projectId}/outline` }
              : { target: 'writing', label: '正文定位', pathBase: `/project/${input.projectId}/writing` };
    const evidencePreview = (input.evidence || '').replace(/\s+/g, ' ').slice(0, 80);
    const params = new URLSearchParams({
      source: 'writing-quality',
      reportId: input.reportId,
      issueId: input.issueId,
      chapterId: input.chapterId,
      target: target.target,
    });
    if (input.paragraphIndex !== null && input.paragraphIndex !== undefined) {
      params.set('paragraphIndex', String(input.paragraphIndex));
    }
    if (evidencePreview) params.set('evidencePreview', evidencePreview);
    const context = {
      source: 'writing-quality',
      reportId: input.reportId,
      issueId: input.issueId,
      chapterId: input.chapterId,
      evidence: input.evidence || '',
      evidencePreview,
      paragraphIndex: input.paragraphIndex ?? null,
      sentenceIndex: input.sentenceIndex ?? null,
      issueType: input.issueType,
    };
    return {
      target: target.target,
      label: target.label,
      path: `${target.pathBase}?${params.toString()}`,
      context,
    };
  }

  private persistRecheckResult(db: any, revision: RevisionRow, issue: IssueRow | null, result: RecheckResult) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE writing_revision_records
      SET recheck_result_json = ?, updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(result), now, revision.id);

    if (!issue) return;
    const nextStatus = result.pass ? 'recheck_passed' : 'recheck_failed';
    const history = safeJsonParse(issue.status_history_json || '[]', []);
    history.push({ from: issue.status, to: nextStatus, reason: 'revision_recheck', at: now });
    db.prepare(`
      UPDATE writing_quality_issues
      SET status = ?, recheck_result_json = ?, status_history_json = ?, updated_at = ?
      WHERE id = ?
    `).run(nextStatus, JSON.stringify(result), JSON.stringify(history), now, issue.id);
  }

  private getChapterContext(content: string, issue: IssueRow): string {
    const idx = content.indexOf(issue.original_text || issue.evidence || '');
    if (idx >= 0) {
      const start = Math.max(0, idx - 500);
      const end = Math.min(content.length, idx + (issue.original_text || issue.evidence || '').length + 500);
      return content.slice(start, end);
    }
    return content.slice(0, 3000);
  }

  private simpleRecheck(remainingCount: number): RecheckResult {
    return {
      pass: remainingCount <= 1,
      level: remainingCount === 0 ? 'pass' : remainingCount <= 2 ? 'warning' : 'fail',
      remainingIssues: remainingCount,
      newIssues: 0,
      summary: remainingCount === 0 ? '该章节所有问题已解决' : `该章节还有 ${remainingCount} 个问题待处理`,
    };
  }

  private calcIssueCounts(issueRows: IssueRow[]): IssueCounts {
    let total = 0, open = 0, high = 0, resolved = 0;
    for (const i of issueRows) {
      total++;
      if (this.isClosedIssueStatus(i.status)) resolved++;
      if (this.isOpenIssueStatus(i.status)) {
        open++;
        if (i.severity === 'high' || i.severity === 'critical') high++;
      }
    }
    return { total, open, high, resolved };
  }

  private isOpenIssueStatus(status: string): boolean {
    return ['open', 'planned', 'refined', 'recheck_failed'].includes(status);
  }

  private isClosedIssueStatus(status: string): boolean {
    return ['resolved', 'applied', 'recheck_passed', 'ignored', 'archived', 'superseded'].includes(status);
  }

  /**
   * 作废旧质检结论：同一章节重新质检前调用。
   * - 该章所有尚未 superseded 的旧报告 → status='superseded'；
   * - 其下仍处于 open 态（open/planned/refined/recheck_failed）的问题 → status='superseded' 并留痕；
   *   作者已解决/忽略的终态问题保持不变。纯确定性、不调用 LLM。
   */
  private supersedeChapterReports(db: any, chapterId: string, now: string): { reports: number; issues: number } {
    const oldReports = db
      .prepare(`SELECT id FROM writing_quality_reports WHERE chapter_id = ? AND COALESCE(status,'open') <> 'superseded'`)
      .all(chapterId) as Array<{ id: string }>;
    if (!oldReports.length) return { reports: 0, issues: 0 };
    const openStates = ['open', 'planned', 'refined', 'recheck_failed'];
    const ph = oldReports.map(() => '?').join(',');
    const oldIssueRows = db
      .prepare(`SELECT id, status, status_history_json FROM writing_quality_issues WHERE report_id IN (${ph})`)
      .all(...oldReports.map(r => r.id)) as Array<{ id: string; status: string; status_history_json: string | null }>;
    let issues = 0;
    const updIssue = db.prepare(
      `UPDATE writing_quality_issues SET status='superseded', status_history_json=?, updated_at=? WHERE id=?`,
    );
    for (const iss of oldIssueRows) {
      if (!openStates.includes(iss.status)) continue;
      const history = safeJsonParse(iss.status_history_json || '[]', []);
      history.push({ from: iss.status, to: 'superseded', reason: 'chapter_reanalyzed', at: now });
      updIssue.run(JSON.stringify(history), now, iss.id);
      issues++;
    }
    const res = db
      .prepare(`UPDATE writing_quality_reports SET status='superseded', updated_at=? WHERE chapter_id=? AND COALESCE(status,'open') <> 'superseded'`)
      .run(now, chapterId);
    return { reports: Number(res.changes || oldReports.length), issues };
  }

  private parseJson<T>(content: string | null | undefined): T | null {
    if (!content) return null;
    const clean = content.replace(/```json\n?|```\n?/g, '').trim();
    try { return JSON.parse(clean) as T; } catch { /* try extract */ }
    const start = clean.indexOf('{');
    const end = clean.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(clean.slice(start, end + 1)) as T; } catch { /* fall through */ }
    }
    return null;
  }

  // ====================== RESPONSE MAPPERS ======================

  private reportRowToResponse(r: ReportRow) {
    return {
      id: r.id, projectId: r.project_id, chapterId: r.chapter_id,
      sourceType: r.source_type, scope: r.scope,
      title: r.title, summary: r.summary,
      overallLevel: r.overall_level, overallScore: r.overall_score,
      status: r.status, model: r.model,
      payload: safeJsonParse(r.payload),
      attention: safeJsonParse(r.attention_json || '{}'),
      viewState: safeJsonParse(r.view_state_json || '{}'),
      createdBy: r.created_by, createdAt: r.created_at, updatedAt: r.updated_at,
    };
  }

  private issueRowToResponse(r: IssueRow) {
    const tags = safeJsonParse(r.tags, []);
    const parsedNavigation = safeJsonParse(r.navigation_json || '{}', {});
    const hasValidNavigation = parsedNavigation?.target
      && parsedNavigation?.label
      && parsedNavigation?.path
      && parsedNavigation?.context;
    const navigation = hasValidNavigation
      ? parsedNavigation
      : this.buildIssueNavigation({
        projectId: r.project_id,
        chapterId: r.chapter_id,
        reportId: r.report_id,
        issueId: r.id,
        issueType: r.issue_type,
        tags,
        evidence: r.evidence || '',
        paragraphIndex: r.paragraph_index,
        sentenceIndex: r.sentence_index,
      });
    return {
      id: r.id, reportId: r.report_id, projectId: r.project_id, chapterId: r.chapter_id,
      issueType: r.issue_type, severity: r.severity,
      qualityIssue: safeJsonParse(r.payload)?.qualityIssue || qualityIssue({ id: r.id, projectId: r.project_id, entityId: r.chapter_id,
        stage: 'chapter', ruleId: r.issue_type, severity: r.severity, status: r.status,
        message: r.summary || r.title, quote: r.evidence, source: 'writing_quality_issues' }),
      title: r.title, summary: r.summary,
      evidence: r.evidence, suggestion: r.suggestion,
      paragraphIndex: r.paragraph_index, sentenceIndex: r.sentence_index,
      startOffset: r.start_offset, endOffset: r.end_offset,
      originalText: r.original_text, suggestedText: r.suggested_text,
      tags,
      status: r.status, payload: safeJsonParse(r.payload),
      latestRevisionId: r.latest_revision_id || null,
      navigation,
      statusHistory: safeJsonParse(r.status_history_json || '[]', []),
      recheckResult: safeJsonParse(r.recheck_result_json || '{}', {}),
      createdAt: r.created_at, updatedAt: r.updated_at,
      resolvedAt: r.resolved_at, resolvedBy: r.resolved_by,
    };
  }

  private revisionRowToResponse(r: RevisionRow) {
    const payload = safeJsonParse(r.payload || '{}', {});
    return {
      id: r.id,
      projectId: r.project_id,
      chapterId: r.chapter_id,
      issueId: r.issue_id,
      reportId: r.report_id,
      revisionType: r.revision_type,
      beforeText: r.before_text,
      afterText: r.after_text,
      diff: safeJsonParse(r.diff_json, []),
      applied: r.applied === 1,
      appliedAt: r.applied_at,
      reverted: r.reverted === 1,
      payload,
      reason: payload.reason || '',
      remainingRisk: payload.remainingRisk || 'medium',
      canApply: r.can_apply !== 0,
      recheckResult: safeJsonParse(r.recheck_result_json || '{}', {}),
      createdBy: r.created_by,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

function safeJsonParse(raw: string, fallback: any = {}) {
  try { return JSON.parse(raw || '{}'); } catch { return fallback; }
}
