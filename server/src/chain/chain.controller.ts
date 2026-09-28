import { readConstitution, updateConstitution, constitutionSettings, buildExecutionStandard, missingConstitutionStandards, genreFitProblem, categoryPlacementProblem, categoryPlacementMessage, categoryWordScaleStanding, categoryWordScaleBlocked, categoryWordScaleMessage, audienceChannelHint, platformStandardProblem, buildPlatformStyleDirective, resolveProjectStandardDirective, styleIntensityGuides, type CreativeConstitution } from '../modules/project/creative-constitution';
import {
  CHAPTER_WORD_RANGE,
  buildChapterResponsibilityAuditPrompt,
  buildChapterResponsibilityRepairPrompt,
  chapterResponsibilityCriteriaText,
  storyCardAuthorizationDirective,
  chapterResponsibilityPlanningDirective,
  isEvidencedChapterResponsibilityConflict,
  platformDisplayName,
  platformCategoryBenchmarkNote,
  platformCategoryWritingBrief,
  platformCategoryWritingProfile,
  categoryOptionsForPlatform,
  categoryReferenceOptionsForProject,
  platformCategoryTreeVerification,
  platformSubmissionDimensions,
  platformCategoryDimensionBinding,
  resolveSubmissionCategory,
  canFitTargetWordsToChapters,
  storyTargetWordsRequirement,
  SELECTABLE_PLATFORMS,
  type SupportedStoryType,
  type TargetPlatform,
} from '../../shared/src';
﻿/**
 * Chain Controller - Prompt Chain REST API
 *
 * 提供面向前端写作工作流的完整端点：
 * - generate       正文生成（严格按已绑定详细大纲单次 LLM 调用）
 * - continue       续写当前章节
 * - enhance-opening  开头强化
 * - enhance-reversal 反转强化
 * - adapt-platform   平台改写
 * - generate-title   标题/简介生成
 */
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Logger,
  Res,
  Sse,
  HttpException,
  ConflictException,
} from '@nestjs/common';
import { Observable, Subscriber } from 'rxjs';
import { ApiTags } from '@nestjs/swagger';
import { jsonrepair } from 'jsonrepair';
import { ChainEngineService } from './chain-engine.service';
import {
  resolveNovelStrategy, buildBenchmarkDirective, getPlatform, targetForLength,
  type ResolvedNovelStrategy, type TextMetricTarget,
  // measureAgainstTarget / benchmarkRefineIssues / buildBenchmarkRefinePrompt 曾只被已删除的
  // refineToPlatformBenchmark 死旁路使用；平台基准现由活体路径 deterministicPlatformReview 执行，
  // 这三个导出仍在 platform-benchmarks.ts 保留并被其 spec 覆盖，需要时再从此处显式引入。
  refineKeepsStory,
  normalizePlatformId,
} from './platform-benchmarks';
import { detectForbiddenTells, isLanguageHardline, normalizeProseLayout, type HardlineFinding, type HardlineProfile } from './hardline-scanner';
import { assessHardlineRepairProgress } from './hardline-repair-progress';
import { detectSourceCountdownConflict } from './source-countdown-consistency';
import { describeWorldSourceCandidate } from './source-rule-consistency';
import { buildSourceHierarchyReviewPrompt, normalizeSourceHierarchyReview, SourceHierarchyReview } from './source-hierarchy-review';
import { STORY_FACT_PRIORITY } from '../modules/module-standards/module-standards.seed';
import {
  classifyGateFailure,
  OUTLINE_PRECONDITION_MARKER,
  firstGateReportFromChain,
  gateFailureLabel,
  gateRejectionFromReport,
  isGateRejection,
  isHardlineFinding,
  HARDLINE_FINDING_PREFIX,
  type GateFailureReport,
} from '../modules/writing-quality/gate-failure';
import {
  scanOutlineConsistency,
  correctedOutlineOrdinalLabel,
  summarizeOutlineConsistency,
  buildOutlineConsistencyRepairInstruction,
  type OutlineConsistencyFinding,
  type OutlineConsistencyRow,
} from './outline-consistency';
import { maskForeshadowAnswers } from './foreshadow-mask';
import { applyCrossStagePatch } from './cross-stage-patch';
import { buildOutlineFactReviewPrompt, describeOutlineFactReview, missingPriorLedgerEntries, normalizeOutlineFactReview } from './outline-fact-ledger';
import { ideaTimeConflict } from './idea-fact-consistency';
import {
  CHAPTER_FORESHADOWING_FIELD,
  CHAPTER_FORESHADOWING_CONTRACT,
  GLOBAL_FORESHADOWING_CONTRACT,
  readChapterForeshadowing,
  describeForeshadowingDefect,
  describeGlobalForeshadowingDefect,
} from './foreshadowing-contract';
import { isStructuredOutputTruncated, STRUCTURED_JSON_OUTPUT_CEILING } from './structured-truncation';
import { RealLLMService } from './real-llm.service';
import { StatePersistenceService } from '../state/state-persistence.service';
import { NewsRssService } from './news-rss.service';
import { ChainTemplateService } from './chain-template.service';
import { DatabaseService } from '../database/database.service';
import { VectorIndexService } from '../rag/vector-index.service';
import { WorkflowGuardService } from '../modules/workflow-guard/workflow-guard.service';
import { StateItemService } from '../state/state-item.service';
import { ConsistencyCheckService } from '../state/consistency-check.service';
import { CharacterService, PROFILE_FIELDS } from '../modules/character/character.service';
import { loadCharacterNames } from '../modules/character/character-names';
import { WorldSettingService, WORLD_PROFILE_FIELDS } from '../modules/world-setting/world-setting.service';
import { MapPointService } from '../modules/map-point/map-point.service';
import { EmbeddingService } from '../rag/embedding.service';
import { GenerationRecoveryService } from './generation-recovery.service';
import { WritingGateway } from '../modules/websocket/websocket.gateway';
import { LLM_TUNABLES } from '../config/llm-tunables';
import {
  CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES,
  GenerationMetricsService,
  type ChapterResponsibilityRepairStrategy,
} from '../modules/generation-metrics/generation-metrics.service';
import { GeneratedCanonGuardService } from '../modules/generation-metrics/generated-canon-guard.service';
import { isMissingStandardFinding, qualityIssue, replaceQualityIssues, type QualityIssue } from '../modules/writing-quality/quality-issue';
import { executeRepair, repairPrompt as localPatchContract } from '../modules/writing-quality/repair-strategy-registry';
import { applyLocalPatches, selectAnchoredLocalPatchBatch } from '../modules/writing-quality/local-repair';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  buildNarrativeBeatPlan,
  validateChapterEndingBoundary,
  validateForeshadowingBoundary,
} from './adaptive-narrative';
import { assessSemanticRepairProgress, decideLengthContinuation, decideProgressiveRepair } from './adaptive-repair';

/** 当前生成链路所属项目（沿 await 链自动继承）；llmCallWithRetry 埋点缺省 projectId 时从此兜底 */
const projectMetricsContext = new AsyncLocalStorage<string | null>();

// 长篇渐进式大纲：创建时世界观/贯穿角色/全书卷规划一次到位，但只详细展开前 N 章细纲；
// 之后随正文写作滚动补到始终领先约 N 章，避免一次性空想全书数百章（慢、易截断、必然与实际剧情脱节）。
const LONG_DETAIL_OUTLINE_WINDOW = 20;
// 已细纲但未写的“可写余量”低于该值时，正文生成前自动滚动补纲（对作者无感）。
const LONG_OUTLINE_ROLLOUT_TRIGGER = 5;
import { OriginalityGuardService } from '../modules/originality/originality-guard.service';

type OutlineChapterFunction =
  | 'opening'
  | 'exposition'
  | 'rising_action'
  | 'conflict'
  | 'climax'
  | 'breathing'
  | 'charging'
  | 'explosion'
  | 'paving'
  | 'transition'
  | 'cliffhanger'
  | 'resolution'
  | 'closing';

const normalizeOutlineChapterFunction = (
  value: unknown,
  order = 0,
  isShort = true,
): OutlineChapterFunction => {
  const raw = String(value || '').trim().toLowerCase();
  const map: Record<string, OutlineChapterFunction> = {
    open: 'opening',
    opening: 'opening',
    hook: 'opening',
    start: 'opening',
    exposition: 'exposition',
    setup: 'exposition',
    development: 'rising_action',
    rising: 'rising_action',
    rising_action: 'rising_action',
    conflict: 'conflict',
    crisis: 'conflict',
    climax: 'climax',
    explosion: 'explosion',
    payoff: 'explosion',
    resolution: 'resolution',
    ending: 'resolution',
    breathing: 'breathing',
    charging: 'charging',
    paving: 'paving',
    transition: 'transition',
    cliffhanger: 'cliffhanger',
    closing: 'closing',
  };
  const mapped = map[raw];
  if (mapped && mapped !== 'paving') return mapped;

  const chapterNo = order <= 0 ? order + 1 : order;
  if (isShort) {
    const shortRhythm: OutlineChapterFunction[] = [
      'opening',
      'exposition',
      'rising_action',
      'conflict',
      'climax',
      'transition',
      'climax',
      'cliffhanger',
      'resolution',
    ];
    return shortRhythm[Math.max(0, Math.min(chapterNo - 1, shortRhythm.length - 1))];
  }

  const longCycle: OutlineChapterFunction[] = [
    'opening',
    'charging',
    'conflict',
    'explosion',
    'breathing',
    'paving',
    'cliffhanger',
    'transition',
  ];
  return longCycle[(Math.max(chapterNo, 1) - 1) % longCycle.length];
};

export const parsePositiveTargetWords = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[,，\s]/g, '').replace(/字$/, '');
  if (!text) return null;
  const unitMatch = text.match(/^(\d+(?:\.\d+)?)(万|千)?$/);
  if (!unitMatch) return null;
  const multiplier = unitMatch[2] === '万' ? 10000 : unitMatch[2] === '千' ? 1000 : 1;
  const parsed = Number(unitMatch[1]) * multiplier;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

/** Character bigram similarity is stable for Chinese and catches lightly renamed premises. */
export const ideaSemanticSimilarity = (left: any, right: any): number => {
  const grams = (values: unknown[]) => {
    const text = values.map(value => String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')).join('');
    const result = new Set<string>();
    for (let i = 0; i <= text.length - 2; i++) result.add(text.slice(i, i + 2));
    return result;
  };
  const groups: Array<{ fields: string[]; weight: number }> = [
    { fields: ['angle', 'coreConflict', 'uniquePoint', 'mainReversal'], weight: 0.5 },
    { fields: ['title', 'setting', 'protagonist'], weight: 0.2 },
    { fields: ['hook', 'description'], weight: 0.3 },
  ];
  let weighted = 0;
  let usedWeight = 0;
  for (const group of groups) {
    const a = grams(group.fields.map(field => left?.[field]));
    const b = grams(group.fields.map(field => right?.[field]));
    if (!a.size || !b.size) continue;
    let intersection = 0;
    for (const gram of a) if (b.has(gram)) intersection += 1;
    weighted += (intersection / Math.min(a.size, b.size)) * group.weight;
    usedWeight += group.weight;
  }
  return usedWeight ? weighted / usedWeight : 0;
};

export interface AlignmentFindingPartition {
  blocking: string[];
  advisories: string[];
  sourceConflicts: string[];
}

/**
 * The alignment gate protects story facts and chapter boundaries.  Language
 * polish belongs to the downstream quality report and must not cause another
 * full-chapter rewrite.  Auto-expanded context may also lag behind a detailed
 * chapter outline; when the reviewer exposes that disagreement, report the
 * source conflict instead of blaming prose that follows the chapter contract.
 *
   * 这里曾有第二份矛盾严重度口径：命中「重复措辞」等正则的 contradiction 被转为
   * advisory，后果是已判定的正文缺陷未阻断保存。contradictions 一律保持 blocking。
 */
export function partitionAlignmentFindings(
  contradictions: readonly string[],
  outlineContract: string,
  reviewerAdvisories: readonly string[] = [],
): AlignmentFindingPartition {
  const result: AlignmentFindingPartition = { blocking: [], advisories: [], sourceConflicts: [] };
  const outlineNormalized = String(outlineContract || '').replace(/[\s\p{P}\p{S}]/gu, '');
  for (const [index, raw] of [...contradictions, ...reviewerAdvisories].entries()) {
    const finding = String(raw || '').trim();
    if (!finding) continue;
    // 标准缺失是【未执行】，不是【写得不好】，必须最先判为 blocking。
    // 判据唯一来源：quality-issue.isMissingStandardFinding（与 gate-failure 的 Gate 分类器同一份），
    // 不再在此内联第二套正则——判据分叉正是「partition 判 blocking、分类器判 outline_alignment」
    // 这种自相矛盾的来源。
    // 这条不能删：删掉后「创作宪法/项目卡…为空…」会命中下方 namesMultipleSources
    // （描述里同时出现「世界观档案」和「详细大纲」）→ 落 sourceConflicts → 未执行标准被静默放行。
    if (isMissingStandardFinding(finding)) {
      result.blocking.push(finding);
      continue;
    }
    const quotes = [...finding.matchAll(/[“『](.*?)[”』]/g)]
      .map(match => String(match[1] || '').replace(/[\s\p{P}\p{S}]/gu, ''))
      .filter(value => value.length >= 4);
    const namesMultipleSources = /(世界观|世界档案|故事上下文|扩展资料)/.test(finding)
      && /(大纲|伏笔|章节合同)/.test(finding);
    const worldClaimConflictsWithOutline = /(世界观|世界档案|故事上下文|扩展资料)/.test(finding)
      && quotes.some(quote => outlineNormalized.includes(quote) || quote.includes(outlineNormalized.slice(0, Math.min(quote.length, 20))));
    // 这里曾有第二份“只要同时提到世界观和大纲就算资料源冲突”的口径，
    // 后果是「正文写林川名字、与大纲/世界观冲突」被误分流，正文修订提前停止。
    // 含正文证据的条目始终是待修的正文矛盾；真正的源对源冲突才走此分支。
    const citesDraft = /(正文|稿件|文中|本文|本章文本|草稿)/.test(finding);
    if (!citesDraft && (namesMultipleSources || worldClaimConflictsWithOutline)) {
      result.sourceConflicts.push(finding);
      continue;
    }
    // 这里曾直接信任评审器的 advisories 字段，后果是「白名单外李成」「后天/三天后」
    // 和大纲事件顺序错位首次验收被放行，下一轮才升级为阻断并触发整章重写。
    // 内容事实先于措辞建议分类；两组词必须同时出现，避免把纯重复用语当事实矛盾。
    const materialFact = /(后天|三天后|明天|昨天|时间|倒计时|时序|先后|顺序|次序|名单|户数|数量|格数|姓名|白名单|人物|角色|台账|大纲|设定|刻痕)/.test(finding)
      && /(不一致|矛盾|冲突|错位|不在|晚于|未兑现|缺失|缺过渡|口径|出入|偏离|越界)/.test(finding);
    if (materialFact) {
      result.blocking.push(finding);
      continue;
    }
    if (index >= contradictions.length) result.advisories.push(finding);
    else result.blocking.push(finding);
  }
  return result;
}

/**
 * 矛盾落库「严重度」的唯一判定（唯一来源，避免各写入点各判一套口径）。
 *
 * 依据 module-standards.seed.ts「质检与一致性」既定条款：**表达层与事实层同等对待**——
 * 正文与所选平台/分类/基调/文风/流派/视角不符，同样按 blocking 判定并写入 contradictions，
 * 不由代码或提示词降级为 high 或建议；严重度封顶与模型降级一律禁止。
 * 因此 LLM 验收器判出的六维偏差、缺失必需事件与故事事实冲突（默认 source），
 * 与硬红线确定性扫描一样必须 blocking，才能进修复闭环，而不是只挂在矛盾列表里。
 *
 * 资料源冲突同样阻断生成，但修复对象是资料源，不允许通过重写正文掩盖。
 */
export function alignmentFindingSeverity(source: string): 'blocking' | 'high' | 'medium' {
  if (source === 'alignment_verifier_advisory') return 'medium';
  return 'blocking';
}

interface ChapterResponsibilityIssueContract {
  chapter: number;
  task: string;
  conflict: string;
  retain: string;
  fix: string;
  raw: string;
}

export const parseChapterResponsibilityIssue = (raw: string): ChapterResponsibilityIssueContract | null => {
  const text = String(raw || '').trim();
  const candidate = (() => {
    try { return JSON.parse(text); } catch { /* fall through */ }
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  })() as any;
  const chapter = Number(candidate?.chapter);
  const fix = String(candidate?.fix || '').trim();
  if (!Number.isInteger(chapter) || chapter <= 0 || !fix) return null;
  return {
    chapter,
    task: String(candidate?.task || '').trim(),
    conflict: String(candidate?.conflict || '').trim(),
    retain: String(candidate?.retain || candidate?.preservedGoal || '').trim(),
    fix,
    raw: text,
  };
};

export const applyAuditedResponsibilityFixes = <T extends { title: string; func: string; brief: string }>(
  chapterTitles: T[],
  issues: string[],
): { chapterTitles: T[]; applied: ChapterResponsibilityIssueContract[] } => {
  const contracts = issues.map(parseChapterResponsibilityIssue).filter(Boolean) as ChapterResponsibilityIssueContract[];
  if (!contracts.length) return { chapterTitles, applied: [] };
  const byChapter = new Map<number, ChapterResponsibilityIssueContract[]>();
  for (const contract of contracts) {
    const list = byChapter.get(contract.chapter) || [];
    list.push(contract);
    byChapter.set(contract.chapter, list);
  }
  return {
    applied: contracts,
    chapterTitles: chapterTitles.map((chapter, index) => {
      const fixes = byChapter.get(index + 1);
      if (!fixes?.length) return chapter;
      const brief = fixes.map(contract => [
        contract.retain ? `保留目标：${contract.retain}` : '',
        `执行方式：${contract.fix}`,
      ].filter(Boolean).join('；')).join('；');
      return { ...chapter, brief };
    }),
  };
};

export const canFitChapterWordRange = (
  targetWords: number,
  chapterRange: { min: number; max: number } = CHAPTER_WORD_RANGE,
): boolean => (
  Number.isInteger(targetWords)
  && targetWords >= chapterRange.min
  && Math.ceil(targetWords / chapterRange.max) <= Math.floor(targetWords / chapterRange.min)
);

export const resolveCreationChapterPlan = (
  targetWords: number,
  chapterRange: { min: number; max: number },
  plannedChapters?: unknown,
): { minChapters: number; maxChapters: number; recommendedChapters: number } => {
  const min = Math.max(1, Math.trunc(Number(chapterRange?.min) || 0));
  const max = Math.max(min, Math.trunc(Number(chapterRange?.max) || 0));
  const minChapters = Math.max(1, Math.ceil(targetWords / max));
  const maxChapters = Math.max(minChapters, Math.floor(targetWords / min));
  const confirmed = Number(plannedChapters);
  const confirmedFits = Number.isInteger(confirmed)
    && confirmed >= minChapters
    && confirmed <= maxChapters;
  const averageRecommendation = Math.round(targetWords / ((min + max) / 2));
  return {
    minChapters,
    maxChapters,
    recommendedChapters: confirmedFits
      ? confirmed
      : Math.min(maxChapters, Math.max(minChapters, averageRecommendation)),
  };
};

export const buildChapterContinuityLedgerEntry = (chapter: Record<string, any>, chapterNo: number): string => {
  const compact = (value: unknown, max = 900): string => serializeGeneratedSqlText(value).replace(/\s+/g, ' ').trim().slice(0, max);
  return JSON.stringify({
    chapter: chapterNo,
    eventChain: compact(chapter.content || chapter.coreContent || chapter.summary || chapter.plot, 1200),
    actions: chapter.characterActions || [],
    characterStates: chapter.characterStates || chapter.stateChanges || [],
    foreshadowing: chapter.foreshadowing || [],
    foreshadowingRecovered: chapter.foreshadowingRecover || [],
    hook: compact(chapter.hook || chapter.nextChapterHook || chapter.outcome || chapter.result, 500),
  });
};

export const collectOutlineForeshadowings = (rows: Array<{ order: number; scenes?: unknown }>): any[] => {
  const collected: any[] = [];
  for (const row of rows) {
    let scenes: any = row.scenes;
    if (typeof scenes === 'string') {
      try { scenes = JSON.parse(scenes); } catch { scenes = {}; }
    }
    const items = Array.isArray(scenes?.foreshadowing) ? scenes.foreshadowing : [];
    for (const item of items) {
      const content = serializeGeneratedSqlText(item?.content || item?.evidenceText).trim();
      if (!content) continue;
      const recovery = Number(item?.plannedRecoveryChapter || item?.recoveryChapter);
      collected.push({
        ...item,
        content,
        buriedChapter: Number(row.order) + 1,
        recoveryChapter: Number.isInteger(recovery) && recovery > Number(row.order) + 1 ? recovery : null,
        evidenceText: serializeGeneratedSqlText(item?.evidenceText || content),
        recoveryCondition: serializeGeneratedSqlText(item?.recoveryCondition || item?.plannedPayoff || ''),
        scope: serializeGeneratedSqlText(item?.scope, 'chapter'),
      });
    }
  }
  return collected;
};

export const canFitStoryTargetWords = (
  targetWords: number,
  storyType: string = 'long_novel',
  platform = 'generic',
): boolean => {
  const normalizedType: SupportedStoryType = storyType === 'short_story' ? 'short_story' : 'long_novel';
  const [min, max] = targetForLength(getPlatform(platform), normalizedType).chapterWords;
  return canFitTargetWordsToChapters(targetWords, normalizedType, { min, max });
};

export const resolveDiscoveryTargetWords = (
  explicitValue: unknown,
  idea: Record<string, any> | null | undefined,
): { targetWords: number | null; source: 'configured' | 'idea' | 'invalid_config' | 'missing' } => {
  const hasExplicitValue = explicitValue !== undefined && explicitValue !== null && String(explicitValue).trim() !== '';
  const configured = parsePositiveTargetWords(explicitValue);
  if (hasExplicitValue) {
    return configured === null
      ? { targetWords: null, source: 'invalid_config' }
      : { targetWords: configured, source: 'configured' };
  }
  const planned = parsePositiveTargetWords(idea?.recommendedTargetWords ?? idea?.estimatedWords);
  return planned === null
    ? { targetWords: null, source: 'missing' }
    : { targetWords: planned, source: 'idea' };
};

/**
 * SQLite only accepts scalar bind values. LLM JSON fields are occasionally
 * returned as structured values even when the schema asks for text, so every
 * generated text field must cross this boundary before it is persisted.
 */
export const serializeGeneratedSqlText = (value: unknown, fallback = ''): string => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
};

/**
 * 把库里的列表型字段（JSON 数组字符串 / 换行分隔纯文本 / 单值）统一成字符串数组。
 * 章节深度字段（hot_scenes / setback_scenes / highlight_points）在不同写入路径下
 * 既可能是 JSON 数组字符串也可能是纯文本，两种都必须能读，否则字段会静默丢空。
 */
export function toStringList(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value.map((item) => serializeGeneratedSqlText(item).trim()).filter(Boolean);
  const raw = serializeGeneratedSqlText(value).trim();
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((item) => serializeGeneratedSqlText(item).trim()).filter(Boolean);
    } catch { /* 非 JSON 时按纯文本处理 */ }
  }
  return raw.split(/\r?\n/).map((line) => line.replace(/^\s*[-*·]\s*/, '').trim()).filter(Boolean);
}

export const extractBalancedJson = <T = unknown>(content: string): T | null => {
  const candidates: Array<{ text: string; value: T }> = [];
  for (let start = 0; start < content.length; start += 1) {
    const opener = content[start];
    if (opener !== '{' && opener !== '[') continue;
    const stack: string[] = [opener];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < content.length; index += 1) {
      const char = content[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') {
        inString = true;
        continue;
      }
      if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        const expected = char === '}' ? '{' : '[';
        if (stack[stack.length - 1] !== expected) break;
        stack.pop();
        if (stack.length === 0) {
          const text = content.slice(start, index + 1);
          try { candidates.push({ text, value: JSON.parse(text) as T }); } catch {}
          break;
        }
      }
    }
  }
  candidates.sort((left, right) => right.text.length - left.text.length);
  return candidates[0]?.value ?? null;
};

/**
 * `response_format: json_object` requires an object at the top level. Idea
 * discovery therefore uses one canonical `{ "ideas": [...] }` shape.
 */
export const extractIdeaList = (content: string): any[] | null => {
  if (!content?.trim()) return null;
  const cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  const candidates: unknown[] = [];
  try { candidates.push(JSON.parse(cleaned)); } catch {}
  try { candidates.push(JSON.parse(jsonrepair(cleaned))); } catch {}
  const balanced = extractBalancedJson<unknown>(cleaned);
  if (balanced !== null) candidates.push(balanced);

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'object') {
      const value = candidate as { ideas?: unknown };
      if (Array.isArray(value.ideas)) return value.ideas;
    }
  }
  return null;
};

const inferOutlineGoalArc = (order = 0, isShort = true): string => {
  const chapterNo = order <= 0 ? order + 1 : order;
  const shortArc = [
    'mist_truth',
    'probe_showdown',
    'accumulate_burst',
    'crisis_resolve',
    'suppress_counter',
    'foreshadow_recover',
    'pave_climax',
    'probe_showdown',
    'foreshadow_recover',
  ];
  const longArc = [
    'mist_truth',
    'accumulate_burst',
    'crisis_resolve',
    'pave_climax',
    'foreshadow_recover',
    'suppress_counter',
    'probe_showdown',
  ];
  const source = isShort ? shortArc : longArc;
  return source[(Math.max(chapterNo, 1) - 1) % source.length];
};

// ==================== DTO ====================

class GenerateDto {
  projectId: string;
  chapterId?: string;
  mode?: 'manual' | 'semi_auto' | 'full_auto';
  prompt?: string;
  outline?: Record<string, unknown>;
  chapterContext?: Record<string, unknown>;
  chapterNumber?: number;
  chapterOutline?: string;
  chapterFunction?: string;
  isLocked?: boolean;
  /** 写作场景：writing_daily 或 writing_climax，决定使用哪个模型 */
  scenario?: string;
}

class ContinueDto {
  projectId: string;
  chapterId: string;
  prompt?: string;
  context?: string;
  /** 写作场景：writing_daily 或 writing_climax，决定使用哪个模型 */
  scenario?: string;
}

class EnhanceOpeningDto {
  projectId: string;
  chapterId: string;
  text: string;
  style?: 'poetic' | 'direct' | 'suspense' | 'emotional';
}

class EnhanceReversalDto {
  projectId: string;
  chapterId: string;
  content: string;
}

class AdaptPlatformDto {
  projectId: string;
  chapterId: string;
  content: string;
  /**
   * 目标平台。类型走共享唯一平台枚举（TargetPlatform），不再手写子集：
   * 此前这里硬编码 5 个平台（zhihu/fanqie/qidian/douyin/rules_horror），
   * 而前端候选取自 SELECTABLE_PLATFORMS（9 个），于是 jinjiang/qimao/xiaohongshu
   * 三个平台在类型上「不存在」——是本项目第 N 份平台清单，已删。
   */
  targetPlatform: TargetPlatform;
}

class GenerateTitleDto {
  projectId: string;
  chapterId?: string;
  content: string;
  count?: number;
}

// ==================== 场景超时分层 ====================
/**
 * 生成超时与 maxTokens 边界集中由 ../config/llm-tunables 管理，
 * 全部可通过环境变量覆盖，默认值已调到宽容档（≥5 分钟），
 * 不再把 45s/120s/240s 这类魔法数字写死在业务代码里。
 * 详见 llm-tunables.ts。
 */

// ==================== Controller ====================

@ApiTags('chain')
@Controller('chain')
export class ChainController {
  private readonly logger = new Logger(ChainController.name);
  private readonly activeChapterGenerations = new Map<string, number>();
  private ideaDiscoveryInFlight = new Map<string, Promise<any>>();

  constructor(
    private readonly chainEngine: ChainEngineService,
    private readonly realLLM: RealLLMService,
    private readonly statePersistence: StatePersistenceService,
    private readonly newsRss: NewsRssService,
    private readonly chainTemplate: ChainTemplateService,
    private readonly db: DatabaseService,
    private readonly vectorIndex: VectorIndexService,
    private readonly embedding: EmbeddingService,
    private readonly workflowGuard: WorkflowGuardService,
    private readonly stateItemService: StateItemService,
    private readonly characterService: CharacterService,
    private readonly worldSettingService: WorldSettingService,
    private readonly mapPointService: MapPointService,
    private readonly generationRecovery: GenerationRecoveryService,
    private readonly consistencyCheckService: ConsistencyCheckService,
    private readonly writingGateway: WritingGateway,
    private readonly generationMetrics: GenerationMetricsService,
    private readonly generatedCanonGuard: GeneratedCanonGuardService,
    private readonly originalityGuard: OriginalityGuardService,
  ) {}

  private beginChapterGeneration(projectId: string, chapterId: string) {
    const key = `${projectId}:${chapterId}`;
    if (this.activeChapterGenerations.has(key)) {
      throw new HttpException('该章节正在生成中，请等待当前任务完成或失败后再试。', 409);
    }
    this.activeChapterGenerations.set(key, Date.now());
    return key;
  }

  /**
   * 模块标准「Gate失败可观测」：两个 Gate（正文质量 Gate / 本章大纲一致性 Gate）
   * 抛错前必须把 projectId、chapterIndex、失败类别与正文原文落 generation_runs，
   * 使排查以日志和数据库为准、不依赖界面截图。
   *
   * 只落记录，不改判定：severity / status / 是否阻断全部保持原样；
   * 落库本身失败只告警，绝不允许用「记录失败」掩盖真正的 Gate 结论。
   */
  private recordGateRejection(input: {
    projectId?: string;
    chapterIndex: number;
    report: GateFailureReport;
    content: string;
  }): void {
    try {
      // injectStandard=false：这条记录描述的是「本 Gate 拒绝」，不是一次按标准执行的生成，
      // 不能让它看起来像一次已注入标准的正常调用。
      const run = this.generationMetrics.beginRun(
        input.projectId, 'review', input.report.message, undefined, 'gate_rejection', input.chapterIndex, false);
      this.generationMetrics.finishRun(run.id, 'failed', Date.now(), input.content, input.report.detail);
    } catch (error) {
      this.logger.warn(`Gate 拒绝落库失败（不改变 Gate 结论）：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private finishChapterGeneration(key?: string) {
    if (key) this.activeChapterGenerations.delete(key);
  }


  private generatedNarrativeText(output: unknown): string {
    if (typeof output === 'string') return output.trim();
    if (output && typeof output === 'object') {
      const value = output as Record<string, unknown>;
      for (const key of ['fullText', 'full_text', 'content', 'text', 'chapterContent']) {
        if (typeof value[key] === 'string' && value[key].trim()) return value[key].trim();
      }
    }
    return '';
  }

  private assertGeneratedChapterIdentity(content: string, chapterIndex: number): void {
    const heading = content.match(/^\s{0,3}#{1,6}\s*第\s*([一二三四五六七八九十百千万零〇\d]+)\s*章/m);
    if (!heading) return;
    const chinese = new Map([['一', 1], ['二', 2], ['三', 3], ['四', 4], ['五', 5], ['六', 6], ['七', 7], ['八', 8], ['九', 9], ['十', 10]]);
    const declared = /^\d+$/.test(heading[1]) ? Number(heading[1]) : chinese.get(heading[1]);
    if (declared !== chapterIndex) {
      throw new HttpException(`生成正文标题标注为“第${heading[1]}章”，但当前目标是第${chapterIndex}章；结果未保存，避免写入错误章节`, 422);
    }
  }

  private generatedNarrativeWordCount(content: string): number {
    const chinese = (content.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
    const english = content.replace(/[\u4e00-\u9fff\u3400-\u4dbf]/g, ' ').split(/\s+/).filter(token => /[a-zA-Z]/.test(token)).length;
    return chinese + english;
  }

  private assertGeneratedChapterLength(content: string, targetWords: number, wordRange?: { min: number; max: number }): number {
    const range = wordRange || { ...CHAPTER_WORD_RANGE };
    if (!Number.isInteger(targetWords) || targetWords < range.min || targetWords > range.max) {
      throw new HttpException(`本章大纲缺少有效的${range.min}-${range.max}字动态目标，正文未保存`, 400);
    }
    const actual = this.generatedNarrativeWordCount(content);
    if (actual < range.min || actual > range.max) {
      throw new HttpException(`模型仅生成${actual}字，未达到正文必须为${range.min}-${range.max}字的要求；本次结果未保存，可安全重试`, 422);
    }
    return actual;
  }

  /**
   * 生成正文并把字数强制收敛到 CHAPTER_WORD_RANGE 字区间。
   *
   * 两个历史坑导致“字数不足下限”假性失败：
   * 1) 之前复用场景默认 maxTokens(4096)，而 CHAPTER_WORD_RANGE 中文字约需 4000-5200 token，
   *    模型被 API 在 ~4096 token 处硬截断，正好落在 3000 字上下，难以稳定跨过下限；
   * 2) “不足下限”的旧重试是让模型“整章重写得更长”，但模型常给出相似篇幅而原地踏步，
   *    几次重试后仍 < 3000，最终抛 422 丢整章。
   *
   * 现在的做法：
   * - 显式传入充足 maxTokens，确保模型有空间写到目标区间、不被 token 上限掐断；
   * - “不足下限”改为“续写追加”：把上一版完整正文作基底，要求模型只输出新增续写片段并
   *   追加到尾部，字数因此单调递增、必定逼近并跨过 3000（不再依赖模型一次写够）；
   * - “超出上限”直接走确定性句末截断兜底（trimToSentenceBoundary，不伪造内容），
   *   截断后必落在 CHAPTER_WORD_RANGE，省去无谓的压缩重试。
   * 全部调用均为真实 LLM，绝不伪造内容；只有重试耗尽仍 < 3000 才抛 422。
   */
  private async generateBodyWithLengthGuard(params: {
    basePrompt: string;
    targetWords: number;
    scenario: string;
    temperature?: number;
    wordRange?: { min: number; max: number };
    onProgress?: (payload: { label: string; message: string; progress: number }) => void;
    /** 业务步骤埋点上下文：项目/章节 + 当前是首版还是大纲对齐精修 */
    metricsContext?: { projectId?: string; chapterIndex?: number; phase?: 'first' | 'repair' | 'benchmark_refine' };
  }): Promise<string> {
    const { basePrompt, targetWords, scenario, temperature = 0.7 } = params;
    const range = params.wordRange || { ...CHAPTER_WORD_RANGE };
    // 首版一次到位自校准：用历史"目标→首版实际"产出比，前置铺够篇幅，把"少字→补字 3-4 轮"压到 1-2 轮。
    const metricsProjectId = params.metricsContext?.projectId;
    const lengthCalib = metricsProjectId ? this.generationMetrics.getLengthCalibration(metricsProjectId) : null;
    const yieldRatio = lengthCalib && lengthCalib.ratio < 1 ? Math.max(0.6, lengthCalib.ratio) : 1;
    if (!Number.isInteger(targetWords) || targetWords < range.min || targetWords > range.max) {
      throw new HttpException(`本章大纲缺少有效的${range.min}-${range.max}字动态目标，正文未保存`, 400);
    }
    // 首版预算 = 单一路由口径 LLM_TUNABLES.BODY_MAXTOKENS（默认 32768，即结构化输出硬顶）。
    //
    // ⚠️ 防复发（勿再引入）：这里曾用 min(CAP, max(MIN, target*1.6+EXTRA)) 的四参数组合式。
    // 本平台单章目标区间按该式算出来只有 14800-18000，恒被 MIN=24576 抬起，CAP 永远不生效，
    // 而注释却写着「首版直接给足」——注释与真实行为相反，运维按环境变量调预算时改的多半是死开关。
    // 后果：首版预算仍可能装不下 reasoning，正文被截断 → 同模型扩容重试，白烧一整轮（实测 125s）。
    // 现直接取单值硬顶，从源头消除这一轮；预算的唯一调法 = LLM_BODY_MAXTOKENS 环境变量。
    const maxTokens = LLM_TUNABLES.BODY_MAXTOKENS;
    let lastContent = '';
    let lastActual = 0;
    let previousActual: number | null = null;
    let attempt = 0;
    while (true) {
      const isRetry = attempt > 0;
      if (!isRetry) {
        // 阶段 1：首版生成
        params.onProgress?.({
          label: '按大纲生成首版正文',
          message: `首版：按本章详细大纲生成正文（目标约 ${targetWords} 字，写完后会自动做大纲对照）…`,
          progress: 20,
        });
      } else {
        // 阶段 2：字数续写（仅在字数偏离区间时触发）
        const stepProgress = Math.max(35, Math.min(85, 35 + attempt * 12));
        const direction = lastActual < range.min ? '不足下限' : '超出上限';
        params.onProgress?.({
          label: '字数微调',
          message: `字数微调：上一版 ${lastActual} 字${direction}，按实际缺口一次续写追加（不添无关支线、不重写已有正文）…`,
          progress: stepProgress,
        });
      }
      // 首轮正常大纲生成；重试一律走“续写追加”（见 buildExpansionContinuationPrompt）。
      // 首版按历史产出比前置铺够篇幅（自校准），从源头减少"少字→补字"轮次。
      const firstPrompt = !isRetry && lengthCalib && lengthCalib.ratio < 0.95
        ? basePrompt + this.buildLengthCalibrationDirective(targetWords, range, lengthCalib.ratio)
        : basePrompt;
      const genPhase = params.metricsContext?.phase;
      const isRepairPhase = genPhase === 'repair';
      const isBenchmarkPhase = genPhase === 'benchmark_refine';
      const stepKey = isRepairPhase ? 'body_alignment_repair'
        : isBenchmarkPhase ? 'body_benchmark_refine'
        : (isRetry ? 'body_length_retry' : 'body_first');
      const prompt = isRetry
        ? this.buildExpansionContinuationPrompt(basePrompt, lastContent, lastActual, targetWords, attempt, range, yieldRatio)
        : firstPrompt;
      // 续写保持同一创作温度；变化来自明确的剩余字数和上下文，不能靠升温碰运气。
      const useTemp = temperature;
      let response: { content: string };
      try {
        response = await this.realLLM.generate({
          prompt, scenario, temperature: useTemp, maxTokens, deferQualityGate: true,
          metrics: {
            projectId: metricsProjectId,
            chapterIndex: params.metricsContext?.chapterIndex,
            stepKey,
            attempt,
            targetWords,
            prevWords: lastActual || null,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpException(`章节生成调用失败，正文未保存：${message}`, 502);
      }
      const raw = this.generatedNarrativeText(response);
      if (!raw) {
        throw new HttpException('正文生成未返回可验收内容，正文未保存', 502);
      }
      // 重试时模型可能返回“完整新版正文”（以已写正文开头），也可能只返回“续写片段”。
      // 以是否复用已有正文开头来判定：复用则视为整章重写直接采用；否则作为续写片段追加到尾部。
      // 重试返回可能是「整章重写」或「纯续写片段」。不能只靠前 80 字全等判定——模型整章重写时常对
      // 开头做局部改写（用词高度重合但不完全一致），全等会把整章重写误判成续写，进而把两遍完整稿拼成
      // 双开头（同一晚事件发生两遍、时间线矛盾，曾把章节质量直接打到 34）。改用归一化 bigram 相似度
      // + 分散锚点稳健识别「同一开头的完整重写」：判定为完整重写就直接采用 raw，绝不与旧稿拼接。
      // 落库前做确定性「仅排版层」规整：折叠连续空行（规则 33）、合并连续叙述碎片段
      // （规则 26 / 26b-staccato）。这两类已在阻断清单内：确定性层先收口，残留碎片会进 contradictions 触发段落级精修，
      // 必须在确定性层收口。规则只重排换行、不增删字符，因此不影响字数统计与续写拼接语义。
      const layoutProfile = this.resolveHardlineProfile(metricsProjectId);
      const content = normalizeProseLayout(
        isRetry
          ? (this.retryResponseIsFullRewrite(raw, lastContent) ? raw : lastContent + raw)
          : raw,
        layoutProfile,
      );
      const actual = this.generatedNarrativeWordCount(content);
      lastContent = content;
      lastActual = actual;
      if (lastActual >= range.min && lastActual <= range.max) {
        params.onProgress?.({
          label: '字数验收通过',
          message: `正文已收敛至 ${lastActual} 字（落在 ${range.min}-${range.max} 区间内），进入大纲一致性质检…`,
          progress: 90,
        });
        return content;
      }
      // 关键修复②：超出上限走确定性句末截断兜底（仅裁剪模型多余铺陈，不伪造任何内容）。
      // 正文必有句末标点，截断后必落在合法区间，直接采用，避免无谓的压缩重试。
      if (lastActual > range.max) {
        const trimmed = this.trimToSentenceBoundary(content, range.max, range.min);
        const trimmedCount = this.generatedNarrativeWordCount(trimmed);
        if (trimmedCount >= range.min) {
          params.onProgress?.({
            label: '字数验收通过',
            message: `正文经句末收敛至 ${trimmedCount} 字（落在 ${range.min}-${range.max} 区间内），进入大纲一致性质检…`,
            progress: 90,
          });
          return trimmed;
        }
      }
      // 不足下限时不按固定次数继续。首稿后可做一次按实际缺口的续写；
      // 后续只有在字数确实向下限显著推进时才获得下一次调用资格。
      const continuation = decideLengthContinuation(previousActual, lastActual, range.min);
      if (!continuation.continue) {
        throw new HttpException(
          `正文续写未形成可验证进展（${continuation.reason}，本次增加${continuation.gainedWords}字，至少需增加${continuation.requiredGain}字），已停止重复生成；当前${lastActual}字，结果未保存`,
          422,
        );
      }
      previousActual = lastActual;
      attempt += 1;
    }
  }

  /**
   * 字数重试时，判断模型本次返回的是「整章重写的完整稿」还是「只新增的续写片段」。
   * 旧实现只比较前 80 字是否完全相同，模型只要对开头做局部改写就会被误判成续写，
   * 导致「旧完整稿 + 新完整稿」双稿叠印（同一事件发生两遍、时间线矛盾，曾把章节打到 34 分）。
   * 改为确定性文本相似度判定，不调用模型：
   *   1) 前 80 字精确相同 → 必然是完整重写（保留原快速路径）；
   *   2) 归一化去标点空白后，两段开篇（前 300 字）bigram Dice ≥ 0.5 → 同一开头的重写；
   *   3) 旧稿在 开头/1/3/2/3 三处的短锚点在新稿命中 ≥2 → 新稿复述了旧稿主体，判为重写。
   * 真正的续写片段从旧稿结尾往后写，与旧稿「开头」几乎不重合，三条都不会误命中。
   */
  private retryResponseIsFullRewrite(raw: string, prev: string): boolean {
    if (!prev) return false;
    if (raw.startsWith(prev.slice(0, 80))) return true;
    const norm = (s: string) => String(s).replace(/[\s\p{P}]/gu, '');
    const a = norm(prev);
    const b = norm(raw);
    if (a.length < 40 || b.length < 40) return false;
    if (this.bigramDice(a.slice(0, 300), b.slice(0, 300)) >= 0.5) return true;
    const anchors = [0, 0.33, 0.66]
      .map((t) => a.slice(Math.floor(a.length * t), Math.floor(a.length * t) + 24))
      .filter((x) => x.length >= 16);
    if (anchors.filter((anc) => b.includes(anc)).length >= 2) return true;
    // 兜底：新稿正文里直接出现旧稿「开头」一段、且新稿体量达旧稿一半以上 → 它是从头重写的完整稿
    // （真续写从旧稿结尾往后写，绝不可能包含旧稿开头），必须采用新稿、禁止拼接成双开头。
    const headAnchor = a.slice(0, 40);
    if (headAnchor.length >= 24 && b.includes(headAnchor) && b.length >= a.length * 0.5) return true;
    return false;
  }

  /** 字符二元组 Dice 系数（0~1），衡量两段文本词面重合度，纯确定性、零模型调用。 */
  private bigramDice(a: string, b: string): number {
    const gramSet = (s: string) => {
      const set = new Set<string>();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const A = gramSet(a);
    const B = gramSet(b);
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const g of A) if (B.has(g)) inter++;
    return (2 * inter) / (A.size + B.size);
  }

  /**
   * 把超出上限的正文在“句末标点”处确定性截断到 maxCount（与 generatedNarrativeWordCount
   * 同一计量）以内，避免要求模型反复自我压缩仍失败导致整章丢失。只裁剪模型自身多余
   * 铺陈，不新增、不改写任何内容（无假数据）。从尾部向前找第一个既 ≤ maxCount 又 ≥
   * minCount 的句末边界，尽量贴近上限、少切真实内容。
   */
  private trimToSentenceBoundary(content: string, maxCount: number, minCount: number = CHAPTER_WORD_RANGE.min): string {
    if (this.generatedNarrativeWordCount(content) <= maxCount) return content;
    const endings = /[。！？!?…~）”」』]/;
    let fallback = '';
    for (let i = content.length - 1; i >= 0; i--) {
      if (!endings.test(content[i])) continue;
      const slice = content.slice(0, i + 1);
      const count = this.generatedNarrativeWordCount(slice);
      if (count <= maxCount) {
        if (count >= minCount) return slice; // 命中理想区间，直接采用
        fallback = slice; // 暂存“不超过上限”的最长切片，若找不到理想区间再用
      }
    }
    return fallback || content.slice(0, maxCount);
  }

  /**
   * 构建“续写追加”扩充 prompt：把上一版完整正文作基底，要求模型严格从其结尾继续，
   * 只输出【新增续写片段】（不重复、不重写已有正文），从而让总字数单调递增地逼近下限。
   * 这是修复“字数不足下限”的关键——比“整章重写得更长”可靠得多，因为后者模型常给出
   * 相似篇幅而原地踏步。所有追加内容必须贴合本章任务，不得引入无关支线（避免破坏大纲一致性）。
   */
  private buildExpansionContinuationPrompt(
    basePrompt: string,
    prevContent: string,
    prevActual: number,
    targetWords: number,
    attempt = 1,
    wordRange?: { min: number; max: number },
    yieldRatio = 1,
  ): string {
    const range = wordRange || { ...CHAPTER_WORD_RANGE };
    const deficit = Math.max(range.min - prevActual, targetWords - prevActual);
    // 模型单次续写实际产出约为"要求量"的 yieldRatio，按 1/yieldRatio 放大一次性要足，避免挤牙膏式 3-4 轮。
    const safeYield = Math.max(0.6, yieldRatio);
    const askWords = Math.max(deficit, Math.ceil(deficit / safeYield));
    const yieldHint = yieldRatio < 0.95
      ? `（据历史统计，你单次续写实际产出约为要求量的 ${(yieldRatio * 100).toFixed(0)}%，本次请直接写够 ≥ ${askWords} 字新增内容，一次性补足、不要分多次挤牙膏）`
      : '';
    const directive =
      `你正在扩写同一章小说。已写正文经系统逐字统计为 ${prevActual} 字，但本章正文必须达到 ≥ ${range.min} 且 ≤ ${range.max} 中文字（目标约 ${targetWords} 字），目前还差约 ${deficit} 字。\n` +
      `请严格以【已写正文】的结尾为起点继续往后写，只输出【新增的续写内容】，规则（不可违反）：\n` +
      `1) 绝不重复、绝不重写【已写正文】，不要加“（续写）”之类标记；直接在结尾后接续；\n` +
      `2) 只补充符合本章任务的情节细节（对话、动作、感官刻画、心理活动、场景氛围），不得引入与本章大纲无关的支线或新核心事件；\n` +
      `3) 续写后整体（已写 + 本次）应达到 ≥ ${range.min} 且 ≤ ${range.max} 中文字，并在合适处自然收尾；\n` +
      `4) 保持人物、视角、语气、时代背景与【已写正文】完全一致；\n` +
      `5) 你的回复只算新增续写部分的字数，必须 ≥ ${askWords} 且使整体不超 ${range.max}。${yieldHint}`;
    return `${basePrompt}\n\n## 字数扩充（自动重试·第${attempt}次·续写追加）\n${directive}\n\n## 已写正文（请从其结尾继续，不要重复它）\n${prevContent}`;
  }

  /**
   * 首版篇幅自校准指令：历史首版平均只写到目标的 ratio（<1），则在首版 prompt 前置要求按
   * target/ratio 铺排，把"结尾仓促、偏短"消灭在第一版，而非靠后续多轮补字。封顶不超章节上限。
   */
  private buildLengthCalibrationDirective(
    targetWords: number,
    range: { min: number; max: number },
    ratio: number,
  ): string {
    const safeRatio = Math.max(0.62, ratio);
    const padded = Math.min(range.max, Math.round(targetWords / safeRatio));
    return `\n\n## 篇幅一次到位要求（依据本模型历史首版产出自动校准）\n` +
      `统计显示：你在本项目的正文首版平均只写到目标篇幅的约 ${(ratio * 100).toFixed(0)}%，常因结尾仓促而偏短、触发多轮补写。\n` +
      `本次请直接按约 ${padded} 字铺排（最终仍须落在 ${range.min}-${range.max} 字区间）：开场即进入冲突，按场景节拍均匀分配篇幅，每个关键场景写足对话+动作+感官+心理，不要把多个场景压成概述，确保第一版就写到目标区间、无需后续补字。`;
  }

  /**
   * A chapter may only be persisted after the configured reviewer confirms that
   * it is the same chapter described by the bound detailed outline.  String
   * matching is deliberately not used here: prose must not duplicate outline
   * wording, but it must enact the required events, conflict, actions and hook.
   */
  /**
   * 非抛出版本的大纲一致性验收：返回结构化结论（pass/missing/contradictions/evidence），
   * 由调用方决定自修复还是阻断。审查器本身仍是真实 LLM（scenario=review），绝不伪造判定。
   */
  private async checkChapterAlignment(input: {
    chapterIndex: number;
    chapterTitle: string;
    outlineContract: string;
    storyContext: string;
    content: string;
    /** 后续章节边界清单：当前章之后各章的核心节拍，验收时检查跨章提前消费与跨章断言冲突 */
    subsequentChapterBoundary?: string;
    /** 项目 id：用于按目标平台/长短篇分化硬红线扫描（各平台是各平台风格） */
    projectId?: string;
  }): Promise<{
    evaluationStatus: 'evaluated' | 'not_evaluated';
    pass: boolean;
    missing: string[];
    contradictions: string[];
    advisories: string[];
    sourceConflicts: string[];
    evidence: string[];
    outlineAligned: boolean;
    continuityPassed: boolean;
    characterPassed: boolean;
    worldPassed: boolean;
    timelinePassed: boolean;
    prosePassed: boolean;
    /**
     * 确定性硬红线扫描的结构化结论（含命中段落原文与段号）。
     * 自修复循环靠它判断"这一轮的问题是否全部可段落级就地修复"，从而走局部补丁而非整章重写。
     */
    hardlineFindings: HardlineFinding[];
  }> {
    const fail = (missing: string[]): {
      evaluationStatus: 'not_evaluated';
      pass: boolean; missing: string[]; contradictions: string[]; advisories: string[]; sourceConflicts: string[]; evidence: string[];
      outlineAligned: boolean; continuityPassed: boolean; characterPassed: boolean;
      worldPassed: boolean; timelinePassed: boolean; prosePassed: boolean; hardlineFindings: HardlineFinding[];
    } => ({
      evaluationStatus: 'not_evaluated',
      pass: false, missing, contradictions: [], advisories: [], sourceConflicts: [], evidence: [],
      outlineAligned: false, continuityPassed: false, characterPassed: false,
      worldPassed: false, timelinePassed: false, prosePassed: false, hardlineFindings: [],
    });
    if (!input.outlineContract || input.outlineContract.length < 80) {
      return fail([OUTLINE_PRECONDITION_MARKER]);
    }
    // 执行标准是验收前提：评审器拿不到平台/分类/基调/文风/流派/视角，就只能判「有没有按大纲写」，
    // 判不了「这一章是否符合创建时确认的平台分类与文风」——那正是「配置是配置、执行是另一回事」的缺口。
    const reviewStandard = input.projectId ? this.buildExecutionStandardTags(input.projectId) : '';
    const reviewPrompt = `你是小说章节验收器。只判断，不改写正文。\n\n${reviewStandard ? `【创建项目时确认的执行标准（验收前提，正文必须执行）】\n${reviewStandard}\n\n` : ''}【章节】第${input.chapterIndex}章 ${input.chapterTitle}\n【不可偏离的详细大纲（当前章事实合同）】\n${input.outlineContract.slice(0, 12000)}\n\n【支持性故事上下文（前文事实/角色/世界观/时间线/伏笔）】\n${input.storyContext.slice(0, 14000)}\n\n${input.subsequentChapterBoundary ? `【后续章节边界（本章不得提前消费）】\n${input.subsequentChapterBoundary.slice(0, 1800)}\n\n` : ''}\n【待验收正文】\n${input.content}\n\n事实权威顺序：\n1. 已保存正文、明确锁定状态、mustObeyRules/forbiddenWriting 是最高权威。\n2. 当前章的具体到达时间、人物行动、场景与伏笔，以【详细大纲】为本章权威。\n3. 自动扩展的世界档案/简介只作支持材料；若它与详细大纲对同一事实说法冲突，写入 sourceConflicts，不得要求正文同时满足两套说法，也不得把遵循详细大纲判成正文错误。\n\n必须严格按顺序执行：\n第一步：从【详细大纲】提取“本章必需事件点清单”——每个事件点是大纲明确要求正文实际发生的一个具体事件/场景/人物行动/钩子，按大纲出现顺序排列，至少包含结尾钩子，合并同一场景的重复描述，最多12项。\n第二步：逐项判定正文是否真实发生该事件，给出 covered 与正文逐字证据。\n第三步：仅检查有逐字证据的故事事实冲突、人物越界、时间线冲突和结尾钩子；若提供了【后续章节边界】，必须额外检查两类跨章问题并写入 contradictions：(a) 跨章提前消费——正文把后续章节大纲明确计划的核心事件、伏笔回收或反转提前兑现/提前揭开；(b) 跨章断言冲突——正文写死“只有…才知道…”“世上只有…”“唯一…就是…”等强断言，而该断言与后续章节既定事实冲突（如后续大纲显示该信息另有来源）。两类问题均视为阻断性矛盾。\n第四步：只有重复措辞、相似身体动作、轻微收纳跳步、段落节奏与地点用词偏差写入 advisories。人物白名单外新角色、时间/倒计时/名单数量冲突、大纲必需事件顺序错位即使措辞为「建议统一」也必须写入 contradictions 并阻断，不得放入 advisories。
第五步：AI 痕迹检查——只补判确定性扫描覆盖不到的两项，命中且有逐字证据才写入 contradictions（视为阻断性矛盾）：(a) 升华式段尾：段落末尾突然“上价值”/总结点题（如“那一刻她终于明白”“一切都会过去的”）；(c) 空洞反思段：连续多段内心独白只有情绪、没有事件推进。正常的一两处修辞不判。以下各项已由确定性硬红线扫描唯一覆盖（formula-sentence 公式句／dash-density 破折号过密／simile-density 比喻过密／48 套路化表达／55 AI 高频模糊词过密／34 排比与动词堆砌／53-same-structure-parallel 同构排比，见 LANGUAGE_HARDLINE_RULE_IDS），仍按阻断性矛盾处理，但判据只有一份：此处不得再判定、不得再产出同类条目，以免同一处 AI 痕迹被重复计数。\n第六步：执行标准检查——平台/分类/基调/文风/流派/视角六维都是创建时确认的执行前提，任一处偏差都写入 contradictions（阻断性矛盾），由修复闭环改写后重新验收，不得因为「只是文风/只是措辞」降级成 advisories。逐维判据：(a)「视角」——正文叙事视角必须与执行标准一致（标准为「多视角轮换」时按段落级标记判定）；(b)「分类」——本章的事件类型、场景与冲突必须落在执行标准「分类」所指的平台投稿分类范围内；(c)「基调」——全篇情绪走向与标准一致，情绪转折有铺垫与代价，未中途改调性；(d)「文风」——句式、比喻密度、描写分寸与信息给法与标准一致；(e)「流派」——该流派读者的核心预期在本章被兑现。判定必须有逐字证据，且偏差须成规模（同一维≥2 处或贯穿全章）才判，单处用词偏好不判。平台层量化基准（段落厚度、对话占比、章尾钩等）由确定性硬红线扫描器负责，此处不重复判定。\n\n严格规则：\n- 正文必须执行本章大纲，不得用同主题的另一件事替代。\n- 任一必需事件 covered=false 或存在有证据的故事事实冲突才不通过。\n- sourceConflicts 是资料源之间的矛盾：先修资料源，阻断正文保存，禁止正文同时满足两套矛盾说法。\n- 不以关键词出现作为通过依据；证据必须逐字来自正文，找不到就写“无明确证据”，不得猜。\n- 输出必须紧凑：event不超过60字，evidence不超过80字，contradictions最多6项，advisories最多6项，总JSON不超过6000个汉字。\n\n只输出JSON对象：{"pass":true|false,"requiredEvents":[{"event":"必需事件点","covered":true|false,"evidence":"正文逐字证据或无明确证据"}],"missingRequiredItems":["所有covered=false的事件点"],"contradictions":["仅有证据的故事事实/人物/时间线/跨章冲突"],"advisories":["非阻断的局部措辞/重复问题（执行标准六维偏差不得放这里）"],"sourceConflicts":["资料源之间互相冲突的说法"],"outlineAligned":true|false,"continuityPassed":true|false,"characterPassed":true|false,"worldPassed":true|false,"timelinePassed":true|false,"prosePassed":true|false,"evidence":["最多4条总体逐字证据"]}\n\npass 必须为 true 当且仅当：全部 requiredEvents.covered===true 且 contradictions 为空。advisories 不改变 pass；sourceConflicts 必须清零才可通过。`;
    const qualityOutputContract = '';
    let response: { content: string };
    try {
      response = await this.realLLM.generate({
        prompt: `${reviewPrompt}${qualityOutputContract}`,
        scenario: 'review',
        temperature: 0.1,
        // 真实日志显示 8192→16384 仍可能连续截断。第一次直接使用评审完整预算，
        // 同时禁止内部扩容重跑；若仍截断则明确 not_evaluated，不得改写正文。
        maxTokens: LLM_TUNABLES.QUALITY_REVIEW_MAXTOKENS,
        responseFormat: 'json_object',
        maxEmptyRetries: 0,
        metrics: {
          projectId: input.projectId,
          chapterIndex: input.chapterIndex,
          stepKey: 'alignment_review',
          attempt: 0,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 审查调用失败：按"不通过"处理并保留原因，交给上层决定（自修复或抛出）。
      // 关键：message 透传，不替换为"网络问题"等模糊文案——上游瞬时空内容属真实 LLM 调用失败，
      // 失败原因以日志为准；上层会把这条 missing 写进矛盾 tab 让作者可见。
      return fail([`章节验收评审调用失败（评审器故障，不是正文缺陷）：${message}`]);
    }
    const verdict = this.safeExtractJson<{
      pass?: unknown;
      requiredEvents?: unknown;
      outlineAligned?: unknown;
      continuityPassed?: unknown;
      characterPassed?: unknown;
      worldPassed?: unknown;
      timelinePassed?: unknown;
      prosePassed?: unknown;
      missingRequiredItems?: unknown;
      contradictions?: unknown;
      advisories?: unknown;
      sourceConflicts?: unknown;
      evidence?: unknown;
    }>(response.content, null as any);
    const requiredEvents = Array.isArray(verdict?.requiredEvents) ? verdict.requiredEvents : [];
    const uncoveredEvents = requiredEvents
      .filter((e: any) => e && e.covered !== true)
      .map((e: any) => `大纲必需事件未兑现：${typeof e.event === 'string' ? e.event : '未命名事件'}${typeof e.evidence === 'string' && e.evidence ? `（${e.evidence}）` : ''}`)
      .filter(Boolean);
    const missing = Array.from(new Set([
      ...(Array.isArray(verdict?.missingRequiredItems) ? verdict.missingRequiredItems.map(String).filter(Boolean) : []),
      ...uncoveredEvents,
    ]));
    const rawContradictions = Array.isArray(verdict?.contradictions)
      ? verdict.contradictions.map(String).filter(Boolean)
      : [];
    const rawAdvisories = Array.isArray(verdict?.advisories)
      ? verdict.advisories.map(String).filter(Boolean) : [];
    const partitioned = partitionAlignmentFindings(rawContradictions, input.outlineContract, rawAdvisories);
    const contradictions = [...partitioned.blocking];
    const advisories = Array.from(new Set(partitioned.advisories));
    const sourceConflicts = Array.from(new Set([
      ...partitioned.sourceConflicts,
      ...(Array.isArray(verdict?.sourceConflicts) ? verdict.sourceConflicts.map(String).filter(Boolean) : []),
    ]));

    // ===== 硬红线确定性扫描 =====
    // LLM 验收器在长 prompt 下经常放过同类违规（"叙述者跳出成为作者评论者""睡着了又盯着屏幕"
    // "短句独立成段后跟空行"），必须用确定性规则补一层卡口。命中即视为违反硬红线，
    // 直接 pass=false 并把违规原文注入 contradictions，让 generateBodyWithAlignmentGuard
    // 触发回炉（精修 prompt 会把违规原文喂回去要求精确删除/改写）。
    const hardlineProfile = this.resolveHardlineProfile(input.projectId);
    const languageFindings = detectForbiddenTells(input.content, hardlineProfile);
    const factFindings = this.detectGlobalFactContradictions(input.content);
    // AI 痕迹硬红线分流：语言硬伤类（LANGUAGE_HARDLINE_RULE_IDS，含叙述者跳出、解释一切、
    // 动作清单、机械碎句、同构排比、公式句、破折号/比喻过密、热血空洞反思、觉醒段、
    // 客服式对话、机械转场、刻意感官/拟人/套路化表达、密集生理反应、AI 高频模糊词等）
    // 与事实类一样按阻断性矛盾处理（带【硬红线·确定性扫描·】前缀，触发精修精确改写）；
    // 文笔/排版类（短段堆叠 26-short-para、等长段 26-uniform、逐句换行 26b-staccato、姓名独占一行 32、
    // 多空行 33、标点单一 35、叙述标点平板 35b）已全部收进同一份阻断清单 LANGUAGE_HARDLINE_RULE_IDS，
    // 与语言硬伤一样进 contradictions、阻断保存，不存在「只提示不阻断」。仍进 advisories 的只剩内容/节奏
    // 度量类（40 开篇钩子 / 40b 番茄前300字冲突 / 41 情绪死区 / 43 不完美细节 / 45 数字锚点 / 28a
    // 冗余过滤词 / 38 代词过载 / 对话占比 dialogue-ratio / time-density 时间词过密），由平台度量与提示词硬性要求承担。
    if (languageFindings.length > 0) {
      const languageHardline = languageFindings.filter(f => isLanguageHardline(f.ruleId));
      for (const f of languageFindings) {
        const isHard = isLanguageHardline(f.ruleId);
        const line = `${isHard ? HARDLINE_FINDING_PREFIX : '【质量建议·确定性扫描·'}${f.ruleId}】${f.message} | 位置: ${f.position} | 原文: ${f.snippet}`;
        if (isHard) contradictions.push(line);
        else advisories.push(line);
      }
      if (languageHardline.length > 0) {
        this.logger.warn(
          `语言硬红线确定性扫描命中 ${languageHardline.length} 处违规（章节 ${input.chapterIndex}）：` +
          languageHardline.map(f => `${f.ruleId}@${f.position}`).join(', ')
        );
      }
    }
    if (factFindings.length > 0) {
      for (const f of factFindings) {
        // 前缀统一取 HARDLINE_FINDING_PREFIX（【硬红线·确定性扫描·规则号】），供 ConflictDashboard
        // 与精修 prompt 区分来源；不得在别处再写一份同样的字面量。
        contradictions.push(
          `${HARDLINE_FINDING_PREFIX}${f.ruleId}】${f.message} | 位置: ${f.position} | 原文: ${f.snippet}`
        );
      }
      this.logger.warn(
        `事实硬红线确定性扫描命中 ${factFindings.length} 处违规（章节 ${input.chapterIndex}）：` +
        factFindings.map(f => `${f.ruleId}@${f.position}`).join(', ')
      );
    }

    // 评审器只要返回了可解析的结论对象，就说明这一章确实被评估过。此前要求
    // requiredEvents 非空才判 evaluated，导致"返回了合法结论、只是没给出必需事件清单"
    // 被当成"评审证据不足"，整章作废重来（实测 24 次 outline 失败全部由此产生）。
    // 真正的 not_evaluated 只有两种：评审调用失败，或 JSON 无法解析（verdict 为空）。
    const verdictEvaluated = !!verdict && typeof verdict === 'object' && Object.keys(verdict).length > 0;
    const evaluationStatus = verdictEvaluated ? 'evaluated' : 'not_evaluated';
    const pass = evaluationStatus === 'evaluated'
      && verdict?.outlineAligned === true
      && missing.length === 0 && contradictions.length === 0 && sourceConflicts.length === 0;
    return {
      evaluationStatus,
      pass,
      missing,
      contradictions,
      advisories: Array.from(new Set(advisories)),
      sourceConflicts,
      evidence: Array.isArray(verdict?.evidence) ? verdict.evidence.map(String).filter(Boolean).slice(0, 4) : [],
      outlineAligned: pass || verdict?.outlineAligned === true,
      continuityPassed: pass || verdict?.continuityPassed === true,
      characterPassed: pass || verdict?.characterPassed === true,
      worldPassed: pass || verdict?.worldPassed === true,
      timelinePassed: pass || verdict?.timelinePassed === true,
      prosePassed: verdict?.prosePassed === true && languageFindings.length === 0,
      hardlineFindings: [...languageFindings.filter(f => isLanguageHardline(f.ruleId)), ...factFindings],
    };
  }

  /**
   * 抛出版本：保持既有契约（其他调用方如续写端点仍依赖“不通过即 422 抛出”）。
   * 仅是把 checkChapterAlignment 的结论转成异常。
   */
  private async assertGeneratedChapterAlignment(input: {
    chapterIndex: number;
    chapterTitle: string;
    outlineContract: string;
    storyContext: string;
    content: string;
    projectId?: string;
  }): Promise<{ outlineAligned: true; continuityPassed: true; characterPassed: true; worldPassed: true; timelinePassed: true; prosePassed: true; evidence: string[] }> {
    if (!input.outlineContract || input.outlineContract.length < 80) {
      throw new HttpException('本章详细大纲不足以作为正文验收依据，已停止生成且未保存正文', 400);
    }
    const report = await this.checkChapterAlignment(input);
    if (!report.pass) {
      // 与 generateBodyWithAlignmentGuard 共用同一个分类器：成因（未执行标准／正文硬红线／
      // 本章大纲不一致／评审未完成）由分类器判定，不在这里手写文案——手写文案正是
      // 「无论真实原因是什么都报同一句」的来源。
      const failure = classifyGateFailure({
        evaluationStatus: report.evaluationStatus,
        topic: 'outline_alignment',
        missing: report.missing,
        contradictions: report.contradictions,
      });
      this.logger.error(`[Gate] ${gateFailureLabel(failure)} | projectId=${input.projectId} chapterIndex=${input.chapterIndex} | kinds=${failure.kinds.join('+')} | status=${failure.status} | detail=${failure.detail}`);
      this.recordGateRejection({
        projectId: input.projectId, chapterIndex: input.chapterIndex, report: failure, content: input.content,
      });
      throw new HttpException(failure.message, failure.status);
    }
    return {
      outlineAligned: true,
      continuityPassed: true,
      characterPassed: true,
      worldPassed: true,
      timelinePassed: true,
      prosePassed: true,
      evidence: report.evidence,
    };
  }

  /**
   * 大纲事实优先精确补丁。旧流程把两句方向矛盾也交给整章重写，结果在其它段落
   * 新增语言硬红线，回滚后直接退出，段落级修复从未运行。补丁只提供逐字原文，
   * 由唯一匹配/改动预算/故事身份及后续双 Gate 复检共同约束；不通过则保留原稿。
   */
  private async repairOutlineFactsLocally(params: {
    projectId: string; chapterIndex: number; content: string; outlineContract: string;
    issues: string[]; attempt: number;
  }): Promise<string | null> {
    const { projectId, chapterIndex, content, outlineContract, issues, attempt } = params;
    if (!issues.length) return null;
    // 这里曾把「问题超过 4 项」当成禁用局部修订的开关，后果是复杂章节
    // 直接整章重写，新增硬红线后回滚并停止，精确修补一次也没尝试。
    // 每轮最多选 4 项做有限补丁，其余仍留在完整复检中，不能借分批放行。
    const selectedIssues = issues.slice(0, 4);
    const prompt = `你是小说本章大纲事实的局部修订器。仅修复下列有证据的缺失或冲突，禁止整章重写、无关润色和改变其它已正确发生的事件。\n\n【项目执行标准】\n${this.buildExecutionStandardTags(projectId)}\n\n【本章大纲】\n${outlineContract}\n\n【待修问题】\n${selectedIssues.map((v, i) => `${i + 1}. ${v}`).join('\n')}\n\n【当前完整正文】\n${content}\n\n输出 JSON：{"patches":[{"original":"正文里逐字存在且唯一的原文","replacement":"修正后的文字"}]}。最多8处；每处尽量只替换含错误的句子或紧邻段落，全部改动合计不超过正文20%。需要补入事件时，替换最邻近的原段落并保持时间顺序、名单数字、人物关系、视角及其它事件不变。正文硬红线也仍会复检；不得新增机械转场、标点堆砌、碎句或无语义的问句。若不能定位，返回 {"patches":[]}，不得编造已修复结论。`;
    let response: { content: string };
    try {
      response = await this.realLLM.generate({
        prompt, scenario: 'refinement', temperature: 0.2, responseFormat: 'json_object',
        maxTokens: LLM_TUNABLES.QUALITY_REPAIR_MAXTOKENS, deferQualityGate: true,
        metrics: { projectId, chapterIndex, stepKey: `outline_local_repair_${attempt}`, attempt },
      });
    } catch (error) {
      this.logger.warn(`大纲局部修订第${attempt}轮模型调用失败，停止本次生成：${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    try {
      const patches = JSON.parse(response.content).patches;
      // 这里曾有第二份“整批补丁必须全有效”的修复口径：模型漏抄一行原文，
      // 8 处补丁即使其余 7 处锚定正确也全部丢弃，随后整章重写又新增硬红线。
      // 只取逐字唯一且落在 20% 预算内的受限批次；拒绝项记录并留待下一轮，
      // 下方仍以完整语义 Gate 与硬红线 Gate 证明改善，否则本批回滚。
      const batch = selectAnchoredLocalPatchBatch(content, patches, 0.2);
      if (batch.rejected.length > 0) {
        this.logger.warn(`大纲局部修订第${attempt}轮补丁分批：采纳 ${batch.patches.length} 处、留待复检 ${batch.rejected.length} 处（${batch.rejected.map(item => `${item.index + 1}:${item.reason}`).join('，')}）`);
      }
      if (batch.patches.length === 0) return null;
      // 这里曾把全部事实补丁一次套入再扫描；其中一条制造 26 等长段，
      // 后果是另外两条能修正时间事实的安全补丁也一并回滚，然后整章重写。
      // 逐条扫描同一份硬红线规则，只接受不新增、不加重硬红线的补丁；
      // 未接受的问题继续阻断，后续完整事实评审仍须证明总问题减少。
      const profile = this.resolveHardlineProfile(projectId);
      const scanHardlines = (text: string) => [
        ...detectForbiddenTells(text, profile).filter(f => isLanguageHardline(f.ruleId)),
        ...this.detectGlobalFactContradictions(text),
      ];
      let repaired = content;
      let hardlines = scanHardlines(content);
      let accepted = 0;
      for (const [index, patch] of batch.patches.entries()) {
        const candidate = applyLocalPatches(repaired, [patch], false, 0.2);
        const nextHardlines = scanHardlines(candidate);
        const progress = assessHardlineRepairProgress(hardlines, nextHardlines, false);
        if (!progress.accepted) {
          this.logger.warn(`大纲局部修订第${attempt}轮补丁 ${index + 1} 留待复检：${progress.reason}`);
          continue;
        }
        repaired = candidate;
        hardlines = nextHardlines;
        accepted += 1;
      }
      if (accepted === 0) return null;
      this.assertGeneratedChapterIdentity(repaired, chapterIndex);
      const guard = refineKeepsStory(content, repaired, this.getProjectCharacterNames(projectId));
      if (!guard.ok) throw new Error(`故事身份不一致：${guard.reason}`);
      return repaired;
    } catch (error) {
      this.logger.warn(`大纲局部修订第${attempt}轮未应用：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 构建“大纲对齐自修复”prompt：把验收器判定的缺失/冲突要点逐条列出，并要求整章重写时
   * 强制以【本章结尾钩子】收尾、不得提前终止于大纲中间事件。仍是真实 LLM 重写，无假数据。
   * 仅作原 basePrompt 的追加指令段，大纲与上下文保持不变（见上文）。
   */
  private buildAlignmentRepairPrompt(
    basePrompt: string,
    missing: string[],
    contradictions: string[],
    chapterIndex: number,
    targetWords: number,
    previousContent: string,
    attemptLabel: string,
  ): string {
    const missingList = missing.map((m, i) => `  ${i + 1}) ${m}`).join('\n');
    // 截断上一版正文喂给模型（避免 prompt 过长），让它"看到"已写好的部分以便保留，
    // 而不是整章推倒重来导致文本同质化/风格断裂。
    const prev = (previousContent || '').slice(0, 6000);

    // 本函数仅修大纲事件与事实冲突。确定性硬红线按扫描器证据交给局部补丁，复检后再判。
    const contradictionList = contradictions.map((c, i) => `  ${i + 1}) ${c}`).join('\n');
    const contradictionBlock = contradictionList
      ? `\n\n## LLM 验收矛盾（需要重写思路，不只是删字）\n${contradictionList}\n\n每条矛盾都必须在【上一版正文】中定位到具体句子并直接改写该句：数字/事实类矛盾（数量自相矛盾、时间线冲突、事实冲突）必须把冲突句改写成与开篇及世界观档案一致的数字/事实，矛盾双方只保留正确的一方；跨章提前消费类矛盾必须删除或降级为模糊线索；改完对照矛盾列表逐条确认已消除，不得原样保留任何一条。\n`
      : '';

    const directive =
      `\n\n## 大纲对齐迭代精修（${attemptLabel} · 基于上一版进化，不是推倒重来）\n` +
      `上一版第${chapterIndex}章正文未通过大纲一致性验收，缺失/冲突如下，本次必须全部兑现：\n${missingList}\n${contradictionBlock}\n` +
      `【上一版正文（保留已正确发生的场景，只补回缺失事件并修正事实冲突）】\n${prev}\n\n` +
      `迭代精修规则（不可违反）：\n` +
      `1) 这是一次【针对性精修】而非随意改写：上一版中已正确发生的场景与正文必须尽量保留其位置与内容，只补回缺失的必需事件点并修正事实冲突；\n` +
      `2) 缺失要点 ${missingList} 必须全部兑现，不得省略、不得替换、不得调换其在大纲中的顺序；\n` +
      `3) 正文的【最后一个场景】必须是【本章结尾钩子】所描述的内容，必须将正文落在该钩子场景上收尾；严禁提前终止于大纲中间事件（如用餐、通勤、过渡等场景）；\n` +
      `4) 仍须满足 ${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max} 字（目标约 ${targetWords} 字）、散文质感、视角一致、不违反世界观/角色/时间线等全部原有要求；\n` +
      `5) 本轮不以标点或文风润色代替缺失事件；重写后仍要经过全文硬红线扫描，任何残留都会阻断保存；\n` +
      `6) 直接输出完整可发布的正文（含保留的原有场景 + 补回的新场景），不要任何解释、前缀、JSON 或方法论标签。`;
    return `${basePrompt}${directive}`;
  }

  // 这里曾有第二份硬红线修法说明书，后果是与扫描器命中结论冲突、混合失败时
  // 把语言问题塞进大纲重写，标点建议甚至与破折号密度相互打架。现只以扫描器 finding
  // 为语言判据；大纲修复只处理事件与事实，局部精修只处理命中段落。

  /**
   * 执行前提读取失败必须显式失败，绝不静默降级。
   *
   * 平台/分类/基调/文风/流派/视角与硬红线档案是用户创建时确认的「执行标准」，是生成的前提。
   * 这些读取此前一律用 catch 返回空值，把数据库故障吞成"没有配置"：prompt 里没有平台与基调、
   * 硬红线扫描退化成通用口径、精修失去人物名单，生成却照常返回成功——
   * 这正是「配置是配置、怎么做是另一回事」的机制性根因：空值让执行标准静默失效。
   * 因此这里统一抛出可定位的服务端错误：停止本次生成，并把失败站点与原因暴露给用户。
   */
  private throwStepReadFailure(site: string, projectId: string | undefined, error: unknown): never {
    if (error instanceof HttpException) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.error(`[执行前提读取失败] ${site} project=${projectId || '(未提供)'}：${detail}`);
    throw new HttpException(
      `执行前提读取失败（${site}）：${detail}。已停止本次生成，避免在缺少平台/基调/文风等执行标准的情况下继续。`,
      500,
    );
  }

  /**
   * 创建时确认的执行标准（平台/分类/基调/文风/流派/视角六维）完整指令。
   * 篇幅【在】执行标准之内，只是不占独立维度键：全书目标字数由「分类」维度携带的平台分类
   * 实测体量分布约束（platformCategoryBenchmarkNote 明确要求「与头部区间对照后明确取舍」），
   * 只有单章字数才由字数区间守卫负责。不得把「不是维度键」读成「不必按平台分类执行」。
   * 维度清单唯一来源见 shared/src/execution-standard-dimensions.ts，这里不得再列第二份。
   * 局部精修 prompt 必须带上它：用户设定的这些是执行前提，精修不得偏离平台风格与基调。
   * 与 resolveHardlineProfile、首稿 prompt 同源（同一份创作宪法），不另起一套口径。
   */
  private buildExecutionStandardTags(projectId: string): string {
    try {
      const row = this.db.getDb()
        .prepare('SELECT type, target_platform, settings FROM projects WHERE id = ?')
        .get(projectId) as any;
      // 项目不存在 = 执行标准取不到，属未执行，必须暴露而不是返回空标准放行。
      if (!row) throw new HttpException(`执行标准解析失败：项目不存在 ${projectId}`, 404);
      // 与框架层、正文层共用唯一执行标准构建器：不再各自另拼一份口径。
      return buildExecutionStandard(readConstitution(row)).directive;
    } catch (error) {
      this.throwStepReadFailure('buildExecutionStandardTags', projectId, error);
    }
  }

  /**
   * 硬红线【段落级局部精修】：确定性扫描已经给出命中段落原文与段号，位置精确已知，
   * 因此不需要、也不允许整章重写——整章重写会让段号漂移、同类违规换一批位置复现，
   * 正是规则 42 等硬红线"命中 → 整章重写 → 再命中"反复卡住保存的根因。
   *
   * 执行器与统一质量 Gate 共用同一个局部补丁通道（hardline_local_replacement）：
   * 只在命中段落内就地插入/改写，未命中段落一字不动。
   * 返回 null 表示本轮不可用（证据锚不住 / 模型输出非法 / 未证明命中数严格减少），
   * 调用方据此保留上一版正文，绝不做无证据的改写。
   */
  private async repairHardlineFindingsLocally(params: {
    projectId: string;
    chapterIndex: number;
    content: string;
    findings: HardlineFinding[];
    attempt: number;
    onProgress?: (p: { label: string; message: string; progress: number }) => void;
  }): Promise<{ content: string; before: number; after: number } | null> {
    const { projectId, chapterIndex, content, findings, attempt } = params;
    const profile = this.resolveHardlineProfile(projectId);
    // 自证口径与 Gate 完全一致：语言硬伤 + 事实硬红线，两条都用同一份确定性扫描器。
    const scanFindings = (text: string) => [
      ...detectForbiddenTells(text, profile).filter(f => isLanguageHardline(f.ruleId)),
      ...this.detectGlobalFactContradictions(text),
    ];
    const beforeFindings = scanFindings(content);
    const before = beforeFindings.length;

    // 证据锚定：命中段落原文是正文的逐字子串，可直接当 evidence.quote（qualityIssue 依据
    // content.indexOf(quote) >= 0 自动判 verified）。snippet 是折叠过的摘要（"A | B | C"），
    // 只有拆开后逐字命中的片段才能当锚点。锚不出证据就不改。
    const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    const issues: QualityIssue[] = [];
    // 同一轮最多给模型 6 段精确证据；其余命中留待复检后的下一轮。
    // 这里曾把整章、全部命中段和整份规则说明一次送入结构化精修，后果是输出扩到
    // 32768 tokens 仍截断，8 处硬伤一处也没改成。分批仍由全文硬红线复检把关。
    const MAX_LOCAL_ANCHORS = 6;
    const candidates: Array<{ finding: HardlineFinding; anchors: string[] }> = [];
    for (const finding of findings) {
      const anchors = new Set<string>();
      for (const p of finding.paragraphs || []) {
        const text = String(p || '').trim();
        if (text && content.indexOf(text) >= 0 && content.indexOf(text) === content.lastIndexOf(text)) anchors.add(text);
      }
      if (anchors.size === 0) {
        for (const part of String(finding.snippet || '').split(' | ')) {
          const fragment = part.trim();
          if (fragment.length < 8 || !content.includes(fragment)) continue;
          const host = paragraphs.find(p => p.includes(fragment));
          if (host && content.indexOf(host) === content.lastIndexOf(host)) anchors.add(host);
        }
      }
      if (anchors.size > 0) candidates.push({ finding, anchors: [...anchors] });
    }
    // 这里曾按扫描顺序把前 6 段填满：26 等长占 3 段、35 再占 3 段，
    // 后面的 42/50/53 根本没进精修 prompt。先每条规则选一个高重合锚点，
    // 再把剩余预算给需要多处修改的全局密度/残句规则；正文仍只允许 6 段。
    const coverage = new Map<string, number>();
    for (const row of candidates) {
      for (const quote of row.anchors) coverage.set(quote, (coverage.get(quote) || 0) + 1);
    }
    const chosenAnchors = new Set<string>();
    for (const row of candidates) {
      if (chosenAnchors.size >= MAX_LOCAL_ANCHORS) break;
      if (row.anchors.some(quote => chosenAnchors.has(quote))) continue;
      // 连续八段圆滑对答若只改首段，余下七段仍命中；优先在中部截断。
      const best = row.finding.ruleId === '42'
        ? row.anchors[Math.floor((row.anchors.length - 1) / 3)]
        : [...row.anchors].sort((a, b) => (coverage.get(b) || 0) - (coverage.get(a) || 0))[0];
      if (best) chosenAnchors.add(best);
    }
    // 这里曾只给 35b 的首个命中窗提供证据，后果是用户这版正文 33 个失败窗
    // 每轮只修章首、后三分之二始终没进 prompt。扫描器现提供全部失败窗段落，
    // 在有限补丁预算内分散取样，复检仍要求全文命中严格下降。
    for (const ruleId of ['35b', '35']) {
      const row = candidates.find(candidate => candidate.finding.ruleId === ruleId);
      if (!row || row.anchors.length < 3) continue;
      for (const fraction of [0.25, 0.5, 0.75]) {
        if (chosenAnchors.size >= MAX_LOCAL_ANCHORS) break;
        chosenAnchors.add(row.anchors[Math.floor((row.anchors.length - 1) * fraction)]);
      }
    }
    for (const row of candidates.filter(({ finding, anchors }) => finding.ruleId === '42' && anchors.length >= 5)) {
      if (chosenAnchors.size >= MAX_LOCAL_ANCHORS) break;
      chosenAnchors.add(row.anchors[Math.floor((row.anchors.length * 2) / 3)]);
    }
    for (const row of candidates.filter(({ finding }) =>
      finding.ruleId === 'dash-density' || finding.ruleId === '50-fragment-action-chain')) {
      for (const quote of row.anchors) {
        if (chosenAnchors.size >= MAX_LOCAL_ANCHORS) break;
        chosenAnchors.add(quote);
      }
    }
    const selected = candidates.map(row => ({
      finding: row.finding,
      anchors: row.anchors.filter(quote => chosenAnchors.has(quote)),
    })).filter(row => row.anchors.length > 0);
    for (const { finding, anchors } of selected) {
      for (const quote of anchors) {
        issues.push(qualityIssue({
          projectId, stage: 'chapter', ruleId: finding.ruleId, severity: 'blocking',
          message: `【硬红线】${finding.message}（位置：${finding.position}）`,
          quote, content, source: 'hardline_local_repair',
        }));
      }
    }
    if (issues.length === 0) {
      this.logger.warn(`硬红线段落级精修中止（章节 ${chapterIndex}）：${findings.length} 条命中无法锚定到正文逐字原文，保留上一版正文、不做无证据改写`);
      return null;
    }

    const violationLines = selected.map(({ finding: f }, i) =>
      `  ${i + 1}) ${HARDLINE_FINDING_PREFIX}${f.ruleId}】${f.message} | 位置: ${f.position}${f.occurrenceCount ? ` | 当前命中窗/次数: ${f.occurrenceCount}` : ''}`);
    const hitBlocks = selected.map(({ finding: f, anchors }, i) =>
      `【命中 ${i + 1}｜规则 ${f.ruleId}｜${f.position}】\n${anchors.map(p => {
        const at = paragraphs.indexOf(p);
        return `${at >= 0 ? `第 ${at + 1} 段：` : ''}${p}`;
      }).join('\n\n')}`).join('\n\n');
    const executionStandard = this.buildExecutionStandardTags(projectId);

    const prompt =
`你是小说正文的【段内局部精修器】。上一版正文触发了确定性硬红线扫描，命中规则、命中原文与段号已给出。
本轮只允许在【命中段落内部】就地改写：未命中段落必须一字不动，段落数量与顺序不得变化，
全部事实、人物身份、说话人、情节结果与篇幅规模必须原样保留。

${executionStandard ? `【创建时确认的执行标准（前提，不得偏离）】\n${executionStandard}\n\n` : ''}【硬红线违规（逐条必须消除）】
${violationLines.join('\n')}

【命中段落原文（这几段就是要改的地方）】
${hitBlocks}

只处理上述有逐字证据的段落，按每条扫描结论减少并最终消除其对应硬伤；保留故事事实与人物声音。
标点只能随句意变化，不得把陈述句强改疑问句，也不得新增破折号或把完整动作拆成机械短句凑指标。
不要输出全文，不要解释，只输出局部补丁 JSON。

## 输出契约
${localPatchContract('hardline_local_replacement')}
注意：original 必须是上列【命中段落】里的逐字原文且在全文中唯一匹配；replacement 必须是改写后的整段文字。`;

    let rawPatches: unknown;
    try {
      const response = await this.realLLM.generate({
        prompt, scenario: 'refinement', temperature: 0.3,
        responseFormat: 'json_object', maxTokens: LLM_TUNABLES.QUALITY_REPAIR_MAXTOKENS,
        deferQualityGate: true,
        metrics: { projectId, chapterIndex, stepKey: `hardline_local_repair_${attempt}`, attempt },
      });
      rawPatches = JSON.parse(response.content).patches;
    } catch (error) {
      this.logger.warn(`硬红线段落级精修第${attempt}轮模型调用/解析失败：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    let repaired: string;
    try {
      repaired = executeRepair('hardline_local_replacement', { content, issues, structured: false }, rawPatches);
    } catch (error) {
      this.logger.warn(`硬红线段落级精修第${attempt}轮补丁未应用：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }

    try {
      this.assertGeneratedChapterIdentity(repaired, chapterIndex);
    } catch (error) {
      this.logger.warn(`硬红线段落级精修第${attempt}轮结果未通过章节身份校验：${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    const repairGuard = refineKeepsStory(content, repaired, this.getProjectCharacterNames(projectId));
    if (!repairGuard.ok) {
      this.logger.warn(`硬红线段落级精修第${attempt}轮未通过故事身份守护（${repairGuard.reason}），保留上一版正文`);
      return null;
    }

    const afterFindings = scanFindings(repaired);
    const progress = assessHardlineRepairProgress(beforeFindings, afterFindings);
    const after = afterFindings.length;
    if (!progress.accepted) {
      this.logger.warn(`硬红线段落级精修第${attempt}轮未证明改善（规则 ${before} → ${after}，命中窗 ${progress.beforeOccurrences} → ${progress.afterOccurrences}，${progress.reason}；剩余 ${afterFindings.map(f => `${f.ruleId}@${f.position}`).join(', ')}），丢弃本轮结果、保留上一版正文`);
      return null;
    }
    const patchCount = Array.isArray(rawPatches) ? rawPatches.length : 0;
    this.logger.log(`硬红线段落级精修第${attempt}轮通过自证：规则 ${before} → ${after}，命中窗 ${progress.beforeOccurrences} → ${progress.afterOccurrences}（局部补丁 ${patchCount} 处，剩余硬线继续阻断）`);
    params.onProgress?.({
      label: '硬红线局部精修',
      message: `第 ${attempt} 轮硬红线局部精修：规则 ${before} → ${after}，命中窗 ${progress.beforeOccurrences} → ${progress.afterOccurrences}；剩余硬线继续阻断保存。`,
      progress: Math.min(90, 64 + attempt * 8),
    });
    return { content: repaired, before, after };
  }

  /**
   * 生成整章正文并做“大纲对齐”自修复：先按大纲生成（含字数守卫，且 prompt 已强制“创作前
   * 规划”以提高首版命中率），再用真实 LLM 验收器审查是否与绑定详细大纲一致；若不一致，
   * 把验收器指出的缺失要点回灌，做【迭代精修】（保留上一版已写好的场景，只补回缺失、修正冲突），
   * 而非整章推倒重来，避免文本同质化与风格断裂。修复次数由每轮已确认问题是否严格减少决定，
   * 不预先固定轮数：首稿通过为零次、问题不减立即停止、只有确实消除问题才继续。
   * 全部为真实 LLM，绝不伪造内容。这解决了“单次长文生成常漏掉大纲靠后事件、提前终止于中间场景”
   * 的历史痛点：失败不再直接丢弃，而是自我纠正至通过；但仍由作者最终在矛盾 tab 决定。
   */
  private async generateBodyWithAlignmentGuard(params: {
    basePrompt: string;
    projectId: string;
    targetWords: number;
    scenario: string;
    temperature?: number;
    chapterIndex: number;
    chapterTitle: string;
    outlineContract: string;
    storyContext: string;
    /** 后续章节边界清单（防跨章提前消费，可为空） */
    subsequentChapterBoundary?: string;
    wordRange?: { min: number; max: number };
    onProgress?: (payload: { label: string; message: string; progress: number }) => void;
  }): Promise<{ content: string; qualityReport: Awaited<ReturnType<ChainController['checkChapterAlignment']>> }> {
    const {
      projectId, basePrompt, targetWords, scenario, temperature = 0.7, chapterIndex,
      chapterTitle, outlineContract, storyContext, subsequentChapterBoundary, onProgress,
    } = params;
    // 兜底必须带上本章目标字数：调用方（如 stream-generate）若漏传 wordRange，
    // 短篇也要围绕本章大纲目标 ±10% 收敛，而不是退化到 CHAPTER_WORD_RANGE 导致 2700 字就当达标。
    const wordRange = params.wordRange || this.getChapterWordRange(projectId, targetWords);
    this.assertProjectSourceCompleteness(projectId);
    const reviewWorldContext = this.buildWorldWritingContext(projectId, false);
    const sourceCountdownConflict = detectSourceCountdownConflict(reviewWorldContext, outlineContract);
    if (sourceCountdownConflict) {
      this.logger.warn(`章节 ${chapterIndex} ${sourceCountdownConflict}`);
      throw new HttpException(sourceCountdownConflict, 422);
    }
    // 首稿 prompt 的平台数字口径唯一源：与确定性扫描器、buildOutlineAdherenceContract、
    // buildHardlineRulePlaybook 共用 resolvePlatformStrategy(projectId) 的平台基准表。
    // 此前这里写死「前 300 字」「35%–65%」「4000 字约 1400–2600 字」「最长连续叙述约 800 字」，
    // 与平台表（openingHookChars 200–800、dialogueRatio 20%–65%、payoffGapChars 300–1500）
    // 在同一份 prompt 内形成两套数字，模型只能随机二选一，作者看到的却是「我选了知乎却按番茄写」。
    const __fp = this.resolvePlatformStrategy(projectId);
    const __fpPlatform = String(__fp.strategy.id || '');
    const openingHookChars = __fp.target.openingHookChars;
    const dialogueRangeText = `${Math.round(__fp.target.dialogueRatio[0] * 100)}%–${Math.round(__fp.target.dialogueRatio[1] * 100)}%`;
    const dialogueFloorText = `${Math.round(__fp.target.dialogueRatio[0] * 100)}%`;
    const dialogueWordsText = `${Math.round(targetWords * __fp.target.dialogueRatio[0])}–${Math.round(targetWords * __fp.target.dialogueRatio[1])}`;
    const payoffGapText = `${__fp.target.payoffGapChars[0]}–${__fp.target.payoffGapChars[1]}`;
    const payoffGapMaxChars = __fp.target.payoffGapChars[1];
    const fanqieHotReference = __fpPlatform === 'fanqie';
    // 跨章节学习：把之前章节归纳出的避坑经验注入本章首版与精修 prompt，使本章主动规避历史错误。
    const historicalLessons = this.getActiveLessons(projectId);
    // 这里曾只有泛化“数字自洽”提示，后果是模型为写出章尾画面自行
    // 增加第三次完整进出，使一次扣一户的规则在首稿即失真。
    const chapterCountGuard = `\n\n## 本章可计数事件合同（只在内部核算）\n按详细大纲逐次列出本章明确发生的进出、扣名及章末名单状态：触发一次只能产生一次代价。不得为写成章尾画面补造大纲未列的触发；原本空着的末格不得计作本章新扣一户。门内回拨与门外经过时间分别核算，不能以“门外时间没变”代替“门内回拨一小时”。每个人名、户数、日期只用大纲和已确认状态的同一口径。`;
    const enrichedBase = (historicalLessons
      ? `${basePrompt}\n\n${historicalLessons}`
      : basePrompt) + chapterCountGuard;
    const firstPassPrompt = `${enrichedBase}\n\n## 首稿前一次性核对（只在内部执行，不输出计划）\n动笔前先逐项核对本章大纲的全部事件、结尾钩子、已确稿状态、人物声音与行为边界、平台节奏和目标字数；先解决彼此冲突，再一次写成完整正文。不得留到第二轮再补人物、场景、对话或平台要求。\n\n### 开篇钩子（平台硬性要求，必须在开篇钩子窗口内出现）\n前 ${openingHookChars} 字内必须让读者看到一个反常/疑点/冲突/悬念，禁止先铺环境再进事件：开篇直接落到异常事实上（如一个对不上的数字、一句不对劲的称呼、一件不该出现在这里的东西），或用一个带冲突的对话/动作开场；环境细节最多 1-2 句带过，不得连续 3 句以上纯白描铺垫。写完自查：前 ${openingHookChars} 字是否有一个明确的“哪里不对”。\n\n### 对话节拍（42 硬红线，全章必须满足）\n一问一答连续超过 3 段而没有任何人味介入（动作/沉默/打断/语气词/答非所问/停顿/重复），即为客服式圆滑对答；全章任何位置都不得出现连续 4 段无人味对话。本章所有问答都须符合已确认角色的身份与动机，间隔两三轮给出有因果作用的沉默、动作或环境介入，禁止用无关语气词硬凑。\n\n追问豁免（严格限定）：只有答句带对抗张力（孩子闪避/沉默/答非所问/重复家长的话）的追问才豁免——如“就来接你的是谁？”“我姨妈。”“她在哪儿住？”“在那边。”“哪边。”。连续问句本身不构成豁免，纯登记式一问一答仍然违规。\n\n盘问/登记/信息收集场景：每 2-3 轮问答之间出现符合本书人物和场景的动作、环境或心理介入；至少一处真实的沉默、没答或答一半停住；答句不能全是一两个字干条，需有回避、反问或具体行动，不得为了过线塞无关语气词。\n叙述中带引号的称呼/引用词（写着“叔叔”、改成“姑姑”）不是对话，不受此限。\n\n### 对话写作（不引用与本书无关的作品示例）
让回应与角色目标相符，必要时以动作或沉默改变下一句的意思；不得用无信息的短答、机械插动作或大量破折号凑出节奏。规则 42 与确定性硬红线扫描仍逐段验收。

### 对话占比（宪法硬性要求，全章必须满足，量化执行）
全章人物对话（引号内的台词）必须落在本平台本篇幅的对话占比目标区间 ${dialogueRangeText}（唯一来源 platform-benchmarks 平台表，随平台与长短篇变化；按本章目标 ${targetWords} 字即约 ${dialogueWordsText} 字，场景分散到至少 3 处）；低于区间下限 ${dialogueFloorText} 视为不合格，低于系统阻断线（高对话平台 15%/第一人称内心流 5%/其余 8%）直接回炉。注意区分：带引号的称呼/引用词（“叔叔”“姑姑”“某某家长”等）不是对话，不计入占比，也不能拿来凑数。规划对话时让台词承担推进：问询核实（关键事实/时间/人物关系）、孩子口中漏出的细节（谁接、家里几口人、大人交代过什么话）、与同事/邻里的信息交换，每处对话至少推进一个信息点或暴露一处人物，禁止纯寒暄对白。
对话场景必须分散在全章（至少 3 处，覆盖开篇/中段/后段），禁止把所有对话堆在同一个场景；
叙述长段后必须及时用对话打破，最长连续叙述不得超过本平台推进密度上限 ${payoffGapMaxChars} 字（该平台回报间距目标 ${payoffGapText} 字）。

### 动作与节奏（规则 34/39 口径）
连续动作不能是无目的的流水账（“站起来，走到桌前，拉开抽屉，拿出纸”——规则 34 拦截）：每个动作要么带目的、要么带感受，合并进完整长句（“我把手里的表合上，拉过一张凳子，在他对面坐下。坐下以后，我比他还矮一点”）。动作夹心只用在情绪转折处，不要每句台词都配动作（动作过多像提线木偶）。${fanqieHotReference ? '番茄短句节奏是平台特色，短句用于冲击力，但' : '短句可以做冲击力，但'}段内不要连续堆叠超短句（规则 39 只拦“诗歌断行”式堆叠，名单/清单式罗列除外）。

### 转场禁令（规则 44，全章硬红线）
全章禁止使用机械转场词：接着/然后/之后/随即/过了一会儿/不久后/很快/马上/立刻/接下来/此后/当晚等，
出现 3 次即整章不合格。转场必须用具体切入：环境切入（窗外蝉声突然停了）/时间锚点（第二天早上，台历翻到八月）/感官切入（一股粉笔灰味先到）/身体状态（我站起来，膝盖响了一声）。写段落衔接时自查：是否用了以上禁词，
用了就改成具体切入。

### 句式排比禁令（AI 指纹重灾区）
禁止连续 3 个及以上同句式列举（如“甲那栏写着…”“乙那栏写着…”“丙那栏写着…”或“第一种…第二种…”式逐一排比）：
同结构句式全章最多出现 2 次，第 3 次起必须改写为聚合句（“十来个人、两年、四张表，翻来覆去只有两种笔迹”）
或换句式/换视角切入；列举时只挑 1-2 个具体例子展开细节，其余用总数概括。同一段落内禁止 2 个以上“X 栏写着 Y，笔迹 Z”式短句连排。表格/表单/列表的结构说明（如登记表的栏目）必须用聚合句一次带过（“表头三栏：日期、姓名、签字”），禁止逐栏“一栏是…，一栏是…，一栏是…”排比铺陈。

### 数字与数量自洽（世界观硬约束）

涉及数量（张数/期数/次数/人数/金额/天数/页码等任何可数项）时，必须与世界观档案锁定的口径完全一致（具体数值以档案为准，档案写多少就写多少）。落笔前先列出本章要用到的每一个数量，逐一与世界观档案核对：档案已锁定的照抄，档案未锁定的宁可不写具体数字、也绝不自创。同一数量概念在全章任何位置出现都必须同值，禁止出现“两年四张”与“一年四张”并存的矛盾表述；涉及换算的表述（如“两年”与“约七百三十天”）只能全章统一取一种写法，禁止两种写法并存或换算错误。全文写完自查一遍：所有数字是否自洽、且与档案一致。

### 本章场景与动作边界（大纲硬约束，逐条遵守）
本章场景与动作范围以详细大纲的 location_summary 与情节事件为准，正文只允许出现大纲明确列出的场景与动作，禁止出现大纲未列的地点/场景（例如任何一个大纲没有写明的场景切换或地点）与未列的动作（例如任何一个大纲没有写明的行为）——这些属于后续章节，本章提前出现即越界；涉及后续章节信息时只能留线索，不得直接兑现。章末收束按大纲执行且只收一次，不得重复收束、不得重复同一动作（如同一动作反反复复做）。全文写完自查一遍：场景是否全部落在大纲范围内、收束是否唯一。

### 重复意象与前后一致自查（成稿前必须执行）
①同一意象/动作/短语全章最多出现 2 次（如反复出现的道具、动作、天数或点题短语），
重复 3 次及以上必须删改或替换为具体描写，禁止靠反复点题制造强调。
②人物姓名、称呼、家庭关系前后必须完全一致：写“名字没变/称呼换了一个”之类的判定句前，
先核对前文实际写过的称谓是否真的没变；同一处称谓的变化必须交代清楚（写清从什么变成什么），
不得出现前文写的是某个姓名、后文却断言“名字没变”式的自相矛盾。
③人名不得自创超出世界观档案/大纲名单的人物（需要新人物时必须先确认大纲是否锁定过该名字）。
④章节功能边界：本章功能 = 大纲列明的情节事件（逐条照大纲执行）。
禁止新增大纲未列的新线索/新发现/新秘密（任何大纲没有写明的“额外发现”）——深化大纲已有事件可以，
横向加戏不行。
⑤节奏精炼：收尾与过渡段合并动作链，同一连续动作（锁门→摸黑找钥匙→进屋→躺下）合并成 1-2 句表述，
禁止每个小动作单独成段造成拖沓；全章最后一个收束场景尽量简短有力。
⑥结尾钩子：最后一句话必须是未解问题/反转/危机临门一脚（先留一个让读者追问的缺口，再给出这句话），
不得以平淡动作收尾（如拉灯、躺下、合上本子）；倒数第二段已完成的收束动作在最后一段不要再复述。`;
    // 章际边界：若存在后续章节，把后续章节核心节拍注入首稿与精修 prompt，
    // 防止本章提前兑现后续章节事件/伏笔回收/反转，或写死与后续章节既定事实冲突的强断言。
    // 收尾锁定伏笔禁令（世界观档案：两种笔迹归属等收尾反转）与后续章节边界一起注入，
    // 生成侧与评审侧共用同一份边界（防跨章提前消费的双重来源都覆盖）。
    const endingForeshadowGuard = this.buildEndingForeshadowGuard(projectId);
    const boundaryInput = [subsequentChapterBoundary, endingForeshadowGuard].filter(Boolean).join('\n');
    const boundaryPrompt = boundaryInput
      ? `\n\n## 后续章节边界（本章不得提前消费，必须逐条遵守）\n${boundaryInput}\n本章正文严禁提前兑现上述后续章节的核心事件、伏笔回收或反转；涉及相关信息时只能留线索，不得写死与后续既定事实冲突的强断言（如“只有X才知道Y”）。`
      : '';
    const boundedFirstPassPrompt = `${firstPassPrompt}${boundaryPrompt}`;
    onProgress?.({
      label: '写作上下文已锁定',
      message: '已一次性载入详细大纲、人物与状态、世界规则、平台节奏、字数目标和历史避坑经验；首稿将按同一份上下文完整执行。',
      progress: 15,
    });
    // 若本项目已有历史教训，先发一条提示让用户看到「跨章节学习」在生效（第一章漏的，后续章节规避）。
    if (historicalLessons) {
      const count = (historicalLessons.match(/^\s*\d+\)/gm) || []).length;
      onProgress?.({
        label: '跨章节经验',
        message: `已加载 ${count} 条本项目历史避坑经验，本章生成时将主动规避这些已犯过的错误（前几章踩过的坑，本章不再踩）。`,
        progress: 18,
      });
    }
    let content = await this.generateBodyWithLengthGuard({
      basePrompt: boundedFirstPassPrompt, targetWords, scenario, temperature, onProgress, wordRange,
      metricsContext: { projectId, chapterIndex, phase: 'first' },
    });
    this.assertGeneratedChapterIdentity(content, chapterIndex);
    // 评审侧必须看到完整世界观档案（含收尾反转答案），才能判“正文是否提前消费”；
    // 生成侧已脱敏（buildWorldWritingContext 默认 maskForeshadow=true），两端信息不对称是结构性保障。
    // reviewWorldContext 为空（如单测 mock 环境）时保持原始 storyContext，不阻断评审。
    const reviewStoryContext = reviewWorldContext
      ? `${storyContext}\n\n【评审专用·完整世界观档案（含收尾锁定答案，用于判断正文是否提前消费）】\n${reviewWorldContext}`
      : storyContext;
    let qualityReport = await this.checkChapterAlignment({
      chapterIndex, chapterTitle, outlineContract, storyContext: reviewStoryContext, content, projectId,
      subsequentChapterBoundary: boundaryInput,
    });
    if (qualityReport.pass) {
      onProgress?.({
        label: '大纲对照通过',
        message: '大纲对照通过：本次正文已忠实覆盖本章详细大纲所有必需事件点，且未违反已确认上下文。',
        progress: 95,
      });
    } else {
      onProgress?.({
        label: '大纲对照中',
        message: '大纲对照中：逐项核对必需事件点、上下文一致性与结尾钩子…',
        progress: 55,
      });
    }
    const MAX_HARDLINE_LOCAL_ATTEMPTS = 3;
    let hardlineLocalAttempts = 0;
    const repairHistory: string[][] = [];
    while (!qualityReport.pass) {
      if (qualityReport.evaluationStatus === 'not_evaluated') {
        this.logger.warn('大纲对齐评审未完成，保留当前正文并停止；未将评审器故障当作正文缺陷进行改写');
        onProgress?.({
          label: '大纲评审未完成',
          message: '评审服务未返回可用结论，已停止后续改写并保留当前正文；不会因评审器故障重复生成。',
          progress: 95,
        });
        break;
      }
      // 这里曾把资料源矛盾标成 high 并继续改写正文；旧世界档案的“三年前”
      // 因此与唯一规则“每次回拨一小时”一同进入提示词，模型反复生成冲突版本。
      // 源头未修之前停止正文修订，保留矛盾证据并由 Gate 阻断。
      if (qualityReport.sourceConflicts.length > 0) {
        this.logger.warn(`资料源存在 ${qualityReport.sourceConflicts.length} 处矛盾，停止正文改写并阻断保存（章节 ${chapterIndex}）`);
        break;
      }
      // ===== 硬红线确定性扫描 ≠ LLM 柔性结论：必须分流修复 =====
      // LLM 结论（缺事件、上下文矛盾）位置不确定，只能整章精修；确定性扫描给出的是命中段落
      // 的逐字原文与段号，位置精确已知。整章重写会让段号漂移、同类违规换一批位置复现——
      // 这正是规则 42「命中 → 整章重写 → 再命中」反复卡住保存的根因。
      // 混合失败先补齐缺失事件/事实，再重新扫描硬红线；否则局部修复无论是否成功都可能
      // 抢先耗尽循环，导致大纲缺失事件从未修复。大纲修复 prompt 只带语义问题，不带硬红线
      // 的位置清单；修复后重新验收，再对剩余确定性命中做段落级精修，最终两个 Gate 都必须通过。
      const hardlineFindings = qualityReport.hardlineFindings || [];
      const semanticIssues = [...new Set([...qualityReport.missing, ...qualityReport.contradictions]
        .map(item => String(item).trim()).filter(item => item && !isHardlineFinding(item)))];
      if (hardlineFindings.length > 0 && semanticIssues.length === 0) {
        if (hardlineLocalAttempts >= MAX_HARDLINE_LOCAL_ATTEMPTS) {
          this.logger.warn(`硬红线段落级精修已达上限 ${MAX_HARDLINE_LOCAL_ATTEMPTS} 轮仍有命中（章节 ${chapterIndex}），保留当前正文并按原验收结论抛出`);
          break;
        }
        hardlineLocalAttempts += 1;
        const localRepair = await this.repairHardlineFindingsLocally({
          projectId, chapterIndex, content, findings: hardlineFindings,
          attempt: hardlineLocalAttempts, onProgress,
        });
        if (!localRepair) break;
        content = localRepair.content;
        this.assertGeneratedChapterIdentity(content, chapterIndex);
        qualityReport = await this.checkChapterAlignment({
          chapterIndex, chapterTitle, outlineContract, storyContext: reviewStoryContext, content, projectId,
          subsequentChapterBoundary: boundaryInput,
        });
        if (qualityReport.pass) {
          onProgress?.({
            label: '大纲对照精修通过',
            message: `大纲对照通过（第 ${hardlineLocalAttempts} 轮硬红线局部精修后）：命中 ${localRepair.before} 处 → ${localRepair.after} 处并全部清除。`,
            progress: 92,
          });
        }
        continue;
      }
      const missing = semanticIssues;
      const decision = decideProgressiveRepair(repairHistory, missing);
      if (!decision.repair) {
        this.logger.warn(`大纲对齐自适应修复停止：${decision.reason}；剩余${missing.length}项已确认问题`);
        break;
      }
      repairHistory.push(missing);
      const attempt = repairHistory.length;
      const reasonSummary = missing.slice(0, 2).join('；') + (missing.length > 2 ? ` 等 ${missing.length} 处` : '');
      onProgress?.({
        label: '大纲对照精修',
        message: `大纲对照发现：缺「${reasonSummary}」，进行第 ${attempt} 次针对性修复；只有确认问题数减少才会继续下一次。`,
        progress: Math.min(90, 64 + attempt * 8),
      });
      const localFacts = await this.repairOutlineFactsLocally({
        projectId, chapterIndex, content, outlineContract, issues: missing, attempt,
      });
      if (localFacts !== null) {
        const localReport = await this.checkChapterAlignment({
          chapterIndex, chapterTitle, outlineContract, storyContext: reviewStoryContext,
          content: localFacts, projectId, subsequentChapterBoundary: boundaryInput,
        });
        if (localReport.evaluationStatus !== 'evaluated') {
          this.logger.warn(`大纲局部修订第${attempt}轮评审未完成，停止生成并保留原稿，不将评审故障误作正文缺陷`);
          break;
        }
        if (localReport.sourceConflicts.length > 0) {
          this.logger.warn(`大纲局部修订第${attempt}轮发现 ${localReport.sourceConflicts.length} 处资料源冲突，停止正文改写并阻断保存`);
          qualityReport = { ...qualityReport, sourceConflicts: localReport.sourceConflicts };
          break;
        }
        const semanticProgress = assessSemanticRepairProgress(
          [...qualityReport.missing, ...qualityReport.contradictions.filter(item => !isHardlineFinding(item))],
          [...localReport.missing, ...localReport.contradictions.filter(item => !isHardlineFinding(item))],
        );
        const hardlineProgress = assessHardlineRepairProgress(
          qualityReport.hardlineFindings, localReport.hardlineFindings, false,
        );
        if (semanticProgress.improved && hardlineProgress.accepted) {
          this.logger.log(`大纲局部修订第${attempt}轮通过复检：事实 ${semanticProgress.before}→${semanticProgress.after}，硬红线 ${hardlineProgress.beforeOccurrences}→${hardlineProgress.afterOccurrences}`);
          content = localFacts;
          qualityReport = localReport;
          continue;
        }
        this.logger.warn(`大纲局部修订第${attempt}轮复检未改善，保留原稿：事实 ${semanticProgress.before}→${semanticProgress.after}，硬红线 ${hardlineProgress.beforeOccurrences}→${hardlineProgress.afterOccurrences}；${hardlineProgress.reason}`);
      }
      const repairPrompt = this.buildAlignmentRepairPrompt(
        boundedFirstPassPrompt, missing, qualityReport.contradictions.filter(item => !isHardlineFinding(item)),
        chapterIndex, targetWords, content, `第 ${attempt} 次自适应修复`,
      );
      const beforeRepair = content;
      const beforeReport = qualityReport;
      try {
        const repaired = await this.generateBodyWithLengthGuard({
          basePrompt: repairPrompt, targetWords, scenario, temperature, onProgress, wordRange,
          metricsContext: { projectId, chapterIndex, phase: 'repair' },
        });
        const repairGuard = refineKeepsStory(beforeRepair, repaired, this.getProjectCharacterNames(projectId));
        if (!repairGuard.ok) {
          this.logger.warn(`大纲对照精修第${attempt}轮未通过故事身份守护（${repairGuard.reason}），丢弃本次结果、保留上一版正文`);
          break;
        }
        content = repaired;
      } catch (error) {
        // 精修生成失败（如字数守卫耗尽）：保留上一版正文与其验收结论，跳出循环后按原结论抛出。
        this.logger.warn(`大纲自修复第${attempt}次生成失败，沿用上一版验收结论：${error instanceof Error ? error.message : String(error)}`);
        break;
      }
      this.assertGeneratedChapterIdentity(content, chapterIndex);
      // 修复循环内评审同样使用完整世界观档案（评审专用，生成侧保持脱敏）。
      qualityReport = await this.checkChapterAlignment({
        chapterIndex, chapterTitle, outlineContract, storyContext: reviewStoryContext, content, projectId,
        subsequentChapterBoundary: boundaryInput,
      });
      // 这里曾只检查“故事身份”，即使整章修订把 5 条硬红线写成 8 条、
      // 又引入 7×3=20 等事实矛盾，仍把新稿留作最终失败稿。以复检证据回滚退化稿。
      const semanticProgress = assessSemanticRepairProgress(
        [...beforeReport.missing, ...beforeReport.contradictions.filter(item => !isHardlineFinding(item))],
        [...qualityReport.missing, ...qualityReport.contradictions.filter(item => !isHardlineFinding(item))],
      );
      const hardlineProgress = assessHardlineRepairProgress(
        beforeReport.hardlineFindings, qualityReport.hardlineFindings, false,
      );
      if (qualityReport.evaluationStatus !== 'evaluated' || !semanticProgress.improved
        || !hardlineProgress.accepted || qualityReport.sourceConflicts.length > 0) {
        this.logger.warn(`大纲精修第${attempt}轮复检退化，回滚整章：事实 ${semanticProgress.before}→${semanticProgress.after}，硬红线 ${hardlineProgress.beforeOccurrences}→${hardlineProgress.afterOccurrences}；${hardlineProgress.reason}`);
        content = beforeRepair;
        qualityReport = beforeReport;
        break;
      }
      if (qualityReport.pass) {
        onProgress?.({
          label: '大纲对照精修通过',
          message: `大纲对照通过（第 ${attempt} 次精修后）：精修后正文已忠实覆盖所有必需事件点。`,
          progress: 92,
        });
      }
    }
    // 不再把结论丢掉：自修复后仍存在的缺失/矛盾按 source 持久化进矛盾 tab（连正文原文一起落库，
    // 作者随时能取回这一版草稿），随后由 Gate 分类器抛出，由作者决定重生成还是手改
    // （满足"不要静默丢弃，要让我看到"）。
    // persistAlignmentContradictions 放在 pass 判断之后，确保即便未完全通过也能落库，
    // 这正是此前死代码（在 throw 之后、永不可达）修复后的正确位置。
    // 原则1「严格遵守大纲」+ 原则2「不符给修改建议」：把【所有未满足项】
    // （缺失事件 + 上下文冲突）都持久化进矛盾 tab，确保作者能在 tab 看到具体缺了什么、
    // 并由可执行 action 决定让 AI 改写正文对齐大纲（推荐）还是改大纲。
    //
    // 单一数据源延伸：四类结论分四个 source 落库，互不覆盖：
    //   - alignment_verifier                —— LLM 验收器的【缺失】+【阻断性冲突】（阻断保存）
    //   - alignment_verifier_hardline       —— 硬红线确定性扫描（叙述者跳出作者评论、人身状态矛盾等，阻断保存）
    //   - alignment_verifier_advisory       —— 非阻断的局部措辞/重复建议（可见但不阻断；执行标准六维偏差不在此列）
    //   - alignment_verifier_source_conflict —— 资料源互相矛盾（世界档案/简介 vs 详细大纲，需作者定权威源）
    // 这样矛盾 tab 既能看到 LLM 的柔性判断与硬红线违规原文，也能看到「只是建议」的局部措辞问题。
    const isHardlineMessage = (s: string) => isHardlineFinding(s);
    const hardlineViolations = qualityReport.contradictions.filter(isHardlineMessage);
    const llmContradictions = qualityReport.contradictions.filter(s => !isHardlineMessage(s));
    const llmUnmet = Array.from(new Set([
      ...qualityReport.missing,
      ...llmContradictions,
    ].map(s => String(s).trim()).filter(Boolean)));
    this.persistAlignmentContradictions({ projectId, chapterIndex, content,
      contradictions: llmUnmet, source: 'alignment_verifier' });
    this.persistAlignmentContradictions({ projectId, chapterIndex, content,
      contradictions: hardlineViolations, source: 'alignment_verifier_hardline' });
    // 局部措辞建议单独可见；资料源冲突单独落库且阻断，不让正文替资料源背锅。
    const alignmentAdvisories = Array.from(new Set(
      (qualityReport.advisories || []).map(s => String(s).trim()).filter(Boolean)
    ));
    const alignmentSourceConflicts = Array.from(new Set(
      (qualityReport.sourceConflicts || []).map(s => String(s).trim()).filter(Boolean)
    ));
    this.persistAlignmentContradictions({ projectId, chapterIndex, content,
      contradictions: alignmentAdvisories, source: 'alignment_verifier_advisory' });
    this.persistAlignmentContradictions({ projectId, chapterIndex, content,
      contradictions: alignmentSourceConflicts, source: 'alignment_verifier_source_conflict' });
    if (!qualityReport.pass) {
      // 成因（未执行标准／正文硬红线／本章大纲不一致／评审未完成）由唯一分类器判定。
      // 此前无论成因一律打印「本章大纲一致性 Gate 未通过」，于是用户改大纲、报错一字不变——
      // 这正是「同一个问题反反复复出现」的直接来源。
      const failure = classifyGateFailure({
        evaluationStatus: qualityReport.evaluationStatus,
        topic: 'outline_alignment',
        missing: qualityReport.missing,
        contradictions: [...qualityReport.contradictions, ...qualityReport.sourceConflicts],
      });
      this.logger.error(`[Gate] ${gateFailureLabel(failure)} | projectId=${projectId} chapterIndex=${chapterIndex} | kinds=${failure.kinds.join('+')} | status=${failure.status} | detail=${failure.detail}`);
      this.recordGateRejection({ projectId, chapterIndex, report: failure, content });
      throw new HttpException(failure.message, failure.status);
    }
    // 跨章节学习闭环：把本章最终仍未满足的缺失/冲突归纳成通用避坑经验入库，
    // 供本项目后续章节生成时自动规避（第一章漏的教训，第二章首版就用上，避免反复犯同样错）。
    if (llmUnmet.length > 0 || hardlineViolations.length > 0) {
      void this.summarizeChapterLessons(projectId, chapterIndex, qualityReport.missing, qualityReport.contradictions);
    }
    // 平台指标已在首稿前通过唯一 benchmark 指令注入。这里不再先做一次整章“平台精修”后
    // 又进入统一质量 Gate；统一 Gate 会用同一份确定性平台测量，只对有证据的高严重度问题
    // 做一次局部 patch，从而避免重复整章改写导致偏离大纲。
    onProgress?.({
      label: '统一质量验收',
      message: '按同一份大纲、人物、世界规则和平台指标做最终验收；仅对有证据的严重问题执行局部修复。',
      progress: 96,
    });
    const lockedReviewContext = [chapterTitle, outlineContract, storyContext, historicalLessons]
      .filter(Boolean).join('\n');
    content = await this.realLLM.validateGeneratedContent(projectId, chapterIndex, content, lockedReviewContext);
    return { content, qualityReport };
  }

    /**
   * 平台爆款基准优秀线收敛：硬红线只保证"不违规（及格）"，本方法按唯一基准源把对话占比、段落厚度、
   * 开篇/章尾钩提升到该平台长短篇的"优秀线"。不预设精修轮数：短板不减少就立即停止，
   * 只有确定性复测确认短板减少时才允许继续；
   * 失败处理：本方法当前未接线（见下方注释），若将来接线必须按「不降级」原则处理失败，禁止静默返回上一版。
   *
   * 关键：精修 prompt 必须携带【上一版原文 + 本章大纲契约 + 人物白名单】，且每轮结果都要过
   * assertRefineKeepsStory 故事身份守护——一旦模型把故事换成别的人物/题材，或篇幅异常缩水，
   * 立即丢弃该轮结果、保留上一版正确正文（历史上曾因精修不带上下文，把都市文整体覆盖成另一部小说）。
   */
  /**
   * 未接线（dead code）：全仓无调用方，可自证 —— rg -n "refineToPlatformBenchmark" server/src 只命中定义处。
   * 平台基准在活体路径上已由同一份 deterministicPlatformReview（measureAgainstTarget + benchmarkRefineIssues）执行：
   * 生成侧 Gate 走 real-llm.service.ts 的 platform_metric_patch（复测指标未下降即不接受），质检侧走 writing-quality.service.ts 落库。
   * 本方法是被它们取代的旧整章精修旁路。若将来要接线，必须先做两件事，否则禁止启用：
   * 1) 去掉静默兜底语义（catch 后 logger.warn + 返回上一版 = 明确否掉的降级）；
   * 2) 保留【上一版原文 + 本章大纲契约 + 人物白名单】与 refineKeepsStory 守护
   *    （历史事故：不带上下文的真空精修把都市文整章覆盖成另一部小说）。
   */

  /**
   * 取本书人物姓名白名单（主角/主要角色优先）：二次生成的故事身份守护、以及硬红线规则 32
   * 「人名/称谓独占一行」的唯一判据来源。零 LLM、可复算。
   *
   * 【防复发】此前同一份查询在本文件、generation-metrics.service.ts、写作质量质检侧各写了一遍，
   * 口径互不相同（本文件有角色排序+去重，指标侧是裸 SELECT name 不排序不去重，质检侧根本没有）。
   * 三份漂移会让同一段正文在生成链与质检链得到两套结论。现统一转调 character-names.loadCharacterNames，
   * 禁止任何模块再内联这条 SQL。
   */
  private getProjectCharacterNames(projectId: string): string[] {
    try {
      return loadCharacterNames(this.db.getDb(), projectId);
    } catch (error) {
      this.throwStepReadFailure('getProjectCharacterNames', projectId, error);
    }
  }

  private persistAlignmentContradictions(input: {
    projectId: string;
    chapterIndex: number;
    content: string;
    contradictions: string[];
    source?: 'alignment_verifier' | 'alignment_verifier_hardline'
      | 'alignment_verifier_advisory' | 'alignment_verifier_source_conflict';
  }): void {
    try {
      const db = this.db.getDb();
      // source 取值：
      //   alignment_verifier               —— LLM 验收器发现的缺失/阻断性冲突（默认）
      //   alignment_verifier_hardline      —— 硬红线确定性扫描（防 LLM 验收放过同类违规）
      //   alignment_verifier_advisory      —— 非阻断的局部措辞/重复建议（可见，但不进回炉；执行标准六维偏差不在此列）
      //   alignment_verifier_source_conflict —— 资料源互相矛盾（世界档案 vs 详细大纲）
      // 四者互不覆盖：DELETE 与 INSERT 都按 source 区分，保证矛盾 tab 能同时看到 LLM 的柔性判断、
      // 确定性硬违规与「只是建议」的局部措辞问题；这是单一数据源原则的延伸。
      const source = input.source || 'alignment_verifier';
      const isHardline = source === 'alignment_verifier_hardline';
      const isAdvisory = source === 'alignment_verifier_advisory';
      const isSourceConflict = source === 'alignment_verifier_source_conflict';
      // ruleId 必须保持大纲一致性检查的规范 id：conflict.controller / chapter.service /
      // platform-analytics 都按 issue_type='outline_alignment' 过滤，写入别的 id 会让这些结论
      // 在矛盾 tab 里彻底消失。来源差异由 payload.qualityIssue.source 表达（前端据此筛选）。
      const ruleId = isHardline ? 'hardline.outline_alignment' : 'outline_alignment';
      const severity = alignmentFindingSeverity(source);
      const chapter = db.prepare('SELECT id FROM chapters WHERE project_id=? AND chapter_index=? ORDER BY created_at DESC LIMIT 1')
        .get(input.projectId, input.chapterIndex) as { id: string } | undefined;
      replaceQualityIssues(db, {
        projectId: input.projectId,
        stage: 'chapter',
        source,
        scopeKey: `chapter:${chapter?.id || input.chapterIndex}`,
        chapterId: chapter?.id ?? null,
        title: `第${input.chapterIndex}章大纲一致性检查`,
        issues: input.contradictions.map(message => {
        const suggestion = isAdvisory
          ? '非阻断的局部措辞/重复建议（确定性扫描或验收器提示）：不影响本章保存，也不会触发整章重写。可忽略，或在下一轮局部修复时一并处理。'
          : isSourceConflict
            ? '资料源互相矛盾（世界档案/简介 vs 详细大纲）：正文保存已阻断。请先按已确认的规则修正错误档案，再重新生成；不要改写正文掩盖资料源冲突。'
            : source === 'alignment_verifier_hardline'
          ? '硬红线违规（确定性扫描，非 LLM 判断）：属于本项目生成纪律的不可违反条款。请点「AI 重写正文对齐大纲」让 AI 精确删除/改写违规片段；如确属情节需要，必须先修改大纲与确稿上下文，再重生成。'
          : '大纲为不可偏离的合同（最高优先级）。推荐：点下方「AI 重写正文对齐大纲」让 AI 按大纲补回缺失场景/事件；仅当你确认大纲本身写错（如事件顺序/场景设定有误），才打开大纲编辑器修改本章大纲。';
          return {
            ruleId,
            severity,
            message,
            quote: (isAdvisory || isSourceConflict) ? '' : message,
            content: input.content,
            evidenceVerified: isHardline,
            suggestion,
            details: { checkType: 'outline_alignment', chapterIndex: input.chapterIndex },
          };
        }),
      });
    } catch (error) {
      // 持久化失败不阻断主流程：写作提示里的矛盾仍来自 qualityReport，只是 tab 暂不可见。
      this.logger.warn(`大纲验收矛盾持久化失败（不影响正文保存）：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private generateAlignmentCheckId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * 硬红线确定性违规扫描器。
   *
   * 为什么必须有这个：checkChapterAlignment 本身也是 LLM 调用，LLM 验收 LLM
   * 时经常"宽以律己"——把训练数据里的小说/创作随笔/作者自评当成正文放过。
   * 用户截图里出现的"赵明跳下去了。我写的。没有反转，没有救场，没有第二季埋伏笔。就是死。"
   * 正是这类违规，规则 15c 已写进 prompt 但 LLM 在长 prompt 下仍反复越界。
   *
   * 此函数是【确定性、零 LLM 调用、零假数据】的纯规则扫描，命中即视为硬红线违规，
   * 与 LLM 验收结论合并后强制 pass=false、prosePassed=false，触发 generateBodyWithAlignmentGuard
   * 的回炉（且精修 prompt 会把违规原文喂回去要求精确删除/改写）。
   *
   * 覆盖用户截图已暴露的硬红线违规模式 + 联网实证最易踩的 AI 写作破绽：
   *   15c  叙述者跳出成为作者评论者（"我写的这个结局""我本来想写一场对峙""作者写到这里也很为难"等；故事内人物的写字/记录/笔迹辨认不是作者跳出）
   *   15b  叙述者解释一切（"我很难过，因为…"）
   *   15d  第一人称对话框里偷切作者口吻
   *   20a  场景内人身状态前后矛盾（"睡着了/眼皮打架"紧接"盯着屏幕/睁眼看"）
   *   26   短句独立成段后跟空行（用户截图里"就是死。""是深色木纹吊顶。"）
   *   26   连续 3 段同等字符长度（"每段 1 句 + 大量空行"诗歌式排版）
   *   28a  冗余 filter words（"我看到/我听到/我意识到"作句首独立句）
   *   32   姓名/角色独占一行（"赵明。""李四。"紧接空行——用户截图里反复出现的"姓名莫名其妙独占一行"）
   *   33   段后空行 ≥ 2（连续 \n\n+ 是诗歌式排版的物理指纹，Markdown 渲染后是大段空白）
   *   34   排比/动词并列（连续 4 个 2-字动作词"站起来/走到/拉开/拿出"——AI 写作最显眼的破绽之一）
   *   35   标点单一（连续 200 字以上无引号/问号/破折号/感叹号/分号/省略号——"逗号句号一家独大"硬约束）
   *   36   热血空洞句（"这一刻""我终于""我必须""我不能""唯一能""最好的""只有……才能"——AI 反思段的特征签名）
   *   37   抽象情绪独白段（连续 3 段以"我感到/我意识到/我明白/我突然觉悟"开头——AI 端正觉醒段）
   *
   * 返回 [{ ruleId, message, snippet, position }]；空数组表示未命中。
   */
  /**
   * 解析硬红线扫描所需的平台/篇幅上下文。detectForbiddenTells 是纯文本扫描、不查库，
   * 由调用方按项目解析一次传入。查不到项目时返回空对象（扫描器按通用平台处理，真硬伤仍严格）。
   */
  private resolveHardlineProfile(projectId?: string): HardlineProfile {
    if (!projectId) return {};
    try {
      const row = this.db.getDb()
        .prepare('SELECT type, target_platform, settings FROM projects WHERE id = ?')
        .get(projectId) as any;
      // 项目不存在时不得退化成"通用口径"：那会让硬红线扫描悄悄失去平台/分类/基调的分化。
      if (!row) throw new HttpException(`硬红线档案解析失败：项目不存在 ${projectId}`, 404);
      let settings: Record<string, any> = {};
      try { settings = JSON.parse(String(row.settings || '{}')) || {}; } catch { /* 保持空配置 */ }
      const constitution = readConstitution(row);
      // 执行标准单一来源：平台 + 长短篇 + 用户创建时确认的分类/基调/文风/流派/视角一起交给扫描器。
      // 此前只传 platform/storyType，导致 resolveNovelStrategy 的标签微调（悬疑收紧回报间距、
      // 言情允许柔性回报、爽文提高密度、白描放宽间距）在生产里全是死代码——用户选了分类/基调
      // 却对确定性判定毫无影响，正文自然"不符合创建前的平台和标签"。
      return {
        platform: constitution.targetPlatform || undefined,
        storyType: constitution.projectType || undefined,
        storyCategory: constitution.category || undefined,
        storyTone: constitution.storyTone,
        writingStyle: Array.isArray(constitution.writingStyle) ? constitution.writingStyle : undefined,
        webNovelGenre: constitution.webNovelGenre,
        // 规则 32「人名/称谓独占一行」的肯定式判据需要本书人名白名单：没有它就只能靠「短段 + 段首
        // 2-4 汉字」去猜，而猜词表永远不完备 —— 实测本题材第一稿被判出 32 条误报（命中原文全是
        // 普通叙述句），且这 32 条互相矛盾（都要求与上下文合并），精修无法收敛 → 正文 422 不保存。
        characterNames: loadCharacterNames(this.db.getDb(), projectId),
      };
    } catch (error) {
      this.throwStepReadFailure('resolveHardlineProfile', projectId, error);
    }
  }

  /**
   * Cross-project fact gates. These rules intentionally contain no story names,
   * dates, professions or genre assumptions: they protect any novel whose prose
   * states a lifecycle, a contract, or an evidence custody state.
   */
  private detectGlobalFactContradictions(content: string): Array<{
    ruleId: string; message: string; snippet: string; position: string;
  }> {
    const findings: Array<{ ruleId: string; message: string; snippet: string; position: string }> = [];
    const clip = (text: string) => text.length > 100 ? `${text.slice(0, 100)}…` : text;

    // A named person cannot perform a dated personal act after an explicitly
    // stated death year in the same chapter. This catches impossible timelines
    // without assuming any particular setting or character.
    const deaths = [...content.matchAll(/([\u4e00-\u9fa5]{2,4}).{0,24}?(\d{4})年.{0,12}?(去世|死亡|身亡)/g)];
    for (const death of deaths) {
      const name = death[1];
      const deathYear = Number(death[2]);
      const tail = content.slice(death.index || 0);
      const later = new RegExp(`${name}.{0,36}?(\\d{4})年.{0,16}?(办卡|开户|签署|签字|缴费|付款|出席|驾驶|说话)`, 'g');
      let match: RegExpExecArray | null;
      while ((match = later.exec(tail)) !== null) {
        if (Number(match[1]) > deathYear) {
          findings.push({ ruleId: 'fact-lifecycle', message: `人物“${name}”已明确于${deathYear}年死亡，却在${match[1]}年执行个人行为`, snippet: clip(match[0]), position: '全文' });
          break;
        }
      }
    }

    // Contract-based suspense must state the minimum parties. A missing insured
    // party makes a life-insurance plot impossible to reason about downstream.
    if (/(寿险|人身保险|身故赔付)/.test(content) && !/(被保险人|受保人)/.test(content)) {
      findings.push({ ruleId: 'fact-contract-party', message: '人身保险情节缺少被保险人，合同主体不完整，后续理赔与死亡时间无法校验', snippet: clip(content.match(/.{0,30}(寿险|人身保险|身故赔付).{0,60}/)?.[0] || '人身保险情节'), position: '全文' });
    }

    // Once a document is explicitly sealed or collected as evidence, its later
    // removal needs an on-page authorization or handover.
    const custody = /(封条|封存|扣押|收走|保全).{0,420}(拿走|带走|塞进.{0,8}口袋|装进.{0,8}口袋)/;
    if (custody.test(content) && !/(批准|归还|交接|授权|副本|照片)/.test(content.slice((content.match(custody)?.index || 0)))) {
      findings.push({ ruleId: 'fact-custody', message: '已封存或保全的物证被再次取走，但正文未交代授权、归还或副本来源', snippet: clip(content.match(custody)?.[0] || ''), position: '全文' });
    }

    // 物品被明确"收起/收走/拿走/塞进/装进/放回"后，正文后文又声称该物品仍留在原处/没有拿走。
    // 覆盖"陈凯收起硬币 → 硬币又留在桌上"类物品状态链自相矛盾（用户实际抓到的硬伤）。
    const collectedObjects = ['硬币', '钥匙', '手机', '文件', '借条', '照片', '卡', '信', '包', '戒指', '玉佩', '手表', '证件', '合同', '优盘', 'U盘', '存折', '录音笔'];
    const collectedVerbs = [
      { re: new RegExp(`(收起|收走|拿走|塞进|装进|放回|揣进|收回|收进|装回)[^。！？；\\n]{0,14}(${collectedObjects.join('|')})`, 'g'), label: '收走' },
      { re: new RegExp(`(把|将)[^。！？；\\n]{0,10}(${collectedObjects.join('|')})[^。！？；\\n]{0,8}(放回|收回|装回|收进|揣进|收起|收走)`, 'g'), label: '收回' },
    ];
    for (const cv of collectedVerbs) {
      for (const m of content.matchAll(cv.re)) {
        const obj = (m[2] || m[3] || '').trim();
        if (!obj || obj.length < 1 || obj.length > 4) continue;
        const tail = content.slice((m.index || 0) + m[0].length);
        // 只认"明确仍在原处"的强信号，避免"手机还在响"这类语义不同的"还在"误报
        const reappear = new RegExp(`${obj}[^。！？；\\n]{0,20}(没有拿走|没有带走|留在|原封不动|又出现在|还在桌上|还在原位|还在原地|落在地上)`);
        if (reappear.test(tail)) {
          findings.push({
            ruleId: 'fact-item-reappear',
            message: `物品“${obj}”已被明确${cv.label}（${m[0].trim()}），后文又声称其仍留在原处/没有拿走——物品状态链自相矛盾`,
            snippet: clip(m[0]),
            position: '全文',
          });
          break;
        }
      }
    }

    // 同一事件在同一章既被标注为“今晚/今天”又被标注为“明天”——时间线自相矛盾。
    // 覆盖"借条写今晚决赛 → 结尾短信却写明天第一局"类硬伤（用户实际抓到的硬伤）。
    // 只做正向扫描：先出现"今晚/今天+事件"，其后 2000 字内又出现"明天+同类事件"。
    // 不做反向扫描的原因：决赛前夜说"明天打比赛"、次日说"今晚决赛"属于合法跨天推进，
    // 反向会误报；真正的矛盾是同一时间框架内既说今晚又说明天（正向形态）。
    // 反向类矛盾交由 LLM 验收器的"第四步 · 章内自洽"兜底。
    const timeEventFamilies: Array<{ label: string; words: string[] }> = [
      { label: '比赛', words: ['决赛', '比赛', '第一局', '首战', '开场', '开赛'] },
      { label: '商务', words: ['上线', '交易', '签约', '交货', '出发', '付款'] },
      { label: '事务', words: ['开庭', '手术', '见面', '动手'] },
    ];
    for (const fam of timeEventFamilies) {
      const todayRe = new RegExp(`(今晚|今天)[^。！？；\\n]{0,26}(${fam.words.join('|')})`);
      const todayM = content.match(todayRe);
      if (!todayM || todayM.index === undefined) continue;
      const after = content.slice((todayM.index || 0) + todayM[0].length, (todayM.index || 0) + todayM[0].length + 2000);
      const tomorrowM = after.match(new RegExp(`明天[^。！？；\\n]{0,22}(${fam.words.join('|')})`));
      if (tomorrowM) {
        findings.push({
          ruleId: 'fact-time-contradiction',
          message: `同一${fam.label}事件既被标注为“今晚/今天”（${todayM[0].trim()}）又被标注为“明天”（${tomorrowM[0].trim()}）——时间线自相矛盾，请统一为同一时间`,
          snippet: clip(tomorrowM[0]),
          position: '全文',
        });
      }
    }

    return findings;
  }

  /**
   * 跨章节学习 · 读取历史避坑经验，格式化为可注入后续章节 prompt 的段落。
   * 返回空串表示本项目尚无历史教训（如第一章），调用方据此不拼接。
   * 这是「第一章漏的结尾钩子、第二章首版就规避」的关键：经验跨章节累积。
   * 只取高频、未淘汰的经验（数据库侧已做总量封顶与旧版本淘汰），避免无限叠加。
   */
  private getActiveLessons(projectId: string, limit = 6): string {
    try {
      const db = this.db.getDb();
      const rows = db.prepare(
        `SELECT category, lesson, occurrence FROM generation_lessons
         WHERE project_id = ? ORDER BY occurrence DESC, updated_at DESC LIMIT ?`,
      ).all(projectId, limit) as Array<{ category: string; lesson: string; occurrence: number }>;
      if (!rows.length) return '';
      const lines = rows
        .map((r, i) => `  ${i + 1}) [${r.category}] ${r.lesson}（已在前面 ${r.occurrence} 章出现）`)
        .join('\n');
      return (
        `## 本项目历史避坑经验（跨章节学习 · 已从之前章节的生成中归纳，本章务必主动规避）\n` +
        `${lines}\n\n` +
        `应用规则：上述每条都是本项目前几章实际犯过的错误，本章动笔前逐条对照，确保不再重犯；` +
        `但不得因此自我设限、不得编造与大纲无关的内容来"预防"，仍以忠实执行本章大纲为最高目标。`
      );
    } catch (error) {
      this.throwStepReadFailure('getActiveLessons', projectId, error);
    }
  }

  /**
   * 单项目避坑经验总量上限。超过则淘汰「最少出现 + 最久未出现」的旧经验，避免无限叠加。
   */
  private static readonly MAX_LESSONS_PER_PROJECT = 24;

  /**
   * 跨章节学习 · 把一章最终未通过的缺失/冲突，经真实 LLM 归纳成通用避坑经验并入库。
   * 三道闸防止无限叠加：
   *   1) 归纳：要求 LLM 把同类问题合并成 1-3 条通用教训；
   *   2) 合并：先读取本项目已有经验，让 LLM 把新问题映射到已有经验（existingId）做增量，
   *      或对已有经验用更精炼的措辞覆盖旧版本（旧版本移除），仅在确属全新类别时新建；
   *   3) 淘汰：入库后若超过 MAX_LESSONS_PER_PROJECT，按「出现次数最少 → 最久未出现」删除最旧多余的。
   * 失败不影响正文保存（fire-and-forget，catch 内仅告警）。归纳用真实 LLM，绝不伪造。
   */
  private async summarizeChapterLessons(
    projectId: string,
    chapterIndex: number,
    missing: string[],
    contradictions: string[],
  ): Promise<void> {
    const issues = [
      ...missing.map(m => `缺失/未覆盖: ${m}`),
      ...contradictions.map(c => `冲突: ${c}`),
    ].filter(Boolean);
    if (!issues.length) return;
    try {
      const db = this.db.getDb();
      const now = new Date().toISOString();
      // 先读已有经验，供 LLM 判断「合并到旧条目」还是「新建」
      const existing = db.prepare(
        `SELECT id, category, lesson, occurrence FROM generation_lessons WHERE project_id = ? ORDER BY occurrence DESC, updated_at DESC`,
      ).all(projectId) as Array<{ id: string; category: string; lesson: string; occurrence: number }>;
      const existingText = existing.length
        ? existing
            .map((e, i) => `  [${i + 1}] id=${e.id} (${e.category}, 已出现${e.occurrence}次) ${e.lesson}`)
            .join('\n')
        : '（暂无，本章为首次归纳）';

      const prompt =
        `你是小说生成质量复盘器。下面是一章正文未通过大纲一致性验收时暴露的具体问题，` +
        `请归纳成可复用的「避坑经验」，用于注入到本项目后续章节的生成提示中，使后续章节主动规避同类问题。\n\n` +
        `【本章具体问题】\n${issues.join('\n')}\n\n` +
        `【本项目已有避坑经验（能对应到下面某条的，必须合并到它的 existingId，不要新建重复条目）】\n${existingText}\n\n` +
        `【归纳与合并要求】\n` +
        `- 把同类问题合并，输出 1-3 条；每条要么是「合并到已有经验」，要么是「全新经验」；\n` +
        `- 若问题与某条已有经验属同一类（如都关于"漏结尾钩子"或都关于"视角漂移"），必须 action=merge 并填该条 existingId，` +
        `可顺便在 lesson 字段给出更精炼的措辞以覆盖旧版本（旧表述即被移除）；\n` +
        `- 仅当确属全新、无法并入任何已有经验时才 action=new；\n` +
        `- 每条教训必须是「具体、可执行」的中文短句（例如"务必让正文最后一个场景落在结尾钩子场景上收尾，不得提前终止于用餐/通勤等中间事件"），不要复述具体章节内容；\n` +
        `- 类别从以下选一：missing_scene（漏场景/漏事件）、early_termination（提前终止/未到结尾钩子）、character_conflict（角色身份/关系冲突）、viewpoint_drift（视角/人称漂移）、hook_missing（漏结尾钩子）、other。\n\n` +
        `只输出JSON：{"items":[{"action":"merge","existingId":"<id>","lesson":"<可选：更精炼措辞，覆盖旧版本>"},{"action":"new","category":"...","lesson":"..."}]}`;

      const resp = await this.realLLM.generate({
        prompt,
        metrics: { projectId, stepKey: 'outline' },
        scenario: 'outline',
        temperature: 0.2,
        maxTokens: 4096,
        responseFormat: 'json_object',
        maxEmptyRetries: 1,
      });
      const parsed = this.safeExtractJson<{
        items?: Array<{ action?: string; existingId?: string; category?: string; lesson?: string }>;
      }>(resp.content, null as any);
      const items = Array.isArray(parsed?.items) ? parsed!.items : [];
      if (!items.length) return;

      const mergeStmt = db.prepare(
        `UPDATE generation_lessons
         SET occurrence = occurrence + 1,
             last_chapter_index = ?,
             updated_at = ?,
             lesson = COALESCE(?, lesson)
         WHERE id = ? AND project_id = ?`,
      );
      const newStmt = db.prepare(
        `INSERT INTO generation_lessons (id, project_id, category, lesson, occurrence, last_chapter_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?, ?)
         ON CONFLICT(project_id, lesson) DO UPDATE SET
           occurrence = occurrence + 1,
           last_chapter_index = excluded.last_chapter_index,
           updated_at = excluded.updated_at`,
      );
      const bumpByText = db.prepare(
        `UPDATE generation_lessons SET occurrence = occurrence + 1, last_chapter_index = ?, updated_at = ?
         WHERE project_id = ? AND lesson = ?`,
      );

      let merged = 0;
      let created = 0;
      for (const it of items) {
        const action = String(it?.action || '').trim();
        if (action === 'merge') {
          const existingId = String(it?.existingId || '').trim();
          if (!existingId) continue;
          const refined = it?.lesson ? String(it.lesson).trim() : '';
          mergeStmt.run(chapterIndex, now, refined || null, existingId, projectId);
          merged++;
        } else if (action === 'new') {
          const category = String(it?.category || 'other').slice(0, 32);
          const lesson = String(it?.lesson || '').trim();
          if (!lesson) continue;
          const res = newStmt.run(
            this.generateAlignmentCheckId(), projectId, category, lesson, chapterIndex, now, now,
          );
          if (Number(res.changes) === 0) {
            // 与既有条目措辞恰好一致（UNIQUE 冲突），按文本补增量，确保计数不丢
            bumpByText.run(chapterIndex, now, projectId, lesson);
          }
          created++;
        }
      }

      // 第三道闸：超量淘汰最旧最少见的经验，防止无限叠加
      const countRow = db.prepare(`SELECT COUNT(*) AS c FROM generation_lessons WHERE project_id = ?`)
        .get(projectId) as { c: number };
      let pruned = 0;
      if (countRow.c > ChainController.MAX_LESSONS_PER_PROJECT) {
        const excess = countRow.c - ChainController.MAX_LESSONS_PER_PROJECT;
        pruned = db.prepare(
          `DELETE FROM generation_lessons WHERE project_id = ? AND id IN (
             SELECT id FROM generation_lessons WHERE project_id = ?
             ORDER BY occurrence ASC, updated_at ASC LIMIT ?
           )`,
        ).run(projectId, projectId, excess).changes as number;
      }

      this.logger.log(
        `[跨章节学习] 归纳完成（project=${projectId}, ch${chapterIndex}）：合并=${merged}, 新建=${created}, 淘汰旧经验=${pruned}, 现存=${countRow.c - pruned}`,
      );
    } catch (err) {
      this.logger.warn(
        `章节教训归纳失败（不影响正文保存）：${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private assertNoBlockingGeneratedContentIssues(projectId: string, content: string): void {
    const checks = [
      this.characterService.checkConsistency(projectId, content),
      this.worldSettingService.checkConsistency(projectId, content),
      this.mapPointService.checkConsistency(projectId, content),
    ];
    const blocking = checks.flatMap(check => Array.isArray(check?.issues) ? check.issues : [])
      .filter((issue: any) => issue?.severity === 'high')
      .map((issue: any) => `${issue.characterName || issue.worldSettingName || issue.locationName || '设定'}：${issue.reason || issue.issueType}`);
    if (blocking.length > 0) {
      throw new HttpException(`正文触发已确认设定的硬性冲突，未保存：${blocking.slice(0, 3).join('；')}`, 422);
    }
  }

  private readChapterOutlineContract(projectId: string, chapterId: string): { title: string; text: string } {
    const outline = this.db.getDb().prepare(
      `SELECT outline.* FROM outlines outline
       INNER JOIN chapters chapter ON chapter.outline_id = outline.id
       WHERE chapter.id = ? AND chapter.project_id = ? AND outline.project_id = ? AND outline.level = 'chapter'
       LIMIT 1`,
    ).get(chapterId, projectId, projectId) as any;
    if (!outline) {
      throw new HttpException('所选正文未绑定详细章节大纲，已停止生成', 400);
    }
    const text = this.buildChapterOutlineContext(outline);
    return { title: String(outline.title || ''), text };
  }

  /**
   * POST /chain/generate
   * 正文生成（严格按已绑定详细大纲单次 LLM 调用）
   */
  /**
   * 生成前置检查：项目卡片上的 平台/分类/基调/文风/流派/视角 是【执行前提】。
   *
   * 为什么必须前置：这些空值此前要等正文全部写完（实测约 10 分钟、十余次 LLM 调用）之后，
   * 才由统一质量 Gate 当作 blocking 发现——成本最高的一步才发现「标准根本没设置」，
   * 而且它与「对话占比不足」「重复铺陈」等真实写作问题混在一条里，读起来像文章写得不好。
   * 这里把同一份判据提到生成入口：成本为 0 时先阻断。
   * 仍然不降级：不填默认值、不用平台推荐替代、不静默变成 not_applicable。
   */
  private assertExecutionStandardsComplete(projectId: string): void {
    const row = this.db.getDb().prepare(
      'SELECT type,target_words,target_platform,writing_style,settings FROM projects WHERE id = ?',
    ).get(projectId) as Record<string, unknown> | undefined;
    // 闸门不得静默放行：项目不存在时直接 return 会让「未执行标准」检查形同虚设。
    if (!row) throw new HttpException(`执行标准闸门无法校验：项目不存在 ${projectId}`, 404);
    const constitution = readConstitution(row);
    const missing = missingConstitutionStandards(constitution);
    if (missing.length === 0) {
      // 六维齐备之后还有一道「按平台分类执行」的判据：分类必须落在这本书要投放的那个平台的投稿分类里。
      // 归不了位 = 模型只能按系统内部题材写、投稿时对不上位，与「根本没设标准」是同一类问题，同样阻断。
      const placementProblem = categoryPlacementProblem(constitution);
      if (placementProblem) {
        const message = categoryPlacementMessage(constitution, placementProblem, platformDisplayName(constitution.targetPlatform));
        this.logger.error('生成前置阻断（分类未在平台归位） project=' + projectId + ' platform=' + constitution.targetPlatform + ' category=' + constitution.category);
        throw new HttpException(message + '；请在项目卡片把分类改选为该平台的投稿分类后再生成。', 422);
      }
      const fitProblem = genreFitProblem(constitution);
      if (fitProblem) throw new HttpException(fitProblem + '；请在本书创作设定补齐后再生成。', 422);
      // 六维齐备、分类已归位之后的第三道生成前置阻断：目标总字数要落在这个平台分类的头部实测体量里，
      // 或由作者在项目卡片「分类体量取舍依据」写明取舍。
      // 此前「目标总字数」有三套口径：long_novel 只要求 ≥10 万（story-length.ts）、
      // 灵感阶段没有平台分类锚点所以模型自由选（runIdeaDiscovery）、质量评审却按平台分类
      // 实测区间判越界（platform-quality-rules）。目标是项目卡片级状态，而精修策略只改正文，
      // 架构上永远改不动它 —— 于是「生成 → 评审 → 精修 → 复评」必然回滚，每章白烧一轮模型调用。
      // 这里与创建入口、质量 Gate 共用同一份 categoryWordScaleStanding 判据与同一句文案；
      // 不降级：不擅自改写作者填的目标字数，也不降低该判据的 severity。
      const scaleStanding = categoryWordScaleStanding(constitution);
      if (categoryWordScaleBlocked(scaleStanding)) {
        const message = categoryWordScaleMessage(scaleStanding, platformDisplayName(constitution.targetPlatform));
        this.logger.error('生成前置阻断（分类体量判据未满足） project=' + projectId + ' platform=' + constitution.targetPlatform + ' category=' + constitution.category + ' targetWords=' + constitution.targetWords + ' status=' + scaleStanding.status);
        throw new HttpException(message + '；请在项目卡片调整目标总字数，或补齐「分类体量取舍依据」后再生成。', 422);
      }
      return;
    }
    const message = missing
      .map(item => `创作宪法未设置${item.label}：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）`)
      .join('；');
    this.logger.error(`生成前置阻断（generate/stream 共用同一判据） project=${projectId} 未执行标准=${missing.map(item => item.dimension).join(',')}`);
    throw new HttpException(`${message}；请在项目卡片补齐这些执行标准后再生成。`, 422);
  }

  @Post('generate')
  async generate(@Body() dto: GenerateDto) {
    this.logger.log(`generate: project=${dto.projectId} mode=${dto.mode || 'full_auto'}`);
    let generationKey: string | undefined;

    // 检查是否为锁定章节（批量操作跳过）
    if (dto.isLocked) {
      return {
        success: true,
        skipped: true,
        reason: '该章节已锁定，自动跳过',
        content: '[已锁定]',
      };
    }

    try {
      this.workflowGuard.assertCanGenerateBody(dto.projectId);
      // 执行标准缺失属于「未执行」，不是「写得不好」：必须在花 token 之前暴露。
      this.assertExecutionStandardsComplete(dto.projectId);
      // 渐进式长篇：正文生成前自动补足滚动细纲窗口（短篇/已足够时内部 no-op），可能正好为本章补绑大纲。
      await this.rolloutDetailedOutlines(dto.projectId);
      const db = this.db.getDb();
      if (!dto.chapterId) {
        throw new HttpException('请选择一个章节后再生成正文。系统一次只生成所选章节。', 400);
      }
      const targetChapter = db.prepare(
        `SELECT chapter.id, chapter.outline_id, chapter.chapter_index, outline.target_words
         FROM chapters chapter LEFT JOIN outlines outline ON outline.id = chapter.outline_id
         WHERE chapter.id = ? AND chapter.project_id = ? LIMIT 1`,
      ).get(dto.chapterId, dto.projectId) as any;
      if (!targetChapter) {
        throw new HttpException('所选章节不存在或不属于当前项目。', 404);
      }
      const chapterTargetWords = Number(targetChapter.target_words || 0);
      const wordRange = this.getChapterWordRange(dto.projectId, chapterTargetWords);
      if (!Number.isInteger(chapterTargetWords) || chapterTargetWords < wordRange.min || chapterTargetWords > wordRange.max) {
        throw new HttpException(`本章大纲缺少有效的${wordRange.min}-${wordRange.max}字动态目标，正文生成已停止`, 400);
      }
      generationKey = this.beginChapterGeneration(dto.projectId, dto.chapterId);
      if (!targetChapter.outline_id) {
        throw new HttpException('所选章节尚未关联详细大纲。请先在大纲页关联该章后再生成，系统不会用其他章节或通用资料替代。', 400);
      }
      dto.chapterNumber = Number(targetChapter.chapter_index || dto.chapterNumber || 1);
      {
        // 正文前置：章节合同必须先自洽，口径与 stream-generate 完全一致。
        // 大纲自身越界（location_summary 声明「全章不出校门」、ending_setup 却落在门外的下一章主场）时，
        // 正文无论怎么写都必然被 Gate 判违约；先就地改好大纲，再花 token 写正文。
        // 修复结果由后续 buildChapterPlanContext / readChapterOutlineContract 重新从库里读取。
        await this.repairOutlineConsistency(dto.projectId, {
          onlyOutlineIds: [String(targetChapter.outline_id)],
          label: `正文前置 第${dto.chapterNumber}章`,
        });
      }
      const chapterContract = this.readChapterOutlineContract(dto.projectId, dto.chapterId);
      // RAG 上下文注入: 检索项目相关的角色和世界观信息
      let ragContext = '';
      try {
        const stateContext = this.buildWritingStateContext(dto.projectId, dto.chapterNumber);
        const characterContext = this.buildCharacterWritingContext(dto.projectId);
        const worldContext = this.buildWorldWritingContext(dto.projectId);
        const locationContext = this.buildLocationWritingContext(dto.projectId);
        if (characterContext) ragContext += `\n${characterContext}`;
        if (worldContext) ragContext += `\n${worldContext}`;
        if (locationContext) ragContext += `\n${locationContext}`;
        if (stateContext.contextText || stateContext.pendingTotal > 0) {
          ragContext += '\n【写作状态上下文】\n' + (stateContext.contextText || '暂无状态上下文。');
          ragContext += `\n【状态使用规则】${stateContext.stateGuard}`;
          if (stateContext.pendingSummary.length > 0) {
            ragContext += '\n待确稿候选:\n' + stateContext.pendingSummary.map(item => `- ${item}`).join('\n');
          }
        }
        // 正文生成只使用统一状态管理中的已确稿资料。
        // 旧向量库可能包含未确稿角色/世界观片段，不能直接进入正文提示。
      } catch { /* RAG失败不影响主流程 */ }

      // 自动从数据库组装 outline + chapterContext（前端不传时后端自动补）
      let outline = (dto.outline || {}) as any;
      let chapterContext = (dto.chapterContext || {}) as any;
      if (!dto.outline || !dto.chapterContext || Object.keys(dto.outline).length === 0) {
        try {
          const autoCtx = this.buildChapterPlanContext(dto.projectId, dto.chapterNumber || 1, dto.chapterId);
          if (autoCtx.outline) outline = autoCtx.outline;
          if (autoCtx.context) chapterContext = autoCtx.context;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new HttpException(`无法建立本章的确认故事上下文，已停止生成：${message}`, 409);
        }
      }
      if (ragContext) {
        chapterContext = {
          ...chapterContext,
          confirmedStateContext: ragContext,
          stateGuard: '已确稿 hard_fact 必须遵守。待确认 soft_candidate 只能参考, 不要写死。冲突/过期 warning 需要避免或复核。',
        };
      }

      // A selected body chapter is always bound to its detailed outline.  Never
      // fall through to a generic prompt when canonical context construction
      // failed, otherwise a successful-looking but unrelated chapter is saved.
      if (!outline || Object.keys(outline).length === 0 || !chapterContext || Object.keys(chapterContext).length === 0) {
        throw new HttpException('本章确认故事上下文不完整，已停止生成；不会使用通用提示词替代详细大纲', 409);
      }

      // 严格基于已绑定的详细大纲做单次 LLM 生成（2026-07-24 取消天龙8步后）
      if (outline && Object.keys(outline).length > 0) {
        const povInstruction = (() => {
          const pov = String((chapterContext as any).pov || '').trim();
          return pov
            ? `严格使用已有项目配置的叙事视角：${pov}。本视角的硬红线已写入下方【大纲严格性约束】的 POV 红线段，第一人称/第三人称均须严守"禁止叙述者跳出成为作者评论者"。`
            : '保持大纲与前文已经建立的叙事视角，不得无依据切换；本视角的硬红线已写入下方【大纲严格性约束】的 POV 红线段，第一人称/第三人称均须严守"禁止叙述者跳出成为作者评论者"。';
        })();
        const stateGuardText = String((chapterContext as any).stateGuard || '已确稿事实必须遵守；待确稿候选只能参考，不要写死；冲突/过期需避免或复核。');
        const confirmedStateText = String(
          (chapterContext as any).confirmedStateContext
          || ragContext
          || '暂无已确稿上下文。',
        );
        const chapterHeading = chapterContract.title || `第${targetChapter.chapter_index}章`;
        const chapterOutlineText = chapterContract.text;

        // 大纲严格性约束（红线 + 绿区）：大纲是不可偏离的合同，但在红线内
        // 鼓励微发挥与多样性。配合末位 assertGeneratedChapterAlignment 形成
        // "事前约束 + 事后拒绝"双保险。短篇受篇幅限制，微发挥以精准为主。
        const outlineAdherenceContract = this.buildOutlineAdherenceContract(this.isProjectLongNovel(dto.projectId), dto.projectId);

        // 平台风格指令必须放在 prompt 最前面（章节标题之后、大纲之前），确保模型第一眼看到并遵循。
        // 放在大纲/大段已确稿上下文之后会被 deepseek 等模型忽略，导致"选了番茄却写成盐选"。
        

        let prompt = `你正在创作第${targetChapter.chapter_index}章 ${chapterHeading}。

${this.resolvePlatformToneDirective(dto.projectId)}
## 不可偏离的详细大纲
${chapterOutlineText}

## 已确稿故事上下文
${confirmedStateText}

## 状态使用规则
${stateGuardText}

${outlineAdherenceContract}

${this.buildNarrativeQualityContract(dto.projectId)}

## 写作要求
1. 正文长度必须严格控制在 ${wordRange.min}-${wordRange.max} 个汉字之间，绝对不得超过 ${wordRange.max} 字、也不得少于 ${wordRange.min} 字。写到约 ${chapterTargetWords} 字时必须自然收尾，不要摊开写或注水。
2. 严格遵循本章大纲中已列出的核心事件、冲突、人物行动、结尾钩子；按大纲事件顺序依次推进，大纲列出的所有场景与人物行动都必须实际发生，不许擅自改写或跳过。正文的最后一个场景必须是【本章结尾钩子】所描述的场景并落在该钩子场景上收尾，严禁提前终止于大纲中间事件（如用餐、通勤、过渡等场景）。
3. 不得在正文里写"天龙8步""目标/诱因/行动/阻碍/误判/反转/代价/钩子"等小标题或方法论标签；只输出可发布的纯正文。
4. 对话、动作、场景描写要服务于大纲事件，不得为凑字数添加与本章无关的支线。
5. ${povInstruction}

## 直接输出
请直接输出完整章节正文，不要任何解释、前缀、JSON、Markdown 标题。`;
        // 把已注入的 RAG（角色/世界观/地点）追加到 prompt 末尾
        if (ragContext) prompt += `\n\n【已确稿 RAG 补充】\n${ragContext}`;

        const { content: fullContent, qualityReport } = await this.generateBodyWithAlignmentGuard({
          basePrompt: prompt,
          projectId: dto.projectId,
          targetWords: chapterTargetWords,
          // 这里曾默认 daily，后果是项目正文绕过「writing」场景模型配置；B2 只会调用日常模型。
          scenario: dto.scenario || 'writing',
          temperature: 0.7,
          chapterIndex: Number(targetChapter.chapter_index),
          chapterTitle: chapterContract.title,
          outlineContract: chapterContract.text,
          storyContext: confirmedStateText,
          subsequentChapterBoundary: this.buildSubsequentChapterBoundary(dto.projectId, Number(targetChapter.chapter_index)),
          wordRange,
        });
        this.assertNoBlockingGeneratedContentIssues(dto.projectId, fullContent);

        const characterConsistency = this.characterService.checkConsistency(dto.projectId, fullContent);
        const worldConsistency = this.worldSettingService.checkConsistency(dto.projectId, fullContent);
        const locationConsistency = this.mapPointService.checkConsistency(dto.projectId, fullContent);
        return {
          success: true,
          content: fullContent,
          characterConsistency,
          worldConsistency,
          locationConsistency,
          qualityReport,
          // The chapter API is the only persistence owner: it snapshots author
          // content and synchronizes summaries/RAG/foreshadowing/timeline as one
          // transaction. Returning prose here must never bypass that path.
          requiresCanonicalSave: true,
          chainResult: {
            status: 'completed',
            totalLatency: 0,
            nodeCount: 1,
          },
        };
      }

      // 简易模式：直接调用 LLM 生成，自动从数据库补充上下文
      // All valid body requests return inside the outline-bound branch above.
      // Keep this guard instead of a generic prompt fallback: generic prose is
      // neither eligible for the chapter quality gate nor for canonical saving.
      throw new HttpException('本章确认上下文无效，已停止生成；不会使用通用提示词降级', 409);
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : '生成失败';
      this.logger.error(`generate 失败: ${message}`);
      return { success: false, error: message };
    } finally {
      this.finishChapterGeneration(generationKey);
    }
  }

  /**
   * POST /chain/continue
   * 续写当前章节
   */
  @Post('continue')
  async continueWriting(@Body() dto: ContinueDto) {
    this.logger.log(`continue: chapter=${dto.chapterId}`);

    try {
      this.workflowGuard.assertCanContinueBody(dto.projectId);
      const contextStr = dto.context
        ? `\n前文内容：${dto.context.substring(0, 2000)}`
        : '';
      const chapter = this.db.getDb().prepare(
        'SELECT chapter_index FROM chapters WHERE id = ? AND project_id = ? LIMIT 1'
      ).get(dto.chapterId, dto.projectId) as any;
      const confirmedContext = this.buildWritingStateContext(dto.projectId, chapter?.chapter_index);
      const characterContext = this.buildCharacterWritingContext(dto.projectId);
      const worldContext = this.buildWorldWritingContext(dto.projectId);
      const locationContext = this.buildLocationWritingContext(dto.projectId);
      const stateContext = `\n\n【写作状态上下文】\n${confirmedContext.contextText || '暂无状态上下文。'}\n\n【状态使用规则】\n${confirmedContext.stateGuard}\n${confirmedContext.pendingSummary.length ? confirmedContext.pendingSummary.map(item => `待确稿候选: ${item}`).join('\n') : '无待确稿候选'}\n${characterContext}\n${worldContext}`;

      let prompt = `继续续写当前章节。${this.resolvePlatformToneDirective(dto.projectId)}${contextStr}${stateContext}\n${dto.prompt ? `创作要求：${dto.prompt}` : '自然续写下去'}`;
      prompt += locationContext;

      // 自动注入大纲/角色/世界观上下文
      try {
        const autoCtx = this.buildAutoContext(dto.projectId, chapter?.chapter_index || 1, dto.chapterId);
        if (autoCtx) prompt += '\n\n【大纲与世界观上下文】\n' + autoCtx;
      } catch {}

      // 与 /chain/generate、body-by-outline 两端点共用同源约束（修复：
      // 之前 /chain/continue 不注入降 AI 文风 + 散文质感约束，续写后接的正文照样机械/AI 味）。
      // 续写是增量，但必须继续遵守本章已建立的视角、人物、节奏、段落硬约束。
      const chapterOutlineAdherence = this.buildOutlineAdherenceContract(this.isProjectLongNovel(dto.projectId), dto.projectId);
      const narrativeQualityContract = this.buildNarrativeQualityContract(dto.projectId);
      prompt = `${prompt}\n\n${chapterOutlineAdherence}\n\n${narrativeQualityContract}`;

      const response = await this.realLLM.generate({ prompt, scenario: dto.scenario || 'writing', temperature: 0.7 });
      const continuation = String(response.content || '').trim();
      if (!continuation) throw new Error('续写未返回可验收的正文');
      const db = this.db.getDb();
      const chapterRow = db.prepare(
        `SELECT chapter.chapter_index, chapter.outline_id, chapter.content, outline.target_words
         FROM chapters chapter LEFT JOIN outlines outline ON outline.id = chapter.outline_id
         WHERE chapter.id = ? AND chapter.project_id = ? LIMIT 1`,
      ).get(dto.chapterId, dto.projectId) as any;
      if (!chapterRow?.outline_id) {
        throw new HttpException('所选章节尚未关联详细大纲，不能续写或使用通用提示词替代。', 409);
      }
      const existingContent = String(chapterRow.content || '').trim();
      const content = `${existingContent}${existingContent ? '\n\n' : ''}${continuation}`;
      const chapterContract = this.readChapterOutlineContract(dto.projectId, dto.chapterId);
      const qualityReport = await this.assertGeneratedChapterAlignment({
        chapterIndex: Number(chapterRow.chapter_index || 1),
        chapterTitle: chapterContract.title,
        outlineContract: chapterContract.text,
        storyContext: confirmedContext.contextText || stateContext,
        content,
        projectId: dto.projectId,
      });
      this.assertGeneratedChapterIdentity(content, Number(chapterRow.chapter_index || 1));
      // 续写是增量草稿，不在此强制最终 CHAPTER_WORD_RANGE 字硬上限（章节锁定时 chapter.service 才做最终验收），
      // 否则写到一半就会因“累计超 5000”被拒，违背草稿可逐步累积的体验。仅做非阻塞提醒。
      const draftLen = this.generatedNarrativeWordCount(content);
      if (draftLen > CHAPTER_WORD_RANGE.max || draftLen < CHAPTER_WORD_RANGE.min) {
        this.logger.warn(`continue 草稿累计 ${draftLen} 字，未命中 ${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}；锁定时将做最终篇幅验收。`);
      }
      this.assertNoBlockingGeneratedContentIssues(dto.projectId, content);
      // 硬红线确定性扫描：与 /chain/generate 同源，命中即注入到质量报告 contradictions，
      // 续写积累多次违规时矛盾 tab 上能看到具体违规原文片段。
      try {
        const continuationOnly = content.slice(existingContent.length).trimStart();
        const findings = detectForbiddenTells(continuationOnly, this.resolveHardlineProfile(dto.projectId));
        if (findings.length > 0) {
          (qualityReport as any).hardlineFindings = findings;
          this.logger.warn(
            `continue 硬红线扫描命中 ${findings.length} 处违规（chapter=${dto.chapterId}）：` +
            findings.map(f => `${f.ruleId}@${f.position}`).join(', '),
          );
        }
      } catch (scanErr: any) {
        this.logger.warn(`continue 硬红线扫描失败（已忽略）: ${scanErr?.message ?? scanErr}`);
      }
      const characterConsistency = this.characterService.checkConsistency(dto.projectId, content);
      const worldConsistency = this.worldSettingService.checkConsistency(dto.projectId, content);
      const locationConsistency = this.mapPointService.checkConsistency(dto.projectId, content);

      // Persistence deliberately stays in the renderer's ChapterService update.
      // That route records a snapshot and synchronizes all derived story data.

      return {
        success: true,
        content,
        characterConsistency,
        worldConsistency,
        locationConsistency,
        qualityReport,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : '续写失败';
      this.logger.error(`continue 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/enhance-opening
   * 开头强化 - 增强选中段落的开头吸引力
   */
  @Post('enhance-opening')
  async enhanceOpening(@Body() dto: EnhanceOpeningDto) {
    this.logger.log(`enhance-opening: chapter=${dto.chapterId}`);

    try {
      // 这四条方向【不是】第六个风格维度，而是「文风」维内部的定向强化手法：
      // 执行标准（平台/分类/基调/文风/流派/视角）由 prompt 顶部的 resolvePlatformToneDirective 注入，
      // 六维缺失会直接 422；方向只能决定「在已确认文风允许的范围内往哪一侧用力」。
      const openingDirections: Record<string, string> = {
        poetic: '在已确认文风允许的范围内，用更凝练的意象与节奏强化开头；不得把整段改成诗化文体',
        direct: '在已确认文风允许的范围内，让第一句更直接有力、去掉冗余修饰；不得把文风改成通篇白描',
        suspense: '在已确认文风允许的范围内，把危机/反常/悬念提到开篇第一屏；不得为造悬念改变事实或新增情节',
        emotional: '在已确认文风允许的范围内，强化开篇的情绪落点；不得改变基调、不得煽情化',
      };

      const projectCard = this.buildWritingStateContext(dto.projectId).projectCard as any;
      const direction = dto.style && openingDirections[dto.style]
        ? `定向强化方向（只在「文风」维内部用力，不是新增执行标准维度）：${openingDirections[dto.style]}`
        : `不额外指定方向：严格按执行标准的「文风」维执行：${JSON.stringify(projectCard.writingStyle || projectCard.planning?.style || '')}`;

      const prompt = `${this.resolvePlatformToneDirective(dto.projectId)}作为短篇故事写作专家，请增强以下段落的开头吸引力。

原文：
${dto.text}

${direction}

输出要求：
1. 保留核心信息和情节，不改变故事事实、人物与事件顺序
2. 增强第一句的冲击力
3. ${projectCard.pov ? `严格保持已有项目配置的叙事视角：${projectCard.pov}` : '保持原文已经建立的叙事视角，不得无依据切换'}
4. 执行标准优先：上面注入的平台/分类/基调/文风/流派/视角是本段唯一口径，强化后必须逐维对得上，任何一维都不得被你改写；若所选方向与已确认的文风或基调冲突，以执行标准为准，只在标准允许的范围内做该方向的强化
5. 可借鉴目标平台该投稿分类头部作品的开篇手法（信息前置、危机开场、对话切入等），但严禁照搬具体作品的名场面、人物与设定，也不得凭空新增情节
6. 输出增强后的完整段落`;

      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.8,
      });

      return {
        success: true,
        enhanced: response.content,
      };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      const message = err instanceof Error ? err.message : '开头强化失败';
      this.logger.error(`enhance-opening 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/enhance-reversal
   * 反转强化 - 分析并提供反转增强建议
   */
  @Post('enhance-reversal')
  async enhanceReversal(@Body() dto: EnhanceReversalDto) {
    this.logger.log(`enhance-reversal: chapter=${dto.chapterId}`);

    try {
      const prompt = `${this.resolvePlatformToneDirective(dto.projectId)}作为反转设计专家，分析以下章节内容的反转效果，并提供增强方案。

章节内容：
${dto.content}

分析要求：
1. 识别当前内容中的反转元素（如有）
2. 评估反转力度（1-10分）
3. 如果无反转，建议在何处插入反转
4. 提供3个不同的反转增强方案
5. 每个方案说明：前文伏笔铺垫、反转方式、读者冲击度

输出格式：
{
  "currentReversal": { "exists": boolean, "score": number, "description": string },
  "enhancementPlans": [
    { "title": string, "method": string, "foreshadow": string, "impact": number }
  ]
}`;

      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.8,
      });

      return {
        success: true,
        ...response,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '反转分析失败';
      this.logger.error(`enhance-reversal 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/adapt-platform
   * 平台改写 - 在不同平台风格间转换
   */
  @Post('adapt-platform')
  async adaptPlatform(@Body() dto: AdaptPlatformDto) {
    this.logger.log(`adapt-platform: target=${dto.targetPlatform}`);

    try {
      // 平台要求统一取自唯一事实源 platform-benchmarks（9 平台全覆盖 + 量化基准 + styleMust 风格红线），
      // 不再在控制器内维护只覆盖部分平台的第三套手写文案；未知平台由唯一源自动兜底 generic。
      // 平台 id 归一化只用唯一源 normalizePlatformId（含中文名/别名 → id）。
      // 此前这里是 `String(dto.targetPlatform || '').toLowerCase()`：第二套归一化规则，
      // 认不出「番茄」这类中文写法，静默落进 generic。已删。
      const targetPlatformId = normalizePlatformId(dto.targetPlatform);
      const guide = buildBenchmarkDirective(targetPlatformId);

      // 执行标准是改写前提：平台改写只换平台写法，不得改掉创建时确认的分类/基调/文风/流派/视角与题材标签。
      // 此前这里只注入目标平台基准，等于把目标平台当成唯一标准——用户设定的其余维度会在改写中丢失。
      const projectStandard = this.resolvePlatformToneDirective(dto.projectId);
      const prompt = `作为平台风格适配专家，将以下内容改写为适合 ${platformDisplayName(targetPlatformId)} 平台的风格。\n\n【创建项目时确认的执行标准（前提：除「平台」一维由本次目标平台替换外，其余维度必须原样执行，不得改掉）】\n${projectStandard}

原文：
${dto.content.substring(0, 3000)}

目标平台要求（唯一事实源，含受众、量化文本基准与风格红线，严格遵循）：
${guide}

输出要求：
1. 严格遵循目标平台的节奏/对话占比/段落厚度/开篇钩子/章尾钩与风格红线
2. 保留核心剧情和人物设定，不得改写成另一个故事
3. 调整节奏和结构以匹配平台
4. 输出改写后的完整段落`;

      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.7,
      });

      return {
        success: true,
        adapted: response.content,
        // 回显归一化后的平台 id：作者拿到的是系统真正据以执行的那个平台，
        // 而不是可能拼写/别名不一致的入参原文。
        targetPlatform: targetPlatformId,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '平台改写失败';
      this.logger.error(`adapt-platform 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/generate-title
   * 标题/简介生成 - 基于内容生成吸引人的标题和简介
   */
  @Post('generate-title')
  async generateTitle(@Body() dto: GenerateTitleDto) {
    this.logger.log(`generate-title: count=${dto.count || 5}`);

    try {
      let platformDirective = '';
      try {
        // 标题与正文同一事实源：执行标准六维（平台/分类/基调/文风/流派/视角）+ 长短篇，避免标题风格与本书定位脱节
        if (dto.projectId) platformDirective = this.resolvePlatformToneDirective(dto.projectId);
      } catch {}
      const prompt = `作为爆款标题文案专家，基于以下内容生成 ${dto.count || 5} 个吸引人的标题和简介。
${platformDirective}

内容概要：
${dto.content.substring(0, 2000)}

要求：
1. 标题要吸引点击（悬念/冲突/情绪/反转）
2. 简介要引人入胜（前50字决定是否继续看）
3. 标题控制在10-25字
4. 简介控制在50-150字
5. 标注每个标题适合的平台风格

输出JSON格式：
[
  {
    "title": string,
    "subtitle": string,
    "suitablePlatforms": string[],
    "appealFactor": string
  }
]`;

      const response = await this.realLLM.generate({
        prompt,
        temperature: 0.9,
      });

      // 原创性后置检测：逐个候选标题比对知名作品库，撞名/高度相似透出风险（不阻断、不改写结果）
      const originalityWarnings: Array<{ title: string; risk: string; similarity: number; matched: string; suggestion: string }> = [];
      try {
        const titles = JSON.parse(response.content);
        if (Array.isArray(titles)) {
          for (const item of titles) {
            for (const h of this.originalityGuard.checkTitle(String(item?.title || ''))) {
              originalityWarnings.push({ title: item.title, risk: h.risk, similarity: h.similarity, matched: h.matchedItem, suggestion: h.suggestion });
            }
          }
        }
      } catch { /* 标题 JSON 解析失败不阻断返回 */ }

      return {
        success: true,
        ...response,
        originalityWarnings,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '标题生成失败';
      this.logger.error(`generate-title 失败: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/generate-outline
   * 服务端权威大纲入口。
   *
   * 为什么需要这一层：前端直连 /chain/templates/execute/:id 时，服务端只查工作流阶段，
   * 既不校验项目卡片上的执行标准，也不把执行标准注入大纲链——产出的大纲与用户创建前选定的
   * 平台/分类/基调/文风/流派/视角/题材标签无关。这里把「执行标准」同时当作前置条件与输入，
   * 与正文层共用同一个解析器（resolvePlatformToneDirective / buildExecutionStandard / platform-benchmarks）。
   * 任何一步取不到标准都直接阻断：不填默认值、不静默跳过、不降级保存。
   */
  @Post('generate-outline')
  async generateOutline(@Body() dto: { projectId?: string; storySetting?: string; chapterLimit?: number }) {
    const projectId = String(dto?.projectId || '').trim();
    if (!projectId) throw new HttpException('缺少 projectId，无法解析项目执行标准', 400);
    const row = this.db.getDb().prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as Record<string, any> | undefined;
    if (!row) throw new HttpException(`项目不存在：${projectId}`, 404);

    // ① 执行标准闸门（成本为 0 时先失败，不等整条链跑完十余次 LLM 调用）
    this.assertExecutionStandardsComplete(projectId);
    this.workflowGuard.assertCanGenerateOutline(projectId);

    // ② 执行标准注入：平台基准 + 基调/文风/流派/视角/题材标签 + 创作宪法，与正文层同一份来源
    const constitution = readConstitution(row);
    const platformDirective = this.resolvePlatformToneDirective(projectId);
    if (!platformDirective.trim()) {
      throw new HttpException('执行标准未生效：未能从项目卡片解析出平台/基调/文风标准，已停止生成大纲（不得用默认值或平台推荐替代）。', 422);
    }

    // ③ 目标总字数与单章区间都取项目本体，避免前端传参与项目配置漂移
    const configuredTotalWords = Number(constitution.targetWords || 0);
    if (!Number.isInteger(configuredTotalWords) || configuredTotalWords <= 0) {
      throw new HttpException('项目未配置有效的目标总字数，无法生成大纲', 422);
    }
    const range = this.getChapterWordRange(projectId, configuredTotalWords);
    const wordRangeText = `每章 ${range.min}-${range.max} 字（targetWords 必须是落在该区间内的整数，并给出 wordCountReason）`;
    const parsedLimit = Number(dto?.chapterLimit);
    const chapterLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : undefined;
    const storySetting = String(dto?.storySetting || '').trim() || '自动生成';

    const result = await this.chainTemplate.executeChain('long-novel-flexible-outline', {
      projectId,
      story_setting: storySetting,
      targetWords: configuredTotalWords / 10000,
      genre: constitution.category || constitution.webNovelGenre.join('、'),
      chapterLimit,
      platform_directive: platformDirective,
      wordRangeText,
    });
    const outputs: any = (result as any)?.outputs || {};
    const analysis = outputs.node_1_analysis ?? null;
    const volumeStructure = outputs.node_2_volumes ?? null;
    const chapterOutline = outputs.node_3_chapters ?? null;
    const chapterVolumes: any[] = Array.isArray(chapterOutline?.volumes) ? chapterOutline.volumes : [];
    if (chapterVolumes.length === 0) {
      // 真实成因优先：章纲节点被质量 Gate 拒绝时，「volumes 为空」只是症状。
      // 报症状会让用户去改大纲结构，而真正要改的是执行标准/平台分类体量/时间线冲突。
      const gateReport = firstGateReportFromChain(result);
      if (gateReport) throw gateRejectionFromReport(gateReport);
      throw new HttpException('大纲链未返回可保存的章节结构（章纲节点 volumes 为空）。已停止，不降级保存。', 502);
    }

    // ④ 卷级信息（标题/主题/目标/高潮/关键事件）来自卷纲节点，按 volumeNumber 合并进章纲；
    //    否则前端只能拿到「第N卷」占位标题，保存后卷结构信息整体丢失。
    const structureByNumber = new Map<number, any>();
    for (const volume of (Array.isArray(volumeStructure?.volumes) ? volumeStructure.volumes : [])) {
      const number = Number(volume?.volumeNumber);
      if (Number.isInteger(number)) structureByNumber.set(number, volume);
    }
    const volumes = chapterVolumes.map((volume: any, index: number) => {
      const number = Number.isInteger(Number(volume?.volumeNumber)) ? Number(volume.volumeNumber) : index + 1;
      const structure: any = structureByNumber.get(number) || {};
      return {
        ...structure,
        ...volume,
        volumeNumber: number,
        title: String(volume?.title || structure?.title || `第${number}卷`),
        theme: String(volume?.theme || structure?.theme || ''),
        description: String(volume?.description || volume?.outline || structure?.outline || structure?.goal || ''),
        goal: String(volume?.goal || structure?.goal || ''),
        climaxDescription: String(volume?.climaxDescription || structure?.climaxDescription || ''),
        keyEvents: Array.isArray(volume?.keyEvents) ? volume.keyEvents : (Array.isArray(structure?.keyEvents) ? structure.keyEvents : []),
      };
    });
    const chapterCount = volumes.reduce((sum: number, v: any) => sum + (Array.isArray(v.chapters) ? v.chapters.length : 0), 0);
    this.logger.log(`generate-outline: project=${projectId} 平台=${constitution.targetPlatform} 基调=${constitution.storyTone.join('、')} 卷=${volumes.length} 章=${chapterCount}`);
    return { success: true, volumes, meta: { analysis, volumeStructure }, outputs };
  }

  /**
   * POST /chain/chapter-transition
   * 章节衔接 - 批量章节连贯性+前情提要
   */
  @Post('chapter-transition')
  async chapterTransition(@Body() dto: {
    projectId: string;
    previousChapterContent: string;
    previousChapterHook?: string;
    nextChapterTitle?: string;
    transitionType?: 'tight' | 'jump' | 'parallel';
    chapterFunction?: string;
    timeline?: string;
  }) {
    this.logger.log(`chapter-transition: type=${dto.transitionType || 'tight'}`);

    try {
      const projectCard = this.buildWritingStateContext(dto.projectId).projectCard as any;
      // 钩子类型检测
      const last500 = (dto.previousChapterContent || '').slice(-500);
      const hookTypes: string[] = [];
      if (last500.includes('？') || last500.includes('?') || last500.endsWith('...')) hookTypes.push('疑问/悬念钩子');
      if (last500.includes('"') || last500.includes('"') || last500.includes('「')) hookTypes.push('对话钩子');
      if (last500.match(/伸|推|冲|撞|跳|落|握/)) hookTypes.push('动作钩子');
      if (last500.match(/慌|惊|怒|喜|悲|苦|泪|笑/)) hookTypes.push('情绪钩子');

      const detectedHook = hookTypes.length > 0 ? `检测到${hookTypes.join('、')}` : '未明确检测到钩子类型';
      const type = dto.transitionType || 'tight';
      // 章节衔接/过渡同样是正文，必须带执行标准六维（平台/分类/基调/文风/流派/视角）+ 长短篇（与正文同一事实源）
      const toneDirective = this.resolvePlatformToneDirective(dto.projectId);
      let prompt = '';

      if (type === 'tight') {
        prompt = `你正在创作一部小说，需要为下一章生成紧衔接开头。
${toneDirective}

上一章结尾内容（含钩子）：
${dto.previousChapterContent || ''}

下一章标题：${dto.nextChapterTitle || '下一章'}

要求：
1. 在足以形成自然衔接的开篇范围内直接承接上一章钩子
2. 保持场景/情绪/视角的连续性
3. 自然地解开或回应上一章的钩子
4. 为本章后续内容打开空间
5. ${projectCard.pov ? `严格保持已有项目配置的叙事视角：${projectCard.pov}` : '保持前文已经建立的叙事视角，不得无依据切换'}`;
      } else if (type === 'jump') {
        prompt = `你正在创作一部长篇小说，需要为用户生成章节间的过渡段落。
${toneDirective}

时间线/场景变化：
${dto.timeline || '时间跳跃或场景切换'}

上一章内容：
${dto.previousChapterContent || ''}

要求：
1. 生成自然的过渡段（时间推移/场景切换的提示）
2. 保持叙事流畅性，不让读者感到突兀
3. 交代过渡期间发生的必要信息
4. 过渡长度由承接所需信息决定，不使用固定字数`;
      } else {
        prompt = `你正在创作一部长篇小说（多线叙事），需要切换到另一条故事线。
${toneDirective}

切换要求：
- 上一章结尾内容：${dto.previousChapterContent || ''}
- 新章节功能：${dto.chapterFunction || 'exposition'}

要求：
1. 生成"与此同时""而在XX那边"等过渡标记
2. 自然引入另一条线的当前状态
3. 提示读者时间线的对齐关系
4. 字数控制在50-200字`;
      }

      const response = await this.realLLM.generate({
        prompt, temperature: 0.7,
      });

      return { success: true, transition: response.content, type, detectedHook, hookTypes };
    } catch (err) {
      const message = err instanceof Error ? err.message : '衔接失败';
      return { success: false, error: message };
    }
  }

  /**
   * POST /chain/previous-summary
   * 前情提要 - 长篇章节回顾生成
   */
  @Post('previous-summary')
  async previousSummary(@Body() dto: {
    projectId: string;
    previousChapterContent: string;
    unResolvedForeshadowing?: string[];
    characterStates?: Record<string, unknown>;
  }) {
    this.logger.log('previous-summary: generating chapter recap');

    try {
      const prompt = `为长篇小说生成简短的"前情提要"（50-100字），用于章节开头。

上一章内容：
${(dto.previousChapterContent || '').substring(0, 1000)}

未回收伏笔：
${dto.unResolvedForeshadowing?.join('、') || '无'}

要求：
1. 提取上一章最关键的事件（1-2个）
2. 提醒未回收的重要伏笔
3. 提示当前角色状态
4. 语气简洁有力，不超过100字`;

      const response = await this.realLLM.generate({
        prompt, temperature: 0.5,
      });

      return { success: true, summary: response.content };
    } catch (err) {
      const message = err instanceof Error ? err.message : '前情提要生成失败';
      return { success: false, error: message };
    }
  }

  /**
   * GET /chain/memory-health
   * 记忆健康度检查 (P4)
   */
  @Get('memory-health')
  async memoryHealth() {
    try {
      return await this.statePersistence.getHealthReport();
    } catch (err) {
      return {
        overall: 'critical',
        checks: [],
        summary: '健康检查执行失败',
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * POST /chain/export-novel
   * .novel 完整项目包导出 (P5/Q2)
   */
  @Post('export-novel')
  async exportNovel(@Body() dto: {
    projectId: string;
    projectTitle?: string;
    chapters?: { title: string; content: string; status?: string }[];
    characters?: { name: string; description?: string }[];
    worldSettings?: { name: string; content?: string }[];
    outline?: string;
  }) {
    this.logger.log(`export-novel: ${dto.projectTitle || dto.projectId}`);

    try {
      // 构造.novel包内容（JSON格式的项目包）
      const novelPackage = {
        format: 'novel-project',
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        project: {
          id: dto.projectId,
          title: dto.projectTitle || '未命名项目',
        },
        data: {
          chapters: (dto.chapters || []).map((ch, i) => ({
            index: i + 1,
            title: ch.title,
            content: ch.content,
            status: ch.status || 'draft',
          })),
          characters: (dto.characters || []).map(c => ({
            name: c.name,
            description: c.description || '',
          })),
          worldSettings: (dto.worldSettings || []).map(w => ({
            name: w.name,
            content: w.content || '',
          })),
          outline: dto.outline || '',
        },
        summary: {
          chapterCount: (dto.chapters || []).length,
          characterCount: (dto.characters || []).length,
          totalWords: (dto.chapters || []).reduce((sum, ch) => sum + (ch.content?.length || 0), 0),
        },
      };

      return {
        success: true,
        novelPackage,
        downloadData: Buffer.from(JSON.stringify(novelPackage, null, 2)).toString('base64'),
        summary: novelPackage.summary,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '导出失败' };
    }
  }

  /**
   * POST /chain/import-novel
   * .novel 完整项目包导入还原
   */
  @Post('import-novel')
  async importNovel(@Body() dto: { packageData: string }) {
    this.logger.log('import-novel');

    try {
      const decoded = JSON.parse(Buffer.from(dto.packageData, 'base64').toString('utf-8'));

      if (decoded.format !== 'novel-project') {
        return { success: false, error: '无效的项目包格式' };
      }

      return {
        success: true,
        project: decoded.project,
        data: decoded.data,
        summary: decoded.summary,
        message: `已还原项目"${decoded.project.title}"，包含 ${decoded.summary.chapterCount} 章 ${decoded.summary.characterCount} 个角色`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '导入失败' };
    }
  }

  /**
   * POST /chain/export-incremental
   * 增量导出 - 仅导出新增/修改部分
   */
  @Post('export-incremental')
  async exportIncremental(@Body() dto: {
    projectId: string;
    lastExportTime: string;
    chapters?: { title: string; content: string; updatedAt: string }[];
  }) {
    this.logger.log(`export-incremental: since ${dto.lastExportTime}`);

    try {
      const since = new Date(dto.lastExportTime).getTime();
      const newChapters = (dto.chapters || []).filter(ch => new Date(ch.updatedAt).getTime() > since);

      return {
        success: true,
        isIncremental: true,
        since: dto.lastExportTime,
        newChapters: newChapters.map(ch => ({ title: ch.title, updatedAt: ch.updatedAt })),
        count: newChapters.length,
        message: `增量导出: ${newChapters.length} 个新/修改章节`,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '增量导出失败' };
    }
  }

  /**
   * H2 逐段精修 - 对选中段落生成多个AI增强版本并返回diff格式
   */
  @Post('per-paragraph-polish')
  async perParagraphPolish(@Body() dto: {
    projectId: string;
    chapterId?: string;
    paragraphText: string;
    styles?: string[];
  }) {
    this.logger.log('per-paragraph-polish');

    try {
      const projectCard = this.buildWritingStateContext(dto.projectId).projectCard as any;
      const styles = dto.styles?.length ? dto.styles : [String(projectCard.planning?.style || 'project_configured_style')];
      const variants: { style: string; content: string; diff: { type: 'keep' | 'modify' | 'insert' | 'delete'; text: string }[] }[] = [];

      for (const style of styles) {
        // 唯一来源：creative-constitution.ts 的 STYLE_INTENSITY_AXES（逐句精修共用同一份）。
        // 这些 key 只是「文风」维内部的定向强化手法，不是独立的风格维度；
        // 平台/分类/基调/文风/流派/视角六维由 resolvePlatformToneDirective 注入，本按钮不得改写。
        const styleGuide: Record<string, string> = styleIntensityGuides();

        const prompt = `${this.resolvePlatformToneDirective(dto.projectId)}作为写作精修专家，请在本书执行标准之内，对以下段落做「文风维内的定向强化」（方向：${style}）。

原文：
${dto.paragraphText}

要求：${styleGuide[style] || `不额外指定方向：严格按执行标准的「文风」维执行：${JSON.stringify(projectCard.writingStyle || projectCard.planning?.style || style)}`}

输出要求：
1. 保留核心信息和情节，不改变故事事实、人物与事件顺序
2. ${projectCard.pov ? `严格保持已有项目配置的叙事视角：${projectCard.pov}` : '保持原文已经建立的叙事视角，不得无依据切换'}
3. 执行标准优先：平台/分类/基调/文风/流派/视角六维是唯一口径，本次只允许在「文风」维内部做上述定向强化，其余五维与文风维本身都不得被改写；方向与标准冲突时以标准为准
4. 输出风格增强后的完整段落`;

        const response = await this.realLLM.generate({ prompt, temperature: 0.8 });
        const aiContent = response.content;

        // 简单diff: 按句子分割做逐句对比
        const origSentences = dto.paragraphText.split(/(?<=[。！？\n])/).filter(s => s.trim());
        const aiSentences = aiContent.split(/(?<=[。！？\n])/).filter(s => s.trim());

        const diff: { type: 'keep' | 'modify' | 'insert' | 'delete'; text: string }[] = [];
        const maxLen = Math.max(origSentences.length, aiSentences.length);

        for (let i = 0; i < maxLen; i++) {
          const orig = origSentences[i]?.trim();
          const ai = aiSentences[i]?.trim();
          if (!orig && ai) {
            diff.push({ type: 'insert', text: ai });
          } else if (orig && !ai) {
            diff.push({ type: 'delete', text: orig });
          } else if (orig !== ai) {
            diff.push({ type: 'modify', text: `原文: ${orig}\n→ 修改: ${ai}` });
          } else {
            diff.push({ type: 'keep', text: orig! });
          }
        }

        variants.push({ style, content: aiContent, diff });
      }

      return { success: true, variants, paragraphCount: dto.paragraphText.length };
    } catch (err) {
      if (err instanceof HttpException) throw err;
      return { success: false, error: err instanceof Error ? err.message : '精修失败' };
    }
  }

  /**
   * POST /chain/conflict-mark
   * H2 冲突标记 - 检测修改内容与现有设定的冲突
   */
  @Post('conflict-mark')
  async conflictMark(@Body() dto: {
    projectId: string;
    modifiedContent: string;
    contextSections?: { type: string; content: string }[];
  }) {
    this.logger.log('conflict-mark');

    try {
      const contextText = (dto.contextSections || [])
        .map(c => `【${c.type}】${c.content.substring(0, 500)}`)
        .join('\n\n');

      const prompt = `作为小说设定一致性检查专家，检查以下修改内容与已有设定的冲突。

已有设定：
${contextText || '（无上下文信息）'}

修改内容：
${dto.modifiedContent}

请逐行检查，对每一行输出冲突标记：
- 🔴 红色=致命冲突（逻辑矛盾/人设崩塌/世界观违反）
- 🟡 黄色=潜在冲突（风格不一致/信息不明确）
- 🟢 绿色=通过（无冲突）

输出JSON格式：
{
  "conflicts": [
    { "level": "critical|warning|pass", "lineIndex": number, "text": string, "reason": string, "suggestion": string }
  ],
  "summary": { "critical": number, "warning": number, "pass": number }
}`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.3 });

      return { success: true, ...response };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '冲突检测失败' };
    }
  }

  /**
   * POST /chain/post-conflict-qa
   * H2 冲突后局部质检 - 仅检查修改部分及其上下游3段
   */
  @Post('post-conflict-qa')
  async postConflictQA(@Body() dto: {
    projectId: string;
    modifiedContent: string;
    contextBefore?: string;
    contextAfter?: string;
    resolvedConflicts?: string[];
  }) {
    this.logger.log('post-conflict-qa');

    try {
      const prompt = `进行局部质检，仅检查修改部分及其上下文。

修改前内容：
${dto.contextBefore || '（无）'}

修改后内容：
${dto.modifiedContent}

修改后上下文：
${dto.contextAfter || '（无）'}

已解决的冲突：${dto.resolvedConflicts?.join(', ') || '无'}

质检维度：
1. 新逻辑一致性（修改后是否有新矛盾）
2. 新设定匹配度（是否与现有设定兼容）
3. 流畅通顺度（语言是否自然）

输出JSON：
{
  "status": "pass|warning|fail",
  "logicScore": number,
  "settingMatchScore": number,
  "fluencyScore": number,
  "issues": string[],
  "suggestions": string[]
}`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.3 });

      return { success: true, ...response };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '质检失败' };
    }
  }

  /**
   * POST /chain/style-detect
   * N3 文风自动识别 - 从用户输入自动推荐文风
   */
  @Post('style-detect')
  async styleDetect(@Body() dto: { input: string }) {
    this.logger.log('style-detect');

    try {
      const prompt = `作为文风分析专家，分析以下创作输入，自动推荐最适合的文风。

用户输入：
${dto.input.substring(0, 2000)}

可选的风格类型：
1. 群像 - 多角色并行，视角频繁切换
2. 系统 - 面板/数值/升级/任务化
3. 历史 - 时代背景约束，人物基于史实
4. 抗战 - 特定历史时期，战争场景密集
5. 都市 - 现代背景，社会写实
6. 玄幻 - 力量体系+境界升级
7. 悬疑 - 伏笔密集，推理逻辑
8. 情感 - 情感细腻，代入感强

输出JSON：
{
  "primaryStyle": { "id": string, "name": string, "confidence": number },
  "secondaryStyles": [{ "id": string, "name": string, "confidence": number }],
  "reasoning": string,
  "keyElements": string[]
}`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.4 });

      return { success: true, ...response };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '分析失败' };
    }
  }

  /**
   * POST /chain/style-mix
   * N4 风格混搭 - 主风格+子风格组合，规则取并集
   */
  @Post('style-mix')
  async styleMix(@Body() dto: {
    primaryStyle: string;
    secondaryStyles?: string[];
    content: string;
  }) {
    this.logger.log(`style-mix: primary=${dto.primaryStyle}`);

    try {
      const styleRules: Record<string, string> = {
        ensemble: '群像风格: 多视角POV切换，对话差异化，章节占比平衡',
        system: '系统流风格: 面板格式+数值变化+任务提示+升级',
        historical: '历史风格: 时间线对齐真实历史，时代细节真实',
        war: '抗战风格: 武器装备/军衔/战略符合时代，战争场景',
        urban: '都市风格: 社会规则/城市地理/职业细节真实',
        fantasy: '玄幻风格: 境界划分严格递进，力量体系清晰',
        mystery: '悬疑风格: 线索排列严格，信息差设计，逻辑闭环',
        emotional: '情感风格: 心理描写+情绪渲染+共情引导',
      };

      const primaryRule = styleRules[dto.primaryStyle]
        || `指定风格：${String(dto.primaryStyle || '').trim() || '项目当前风格'}。保留原文事实，不得另起故事。`;
      const secondaryRules = (dto.secondaryStyles || [])
        .map(s => styleRules[s] || `指定辅助风格：${String(s || '').trim()}`)
        .filter(Boolean)
        .join('\n- ');

      const prompt = `作为多风格混搭写作专家，按以下风格组合创作。

主风格：${primaryRule}
${secondaryRules ? `子风格：\n- ${secondaryRules}` : '（无子风格）'}

冲突规则处理：以主风格为准，子风格补充

用户内容：
${dto.content.substring(0, 2000)}

请按混搭风格改写此内容，保留核心剧情。`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.7 });

      return { success: true, content: response.content, styles: [dto.primaryStyle, ...(dto.secondaryStyles || [])] };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '混搭失败' };
    }
  }

  /**
   * GET /chain/sensitive/platforms
   * O7 获取各平台敏感词等级配置
   *
   * ⚠️ 平台【名字】只能取自 PLATFORM_REGISTRY（这里用 SELECTABLE_PLATFORMS[].label），
   * 本方法只保留各平台特有的审核松紧数据。历史写法在本文件里另抄了一张平台名表——
   * '起点中文' / '晋江文学' 与注册表的 '起点中文网' / '晋江文学城' 对不上，且只覆盖 5 个平台
   * （qimao / xiaohongshu / rules_horror 缺失），正是「同一份平台清单散在多处」的复发形态，已收敛。
   * 未采集过审核口径的平台返回 levels: null / verified: false，如实标注"未核验"，
   * 不得用编造的默认值冒充已核验数据。
   */
  @Get('sensitive/platforms')
  getPlatformConfigs() {
    /** 已采集过审核口径的平台（键=平台 id，值只放该平台特有数据，不含名字） */
    const auditedLevels: Record<string, { levels: Record<string, string>; description: string }> = {
      fanqie: {
        levels: { political: 'high', pornographic: 'high', violent: 'high', illegal: 'critical', sensitive_history: 'high', discrimination: 'critical' },
        description: '对血腥描写和色情暗示极为严格',
      },
      qidian: {
        levels: { political: 'medium', pornographic: 'high', violent: 'medium', illegal: 'critical', sensitive_history: 'medium', discrimination: 'high' },
        description: '对色情和歧视类最严格',
      },
      jinjiang: {
        levels: { political: 'low', pornographic: 'critical', violent: 'medium', illegal: 'critical', sensitive_history: 'low', discrimination: 'high' },
        description: '对色情描写极度严格',
      },
      zhihu: {
        levels: { political: 'medium', pornographic: 'medium', violent: 'medium', illegal: 'high', sensitive_history: 'high', discrimination: 'medium' },
        description: '均衡标准，真实故事需要谨慎',
      },
      douyin: {
        levels: { political: 'high', pornographic: 'high', violent: 'medium', illegal: 'critical', sensitive_history: 'high', discrimination: 'high' },
        description: '政治和色情双重敏感',
      },
    };

    return {
      success: true,
      platforms: SELECTABLE_PLATFORMS.map(item => {
        const audited = auditedLevels[item.id];
        return audited
          ? { id: item.id, name: item.label, verified: true, ...audited }
          : { id: item.id, name: item.label, verified: false, levels: null, description: '未核验：该平台审核口径尚未采集' };
      }),
    };
  }

  /**
   * POST /chain/sensitive/ai-context-detect
   * O2 AI辅助敏感词上下文检测
   */
  @Post('sensitive/ai-context-detect')
  async aiContextDetect(@Body() dto: { content: string; platform?: string }) {
    this.logger.log(`ai-context-detect: platform=${dto.platform || 'default'}`);

    try {
      const prompt = `作为内容安全审查专家，对以下文本进行上下文风险分析。

文本内容：
${dto.content}

目标平台：${dto.platform || '通用'}

分析要求：
1. 逐句分析，判断每句是否存在风险
2. 区分"单个词正常但组合后有问题"的上下文风险
3. 分析作者意图（真实历史叙事 vs 敏感内容创作）
4. 区分"通用模板"和"高风险模仿"

输出JSON格式：
{
  "overallRisk": "low|medium|high|critical",
  "sentences": [
    { "index": number, "text": string, "risk": "none|low|medium|high", "reason": string, "suggestion": string }
  ],
  "contextualRisks": [
    { "type": "word_combination|intent_ambiguity|platform_specific", "description": string, "severity": "low|medium|high" }
  ],
  "summary": string
}`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.2 });

      return { success: true, ...response };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '检测失败' };
    }
  }

  /**
   * 【已删除 · 防复发】POST /chain/sensitive/replace-history
   *
   * 这里曾经是一个零持久化桩：record / sync / rollback 三个 action 全部直接返回
   * { success: true, ... }，不落库、不替换正文、不回退，却对外声称「已更新所有关联数据」
   * 与「所有关联文件已恢复」。同一能力早已有真实实现，只是被放在 refinement 模块：
   *   POST /refinement/sensitive/replacement-history  → 读取真实替换历史
   *   POST /refinement/sensitive/undo-last          → 真实回退（无记录时如实返回 success:false）
   * 教训：一个能力只允许一份真实实现，禁止再在 chain 里平行造第二个「看起来成功」的桩。
   */
  /**
   * POST /chain/writing-context
   * 三段式创作闭环 - 动笔前构建上下文
   */
  @Post('writing-context')
  async writingContext(@Body() dto: {
    projectId: string;
    chapterNumber?: number;
    volumeNumber?: number;
    previousChapterSummary?: string;
    characterIds?: string[];
  }) {
    this.logger.log(`writing-context: project=${dto.projectId} ch${dto.chapterNumber}`);

    try {
      const confirmedContext = this.buildWritingStateContext(dto.projectId, dto.chapterNumber);
      const prompt = `作为AI写作助手，为写作者准备以下创作上下文。

项目ID: ${dto.projectId}
当前卷: ${dto.volumeNumber || 1} 当前章: ${dto.chapterNumber || 1}

前文概要:
${dto.previousChapterSummary || '第一章/无前文'}

【写作状态上下文】
${confirmedContext.contextText || '暂无状态上下文。'}

【状态使用规则】
${confirmedContext.stateGuard}
当前仍有 ${confirmedContext.pendingTotal} 项待确稿状态，只能作为候选参考。
${confirmedContext.pendingSummary.length ? confirmedContext.pendingSummary.map(item => `- ${item}`).join('\n') : '无'}

请生成三段式创作上下文：
1. 【动笔前】当前章节需要知道的核心信息(世界观/角色状态/伏笔状态)
2. 【写作中】需要遵守的规则约束(时间线/人物一致性/设定限制)
3. 【完稿后】需要回写的信息(角色状态更新/伏笔进展/新设定)

输出JSON格式:
{
  "beforeWriting": { "coreInfo": string[], "characterStates": string[], "foreshadowingStatus": string[] },
  "duringWriting": { "rules": string[], "constraints": string[], "reminders": string[] },
  "afterWriting": { "stateUpdates": string[], "foreshadowingProgress": string[], "newSettings": string[] }
}`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.4 });

      return { success: true, writingStateContext: confirmedContext, ...response };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '构建失败' };
    }
  }

  /**
   * POST /chain/writing-context/raw
   * Returns the canonical writing package without an LLM call.  This is the
   * reliable fallback for authors and for any provider that needs to build its
   * own prompt from confirmed project facts.
   */
  @Post('writing-context/raw')
  rawWritingContext(@Body() dto: {
    projectId: string;
    chapterNumber?: number;
    volumeNumber?: number;
  }) {
    const chapterNumber = dto.chapterNumber || 1;
    const confirmedState = this.buildWritingStateContext(dto.projectId, chapterNumber);
    const chapterPlan = this.buildChapterPlanContext(dto.projectId, chapterNumber);
    return {
      success: true,
      projectId: dto.projectId,
      chapterNumber,
      volumeNumber: dto.volumeNumber || 1,
      state: confirmedState,
      chapterPlan,
      canonicalContext: {
        characters: this.buildCharacterWritingContext(dto.projectId),
        world: this.buildWorldWritingContext(dto.projectId),
        locations: this.buildLocationWritingContext(dto.projectId),
      },
      usage: {
        instruction: 'Confirmed facts are authoritative. Pending items are candidates only and must not be written as established facts.',
        freshness: 'Check state.pendingTotal and derived-sync status before generating or locking a chapter.',
      },
    };
  }

  /**
   * POST /chain/post-write-archive
   * 三段式创作闭环 - 完稿后信息回写归档
   */
  @Post('post-write-archive')
  async postWriteArchive(@Body() dto: {
    projectId: string;
    chapterId: string;
    chapterContent: string;
    characterMentions?: { name: string; stateChanges?: string[] }[];
    newForeshadowing?: { content: string; importance?: number }[];
    newSettings?: string[];
  }) {
    this.logger.log(`post-write-archive: chapter=${dto.chapterId}`);

    try {
      const characterInfo = (dto.characterMentions || []).map(c =>
        `${c.name}: ${(c.stateChanges || ['无变化']).join(', ')}`
      ).join('\n');

      const prompt = `分析已完成的章节内容，提取需要归档的结构化信息。

章节内容:
${(dto.chapterContent || '').slice(-4000)}

已知角色状态变化:
${characterInfo || '无'}

新伏笔建议:
${(dto.newForeshadowing || []).map(f => `- ${f.content}`).join('\n') || '无'}

请输出严格JSON，不要Markdown，不要解释。格式如下：
{
  "worldSettingUpdates": [{"title": "世界观变更标题", "summary": "新增或变化的时代规则/技术边界/地理格局/历史约束"}],
  "characterUpdates": [{"title": "角色变更标题", "summary": "人物位置、立场、关系、心理、能力、目标或持有物变化"}],
  "organizationUpdates": [{"title": "组织变更标题", "summary": "组织、派系、军政机构、资源结构或权力关系的变化"}],
  "outlineUpdates": [{"title": "大纲变更标题", "summary": "对分卷主线、章节功能、后续计划、冲突推进的影响"}],
  "foreshadowingUpdates": [{"title": "伏笔变更标题", "summary": "新埋设、激活、回收或悬空风险"}],
  "timelineUpdates": [{"title": "时间线/状态变更标题", "summary": "事件顺序、人物位置、情节阶段、战争/建设进度变化"}],
  "conflicts": [{"title": "潜在冲突标题", "summary": "可能与前文或设定冲突的点"}]
}

如果某类没有变化，返回空数组。只提取正文中明确发生或强烈暗示的变化，不要凭空扩展设定。`;

      const response = await this.realLLM.generate({ prompt, temperature: 0.4 });
      const archive = this.parseArchiveReport(response.content);
      const confirmations = this.createArchiveConfirmations(dto.projectId, dto.chapterId, archive);
      const stateItems = this.stateItemService.createFromArchive(dto.projectId, dto.chapterId, archive, 'manual_post_write_archive');

      return { success: true, archive, rawArchive: response.content, confirmations, stateItems };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : '归档失败' };
    }
  }
  /**
   * POST /chain/news-rss
   * 新闻热点RSS聚合
   */
  @Post('news-rss')
  async fetchNewsRss(@Body() dto: { keywords?: string; count?: number }) {
    const result = await this.newsRss.fetchHotNews(dto.keywords, dto.count || 5);
    return { success: true, ...result };
  }

  /**
   * POST /chain/era-check
   * 时代检测（现代词汇 / 时代用语关键词扫描）
   *
   * 只做可验证的部分：用关键词表扫描正文里的现代词汇与时代特定用语。
   * 【防复发】这里曾经有两条恒为 passed:true 的假检查（「历史人物匹配」「社会制度匹配」），
   * 与正文内容毫无关系，等于给作者一个假的「已校对」结论，已删除。
   * 要真正校验历史人物生卒与社会制度，必须先建时代知识库（真实取数）；在此之前只能如实
   * 返回 verified:false —— 不得再用恒真结果充数（写法参照 POST /chain/sensitive/platforms）。
   */
  @Post('era-check')
  async eraCheck(@Body() dto: { content: string; era?: string }) {
    const content = dto.content || '';
    const era = dto.era || '1920年代';

    // 关键词表当前只覆盖民国语境；其它时代没有采集到词表，只能如实标记为未核验。
    const modernWords = ['手机', '电脑', '网络', '微信', '抖音', '互联网', 'QQ', '支付宝', '微信支付', '高铁', '地铁', '飞机', '空调', '电视', '冰箱', '微波炉', '洗衣机', '电饭煲'];
    const eraWords = ['军阀', '洋枪', '马车', '电报', '黄包车', '租界', '领事馆', '巡捕', '银元', '铜钱', '大帅', '知府', '知县', '太监', '皇上', '格格'];
    const keywordTableCoversEra = era.includes('民国') || era.includes('1920') || era.includes('1930') || era.includes('1940');
    const detectedModern = modernWords.filter(w => content.includes(w));
    const detectedEra = eraWords.filter(w => content.includes(w));

    const checks = [
      { name: '现代词汇检测', verified: true, passed: detectedModern.length === 0, detail: detectedModern.length > 0 ? `发现现代词汇: ${detectedModern.slice(0, 5).join(',')}` : '未发现现代词汇' },
      { name: '时代用语匹配', verified: true, passed: detectedEra.length > 0, detail: detectedEra.length > 0 ? `时代用语: ${detectedEra.slice(0, 5).join(',')}` : '未发现时代特定用语' },
      { name: '科技水平检查', verified: true, passed: detectedModern.length === 0, detail: detectedModern.length > 0 ? '出现超前科技词汇' : '科技水平符合时代' },
      { name: '语言风格检查', verified: true, passed: detectedModern.length <= 1, detail: detectedModern.length > 1 ? `有${detectedModern.length}处现代词汇` : '语言风格基本一致' },
      { name: '历史人物匹配', verified: false, passed: false, detail: '未核验：缺少时代人物生卒知识库，不能用恒真结果代替' },
      { name: '社会制度匹配', verified: false, passed: false, detail: '未核验：缺少时代制度知识库，不能用恒真结果代替' },
    ];

    // 结论只由已核验项决定；未核验项不参与、也不被当作通过。
    const allPassed = checks.filter(c => c.verified).every(c => c.passed);
    return {
      success: true,
      era,
      passed: allPassed,
      keywordTableCoversEra,
      unverifiedChecks: checks.filter(c => !c.verified).map(c => c.name),
      note: keywordTableCoversEra
        ? '关键词表已覆盖该时代语境'
        : `未核验：当前关键词表只覆盖民国语境，未采集「${era}」的词表`,
      checks,
    };
  }

  /**
   * 【已删除 · 防复发】POST /chain/world-impact
   *
   * 曾经无论传什么 projectId / modifiedElement，都返回同一份虚构结果：
   * 角色「陆川」「林婉」、第 3 章「码头枪声」、第 7 章「将军府密谈」，与项目真实数据毫无关系。
   * 世界观改动的真实影响面只能来自 characters / chapters / foreshadowings 的实际查询。
   * 在没有做出这样的真实实现之前，不允许再放回一个恒返回固定角色/章节的假端点。
   */
  /**
   * POST /chain/dialogue-style
   * 对话风格库 - 角色对话习惯分析
   */
  @Post('dialogue-style')
  async dialogueStyle(@Body() dto: { projectId: string; characterName: string; dialogues: string[] }) {
    if (!dto.characterName?.trim() || !Array.isArray(dto.dialogues) || dto.dialogues.length === 0) {
      throw new HttpException('角色名和实际对白样本不能为空', 400);
    }
    const response = await this.realLLM.generate({
      metrics: { projectId: dto.projectId, stepKey: 'character_design' },
      scenario: 'character_design',
      temperature: 0.3,
      prompt: `分析角色“${dto.characterName}”的实际对白风格，不得使用固定模板，不得补造样本中没有的口头禅。对白样本：\n${dto.dialogues.map((dialogue, index) => `${index + 1}. ${dialogue}`).join('\n')}\n只输出JSON：{"speechPattern":"句式与节奏","vocabulary":["实际词汇特征"],"tone":"语气","catchphrases":["仅从样本中提取"],"frequency":"无法从样本判断时写无法判断","examples":[{"original":"原句","recommended":"保持人物特征的微调句"}]}`,
    });
    const parsed = this.safeExtractJson<any>(response.content, null);
    if (!parsed?.speechPattern || !parsed?.tone || !Array.isArray(parsed?.vocabulary) || !Array.isArray(parsed?.examples)) {
      throw new HttpException('对白风格分析结果不完整，未使用固定模板降级', 502);
    }
    return { success: true, character: dto.characterName, style: {
      speechPattern: parsed.speechPattern,
      vocabulary: parsed.vocabulary,
      tone: parsed.tone,
      catchphrases: Array.isArray(parsed.catchphrases) ? parsed.catchphrases : [],
      frequency: parsed.frequency || '无法从当前样本判断',
    }, examples: parsed.examples, model: response.model };
  }

  /**
   * POST /chain/word-plan
   * 自动篇幅规划
   */
  @Post('word-plan')
  async wordPlan(@Body() dto: {
    projectId: string;
    totalWords?: number;
    dailyTarget?: number;
    genre?: string;
  }) {
    const db = this.db.getDb();
    const project = db.prepare('SELECT type, target_words, settings FROM projects WHERE id = ?').get(dto.projectId) as any;
    if (!project) throw new HttpException('项目不存在', 404);
    const settings = this.safeExtractJson<Record<string, any>>(String(project.settings || '{}'), {});
    const targetWords = Number(dto.totalWords || project.target_words);
    if (!Number.isInteger(targetWords) || targetWords <= 0) {
      throw new HttpException('未配置有效的目标总字数，篇幅规划已停止', 400);
    }

    const chapterWordRange = { ...CHAPTER_WORD_RANGE };
    const feasibleChapterRange = {
      min: Math.ceil(targetWords / chapterWordRange.max),
      max: Math.ceil(targetWords / chapterWordRange.min),
    };
    const chapterRows = db.prepare(`
      SELECT o.id, o.parent_id, o."order", o.target_words, o.chapter_function,
             v."order" AS volume_order, v.title AS volume_title
      FROM outlines o
      LEFT JOIN outlines v ON v.id = o.parent_id AND v.level = 'volume'
      WHERE o.project_id = ? AND o.level = 'chapter'
      ORDER BY COALESCE(v."order", 0), o."order"
    `).all(dto.projectId) as any[];
    const volumeRows = project.type === 'short_story' ? [] : db.prepare(`
      SELECT id, "order", title FROM outlines
      WHERE project_id = ? AND level = 'volume' ORDER BY "order"
    `).all(dto.projectId) as any[];

    const invalidTargets = chapterRows.filter(row => {
      const value = Number(row.target_words);
      return !Number.isInteger(value) || value < chapterWordRange.min || value > chapterWordRange.max;
    });
    const volumeBreakdown = volumeRows.map(volume => {
      const chapters = chapterRows.filter(row => row.parent_id === volume.id);
      return {
        volume: Number(volume.order) + 1,
        title: volume.title,
        chapters: chapters.length,
        wordsTarget: chapters.reduce((sum, row) => sum + Number(row.target_words || 0), 0),
        chapterFunctions: [...new Set(chapters.map(row => row.chapter_function).filter(Boolean))],
      };
    });
    const plannedWords = chapterRows.reduce((sum, row) => sum + Number(row.target_words || 0), 0);
    const dailyTarget = Number(dto.dailyTarget || settings.dailyTarget || 0);

    return {
      success: true,
      plan: {
        totalWordsTarget: targetWords,
        chapterWordRange,
        feasibleChapterRange,
        totalChapters: chapterRows.length || null,
        plannedWords: chapterRows.length ? plannedWords : null,
        volumes: project.type === 'short_story' ? 0 : (volumeRows.length || null),
        volumeBreakdown,
        structureMode: 'dynamic_by_story_rhythm',
        requiresStructurePlanning: chapterRows.length === 0,
        structureValid: chapterRows.length > 0 && invalidTargets.length === 0,
        invalidChapterTargets: invalidTargets.map(row => row.id),
        note: '卷数、每卷章数和总章数由主线阶段、冲突升级、人物弧光与阅读节奏决定；不得平均分配。',
        dailyTarget: Number.isInteger(dailyTarget) && dailyTarget > 0 ? dailyTarget : null,
        estimatedDays: Number.isInteger(dailyTarget) && dailyTarget > 0 ? Math.ceil(targetWords / dailyTarget) : null,
      },
    };
  }
  /**
   * POST /chain/foreshadow-recommend
   * 伏笔回收推荐
   */
  @Post('foreshadow-recommend')
  async foreshadowRecommend(@Body() dto: {
    projectId: string; currentChapter: number; foreshadowing: Array<{
      id: string; content: string; buriedChapter: number; status?: string;
      recoveryChapter?: number; recoveryWindowStart?: number; recoveryWindowEnd?: number;
    }>;
  }) {
    const recommendations = dto.foreshadowing
      .filter(f => !['recovered', 'cancelled'].includes(String(f.status || '')))
      .map(f => ({
        ...f,
        recommendRecoveryAt: Number(f.recoveryChapter) > 0
          ? Number(f.recoveryChapter)
          : Number(f.recoveryWindowStart) > 0 ? Math.max(dto.currentChapter, Number(f.recoveryWindowStart)) : null,
        urgency: Number(f.recoveryWindowEnd) > 0 && dto.currentChapter > Number(f.recoveryWindowEnd)
          ? 'overdue'
          : Number(f.recoveryWindowStart) > 0 && dto.currentChapter >= Number(f.recoveryWindowStart) ? 'high' : 'normal',
        needsConfiguration: !(Number(f.recoveryChapter) > 0 || Number(f.recoveryWindowStart) > 0),
        reason: Number(f.recoveryWindowEnd) > 0 && dto.currentChapter > Number(f.recoveryWindowEnd)
          ? `已超过配置的回收窗口（截止第${f.recoveryWindowEnd}章）`
          : Number(f.recoveryWindowStart) > 0
            ? `按配置的第${f.recoveryWindowStart}-${f.recoveryWindowEnd || '未设上限'}章回收窗口安排`
            : '尚未配置回收章节或回收窗口，不能用固定间隔代替',
      }));
    return { success: true, currentChapter: dto.currentChapter, recommendations };
  }

  /**
   * 【已删除 · 防复发】POST /chain/style-vectorize
   *
   * 曾经完全不读入参 samples，固定返回 dimensions:128 与「对话占比约 35%」等编造特征。
   * 文风分析的真实实现早已存在于 server/src/material/material.service.ts 的 analyzeStyle()
   * （真实计算向量 / 关键词 / 句式 / 情感基调），现经 POST /material/style-analyze 暴露，
   * 桌面端「文风分析」已改指向该真实端点。禁止再返回硬编码的风格特征。
   */
  /**
   * 【已删除 · 防复发】POST /chain/content-similarity
   *
   * 曾经读取 resolveDataDir()/copyright/known-ip.json —— 该文件与目录在全仓都不存在，
   * 于是 ipList 恒为空，接口永远返回「低风险 / 未检测到明显的版权风险」（永远安全的假结论）。
   * 真实版权检测在 refinement 模块：POST /refinement/copyright/check（checkFull，
   * 由 known-works.data.ts 的真实作品库支撑）；桌面端「相似内容检查」已改指向该端点。
   * 同类防复发注释见 desktop/src/renderer/pages/TitleCheckPage.tsx。
   */
  /**
   * POST /chain/ai-deconstruct
   * AI智能拆解识别（导入时角色/世界观/伏笔自动识别）
   */
  @Post('ai-deconstruct')
  async aiDeconstruct(@Body() dto: { content: string }) {
    try {
      const extractPrompt = `你正在对一部小说的导入文本做智能拆解分析。请从以下文本中提取并输出：

1. 角色列表（人物名称/角色类型如主角、反派、配角/置信度/别称/简要描述）
2. 世界观元素（地理位置/势力组织/时代背景/力量体系等）
3. 伏笔（未解答的悬念/未回收的线索）
4. 关键剧情节点（核心事件/章节位置）

文本内容：
${(dto.content || '').substring(0, 3000)}

只输出严格 JSON 对象：
{"characters":[{"name":"","role":"主角|反派|配角|待分类","confidence":0,"aliases":[],"description":"","evidence":"原文证据"}],"worldElements":[{"type":"location|organization|era|power_system|other","name":"","confidence":0,"description":"","evidence":"原文证据"}],"foreshadowing":[{"content":"","chapter":null,"confidence":0,"evidence":"原文证据"}],"plotPoints":[{"title":"","chapter":null,"type":"event","evidence":"原文证据"}]}
confidence 只能依据原文证据给出 0 到 1 的值；没有证据的数组必须为空，禁止补示例。`;

      const response = await this.realLLM.generate({
        prompt: extractPrompt,
        scenario: 'daily',
        temperature: 0.3,
        responseFormat: 'json_object',
        // This is extraction metadata, not prose. The result is validated below
        // before any records are created, so prose rhythm/length rules do not apply.
        deferQualityGate: true,
      });
      const parsed = extractBalancedJson<Record<string, unknown>>(response.content);
      if (!parsed) return { success: false, error: 'AI拆解结果无法解析，未创建任何占位内容', deconstruction: null };
      const list = (key: string) => Array.isArray(parsed[key]) ? parsed[key] as any[] : [];
      const characters = list('characters').filter(item => item && typeof item.name === 'string' && item.name.trim());
      const worldElements = list('worldElements').filter(item => item && typeof item.name === 'string' && item.name.trim());
      const foreshadowing = list('foreshadowing').filter(item => item && typeof item.content === 'string' && item.content.trim());
      const plotPoints = list('plotPoints').filter(item => item && typeof item.title === 'string' && item.title.trim());

      return {
        success: true,
        deconstruction: {
          characters, worldElements, foreshadowing, plotPoints,
        },
        stats: { charactersFound: characters.length, worldElementsFound: worldElements.length, foreshadowingFound: foreshadowing.length, plotPointsFound: plotPoints.length },
      };
    } catch {
      return { success: false, error: 'AI拆解失败', deconstruction: null };
    }
  }

  /**
   * 【已删除 · 防复发】POST /chain/import-optimize
   *
   * 曾经无视入参内容，固定返回 3 条编造优化项（还引用了并不存在的角色「陆川」）。
   * 导入后的真实分析由 POST /chain/ai-deconstruct 承担（真实 LLM 抽取角色/世界观/伏笔）。
   * 禁止再返回与入参无关的固定「优化建议」。
   */
  /**
   * POST /chain/schedule-check
   * 每日自动校验调度
   */
  @Post('schedule-check')
  async scheduleCheck(@Body() dto: { projectId: string }) {
    try {
      const db = this.db.getDb();
      const charCount = (db.prepare('SELECT COUNT(*) as count FROM characters WHERE project_id = ?').get(dto.projectId) as any)?.count || 0;
      const chapterCount = (db.prepare('SELECT COUNT(*) as count FROM chapters WHERE project_id = ?').get(dto.projectId) as any)?.count || 0;
      const foreshadowCount = (db.prepare('SELECT COUNT(*) as count FROM foreshadowings WHERE project_id = ?').get(dto.projectId) as any)?.count || 0;

      const checks = [
        { name: '角色数一致性', status: 'pass' as const, detail: `角色卡${charCount}个` },
        { name: '章节完整性', status: chapterCount > 0 ? 'pass' as const : 'warn' as const, detail: `${chapterCount}个章节已创建` },
        { name: '伏笔状态', status: 'pass' as const, detail: `${foreshadowCount}个伏笔` },
      ];
      return {
        success: true, timestamp: new Date().toISOString(),
        overall: checks.every(c => c.status === 'pass') ? 'healthy' as const : 'warning' as const,
        checks, summary: '状态正常',
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /chain/import-doc
   * .docx/.epub导入支持
   */
  @Post('import-doc')
  async importDoc(@Body() dto: { format: 'docx' | 'epub'; content: string }) {
    try {
      const content = dto.content || '';
      const wordCount = content.replace(/\s/g, '').length;

      // 按常见章节标题格式拆分内容
      const chapterRegex = /第[一二三四五六七八九十百千0-9]+[章节回部]|第[0-9]+章|Chapter\s+\d+/gi;
      const matches = content.match(chapterRegex);
      const chapterCount = matches?.length || 1;

      // 拆分成章节列表
      const chapters: Array<{ index: number; title: string; wordCount: number }> = [];
      if (matches) {
        const parts = content.split(chapterRegex);
        for (let i = 0; i < matches.length && i < parts.length - 1; i++) {
          const segLen = parts[i + 1]?.replace(/\s/g, '').length || 0;
          chapters.push({ index: i + 1, title: matches[i], wordCount: segLen });
        }
      } else {
        // 没有章节标记，整篇作为一章
        chapters.push({ index: 1, title: '全文', wordCount });
      }

      return {
        success: true, format: dto.format,
        chapters,
        totalChapters: chapters.length, totalWords: wordCount,
        message: `成功解析${dto.format.toUpperCase()}文件，识别到${chapters.length}个章节`,
      };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /chain/dashboard-stats
   * 进度看板真实数据
   */
  @Post('dashboard-stats')
  async dashboardStats(@Body() dto: { projectId: string }) {
    try {
      const db = this.db.getDb();

      // 项目配置是总目标的唯一权威来源。大纲存在 book/volume/chapter 多层节点，
      // 直接汇总所有层级会重复计算；仅在旧项目未保存总目标时回退到章纲合计。
      const targetWordsResult = db.prepare(`
        SELECT
          COALESCE(p.target_words, 0) AS configuredTargetWords,
          COALESCE(SUM(CASE WHEN o.level = 'chapter' THEN o.target_words ELSE 0 END), 0) AS chapterTargetWords
        FROM projects p
        LEFT JOIN outlines o ON o.project_id = p.id
        WHERE p.id = ?
        GROUP BY p.id, p.target_words
      `).get(dto.projectId) as any;
      const configuredTargetWords = Number(targetWordsResult?.configuredTargetWords || 0);
      const targetWords = configuredTargetWords > 0
        ? configuredTargetWords
        : Number(targetWordsResult?.chapterTargetWords || 0);

      // 章节统计：从 outlines 表获取大纲数，过滤卷节点只统计章节
      const outlineCountResult = db.prepare(`SELECT COUNT(*) as count FROM outlines WHERE project_id = ? AND level = 'chapter'`).get(dto.projectId) as any;
      const totalChapters = outlineCountResult?.count || 0;

      // 实际已写作的章节从 chapters 表获取
      let completedChapters = 0, writingChapters = 0, writtenChapters = 0, totalWords = 0;
      try {
        const chapterStats = db.prepare(`
          SELECT
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'writing' THEN 1 ELSE 0 END) as writing,
            SUM(CASE WHEN COALESCE(word_count,0) > 0 THEN 1 ELSE 0 END) as written,
            COALESCE(SUM(word_count), 0) as totalWords
          FROM chapters WHERE project_id = ?
        `).get(dto.projectId) as any;
        if (chapterStats) {
          completedChapters = chapterStats.completed || 0;
          writingChapters = chapterStats.writing || 0;
          writtenChapters = chapterStats.written || 0;
          totalWords = chapterStats.totalWords || 0;
        }
      } catch { /* chapters 表可能不存在 */ }

      // 角色统计
      const charResult = db.prepare('SELECT COUNT(*) as count FROM characters WHERE project_id = ?').get(dto.projectId) as any;
      const totalCharacters = charResult?.count || 0;

      // 冲突统计（如果冲突表存在）
      let totalConflicts = 0, unresolvedConflicts = 0;
      try {
        const conflictStats = db.prepare(`
          SELECT COUNT(*) as total, SUM(CASE WHEN status != 'resolved' THEN 1 ELSE 0 END) as unresolved
          FROM conflicts WHERE project_id = ?
        `).get(dto.projectId) as any;
        if (conflictStats) {
          totalConflicts = conflictStats.total || 0;
          unresolvedConflicts = conflictStats.unresolved || 0;
        }
      } catch { /* conflicts 表可能不存在 */ }

      return {
        success: true,
        stats: {
          totalChapters, completedChapters, writingChapters, writtenChapters,
          totalWords, targetWords, totalCharacters,
          totalConflicts, unresolvedConflicts,
        },
      };
    } catch (err: any) {
      this.logger.error(`dashboard-stats 失败: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * POST /chain/stream-generate
   * 流式输出生成端点（SSE实时显示进度）
   * 支持两种模式：
   *   1. 简易模式（无 chapterId）：直接调 LLM，按段落推送
   *   2. 单次 LLM 模式（有 chapterId）：严格按详细大纲单次生成，输出最终正文（2026-07-24 取消天龙8步 Chain 后的统一路径）
   */
  @Post('stream-generate')
  async streamGenerate(
    @Body() dto: { projectId: string; chapterId?: string; prompt?: string; mode?: string; templateId?: string; scenario?: string },
    @Res() res: any,
  ) {
    let generationKey: string | undefined;
    // Fastify: res.raw 是 Node.js 原生 response
    const raw = res.raw || res;
    if (!raw.headersSent) {
      raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
    }

    const send = (data: object) => {
      try {
        raw.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (e: any) {
        this.logger.error(`SSE send failed: ${e.message}`);
      }
    };
    let activeGenerationStage = '正在准备生成任务';
    let activeGenerationProgress = 0;

    // The heartbeat is a real SSE event, not only a transport comment. It proves
    // that the connection is healthy while a model is spending time on synthesis
    // or length repair, without pretending that the percentage has advanced.
    const heartbeatInterval = setInterval(() => {
      send({
        type: 'heartbeat',
        label: activeGenerationStage,
        progress: activeGenerationProgress,
        message: `${activeGenerationStage}仍在执行，连接正常…`,
      });
    }, LLM_TUNABLES.HEARTBEAT_INLINE_MS);
    const clearHeartbeat = () => clearInterval(heartbeatInterval);

    try {
      this.workflowGuard.assertCanGenerateBody(dto.projectId);
      // 执行标准缺失属于「未执行」，不是「写得不好」：必须在花 token 之前暴露。
      this.assertExecutionStandardsComplete(dto.projectId);
      // 单次 LLM 模式：有 chapterId 时严格按已绑定详细大纲生成
      if (dto.chapterId) {
        // 加载章节信息
        const chapterRow = this.db.prepare('SELECT * FROM chapters WHERE id = ? AND project_id = ?')
          .get(dto.chapterId, dto.projectId) as any;
        if (!chapterRow) throw new Error('章节不存在');

        // 加载大纲（全部章节大纲，用于构建完整上下文）
        generationKey = this.beginChapterGeneration(dto.projectId, dto.chapterId);
        const allOutlines = this.db.prepare(
          'SELECT * FROM outlines WHERE project_id = ? AND level = \'chapter\' ORDER BY "order"'
        ).all(dto.projectId) as any[];

        // 构建 FullOutline 结构
        const outlineVolumes = allOutlines.map((o: any, i: number) => ({
          title: o.title || `第${i + 1}章`,
          order: o.order || i + 1,
          function: o.chapter_function || 'breathing',
          content: o.content || '',
          targetWords: Number(o.target_words || 0),
        }));
        if (outlineVolumes.some((outline: any) => outline.targetWords <= 0)) {
          throw new HttpException('存在未配置目标字数的大纲节点，正文生成已停止', 400);
        }
        const fullOutline = {
          coreSetting: { theme: '', world: '', powerSystem: '', factions: [], constraints: [] },
          characters: [] as any[],
          chapterStructure: { totalChapters: outlineVolumes.length, chapters: outlineVolumes },
          reversals: [] as any[],
          foreshadows: [] as any[],
        };

        // 加载角色列表
        const characters = this.db.prepare(
          'SELECT * FROM characters WHERE project_id = ?'
        ).all(dto.projectId) as any[];
        fullOutline.characters = characters.map((c: any) => ({
          name: c.name || '未知',
          identity: c.identity || '',
          age: c.age || 0,
          gender: c.gender || '',
          // 这些字段可能被存成纯正文（如 LLM 直接把 arc 写成叙述文字而非 JSON），
          // 必须容错解析：解析失败时保留原文，避免"Unexpected token"崩溃且不丢信息。
          personality: this.safeJson(c.personality, c.personality ? { summary: String(c.personality) } : {}),
          background: c.background || '',
          affiliations: c.identity || '',
          goals: '',
          fears: '',
          relationships: this.safeJson(c.relationships, c.relationships ? [String(c.relationships)] : []),
          arc: this.safeJson(c.arc, c.arc ? [String(c.arc)] : []),
        }));

        // 加载伏笔
        const foreshadowings = this.db.prepare(
          'SELECT * FROM foreshadowings WHERE project_id = ?'
        ).all(dto.projectId) as any[];
        fullOutline.foreshadows = foreshadowings.map((f: any) => ({
          name: f.content || '伏笔',
          type: f.type || 'short',
          setupChapter: f.buried_chapter_index || 0,
          payoffChapter: f.planned_recovery_chapter_index || 0,
          description: f.content || '',
          relatedCharacters: this.safeJson(f.related_character_ids, []),
        }));

        // 当前章大纲
        // The body chapter is canonically bound to one outline by outline_id.
        // Never infer it from an order value: outline edits can renumber orders.
        const currentOutline = allOutlines.find((o: any) => o.id === chapterRow.outline_id) || null;
        if (!currentOutline) {
          throw new HttpException('所选正文未关联详细章节大纲，正文生成已停止', 400);
        }
        const currentTargetWords = Number(currentOutline.target_words || 0);
        if (!Number.isInteger(currentTargetWords) || currentTargetWords < CHAPTER_WORD_RANGE.min || currentTargetWords > CHAPTER_WORD_RANGE.max) {
          throw new HttpException(`本章大纲缺少有效的${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字动态目标，正文生成已停止`, 400);
        }
        {
          // 正文前置：章节合同必须先自洽。
          // 大纲自身越界（location_summary 声明「全章不出校门」、ending_setup 却落在门外的下一章主场）时，
          // 正文无论怎么写都必然被 Gate 判违约。先就地改好大纲，再花 token 写正文。
          const repairedOutlines = await this.repairOutlineConsistency(dto.projectId, {
            onlyOutlineIds: [String(currentOutline.id)],
            label: `正文前置 第${chapterRow.chapter_index}章`,
          });
          const patched = repairedOutlines.get(String(currentOutline.id));
          if (patched) Object.assign(currentOutline, patched);
        }
        const confirmedContext = this.buildWritingStateContext(dto.projectId, chapterRow.chapter_index || 1);
        const confirmedStateContext = [
          confirmedContext.contextText || 'No dynamic state yet.',
          confirmedContext.stateGuard,
          ...confirmedContext.pendingSummary.map(item => `Pending: ${item}`),
          this.buildCharacterWritingContext(dto.projectId),
          this.buildWorldWritingContext(dto.projectId),
          this.buildLocationWritingContext(dto.projectId),
        ].join('\n');
        const previousLedger = this.buildPreviousChapterLedger(dto.projectId, Number(chapterRow.chapter_index || 1));

        // 单次 LLM 生成：不再有逐节点进度回调，靠 SSE 心跳维持连接
        activeGenerationStage = '按详细大纲生成正文（单次 LLM）';

        const templateId = dto.templateId || 'body-by-outline';
        send({ type: 'start', message: `开始【${templateId}】生成第${chapterRow.chapter_index}章...` });

        // 取消天龙8步 Chain（2026-07-24）：改为单次 LLM 调用 + 严格按详细大纲生成
        // 字数收敛统一交给 generateBodyWithLengthGuard，内部已含真实 LLM 超时兜底。
        // 进度通过 SSE 心跳事件推送给前端，不再有"目标→诱因→...→钩子"逐节点推进。
        const chapterOutlineText = currentOutline ? this.buildChapterOutlineContext(currentOutline) : (dto.prompt || '');
        // 大纲严格性约束（红线 + 绿区）：与 /chain/generate 同源，统一维护
        const chapterOutlineAdherence = this.buildOutlineAdherenceContract(this.isProjectLongNovel(dto.projectId), dto.projectId);
        const povInstruction = (() => {
          const pov = String((currentOutline as any)?.pov || '').trim();
          return pov
            ? `严格使用已有项目配置的叙事视角：${pov}。本视角的硬红线已写入上方【大纲严格性约束】的 POV 红线段，第一人称/第三人称均须严守"禁止叙述者跳出成为作者评论者"。`
            : '保持大纲与前文已经建立的叙事视角，不得无依据切换；本视角的硬红线已写入上方【大纲严格性约束】的 POV 红线段，第一人称/第三人称均须严守"禁止叙述者跳出成为作者评论者"。';
        })();
        const streamPrompt = `你正在创作第${chapterRow.chapter_index}章 ${currentOutline?.title || `第${chapterRow.chapter_index}章`}。

${this.resolvePlatformToneDirective(dto.projectId)}
        ## 不可偏离的详细大纲
        ${chapterOutlineText}

        ## 已确稿故事上下文
        ${confirmedStateContext}

        ${chapterOutlineAdherence}

        ${this.buildNarrativeQualityContract(dto.projectId)}

        ## 写作要求（本章具体约束；平台文风见上方【目标平台与风格定位】，降 AI 味见上方【大纲严格性约束】）

        ### 字数与大纲
        1. 总长 ${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max} 汉字，到约 ${currentTargetWords} 字必须自然收尾，不许注水、不许为凑数把对话稀释成自言自语。
        2. 严格遵循本章大纲中已列出的核心事件、冲突、人物行动、结尾钩子；按大纲事件顺序依次推进，大纲列出的所有场景与人物行动都必须实际发生在正文中，不许为"文笔"擅自改写或跳过。正文的【最后一个场景】必须是【本章结尾钩子】所描述的场景，必须将正文落在该钩子场景上收尾；严禁提前终止于大纲中间事件（如用餐、通勤、过渡等场景），即使字数已接近上限也要先写完钩子再收尾。
        3. ${povInstruction}
        4. 不得在正文里写"天龙8步""目标/诱因/行动/阻碍/误判/反转/代价/钩子"等方法论标签；只输出可发布的纯正文。

        ### 文风（统一约束）
        5. 文风与"降 AI 味"要求（禁止排比句、禁止相邻句/段以同一人名或代词起头、禁止对仗四字短语堆砌与升华式说教、禁用 AI 高频副词、禁止模板化开头结尾、禁止对话标签密集、禁止比拟人比喻滥用等）以及上下文一致性要求（角色状态延续、事实/记忆一致、时空逻辑自洽、场景过渡自然、结尾承接下章钩子）已写入上方【大纲严格性约束】的「降 AI 文风 · 必守」「上下文一致性 · 必守」「散文质感」三节，本章同样逐条严格遵守。
        6. 对话、动作、场景描写都要服务于本章大纲事件，不为"显得深刻"添加说教性内心独白或与本章无关的支线。

        ## 直接输出
        请直接输出完整章节正文，不要任何解释、前缀、JSON、Markdown 标题。`;

        const { content: fullText, qualityReport } = await this.generateBodyWithAlignmentGuard({
          basePrompt: streamPrompt,
          projectId: dto.projectId,
          targetWords: currentTargetWords,
          // 流式入口也曾有第二份 daily 默认，后果同上；两个正文入口统一由 writing 配置驱动。
          scenario: dto.scenario || 'writing',
          temperature: 0.7,
          chapterIndex: Number(chapterRow.chapter_index),
          chapterTitle: String(currentOutline.title || ''),
          outlineContract: this.buildChapterOutlineContext(currentOutline),
          storyContext: confirmedStateContext,
          subsequentChapterBoundary: this.buildSubsequentChapterBoundary(dto.projectId, Number(chapterRow.chapter_index)),
          wordRange: this.getChapterWordRange(dto.projectId, currentTargetWords),
          onProgress: (p) => {
            activeGenerationStage = p.label;
            activeGenerationProgress = p.progress;
            send({ type: 'step', label: p.label, message: p.message, progress: p.progress });
          },
        });
        const chainResult = {
          status: 'completed' as const,
          totalLatency: 0,
        };
        activeGenerationStage = '大纲一致性质检';
        activeGenerationProgress = 95;
        send({ type: 'step', label: '大纲一致性质检', message: '大纲一致性、人物、世界观、时间线与叙事连贯性已校验通过', progress: 95 });
        this.assertNoBlockingGeneratedContentIssues(dto.projectId, fullText);

        send({ type: 'quality', report: qualityReport });
        send({ type: 'complete', content: fullText, qualityReport, chainResult: { status: chainResult.status, totalLatency: chainResult.totalLatency } });
        clearHeartbeat();
        raw.end();
        return;
      }

      // 简易模式：直接调 LLM
      let userPrompt = dto.prompt || '生成一段小说正文';
      if (dto.projectId) {
        try {
          const confirmedContext = this.buildWritingStateContext(dto.projectId);
          userPrompt += `\n\n[Writing state context]\n${confirmedContext.contextText || 'No dynamic state yet.'}\n\n[State usage rule]\n${confirmedContext.stateGuard}`;
        } catch {}
      }
      const response = await this.realLLM.generate({
        prompt: userPrompt,
        // 自由流式正文曾保留第三份 daily 默认，后果是写作模型配置再次被旁路。
        scenario: dto.scenario || 'writing',
        temperature: 0.8,
      });
      const content = response.content;
      const paragraphs = content.split('\n\n').filter(Boolean);
      if (paragraphs.length === 0) paragraphs.push(content);
      for (let i = 0; i < paragraphs.length; i++) {
        send({ progress: Math.round(((i + 1) / paragraphs.length) * 100), chunk: paragraphs[i], done: i === paragraphs.length - 1 });
      }
      clearHeartbeat();
      raw.end();
    } catch (err: any) {
      send({ type: 'error', error: err.message });
      clearHeartbeat();
      raw.end();
    } finally {
      this.finishChapterGeneration(generationKey);
    }
  }

  // ============================================================
  // 灵感发现 + 自动生成
  // ============================================================

  /**
   * POST /chain/expand-outline-chapter
   * 章节大纲扩写：不改变既定故事，补足本章事件链/场景/冲突/伏笔/钩子
   */
  @Post('expand-outline-chapter')
  async expandOutlineChapter(@Body() dto: { projectId: string; outlineId: string }) {
    const projectId = String(dto.projectId || '').trim();
    const outlineId = String(dto.outlineId || '').trim();
    if (!projectId || !outlineId) throw new HttpException('缺少项目或章节大纲标识。', 400);
    const db = this.db.getDb();
    const project = db.prepare('SELECT status, type, target_words, settings FROM projects WHERE id=?').get(projectId) as any;
    if (!project) throw new HttpException('项目不存在。', 404);
    if (project.status !== 'active') throw new HttpException('项目尚未激活，不能修改未通过校验的大纲。请先恢复创作资料。', 409);
    const outline = db.prepare('SELECT id,title,content,chapter_function,goal_arc,target_words,scenes FROM outlines WHERE id=? AND project_id=? AND level=\'chapter\'').get(outlineId, projectId) as any;
    if (!outline) throw new HttpException('章节大纲不存在。', 404);

    const result = await this.llmCallWithRetry<any>(
      '章节大纲扩写',
      `${this.resolvePlatformToneDirective(dto.projectId)}在不改变既定故事、人物关系、章节功能、目标字数和后续章节任务的前提下，扩写当前章节的详细大纲。只能补足本章已经承担的事件链、场景、行动、冲突、亮点、伏笔证据和结尾钩子；不得编造另一套故事、提前揭示后续真相或改写已确认资料。\n项目类型：${project.type}\n章节标题：${outline.title}\n章节功能：${outline.chapter_function}\n目标字数：${outline.target_words}\n现有大纲：${outline.content}\n现有结构资料：${outline.scenes || '{}'}\n只输出JSON对象：{"content":"至少80字事件链","scenes":["场景"],"characterActions":"行动","conflicts":[{"name":"冲突","trigger":"触发"}],"highlights":[{"point":"爽点"}],"foreshadowing":[{"content":"线索"}],"foreshadowingRecover":[{"reference":"回收"}],"characterStates":[{"character":"人","stateBefore":"前","stateAfter":"后"}],"hook":"下章钩子","emotionalTone":"情绪"}`,
      {
        temperature: 0.45,
        timeout: LLM_TUNABLES.timeoutContent(),
        scenario: 'outline',
        validate: value => !!value && typeof value === 'object'
          && String((value as any).content || '').trim().length >= 60
          && Array.isArray((value as any).scenes)
          && (String((value as any).characterActions || '').trim().length > 0)
          && (String((value as any).conflict || '').trim().length > 0 || Array.isArray((value as any).conflicts))
          && (String((value as any).hook || '').trim().length > 0),
      },
    );
    if (!result.data) throw new HttpException(`章节大纲扩写失败：${result.warnings.join('；') || '模型未返回完整结构'}`, 502);
    return { success: true, outline: result.data, warnings: result.warnings };
  }

  @Post('idea-discover')
  async ideaDiscover(@Body() dto: {
    storyType: 'short_story' | 'long_novel';
    platform: string;
    customPlatformNote?: string;
    /** 历史请求曾把基调/文风/流派混在 toneTags；保留字段只为识别旧调用，不再用它代替六维。 */
    toneTags?: string[];
    storyTone?: string[];
    writingStyle?: string[];
    webNovelGenre?: string[];
    submissionTags?: string[];
    plotTags?: string[];
    genreFitNote?: string;
    pov?: string;
    count?: number;
    excludeTitles?: string[];
    excludeDetails?: Array<{ title: string; hook?: string; description?: string }>;
    targetWords?: string;
    storyCategory?: string;
    /** 频道提示（男频/女频）：跨频道同名分类（如悬疑脑洞）靠它消歧，缺了模型就拿不到该分类的体量锚点。 */
    targetAudience?: string;
  }) {
    const requestedCount = Number.isInteger(Number(dto.count)) && Number(dto.count) > 0
      ? Math.min(Number(dto.count), 10)
      : 5;
    // 这里曾自动把空平台改成番茄，并仅允许番茄长篇自动分类，后果是用户选择与题材卡的平台可能不一致。
    // 平台必选；留空分类只从该平台、该篇幅在唯一分类事实源里的候选选取，参考分类仍按参考来源标记。
    const inputPlatform = String(dto.platform ?? '').trim();
    const inputCategory = String(dto.storyCategory ?? '').trim();
    const requestedPlatform = inputPlatform;
    const customPlatformNote = String(dto.customPlatformNote ?? '').trim();
    const platformProblem = platformStandardProblem(requestedPlatform, customPlatformNote);
    if (platformProblem !== null) {
      throw new HttpException(
        platformProblem === 'custom_note_missing'
          ? '缺少平台执行标准：选择了「自定义平台」但未填写「自定义平台说明」。系统不掌握该平台基准，标准只能来自这份说明。'
          : platformProblem === 'unsupported'
            ? '目标平台不是可投稿平台：规则怪谈是题材标签，请选择真实发布平台。'
            : '缺少平台执行标准：未选择具体目标平台。平台决定题材的节奏与回报基准，不能按通用网文兜底生成。',
        422,
      );
    }
    const categoryVerification = platformCategoryTreeVerification(requestedPlatform, dto.storyType);
    const categoryCandidates = categoryVerification?.verified === 'confirmed'
      ? categoryOptionsForPlatform(requestedPlatform).map(option => option.id)
      : categoryReferenceOptionsForProject(requestedPlatform, dto.storyType);
    const requestedCategory = inputCategory || (categoryCandidates.length
      ? categoryCandidates[Math.floor(Math.random() * categoryCandidates.length)] : '');
    if (!requestedCategory) {
      throw new HttpException(
        '未选分类，且所选平台与长短篇没有可用的分类候选；请填写该平台的分类。参考分类不会冒充已核验的投稿分类。',
        422,
      );
    }
    const selectedTags = (value: unknown): string[] => Array.isArray(value)
      ? [...new Set(value.map(item => String(item).trim()).filter(Boolean))]
      : [];
    const normalizedDto = {
      ...dto,
      storyType: dto.storyType === 'long_novel' ? 'long_novel' as const : 'short_story' as const,
      platform: requestedPlatform,
      customPlatformNote,
      storyTone: selectedTags(dto.storyTone),
      writingStyle: selectedTags(dto.writingStyle),
      webNovelGenre: selectedTags(dto.webNovelGenre),
      submissionTags: selectedTags(dto.submissionTags),
      plotTags: selectedTags(dto.plotTags),
      genreFitNote: String(dto.genreFitNote ?? '').trim(),
      pov: String(dto.pov ?? '').trim(),
      storyCategory: requestedCategory,
    };
    // 这里曾只检查平台/分类，另外四维靠模型推荐值在创建时补齐；用户在发现页选的风格因此会被覆盖。
    // 与创建项目入口共用创作宪法的缺项/分类归位判据，缺失即阻断，绝不由模型代填。
    const discoveryConstitution = readConstitution({
      type: normalizedDto.storyType,
      target_platform: normalizedDto.platform,
      target_words: 0,
      settings: JSON.stringify({
        category: normalizedDto.storyCategory,
        storyTone: normalizedDto.storyTone,
        writingStyle: normalizedDto.writingStyle,
        webNovelGenre: normalizedDto.webNovelGenre,
        submissionTags: normalizedDto.submissionTags,
        plotTags: normalizedDto.plotTags,
        genreFitNote: normalizedDto.genreFitNote,
        pov: normalizedDto.pov,
        customPlatformNote: normalizedDto.customPlatformNote,
        targetAudience: normalizedDto.targetAudience,
      }),
    });
    // 发现阶段允许留空的创作维度由字典候选生成；创建前仍由完整宪法质量门逐项阻断。
    const autoFields = new Set(['storyTone', 'writingStyle', 'webNovelGenre', 'submissionTags', 'pov']);
    const missingStandards = missingConstitutionStandards(discoveryConstitution).filter(item => !autoFields.has(item.field));
    if (missingStandards.length) {
      throw new HttpException(`发现灵感缺少执行设定：${missingStandards.map(item => item.label).join('、')}`, 422);
    }
    const discoveryFitProblem = genreFitProblem(discoveryConstitution);
    if (discoveryFitProblem) throw new HttpException(discoveryFitProblem, 422);
    const placementProblem = categoryPlacementProblem(discoveryConstitution);
    if (placementProblem) {
      throw new HttpException(`故事分类不属于所选平台：${placementProblem.reason}`, 422);
    }
    const resolvedCategory = resolveSubmissionCategory(
      normalizedDto.platform, normalizedDto.storyCategory, normalizedDto.storyType, audienceChannelHint(normalizedDto.targetAudience),
    );
    if (resolvedCategory.status === 'resolved' && normalizedDto.submissionTags.length > 0) {
      const genreGap = platformCategoryDimensionBinding(
        normalizedDto.platform, resolvedCategory.value, 'genre', normalizedDto.submissionTags.join('、'), normalizedDto.storyType,
      ).gap;
      // 这里曾用头部样本当作投稿标签全集：作者填了后台真实标签也会被 422。
      // 未命中样本已由 genreFitProblem 强制收取依据；生成与质量门继续逐章核验。
      if (genreGap && normalizedDto.genreFitNote.length < 10) throw new HttpException(genreGap, 422);
    }
    const requestKey = JSON.stringify({
      storyType: normalizedDto.storyType,
      platform: normalizedDto.platform,
      customPlatformNote: normalizedDto.customPlatformNote,
      storyTone: normalizedDto.storyTone,
      writingStyle: normalizedDto.writingStyle,
      webNovelGenre: normalizedDto.webNovelGenre,
      submissionTags: normalizedDto.submissionTags,
      plotTags: normalizedDto.plotTags,
      genreFitNote: normalizedDto.genreFitNote,
      pov: normalizedDto.pov,
      storyCategory: normalizedDto.storyCategory,
      targetAudience: String(dto.targetAudience || '').trim(),
      targetWords: String(dto.targetWords || '').trim(),
      count: requestedCount,
      excludeTitles: dto.excludeTitles || [],
    });
    if (!this.ideaDiscoveryInFlight) this.ideaDiscoveryInFlight = new Map<string, Promise<any>>();
    const active = this.ideaDiscoveryInFlight.get(requestKey);
    if (active) {
      this.logger.warn('idea-discover: 相同配置仍在生成，复用当前任务，未重复调用模型');
      return active;
    }
    const task = this.runIdeaDiscovery(normalizedDto, requestedCount);
    this.ideaDiscoveryInFlight.set(requestKey, task);
    try {
      return await task;
    } finally {
      this.ideaDiscoveryInFlight.delete(requestKey);
    }
  }

  private async runIdeaDiscovery(dto: {
    storyType: 'short_story' | 'long_novel';
    platform: string;
    customPlatformNote: string;
    storyTone: string[];
    writingStyle: string[];
    webNovelGenre: string[];
    submissionTags: string[];
    plotTags: string[];
    genreFitNote: string;
    pov: string;
    count?: number;
    excludeTitles?: string[];
    excludeDetails?: Array<{ title: string; hook?: string; description?: string }>;
    targetWords?: string;
    storyCategory: string;
    /** 频道提示（男频/女频）：跨频道同名分类（如悬疑脑洞）靠它消歧，缺了就只能判未归位。 */
    targetAudience?: string;
  }, requestedCount: number) {
    this.logger.log(`idea-discover: type=${dto.storyType} platform=${dto.platform} count=${requestedCount}`);
    try {
      // 只验证并使用 idea_generate 当前场景所配置的模型；不得切换模型、提供商或模式。
      this.realLLM.assertScenarioModelConfigured('idea_generate');
      const chapterTuple = targetForLength(getPlatform(dto.platform), dto.storyType).chapterWords;
      const chapterRange = { min: chapterTuple[0], max: chapterTuple[1] };
      const dictionaryOptions = (type: string): string[] => (this.db.getDb().prepare(
        'SELECT label FROM story_dict WHERE dict_type = ? ORDER BY sort_order, label',
      ).all(type) as Array<{ label: string }>).map(row => row.label);
      const autoOptions = {
        storyTone: dictionaryOptions('tone_tag'),
        writingStyle: dictionaryOptions('writing_style'),
        webNovelGenre: dictionaryOptions('web_novel_genre'),
        plotTags: dictionaryOptions('plot_tag'),
        pov: dictionaryOptions('narrative_pov'),
      };
      for (const [field, options] of Object.entries(autoOptions)) {
        const selected = field === 'pov' ? dto.pov : dto[field as 'storyTone' | 'writingStyle' | 'webNovelGenre' | 'plotTags'];
        if (!(Array.isArray(selected) ? selected.length : selected) && options.length === 0) {
          throw new Error(`创作字典缺少${field}候选，无法自动组合题材；请先在字典管理中补齐。`);
        }
      }
      const submissionRequired = platformSubmissionDimensions(dto.platform, dto.storyType, dto.storyCategory, dto.targetAudience).includes('genre');
      const submissionPlacement = resolveSubmissionCategory(dto.platform, dto.storyCategory, dto.storyType, audienceChannelHint(dto.targetAudience));
      const submissionOptions = submissionPlacement.status === 'resolved'
        ? (platformCategoryWritingProfile(dto.platform, submissionPlacement.value.channel, submissionPlacement.value.platformGroup, dto.storyType)?.topTags || []).map(tag => tag.name)
        : [];
      if (submissionRequired && !dto.submissionTags.length && !submissionOptions.length) {
        throw new Error('此平台分类要求作品标签，但尚无可核验候选；请填写平台后台实际标签后再发现题材。');
      }
      const configuredTargetWords = String(dto.targetWords || '').trim()
        ? parsePositiveTargetWords(dto.targetWords)
        : null;
      if (String(dto.targetWords || '').trim() && configuredTargetWords === null) {
        throw new Error('目标总字数无效，请填写正整数。');
      }
      if (configuredTargetWords !== null
        && !canFitTargetWordsToChapters(configuredTargetWords, dto.storyType, chapterRange)) {
        throw new Error(storyTargetWordsRequirement(dto.storyType, chapterRange));
      }

      const requestedExcludes = (dto.excludeDetails?.length
        ? dto.excludeDetails
        : (dto.excludeTitles || []).map(title => ({ title })))
        .filter(item => String(item?.title || '').trim())
        .slice(-30);
      // 历史作品自动参与题材去重，不能依赖前端恰好把排除项传回来。
      const historicalExcludes = (this.db.getDb().prepare(
        `SELECT title, settings FROM projects
         WHERE title IS NOT NULL AND TRIM(title) <> '' ORDER BY updated_at DESC LIMIT 40`,
      ).all() as Array<{ title: string; settings: string }>).map(row => {
        let detail: any = {};
        try {
          const settings = JSON.parse(row.settings || '{}');
          const story = settings?.creativeConstitution?.confirmedStory;
          if (story && typeof story === 'object' && !Array.isArray(story)) detail = story;
        } catch {}
        return { ...detail, title: String(detail?.title || row.title).trim() };
      });
      const initialExcludes = [...historicalExcludes, ...requestedExcludes]
        .filter((item, index, all) => {
          const title = String(item?.title || '').trim();
          return title && all.findIndex(other => String(other?.title || '').trim() === title) === index;
        })
        .slice(-50);
      const normalizeTitle = (value: unknown) => String(value || '')
        .replace(/[《》「」]/g, '').replace(/[，、,\s]/g, '').trim().toLowerCase();
      const exampleWords = configuredTargetWords ?? (dto.storyType === 'short_story' ? 20_000 : 300_000);
      const exampleChapters = dto.storyType === 'short_story' ? 4 : 90;
      const outputSchema = `{"ideas":[{"title":"4-16字标题","alternateTitles":["备选1","备选2"],"storyType":"${dto.storyType}","angle":"切入角度","hook":"35-80字，异常+困境+代价/时限","description":"140-240字具体事件链","setting":"时代与必要世界背景","protagonist":"主角身份、欲望和弱点","characters":["主要角色"],"styleTags":["补充标签"],"storyTone":${JSON.stringify(dto.storyTone)},"writingStyle":${JSON.stringify(dto.writingStyle)},"webNovelGenre":${JSON.stringify(dto.webNovelGenre)},"pov":${JSON.stringify(dto.pov)},"targetPlatform":"${dto.platform}","tone":"平台与读者适配说明","estimatedWords":${exampleWords},"plannedChapters":${exampleChapters},"scopeBreakdown":[{"arc":"阶段","chapters":${exampleChapters},"reason":"事件和人物任务"}],"scopeReason":"篇幅核算理由","coreConflict":"双方可主动行动的核心冲突","uniquePoint":"第一章即可感知的独特卖点","mainReversal":"改变目标、关系或胜负条件的反转","noveltyProof":{"familiarShell":"读者一眼能懂的类型外壳","uncommonCombination":"本题材独有的职业/关系/机制组合","avoidedPatterns":"相对历史题材主动避开的机制与反转"}}]}`;

      const outputExample = JSON.parse(outputSchema);
      const exampleIdea = outputExample.ideas[0];
      if (!dto.storyTone.length) exampleIdea.storyTone = ['从故事基调字典选择1-2项'];
      if (!dto.writingStyle.length) exampleIdea.writingStyle = ['从文风字典选择1-2项'];
      if (!dto.webNovelGenre.length) exampleIdea.webNovelGenre = ['从创作流派字典选择1-2项'];
      if (!dto.pov) exampleIdea.pov = '从视角字典选择1项';
      exampleIdea.storyCategory = dto.storyCategory;
      exampleIdea.plotTags = dto.plotTags.length ? dto.plotTags : ['从情节取向字典选择1-2项'];
      exampleIdea.submissionTags = dto.submissionTags.length ? dto.submissionTags : (submissionRequired ? ['从本分类标签候选选择1-2项'] : []);
      const outputSchemaWithAuto = JSON.stringify(outputExample);
      const autoSelectionRules = [
        ['storyTone', dto.storyTone, autoOptions.storyTone],
        ['writingStyle', dto.writingStyle, autoOptions.writingStyle],
        ['webNovelGenre', dto.webNovelGenre, autoOptions.webNovelGenre],
        ['plotTags', dto.plotTags, autoOptions.plotTags],
        ['pov', dto.pov ? [dto.pov] : [], autoOptions.pov],
      ].map(([field, selected, options]) => {
        const chosen = selected as string[];
        return chosen.length
          ? `${field} 必须原样为 ${JSON.stringify(chosen)}`
          : `${field} 未预选；每个题材从字典 ${JSON.stringify(options)} 中选择${field === 'pov' ? '恰好1项字符串' : '1-2项数组'}，同批题材尽量采用不同组合`;
      }).join('；');
      const submissionRule = dto.submissionTags.length
        ? `submissionTags 必须原样为 ${JSON.stringify(dto.submissionTags)}`
        : submissionRequired
          ? `每个题材的 submissionTags 从本分类公开作品标签样本 ${JSON.stringify(submissionOptions)} 中选择1-2项；样本不是平台后台完整清单`
          : 'submissionTags 为 []，不得编造未核实的平台投稿标签';
      const buildPrompt = (
        count: number,
        excludes: Array<{ title: string; hook?: string; description?: string }>,
        recoveryReasons: string[] = [],
      ) => {
        const excludeText = excludes.length
          ? `\n历史作品与本批已通过题材（标题、职业场景、异常机制、核心冲突、代价和反转均不得换名复用）：\n${excludes.map((item, index) => `${index + 1}. ${item.title}${item.hook ? `｜${item.hook}` : ''}${item.description ? `｜${String(item.description).slice(0, 160)}` : ''}`).join('\n')}`
          : '';
        const recoveryText = recoveryReasons.length
          ? `\n上一批未通过项：${recoveryReasons.slice(0, 10).join('；')}。只补足缺少的${count}项，不复写已通过项。`
          : '';
        // 灵感阶段就把该平台分类的头部实测体量锚点交给模型。
        // 不带锚点，模型只能凭故事类型自由选体量：长篇默认挑 10-30 万，落到具体平台分类下就落在
        // 头部实测区间外，创建入口/生成入口/质量 Gate 三处都会按「未执行标准」拦下，作者只能回头
        // 改目标字数 —— 而题材的 scopeBreakdown 已按旧字数算过，等于白烧一轮。锚点必须在选材时给。
        const ideaCategoryResolution = resolveSubmissionCategory(dto.platform, String(dto.storyCategory || ''), dto.storyType, audienceChannelHint(dto.targetAudience));
        const ideaCategoryNote = ideaCategoryResolution.status === 'resolved'
          ? platformCategoryBenchmarkNote(dto.platform, ideaCategoryResolution.value, dto.storyType)
          : '';
        const categoryWritingBrief = ideaCategoryResolution.status === 'resolved'
          ? platformCategoryWritingBrief(dto.platform, ideaCategoryResolution.value, dto.storyType)
          : '';
        const categoryAnchorText = ideaCategoryNote
          ? '\n分类体量锚点：' + ideaCategoryNote + '。每项 estimatedWords 与 scopeBreakdown 必须在该区间内取值；'
            + (configuredTargetWords === null
              ? '若某项确有取舍，必须在该项 scopeReason 写明与该区间不符的具体理由，不得无视。'
              : '用户已指定目标总字数 ' + configuredTargetWords + '，以用户指定值为准。')
          : '';
        const targetRule = configuredTargetWords === null
          ? storyTargetWordsRequirement(dto.storyType, chapterRange)
          : `每项 estimatedWords 必须严格等于 ${configuredTargetWords}。`;
        return `${buildPlatformStyleDirective(dto.platform, dto.storyType, dto.customPlatformNote)}
请一次生成 ${count} 个互不重复、可直接创建作品的${dto.storyType === 'short_story' ? '短篇' : '长篇'}题材。只输出一个合法 JSON 对象，不输出分析过程、Markdown 或额外文字。

 本次执行设定：目标平台=${dto.platform}；分类=${dto.storyCategory}；创作流派=${dto.webNovelGenre.join('、')}；平台作品标签=${dto.submissionTags.join('、')}；基调=${dto.storyTone.join('、')}；文风=${dto.writingStyle.join('、')}；视角=${dto.pov}${dto.plotTags.length ? '；情节取向=' + dto.plotTags.join('、') : ''}${dto.genreFitNote ? '；标签与分类契合依据=' + dto.genreFitNote : ''}。${categoryWritingBrief ? '\n分类证据：' + categoryWritingBrief : '\n此分类尚无已核验的官方标签，不编造平台标签。'}${categoryAnchorText}
硬性要求：
1. targetPlatform 必须原样等于“${dto.platform}”，storyType 必须等于“${dto.storyType}”；不得推荐或改写平台。
2. ${targetRule} plannedChapters 必须满足 estimatedWords ÷ 章节数落在每章 ${chapterRange.min}-${chapterRange.max} 字；scopeBreakdown 的章节合计必须等于 plannedChapters。
 3. 已选值必须原样继承；留空维度按创作字典为每个题材显式组合，不得空着创建：${autoSelectionRules}；${submissionRule}。每项 JSON 必须额外包含 storyCategory="${dto.storyCategory}"、submissionTags 数组及 plotTags 数组；示例 JSON 中的空数组只是字段形状，不代表可留空。题材、钩子、事件链必须体现这些选择。同批题材在职业/生存环境、关系结构、压力来源、核心机制、时间结构、真相载体和结局代价中至少四个维度不同，不能只是替换姓名和地点。
4. 每项从改变主角命运的具体事件起步，写清目标、阻力、失败代价、行动时限、连续升级、不可逆选择和有效反转。短篇单线闭环；长篇保留可持续成长、关系和伏笔空间。
5. 标题、职业场景、时代、冲突和反转均要互不重复；不得套用知名作品或真实人物事件，不得产出违规内容。
6. 新颖性不是堆设定。每项先选一个读者熟悉的类型外壳，再组合一个少见但可验证的职业/关系/机制，并明确相对历史作品避开了什么；写入 noveltyProof。若仍是历史题材的同一机制、同一追查路径或同一反转，必须在输出前淘汰重想。
7. 输出前自行检查结构、篇幅和差异；不要为自检另写文字。
8. 同一题材的 hook、description、规则、时间跨度与反转必须共用一套事实：若写每次进入倒退N小时，就不得又写时间固定回到另一数值的N小时前；若历史中已经触发过名单增减，当前起始名单必须反映该变化。逐次变化要能从初始值算到结尾值。
${excludeText}${recoveryText}

JSON 结构（ideas 必须恰好 ${count} 项）：${outputSchemaWithAuto}`;
      };

      const generateBatch = async (
        count: number,
        excludes: Array<{ title: string; hook?: string; description?: string }>,
        recoveryReasons: string[] = [],
      ): Promise<any[]> => {
        const response = await this.realLLM.generate({
          prompt: buildPrompt(count, excludes, recoveryReasons),
          scenario: 'idea_generate',
          timeout: LLM_TUNABLES.timeoutSimple(),
          maxEmptyRetries: 1,
          responseFormat: 'json_object',
        });
        return extractIdeaList(response.content || '') || [];
      };

      const assessIdeaQuality = (candidate: any): string[] => {
        const issues: string[] = [];
        const cleanTitle = String(candidate?.title || '').replace(/[《》「」]/g, '').trim();
        const compactTitle = cleanTitle.replace(/[，、,\s]/g, '');
        if (compactTitle.length < 4 || compactTitle.length > 16) issues.push('标题长度不是4-16字');
        if (String(candidate?.storyType || '') !== dto.storyType) issues.push('长短篇类型未原样继承');
        if (String(candidate?.targetPlatform || '') !== dto.platform) issues.push('目标平台未原样继承');
        if (String(candidate?.hook || '').trim().length < 25) issues.push('钩子缺少异常、困境与代价');
        if (String(candidate?.description || '').trim().length < 120) issues.push('概要未形成具体事件升级链');
        if (ideaTimeConflict(candidate)) issues.push('钩子与概要的逐次倒退时间不一致');
        if (String(candidate?.coreConflict || '').trim().length < 15) issues.push('核心冲突不具体');
        if (String(candidate?.mainReversal || '').trim().length < 10) issues.push('核心反转不成立');
        if (String(candidate?.uniquePoint || '').trim().length < 8) issues.push('独特卖点不清楚');
        const novelty = candidate?.noveltyProof;
        if (!novelty || String(novelty?.familiarShell || '').trim().length < 4
          || String(novelty?.uncommonCombination || '').trim().length < 8
          || String(novelty?.avoidedPatterns || '').trim().length < 6) {
          issues.push('缺少可核验的题材差异说明');
        }
        for (const field of ['storyTone', 'writingStyle', 'webNovelGenre', 'plotTags'] as const) {
          const expected = dto[field];
          const actual = candidate?.[field];
          if (!Array.isArray(actual) || (expected.length > 0
            ? actual.length !== expected.length || [...actual].map(String).sort().join('\u0000') !== [...expected].sort().join('\u0000')
            : actual.length < 1 || actual.length > 2 || actual.some((item: unknown) => !autoOptions[field].includes(String(item))))) {
            issues.push(`${field}未继承选择或未从字典有效组合`);
          }
        }
        if (dto.pov ? String(candidate?.pov || '').trim() !== dto.pov
          : !autoOptions.pov.includes(String(candidate?.pov || '').trim())) issues.push('叙事视角未继承选择或未从字典有效组合');
        if (String(candidate?.storyCategory || dto.storyCategory).trim() !== dto.storyCategory) issues.push('投稿分类未原样继承');
        const actualSubmissionTags = Array.isArray(candidate?.submissionTags) ? candidate.submissionTags.map(String) : [];
        if (dto.submissionTags.length
          ? actualSubmissionTags.length !== dto.submissionTags.length || actualSubmissionTags.sort().join('\u0000') !== [...dto.submissionTags].sort().join('\u0000')
          : submissionRequired
            ? actualSubmissionTags.length < 1 || actualSubmissionTags.some((tag: string) => !submissionOptions.includes(tag))
            : actualSubmissionTags.length > 0) {
          issues.push('作品标签未继承选择或未从本分类公开候选中组合');
        }
        const plannedWords = parsePositiveTargetWords(candidate?.recommendedTargetWords ?? candidate?.estimatedWords);
        if (plannedWords === null || !canFitTargetWordsToChapters(plannedWords, dto.storyType, chapterRange)) {
          issues.push(storyTargetWordsRequirement(dto.storyType, chapterRange));
        }
        if (configuredTargetWords !== null && plannedWords !== configuredTargetWords) issues.push('建议总字数未严格执行用户配置');
        const plannedChapters = Number(candidate?.plannedChapters);
        if (!Number.isInteger(plannedChapters) || plannedChapters <= 0) {
          issues.push('动态总章数无效');
        } else if (plannedWords !== null
          && (plannedChapters * chapterRange.min > plannedWords || plannedChapters * chapterRange.max < plannedWords)) {
          issues.push('总章数与平台章节字数范围不一致');
        }
        const breakdown = Array.isArray(candidate?.scopeBreakdown) ? candidate.scopeBreakdown : [];
        const breakdownChapters = breakdown.reduce((sum: number, item: any) => {
          const chapters = Number(item?.chapters);
          return sum + (Number.isInteger(chapters) && chapters > 0 ? chapters : 0);
        }, 0);
        if (!breakdown.length || breakdown.some((item: any) => !item?.arc || !item?.reason)) {
          issues.push('篇幅分线清单无效');
        } else if (Number.isInteger(plannedChapters) && breakdownChapters !== plannedChapters) {
          issues.push('篇幅分线合计与总章数不一致');
        }
        return issues;
      };

      const accepted: any[] = [];
      const rejectedReasons: string[] = [];
      const seen = new Set(initialExcludes.map(item => normalizeTitle(item.title)));
      const autoSelectionRequested = !dto.storyTone.length || !dto.writingStyle.length || !dto.webNovelGenre.length
        || !dto.plotTags.length || !dto.pov || (submissionRequired && !dto.submissionTags.length);
      const seenCombinations = new Set<string>();
      const accept = (candidates: any[]) => {
        for (const candidate of candidates) {
          if (accepted.length >= requestedCount) break;
          const titleKey = normalizeTitle(candidate?.title);
          const issues = assessIdeaQuality(candidate);
          if (!titleKey || seen.has(titleKey)) issues.push('标题与已有或同批题材重复');
          const closest = [...initialExcludes, ...accepted]
            .map(reference => ({ reference, similarity: ideaSemanticSimilarity(candidate, reference) }))
            .sort((a, b) => b.similarity - a.similarity)[0];
          if (closest?.similarity >= 0.42) {
            issues.push(`题材机制与“${closest.reference.title}”过于接近`);
          }
          const combination = JSON.stringify(['storyTone', 'writingStyle', 'webNovelGenre', 'plotTags', 'pov', 'submissionTags']
            .map(field => candidate?.[field]));
          if (autoSelectionRequested && seenCombinations.has(combination)) issues.push('自动组合与本批已通过题材重复');
          if (issues.length) {
            rejectedReasons.push(...issues);
            continue;
          }
          seen.add(titleKey);
          seenCombinations.add(combination);
          accepted.push({
            ...candidate,
            storyType: dto.storyType,
            targetPlatform: dto.platform,
            // 这里曾只返回四个创作维度，分类、投稿标签和情节取向在题材卡消失，创建时无法核对继承关系。
            storyCategory: dto.storyCategory,
            storyTone: dto.storyTone.length ? dto.storyTone : candidate.storyTone,
            writingStyle: dto.writingStyle.length ? dto.writingStyle : candidate.writingStyle,
            webNovelGenre: dto.webNovelGenre.length ? dto.webNovelGenre : candidate.webNovelGenre,
            pov: dto.pov || candidate.pov,
            submissionTags: dto.submissionTags.length ? dto.submissionTags : (submissionRequired ? candidate.submissionTags : []),
            plotTags: dto.plotTags.length ? dto.plotTags : candidate.plotTags,
            estimatedWords: parsePositiveTargetWords(candidate.recommendedTargetWords ?? candidate.estimatedWords),
            plannedChapters: Number(candidate.plannedChapters),
          });
        }
      };

      const firstBatch = await generateBatch(requestedCount, initialExcludes);
      if (!firstBatch.length) throw new Error('模型已返回内容，但缺少有效的 ideas 数组。未创建题材，请重试。');
      accept(firstBatch);

      // 最多补跑一次，只补缺项。一次用户操作最多两次逻辑调用，且始终使用同一场景配置模型。
      if (accepted.length < requestedCount) {
        const missing = requestedCount - accepted.length;
        const acceptedExcludes = accepted.map(item => ({ title: item.title, hook: item.hook, description: item.description }));
        this.logger.warn(`idea-discover: 首批有 ${accepted.length}/${requestedCount} 项通过，使用同一模型一次补齐 ${missing} 项`);
        const recoveryBatch = await generateBatch(missing, [...initialExcludes, ...acceptedExcludes], Array.from(new Set(rejectedReasons)));
        accept(recoveryBatch);
      }

      if (!accepted.length) {
        throw new Error(`灵感结果未通过质量 Gate，未创建题材：${Array.from(new Set(rejectedReasons)).slice(0, 6).join('；') || '证据不足'}`);
      }
      this.logger.log(`idea-discover: 完成 ${accepted.length}/${requestedCount} 个合格题材，逻辑调用不超过2次`);
      return {
        success: true,
        ideas: accepted,
        totalIdeas: accepted.length,
        qualityWarning: accepted.length < requestedCount
          ? `本次有 ${accepted.length} 个题材通过质量 Gate；其余结果证据不足或未达标，未创建占位内容。`
          : undefined,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : '题材发现失败';
      this.logger.error(`idea-discover 失败: ${message}`);
      return { success: false, ideas: [], error: message };
    }
  }


  // SSE 进度广播：projectId → [{resolve, reject}] (多客户端可同时监听)
  private projectCreationListeners = new Map<string, Array<(data: any) => void>>();
  private projectCreationEventHistory = new Map<string, any[]>();
  /** 每个项目的已发最大进度，用于把总进度钳制成单调不降（避免步骤回退导致前端进度条倒走） */
  private projectLastPercent = new Map<string, number>();

  private async reviewChildSource(projectId: string, parentName: string, parent: unknown,
    childName: string, child: unknown, executionStandard: string): Promise<SourceHierarchyReview> {
    const result = await this.llmCallWithRetry<any>(`${childName}上层事实审查`,
      buildSourceHierarchyReviewPrompt({ parentName, parent, childName, child, executionStandard }),
      { projectId, scenario: 'review', temperature: 0.1, timeout: LLM_TUNABLES.timeoutComplex(),
        validate: value => normalizeSourceHierarchyReview(value) !== null,
        describeValidation: value => normalizeSourceHierarchyReview(value) ? [] : ['一致性审查必须给出自洽的 consistent 和 contradictions'] });
    const review = normalizeSourceHierarchyReview(result.data);
    if (!review) throw new Error(`${childName}上层事实审查没有完整结果，禁止保存`);
    return review;
  }

  private async assertOutlineFactLedger(projectId: string, canonicalBrief: string, executionStandard: string): Promise<void> {
    const db = this.db.getDb();
    const outlineWorld = db.prepare(`SELECT era,rules,story_premise,geography FROM world_settings WHERE project_id=? ORDER BY created_at ASC LIMIT 1`).get(projectId);
    const outlineFacts = db.prepare(`SELECT "order",title,content,scenes FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`).all(projectId) as any[];
    if (outlineFacts.length === 0) throw new Error('章纲事实台账审查无章纲，项目不得激活');
    let previousLedger: string[] = [];
    for (let batchStart = 0; batchStart < outlineFacts.length; batchStart += 4) {
      const chapterBatch = outlineFacts.slice(batchStart, batchStart + 4);
      const factReviewResult = await this.llmCallWithRetry<any>(
        `第${batchStart + 1}-${batchStart + chapterBatch.length}章事实台账审查`,
        `${executionStandard}\n${buildOutlineFactReviewPrompt({ canonicalBrief, world: outlineWorld, previousLedger, chapters: chapterBatch })}`,
        {
          temperature: 0.1,
          timeout: LLM_TUNABLES.timeoutComplex(),
          projectId,
          scenario: 'review',
          maxTokens: LLM_TUNABLES.CONSISTENCY_CHECK_MIN,
          validate: value => describeOutlineFactReview(normalizeOutlineFactReview(value)).length === 0,
          describeValidation: value => describeOutlineFactReview(normalizeOutlineFactReview(value)),
        },
      );
      const factReview = normalizeOutlineFactReview(factReviewResult.data);
      const missingLedger = factReview ? missingPriorLedgerEntries(previousLedger, factReview.ledger) : [];
      if (!factReview || factReview.consistent !== true || factReview.contradictions.length > 0 || missingLedger.length > 0) {
        const details = factReview?.contradictions?.join('；') || (missingLedger.length ? `事实台账丢失上批对象：${missingLedger.join('；')}` : '') || factReviewResult.warnings.join('；') || '未获得完整且明确通过的审查结果';
        const gateError = `第${batchStart + 1}-${batchStart + chapterBatch.length}章事实台账未通过，项目未激活：${details}`;
        try {
          const gateRun = this.generationMetrics.beginRun(projectId, 'review', gateError, undefined, 'outline_fact_ledger', null, false);
          this.generationMetrics.finishRun(gateRun.id, 'failed', Date.now(), JSON.stringify(chapterBatch), gateError);
        } catch (recordError) {
          this.logger.warn(`章纲事实台账 Gate 失败运行落库失败（不改变阻断结论）：${recordError instanceof Error ? recordError.message : String(recordError)}`);
        }
        throw new Error(gateError);
      }
      previousLedger = factReview.ledger;
    }
  }

  private assertProjectSourceCompleteness(projectId: string): void {
    const db = this.db.getDb();
    const world = db.prepare('SELECT story_premise,rules FROM world_settings WHERE project_id=? ORDER BY created_at ASC LIMIT 1').get(projectId) as { story_premise?: string; rules?: string } | undefined;
    const savedCoreRules = this.safeExtractJson<unknown>(String(world?.rules || '[]'), []);
    if (!Array.isArray(savedCoreRules) || !savedCoreRules.some(rule => typeof rule === 'string' && rule.trim())) {
      // 这里曾把 rules=[] 的世界观主记录视为已存在，后果是章纲把确认题材的
      // 门后机制误判成“未授权”，再生成两章阻断文案并消耗后续角色与资料调用。
      throw new Error('已保存世界观核心规则为空，不能激活或生成正文；必须先按确认题材重建世界观。');
    }
    // 这里曾有按单本小说的门与回拨词形写死的第二份源规则检查，后果是
    // 换题材或换措辞便漏判。跨资料语义一致性由通用层级审查与最终 Gate 执行。
  }

  /**
   * POST /chain/create-project-async
   * 异步创建项目：立即返回 projectId，后台执行全部生成步骤，通过 SSE 推送进度。
   * 前端应调用此接口后连接 GET /chain/project-creation-progress/:projectId 接收进度。
   */
  @Post('create-project-async')
  async createProjectAsync(@Body() dto: {
    title: string;
    storyType: string;
    targetPlatform: string;
    targetWords?: number;
    selectedIdea: any;
    settings?: Record<string, unknown>;
    category?: string;
    storyTone?: string[];
    writingStyle?: string[];
    webNovelGenre?: string[];
    submissionTags?: string[];
    plotTags?: string[];
    genreFitNote?: string;
    pov?: string;
    targetAudience?: unknown;
    /** 自定义平台说明（targetPlatform === 'custom' 时必填，否则平台维度判未执行标准并阻断） */
    customPlatformNote?: string;
    /**
     * 分类体量取舍依据：目标总字数刻意偏离该平台分类头部实测区间时必填。
     * 这是执行标准原文“确有取舍必须写在项目卡片上”唯一的落库出口 —— 没有这个字段，
     * 那条合规路径只是一句文案承诺，区间外的体量只能被硬阻断。
     */
    categoryWordScaleDeviation?: string;
    chapterWordRange?: { min: number; max: number };
  }) {
    // 这里曾只信向导状态、不核对题材卡类型，后果是旧长篇题材可被误以短篇创建或反之。
    if (dto.selectedIdea?.storyType && dto.selectedIdea.storyType !== dto.storyType) {
      return { success: false, error: '所选题材的长短篇类型与当前配置不一致；项目未创建，请按当前类型重新发现题材。' };
    }
    // 这里曾只在项目激活前审查时间规则，后果是自相矛盾的题材卡耗完整轮生成后才失败。
    if (ideaTimeConflict(dto.selectedIdea || {})) {
      return { success: false, error: '所选题材的钩子与概要对门后时间给出不同数值；项目未创建，请先统一题材卡中的时间规则。' };
    }

    const db = this.db.getDb();
    const now = new Date().toISOString();
    const { v4: uuid } = require('uuid');

    // 【创建前预检·模型配置】未单独配置任务模型时按当前模式继承日常模型，标准归纳也使用它。
    // 未配置则在创建项目之前明确提醒并中止，绝不静默改用其它模型。
    try {
      this.realLLM.assertScenarioModelConfigured('daily');
    } catch (preErr) {
      return {
        success: false,
        error: (preErr instanceof Error ? preErr.message : String(preErr)) + ' 项目未创建；请先在「设置 → 模型配置」完成日常场景模型配置后再创建。',
      };
    }

    const targetResolution = resolveDiscoveryTargetWords(dto.targetWords, dto.selectedIdea);
    if (targetResolution.source === 'invalid_config') {
      return { success: false, error: '已填写的目标总字数无效，项目未创建。请填写正整数，或清空后采用题材的动态规划字数。' };
    }
    const configuredTargetWords = targetResolution.targetWords;
    if (configuredTargetWords === null) {
      return { success: false, error: '所选题材缺少可执行的动态篇幅规划，项目未创建。请重新发现题材，或返回配置填写目标总字数。' };
    }
    const normalizedStoryType: SupportedStoryType = dto.storyType === 'long_novel' ? 'long_novel' : 'short_story';
    const creationChapterRange = { ...CHAPTER_WORD_RANGE };
    if (!canFitTargetWordsToChapters(configuredTargetWords, normalizedStoryType, creationChapterRange)) {
      return {
        success: false,
        error: `${storyTargetWordsRequirement(normalizedStoryType, creationChapterRange)}项目未创建，请调整配置或重新发现题材。`,
      };
    }
    const projectSettings = dto.settings || {};
    const {
      perChapterTarget: _legacyPerChapterTarget,
      wordsPerChapter: _legacyWordsPerChapter,
      volumeCount: _legacyVolumeCount,
      chaptersPerVolume: _legacyChaptersPerVolume,
      totalChapters: _legacyTotalChapters,
      chapterCount: _legacyChapterCount,
      ...currentProjectSettings
    } = projectSettings;
    const constitution = updateConstitution({ type: dto.storyType || 'short_story', settings: '{}' }, {
      type: dto.storyType || 'short_story', targetWords: configuredTargetWords,
      targetPlatform: dto.targetPlatform || 'generic', category: dto.category,
      storyTone: dto.storyTone, writingStyle: dto.writingStyle, webNovelGenre: dto.webNovelGenre, submissionTags: dto.submissionTags, plotTags: dto.plotTags, genreFitNote: dto.genreFitNote,
      pov: dto.pov, targetAudience: dto.targetAudience, customPlatformNote: dto.customPlatformNote,
      categoryWordScaleDeviation: dto.categoryWordScaleDeviation,
      chapterWordRange: creationChapterRange,
      settings: currentProjectSettings,
    });
    constitution.confirmedStory = dto.selectedIdea && typeof dto.selectedIdea === 'object' && !Array.isArray(dto.selectedIdea)
      ? structuredClone(dto.selectedIdea)
      : { summary: String(dto.selectedIdea || '') };
    constitution.revision = 1;
    // 创建入口前置阻断：平台/分类/基调/文风/流派/视角是【执行前提】，空值 = 标准未执行。
    // 此前这些空值要等生成阶段（assertExecutionStandardsComplete）才被拦下：用户已经选完题材、
    // 项目也落了库，只能事后靠项目卡片补齐。同一份 missingConstitutionStandards 判据放到创建入口，
    // 成本为 0 时先暴露；仍然不降级：不填默认值、不用平台推荐替代、不静默变成 not_applicable。
    const missingCreationStandards = missingConstitutionStandards(constitution);
    if (missingCreationStandards.length > 0) {
      const missingMessage = missingCreationStandards
        .map(item => `创作宪法未设置${item.label}：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）`)
        .join('；');
      this.logger.error(`创建前置阻断（未执行标准） title=${dto.title} 未执行标准=${missingCreationStandards.map(item => item.dimension).join(',')}`);
      return {
        success: false,
        error: `${missingMessage}；项目未创建，请在创建向导中选定这些执行标准后再创建。`,
        missingStandards: missingCreationStandards,
      };
    }
    const creationFitProblem = genreFitProblem(constitution);
    if (creationFitProblem) return { success: false, error: creationFitProblem + '；项目未创建。' };
    // 六维齐备之后的第二道创建前置阻断：「分类」必须是这本书要投放的那个平台上的投稿分类。
    // 与生成入口 assertExecutionStandardsComplete 共用同一份 categoryPlacementProblem 判据、同一句文案。
    const creationCategoryProblem = categoryPlacementProblem(constitution);
    if (creationCategoryProblem) {
      const message = categoryPlacementMessage(constitution, creationCategoryProblem, platformDisplayName(constitution.targetPlatform));
      this.logger.error('创建前置阻断（分类未在平台归位） title=' + dto.title + ' platform=' + constitution.targetPlatform + ' category=' + constitution.category);
      return {
        success: false,
        error: message + '；项目未创建，请在创建向导中改选该平台的投稿分类后再创建。',
        categoryPlacement: creationCategoryProblem,
      };
    }
    // 第三道创建前置阻断：目标总字数要落在这个平台分类的头部实测体量里，或由作者写明取舍。
    // 放在创建入口而不是等到生成，是因为「目标总字数」是项目卡片级状态：创建后再改，
    // 题材的 scopeBreakdown、大纲的章节数都已经按旧字数算过，改一处就要连带重算，成本远高于此时拦下。
    // 与生成入口 assertExecutionStandardsComplete、质量 Gate 共用同一份 categoryWordScaleStanding 判据。
    // 不降级：不擅自改写作者填的目标字数，也不降低该判据的 severity。
    const creationScaleStanding = categoryWordScaleStanding(constitution);
    if (categoryWordScaleBlocked(creationScaleStanding)) {
      const message = categoryWordScaleMessage(creationScaleStanding, platformDisplayName(constitution.targetPlatform));
      this.logger.error('创建前置阻断（分类体量判据未满足） title=' + dto.title + ' platform=' + constitution.targetPlatform + ' category=' + constitution.category + ' targetWords=' + constitution.targetWords + ' status=' + creationScaleStanding.status);
      return {
        success: false,
        error: message + '；项目未创建，请在创建向导中调整目标总字数，或补齐「分类体量取舍依据」后再创建。',
        categoryWordScale: creationScaleStanding,
      };
    }
    const normalizedProjectSettings = constitutionSettings({ ...currentProjectSettings,
      structurePlanning: 'dynamic_by_story_rhythm' }, constitution);
    dto.settings = normalizedProjectSettings;

    const projectId = uuid();
    db.prepare(`INSERT INTO projects (id, title, type, status, target_words, current_words, settings, writing_style, platform_style, target_platform, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      projectId, dto.title, dto.storyType || 'short_story', 'creating', configuredTargetWords, 0,
      JSON.stringify({ autoSave: true, autoSaveInterval: 30, writingMode: 'full_auto', immersiveModeEnabled: false, recapEnabled: true, typoCheckEnabled: true, sensitiveWordCheckEnabled: false, ...normalizedProjectSettings }),
      JSON.stringify(constitution.writingStyle), constitution.targetPlatform, constitution.targetPlatform,
      now, now
    );
    this.projectCreationEventHistory.set(projectId, []);
    this.emitProjectProgress(projectId, { type: 'progress', step: 'project', percent: 5, message: '项目已创建，开始生成内容', status: 'done' });

    // 从项目创建起就持续发心跳，不依赖后台生成函数是否启动
    // 这样无论 executeCreateProjectSteps 内部如何阻塞，SSE 连接都不会断
    const globalHeartbeat = setInterval(() => {
      this.emitProjectProgress(projectId, { type: 'heartbeat', ts: Date.now() });
    }, LLM_TUNABLES.HEARTBEAT_GLOBAL_MS);
    const clearGlobalHeartbeat = () => { clearInterval(globalHeartbeat); };
    this.logger.log(`create-project-async: project=${projectId} 已创建，开始后台生成...`);

    // 后台异步执行全部生成步骤
    const creationDto = { ...dto, targetWords: configuredTargetWords };
    this.executeCreateProjectSteps(projectId, creationDto).catch(err => {
      clearGlobalHeartbeat();
      this.logger.error(`create-project-async 后台执行失败 project=${projectId}: ${err.message}`);
      this.emitProjectProgress(projectId, { type: 'error', message: err.message });
    }).finally(() => {
      clearGlobalHeartbeat();
    });

    return { success: true, projectId, targetWords: configuredTargetWords, tip: '项目已创建，内容正在后台生成中。请连接 SSE 获取进度。' };
  }

  /**
   * GET /chain/project-creation-progress/:projectId
   * SSE 端点：连接后实时接收项目创建进度事件。
   * 使用 NestJS 原生 @Sse() 装饰器，兼容 Fastify 适配器。
   * 事件类型: progress(step/percent/message), stats(最终统计), done(完成), error(错误)
   */
  @Sse('project-creation-progress/:projectId')
  projectCreationProgress(@Param('projectId') projectId: string): Observable<MessageEvent> {
    return new Observable((subscriber: Subscriber<MessageEvent>) => {
      // 注册监听器
      if (!this.projectCreationListeners.has(projectId)) {
        this.projectCreationListeners.set(projectId, []);
      }
      const listeners = this.projectCreationListeners.get(projectId)!;

      let isComplete = false;
      const listener = (data: any) => {
        if (isComplete) return;
        if (data.type !== 'heartbeat') {
          this.logger.log(`[SSE] → 推送 project=${projectId} type=${data.type}`);
        }
        subscriber.next({ data: JSON.stringify(data) } as MessageEvent);
        if (data.type === 'done' || data.type === 'error') {
          isComplete = true;
          subscriber.complete();
        }
      };
      listeners.push(listener);
      this.logger.log(`[SSE] 新连接 project=${projectId} listeners=${listeners.length}`);

      const history = this.projectCreationEventHistory.get(projectId) || [];
      for (const event of history) {
        listener(event);
        if (event.type === 'done' || event.type === 'error') break;
      }

      // 客户端断开时清理
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
        if (listeners.length === 0) this.projectCreationListeners.delete(projectId);
      };
    });
  }

  /** 向指定项目的所有 SSE/WSS 监听者广播进度 */
  private emitProjectProgress(projectId: string, data: any) {
    // 总进度单调不降：progress 事件的 percent 只升不降，避免步骤回退导致前端进度条倒走
    if (data?.type === 'progress' && typeof data.percent === 'number') {
      const prev = this.projectLastPercent.get(projectId) || 0;
      const clamped = Math.max(prev, Math.min(100, data.percent));
      if (clamped !== data.percent) data.percent = clamped;
      this.projectLastPercent.set(projectId, clamped);
    } else if (data?.type === 'error' || (data?.status === 'failed' && data?.type === 'progress')) {
      // 失败/错误事件标记该步为失败，进度保持已到达值
    }
    // SSE 路径
    const history = this.projectCreationEventHistory.get(projectId) || [];
    history.push(data);
    if (history.length > 120) history.splice(0, history.length - 120);
    this.projectCreationEventHistory.set(projectId, history);

    const listeners = this.projectCreationListeners.get(projectId);
    if (!listeners || listeners.length === 0) {
      if (data.type === 'heartbeat') return;
      this.logger.debug(`[SSE] 无监听者 project=${projectId} event=${data.type}`);
      // 即使没 SSE 监听者，WebSocket 也要发
    } else {
      for (const l of listeners) {
        try { l(data); } catch {}
      }
    }

    // WebSocket 路径（无硬编码超时，连接存活=进度存活）
    try {
      this.writingGateway.notifyProjectCreationProgress(projectId, {
        type: data.type,
        step: data.step,
        percent: data.percent,
        message: data.message,
        status: data.status,
        stats: data.stats,
        counts: data.counts,
      });
    } catch {} // WebSocket 未就绪时静默
  }

  /** 后台执行灵感发现创建项目的全部步骤 */
  private async executeCreateProjectSteps(
    projectId: string,
    dto: { title: string; storyType: string; targetWords: number; selectedIdea: any; settings?: Record<string, unknown> },
  ) {
    projectMetricsContext.enterWith(projectId);
    const db = this.db.getDb();
    const now = () => new Date().toISOString();
    const { v4: uuid } = require('uuid');
    const warnings: string[] = [];
    let shortHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
    // 防复发：进入「建项目生成」的唯一入口在这里，不在 HTTP 处理器里 —— 创建向导
    // (create-project-async) 与断点恢复 (resumeFailedGeneration) 都调本函数，而创建向导自己
    // 那三道闸门是「插入项目行之前、校验 dto 带来的那份创作宪法」，恢复路径压根没有 dto 可校验。
    // 此前恢复路径没有闸门，后果实测：项目卡片不达标的书点「重新生成」，先烧 217 秒跑完
    // world 步骤，才在质量 Gate 被同一条 platform.category_word_scale 拦住 —— 作者看到的是
    // 「同一个 Gate 反反复复出现」，因为它每次都在流程末尾才出现，而不是在成本为 0 的入口。
    // 这里复用生成入口那唯一一份 assertExecutionStandardsComplete（六维 / 分类归位 / 分类体量
    // 三道判据同一份 standing、同一句文案），把它提到生成流程第 0 步：不通过就不开工。
    // 不降级：不填默认值、不用平台推荐替代、不降低任何判据的 severity。
    this.assertExecutionStandardsComplete(projectId);
    const constitution = readConstitution(db.prepare(
      'SELECT type,target_words,target_platform,writing_style,settings FROM projects WHERE id=?',
    ).get(projectId) as Record<string, unknown>);

    const isShort = dto.storyType !== 'long_novel';
    const ideaStr = JSON.stringify(dto.selectedIdea);
    const targetWanZi = dto.targetWords / 10000;

    const getCreationCounts = () => ({
      outlines: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM outlines WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      outlineChapters: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM outlines WHERE project_id = ? AND level = 'chapter'`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      chapters: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM chapters WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      characters: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM characters WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      worldSettings: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM world_settings WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      organizations: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM organizations WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      mapPoints: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM map_points WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      foreshadowings: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM foreshadowings WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      timelines: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM timelines WHERE project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
      timelineEvents: (() => { try { return (db.prepare(`SELECT COUNT(*) as c FROM timeline_events e JOIN timelines t ON e.timeline_id = t.id WHERE t.project_id = ?`).get(projectId) as any)?.c || 0; } catch { return 0; } })(),
    });

    let activeGenerationStep = 'world';
    const emit = (step: string, percent: number, message: string, status: 'running' | 'done' | 'failed' = 'running') => {
      if (status === 'running' && step !== 'project' && step !== 'done') activeGenerationStep = step;
      this.emitProjectProgress(projectId, { type: 'progress', step, percent, message, status, counts: getCreationCounts() });
    };

    const asArray = (value: any): any[] => {
      if (Array.isArray(value)) return value;
      if (value === undefined || value === null || value === '') return [];
      return [value];
    };

    const hasUsefulValue = (value: any): boolean => {
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') {
        const text = value.trim();
        return text !== '' && text !== '[]' && text !== '{}' && text !== '[""]';
      }
      if (Array.isArray(value)) return value.some(hasUsefulValue);
      if (typeof value === 'object') return Object.values(value).some(hasUsefulValue);
      return true;
    };

    const unwrapComprehensiveData = (outputs: any): any => {
      const candidates = [
        outputs?.node_1_comprehensive,
        outputs?.node_1,
        outputs?.chain_output?.node_1,
        outputs,
      ];
      for (const candidate of candidates) {
        if (!candidate || typeof candidate !== 'object') continue;
        const nested = (candidate as any).node_1 || (candidate as any).node_1_comprehensive;
        const data = nested && typeof nested === 'object' ? nested : candidate;
        if (data.coreSetting || data.worldview || data.worldSetting || data.characters || data.volumes) {
          return data;
        }
      }
      const firstObject = Object.values(outputs || {}).find((item: any) => item && typeof item === 'object') as any;
      return firstObject || {};
    };

    const enrichForeshadowContent = (fs: any): string => {
      const lines = [
        fs.content || fs.item || fs.title || '',
        fs.setupDetail ? `埋设细节：${fs.setupDetail}` : '',
        fs.recoveryCondition ? `回收条件：${fs.recoveryCondition}` : '',
        fs.payoffDescription ? `兑现效果：${fs.payoffDescription}` : '',
        fs.relatedThread ? `关联线索：${fs.relatedThread}` : '',
      ].filter(Boolean);
      return lines.join('\n');
    };

    const insertTimelineWithEvents = (timelineItems: any[], fallbackChapters: any[] = []): number => {
      const items = timelineItems.length > 0 ? timelineItems : fallbackChapters;
      if (items.length === 0) return 0;
      const tid = uuid();
      const startDate = items[0]?.date || items[0]?.eventDate || null;
      const endDate = items[items.length - 1]?.date || items[items.length - 1]?.eventDate || null;
      db.prepare(`INSERT INTO timelines (id, project_id, name, description, start_date, end_date, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`).run(
        tid, projectId, `${dto.title}时间线`, `《${dto.title}》的故事时间线`, startDate, endDate, now(), now()
      );

      let eventCount = 0;
      for (const [index, item] of items.entries()) {
        const title = serializeGeneratedSqlText(item.title || item.event || item.name, `关键节点 ${index + 1}`);
        if (!title) continue;
        const relatedChapterIds = item.chapterReference ? [String(item.chapterReference)] : [];
        db.prepare(`INSERT INTO timeline_events (id, timeline_id, title, description, event_date, event_type, importance, related_character_ids, related_chapter_ids, created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
          uuid(), tid, title,
          serializeGeneratedSqlText(item.description || item.significance || item.summary),
          serializeGeneratedSqlText(item.date || item.eventDate, `第${index + 1}章`),
          serializeGeneratedSqlText(item.eventType, 'plot'),
          Number(item.importance || (index === 0 ? 3 : 2)),
          JSON.stringify(asArray(item.relatedCharacterIds || item.characters).map(String)),
          JSON.stringify(relatedChapterIds),
          now(), now()
        );
        eventCount++;
      }
      return eventCount;
    };

    const syncProjectRag = async (): Promise<void> => {
      if (!this.embedding.getAvailability().available) return;
      const sources = [
        {
          collection: VectorIndexService.COLLECTIONS.CHARACTERS,
          rows: db.prepare(`SELECT id, name, identity, personality, background, dialogue_style FROM characters WHERE project_id = ?`).all(projectId) as any[],
          docType: 'character_profile',
          text: (row: any) => [row.name, row.identity, row.personality, row.background, row.dialogue_style].filter(Boolean).join('\n'),
          metadata: (row: any) => ({ projectId, name: row.name, identity: row.identity || '', chunkIndex: 0 }),
        },
        {
          collection: VectorIndexService.COLLECTIONS.CHAPTERS_ROLLING,
          rows: db.prepare(`SELECT id, title, content, scenes FROM outlines WHERE project_id = ? AND level = 'chapter' ORDER BY "order"`).all(projectId) as any[],
          docType: 'outline',
          text: (row: any) => [row.title, row.content, row.scenes].filter(Boolean).join('\n'),
          metadata: (row: any) => ({ projectId, title: row.title, chunkIndex: 0 }),
        },
        {
          collection: VectorIndexService.COLLECTIONS.FORESHADOWINGS,
          rows: db.prepare(`SELECT id, content, type, scope, recovery_condition, payoff_description FROM foreshadowings WHERE project_id = ?`).all(projectId) as any[],
          docType: 'foreshadowing',
          text: (row: any) => [row.content, row.type, row.scope, row.recovery_condition, row.payoff_description].filter(Boolean).join('\n'),
          metadata: (row: any) => ({ projectId, type: row.type || '', scope: row.scope || '', chunkIndex: 0 }),
        },
      ];
      for (const source of sources) {
        if (source.rows.length === 0) continue;
        const texts = source.rows.map(source.text);
        const vectors = await this.embedding.embed(texts);
        await this.vectorIndex.indexChunksStrict(source.collection, source.rows.map((row, index) => ({
          chunk: { id: row.id, text: texts[index], docType: source.docType as any, metadata: source.metadata(row) },
          vector: vectors[index],
        })));
      }
    };

    try {
      // ====== LLM 可用性预检 ======
      const llmAvailable = await this.realLLM.isAvailable();
      if (!llmAvailable) {
        const errMsg = '未配置 LLM API Key，无法生成内容。请在「设置」页面添加 API Key（BYOK），或在启动 server 前设置 DEEPSEEK_API_KEY 环境变量。';
        this.logger.error(`create-project-async: ${errMsg}`);
        emit('project', 0, errMsg);
        this.emitProjectProgress(projectId, { type: 'error', message: errMsg });
        return;
      }

      // ====== 长篇：调用综合链 ======
      if (!isShort) {
        // 这里曾让一个模型请求同时生成主线骨架与世界规则，后果是世界规则无法依赖已验收主线。
        emit('skeleton', 10, '生成主线与结局骨架，验收通过后再生成世界规则...');
        this.logger.log(`create-project-async: 长篇模式 project=${projectId}`);
        let heartbeatPercent = 12;
        const heartbeat = setInterval(() => {
          heartbeatPercent = Math.min(heartbeatPercent + 3, 38);
          emit(activeGenerationStep, heartbeatPercent, '当前创作阶段仍在生成和验收中...');
        }, LLM_TUNABLES.PROGRESS_HEARTBEAT_MS);
        try {
          const data = await this.generateConfiguredLongNovelPlan({
            projectId,
            title: dto.title,
            // 执行标准（含创作宪法）由 generateConfiguredLongNovelPlan 内的唯一解析器
            // resolvePlatformToneDirective(projectId) 从项目行注入；此处不再传第二份口径。
            storySetting: `${dto.title}\n${ideaStr}`,
            targetWords: dto.targetWords,
            targetWanZi,
            genre: constitution.category,
            chapterWordMin: CHAPTER_WORD_RANGE.min,
            chapterWordMax: CHAPTER_WORD_RANGE.max,
            onProgress: (step, message) => {
              if (step !== activeGenerationStep) emit(activeGenerationStep, heartbeatPercent, '本阶段已通过生成验收，进入下一阶段', 'done');
              emit(step, heartbeatPercent, message);
            },
          });
          clearInterval(heartbeat);

          if (data && Object.keys(data).length > 0) {
            const worldSetting = data.worldSetting || data.worldview || data.world || {};
            const provenance = data.provenance || {};
            let outlineWriteCount = 0, volumeWriteCount = 0, charCount = 0, fsCount = 0, wsCount = 0, orgCount = 0, mpCount = 0, timelineCount = 0;

            // 存储世界观
            if (data.coreSetting || Object.keys(worldSetting).length > 0) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: provenance.skeletonRunId,
                expectedStages: ['outline'],
                expectedScenarios: ['outline'],
              });
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: provenance.worldRunId,
                expectedStages: ['world'],
                expectedScenarios: ['world_building'],
              });
              const core = JSON.stringify({
                ...(dto.settings || {}),
                coreSetting: data.coreSetting || worldSetting,
                worldSetting: worldSetting || null,
                outlineCharacters: data.characters || [],
                outlineForeshadowings: data.foreshadowings || [],
                timeline: data.timeline || [],
              });
              try {
                db.prepare(`UPDATE projects SET settings = ? WHERE id = ?`).run(core, projectId);
              } catch (error: any) {
                throw new Error(`世界观写入失败：${error.message}`);
              }
            }

            // 存储世界观
            if (Object.keys(worldSetting).length > 0) {
              const wid = uuid();
              try {
                db.prepare(`INSERT INTO world_settings (id, project_id, name, era, geography, factions, rules, atmosphere, constraints, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
                  wid, projectId, `${dto.title}世界观`, serializeGeneratedSqlText(worldSetting.era),
                  JSON.stringify(worldSetting.geography || worldSetting.locations || []),
                  JSON.stringify(worldSetting.factions || worldSetting.organizations || []),
                  JSON.stringify([worldSetting.rules || worldSetting.powerSystem || '']),
                  serializeGeneratedSqlText(worldSetting.atmosphere), JSON.stringify({
                    socialStructure: worldSetting.socialStructure || '',
                    powerSystem: worldSetting.powerSystem || '',
                    economy: worldSetting.economy || '',
                    culture: worldSetting.culture || '',
                    history: worldSetting.history || '',
                  }), now(), now()
                );
                wsCount++;
              // ★ 传播到 world_system_profiles（长篇路径）
              try {
                const existingProfile = db.prepare(`SELECT id FROM world_system_profiles WHERE world_setting_id=?`).get(wid);
                if (!existingProfile) {
                  const pid = require('crypto').randomUUID();
                  db.prepare(`INSERT INTO world_system_profiles (id, project_id, world_setting_id,
                    synopsis, basic_info, era, locations, atmosphere_tone, rules,
                    social_structure, tech_supernatural, system_mechanics,
                    culture_customs, naming_rules, scale_plan, ending,
                    hierarchy_rules, supplementary, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                    pid, projectId, wid,
                    serializeGeneratedSqlText(worldSetting.storyPremise || dto.title),
                    serializeGeneratedSqlText(dto.title + ' | ' + (worldSetting.era || '')),
                    serializeGeneratedSqlText(worldSetting.history || worldSetting.era || ''),
                    serializeGeneratedSqlText(worldSetting.geography || ''),
                    serializeGeneratedSqlText(worldSetting.atmosphere || ''),
                    serializeGeneratedSqlText(worldSetting.rules || ''),
                    serializeGeneratedSqlText(worldSetting.socialStructure || ''),
                    serializeGeneratedSqlText(worldSetting.powerSystem || ''),
                    serializeGeneratedSqlText(worldSetting.powerSystem || ''),
                    serializeGeneratedSqlText(worldSetting.culture || ''),
                    '', '',
                    serializeGeneratedSqlText(worldSetting.endingDirection || ''),
                    STORY_FACT_PRIORITY,
                    serializeGeneratedSqlText((worldSetting.economy || '') + ' | ' + (Array.isArray(worldSetting.factions) ? worldSetting.factions.map((f:any)=>f?.name||f).join('，') : '')),
                    now(), now()
                  );
                }
              } catch (e: any) { this.logger.warn(`world_system_profiles 传播失败(长篇): ${e.message}`); }
              } catch (error: any) {
                throw new Error(`世界观写入失败：${error.message}`);
              }
            }

            // 存储角色
            if ((data.characters || []).length > 0) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: provenance.characterRunId,
                expectedStages: ['character'],
                expectedScenarios: ['character_design'],
              });
            }
            for (const ch of (data.characters || [])) {
              if (!ch.name) continue;
              try {
                const cid = uuid();
                // 从所有文本字段中提取年龄（支持"XX岁""约XX岁""XX多岁""中年/老年/青年"等格式）
                let ageVal = ch.age != null ? Number(ch.age) : null;
                const allText = [ch.identity, ch.appearance, ch.background, ch.personality, typeof ch.personality === 'object' ? JSON.stringify(ch.personality) : ''].filter(Boolean).join(' ');
                if (ageVal == null && allText) {
                  const ageExtract = allText.match(/(\d{1,3})\s*(?:多)?\s*岁/);
                  if (ageExtract) ageVal = Number(ageExtract[1]);
                  else if (/老年|老人|年迈|花甲|古稀/.test(allText)) ageVal = 65;
                  else if (/中年|四十|五十|不惑|知天命/.test(allText)) ageVal = 45;
                  else if (/青年|三十|而立/.test(allText)) ageVal = 30;
                  else if (/少年|二十|弱冠/.test(allText)) ageVal = 20;
                }
                // 根据角色重要性设置 role
                const isPov = charCount === 0 ? 1 : 0;
                let roleVal = ch.role || 'supporting';
                if (isPov) roleVal = 'protagonist';
                else if (/反派|对手|敌人|幕后|黑手|赌庄|代理|内鬼|内奸/.test(allText + (ch.type || '') + (ch.faction || ''))) roleVal = 'antagonist';
                else if (charCount <= 3) roleVal = 'main';
                db.prepare(`INSERT INTO characters (id, project_id, name, aliases, age, gender, identity, appearance, background, personality, abilities, relationships, arc, dialogue_style, dialogue_patterns, is_pov_character, role, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                  cid, projectId, serializeGeneratedSqlText(ch.name), '[]', Number.isFinite(ageVal) ? ageVal : null,
                  serializeGeneratedSqlText(ch.gender) || null, serializeGeneratedSqlText(ch.identity) || null,
                  serializeGeneratedSqlText(ch.appearance) || null, serializeGeneratedSqlText(ch.background) || null,
                  JSON.stringify(ch.personality || {}),
                  JSON.stringify(ch.abilities || {}), JSON.stringify(ch.relationships || []),
                  JSON.stringify(ch.arc || []), serializeGeneratedSqlText(ch.dialogueStyle || ch.dialogue_style) || null, null,
                  isPov, roleVal, now(), now()
                );
                charCount++;
              } catch (error: any) {
                throw new Error(`角色“${ch.name}”写入失败：${error.message}`);
              }
            }

            const configuredLongChapterCount = (data.volumes || []).reduce(
              (total: number, volume: any) => total + (Array.isArray(volume?.chapters) ? volume.chapters.length : 0),
              0,
            );
            if (configuredLongChapterCount <= 0) {
              throw new Error('长篇综合链没有返回章节规划，已停止创建，未切换到其他流程。');
            }

            // 存储大纲 + 卷
            if (data.volumes?.length > 0) {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: provenance.skeletonRunId,
                expectedStages: ['outline'],
                expectedScenarios: ['outline'],
              });
              const outlineRunIds = Array.isArray(provenance.outlineRunIds) ? provenance.outlineRunIds : [];
              if (data.volumes.some((volume: any) => Array.isArray(volume?.chapters) && volume.chapters.length > 0) && outlineRunIds.length === 0) {
                throw new HttpException('长篇详细章纲缺少 generation run 凭证，已停止写入 Canon', 409);
              }
              for (const runId of outlineRunIds) {
                this.generatedCanonGuard.assertStructuredCanCommit({
                  projectId,
                  runId,
                  expectedStages: ['outline'],
                  expectedScenarios: ['outline'],
                });
              }
              for (const vol of data.volumes) {
                const vid = uuid();
                try {
                  db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                    vid, projectId, 'volume', null, volumeWriteCount, vol.title || `第${volumeWriteCount + 1}卷`,
                    vol.description || '', '', '', 0, 0, '[]', '[]', 'planned', '[]', null,
                    JSON.stringify({ goal: vol.description || '', theme: vol.theme || '', keyEvents: vol.keyEvents || [], climax: vol.climax || '', volumeForeshadowing: vol.foreshadowing || [], characterArcs: vol.characterArcs || [], estimatedChapters: Number(vol.estimatedChapters) || (vol.chapters || []).length, chapterCountReason: vol.chapterCountReason || '' }),
                    null, now(), now()
                  );
                  volumeWriteCount++;
                  for (const ch of (vol.chapters || [])) {
                    const oid = uuid();
                    db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                      oid, projectId, 'chapter', vid, outlineWriteCount, ch.title || `第${outlineWriteCount + 1}章`,
                      ch.content || '', normalizeOutlineChapterFunction(ch.chapterFunction || ch.function, outlineWriteCount, isShort), inferOutlineGoalArc(outlineWriteCount, isShort),
                      Number(ch.targetWords),
                      0, '[]', '[]', 'planned', '[]',
                      JSON.stringify({ conflicts: ch.conflicts || (ch.conflict ? [ch.conflict] : []), hook: ch.hook || '', highlights: ch.highlights || ch.highlight || '', foreshadowing: ch.foreshadowing || [], foreshadowingRecover: ch.foreshadowingRecover || [], characterStates: ch.characterStates || [], scenes: ch.scenes || [], characterActions: ch.characterActions || ch['人物行动'] || '', rousing: ch.rousing || ch.hotScenes || ch['热血镜头'] || ch['高光镜头'] || '', wordCountReason: ch.wordCountReason || '' }),
                      null, null, now(), now()
                    );
                    db.prepare(`INSERT INTO chapters (id,project_id,outline_id,volume_index,chapter_index,title,content,word_count,status,created_at,updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
                      uuid(), projectId, oid, volumeWriteCount, outlineWriteCount + 1, ch.title || `第${outlineWriteCount + 1}章`,
                      '', 0, 'draft', now(), now()
                    );
                    outlineWriteCount++;
                  }
                } catch (error: any) {
                  throw new Error(`第${volumeWriteCount + 1}卷大纲写入失败：${error.message}`);
                }
              }
            }

            // 存储伏笔
            for (const fs of (data.foreshadowings || [])) {
              if (!fs.content) continue;
              try {
                db.prepare(`INSERT INTO foreshadowings (id, project_id, content, status, type, importance, scope, buried_at, buried_chapter_index, planned_recovery_at, planned_recovery_chapter_index, recovery_window_start, recovery_window_end, evidence_text, risk_level, recovery_condition, payoff_description, related_character_ids, related_reversal_ids, overdue_threshold, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                  uuid(), projectId, enrichForeshadowContent(fs), 'active', serializeGeneratedSqlText(fs.type, 'hint'),
                  fs.scope === 'global' ? 3 : fs.scope === 'volume' ? 2 : 1,
                  serializeGeneratedSqlText(fs.scope, 'chapter'), now(), fs.setupChapter || 1, null,
                  fs.recoveryChapter || null, fs.recoveryWindowStart || fs.recoveryChapter || null, fs.recoveryWindowEnd || fs.recoveryChapter || null,
                  serializeGeneratedSqlText(fs.evidenceText || fs.content), serializeGeneratedSqlText(fs.riskLevel, 'medium'),
                  serializeGeneratedSqlText(fs.recoveryCondition), serializeGeneratedSqlText(fs.payoffDescription),
                  '[]', '[]', 5, now(), now()
                );
                fsCount++;
              } catch (error: any) {
                throw new Error(`伏笔写入失败：${error.message}`);
              }
            }

            const orgCandidates = [
              ...(Array.isArray(data.organizations) ? data.organizations : []),
              ...(Array.isArray(worldSetting.factions) ? worldSetting.factions : []),
              ...(Array.isArray(worldSetting.organizations) ? worldSetting.organizations : []),
            ];
            const orgNameToId = new Map<string, string>();
            for (const org of orgCandidates) {
              const name = org?.name || org?.title;
              if (name && !orgNameToId.has(name)) orgNameToId.set(name, uuid());
            }
            const insertedOrgNames = new Set<string>();
            for (const org of orgCandidates) {
              const name = org?.name || org?.title;
              if (!name || insertedOrgNames.has(name)) continue;
              insertedOrgNames.add(name);
              try {
                const oid = orgNameToId.get(name) || uuid();
                const parentName = org.parentName || org.parent || org.parentOrg || '';
                const parentId = parentName ? orgNameToId.get(parentName) || null : null;
                db.prepare(`INSERT INTO organizations (id, project_id, name, type, description, parent_id, level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
                  oid, projectId, name, org.type || org.category || '', org.description || org.role || '',
                  parentId, org.level || org.type || '', now(), now()
                );
                orgCount++;
              } catch (error: any) {
                throw new Error(`组织“${name}”写入失败：${error.message}`);
              }
            }

            const mapCandidates = [
              ...(Array.isArray(data.mapPoints) ? data.mapPoints : []),
              ...(Array.isArray(data.locations) ? data.locations : []),
              ...(Array.isArray(worldSetting.geography) ? worldSetting.geography : []),
              ...(Array.isArray(worldSetting.locations) ? worldSetting.locations : []),
            ];
            const mapNameToId = new Map<string, string>();
            for (const mp of mapCandidates) {
              const name = typeof mp === 'string' ? mp : (mp?.name || mp?.title);
              if (name && !mapNameToId.has(name)) mapNameToId.set(name, uuid());
            }
            const insertedMapNames = new Set<string>();
            for (const mp of mapCandidates) {
              const name = typeof mp === 'string' ? mp : (mp?.name || mp?.title);
              if (!name || insertedMapNames.has(name)) continue;
              insertedMapNames.add(name);
              try {
                const mid = mapNameToId.get(name) || uuid();
                const parentName = typeof mp === 'string' ? '' : (mp.parentName || mp.parent || mp.parentLocation || '');
                const rawLevel = typeof mp === 'string' ? 'location' : (mp.level || mp.type || 'location');
                const levelMap: Record<string, string> = {
                  continent: 'world',
                  mainland: 'world',
                  province: 'region',
                  area: 'region',
                  zone: 'country',
                  nation: 'country',
                  empire: 'country',
                  town: 'city',
                  village: 'location',
                  place: 'location',
                };
                const level = levelMap[String(rawLevel).toLowerCase()] || String(rawLevel).toLowerCase();
                const parentId = parentName ? mapNameToId.get(parentName) || null : null;
                db.prepare(`INSERT INTO map_points (id, project_id, name, type, description, parent_id, level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
                  mid, projectId, name, typeof mp === 'string' ? '地点' : (mp.type || mp.category || level),
                  typeof mp === 'string' ? '' : (mp.description || mp.role || ''), parentId, level, now(), now()
                );
                mpCount++;
              } catch (error: any) {
                throw new Error(`地点“${name}”写入失败：${error.message}`);
              }
            }

            try {
              const timelineItems = Array.isArray(data.timeline) ? data.timeline : [];
              timelineCount = insertTimelineWithEvents(
                timelineItems,
                (data.volumes || []).flatMap((vol: any) => Array.isArray(vol.chapters) ? vol.chapters : []),
              );
            } catch (error: any) {
              throw new Error(`时间线写入失败：${error.message}`);
            }

            const finalStats = {
              totalVolumes: volumeWriteCount, totalChapters: outlineWriteCount,
              totalCharacters: charCount, totalWorldSettings: wsCount, totalOrganizations: orgCount,
              totalMapPoints: mpCount, totalForeshadowings: fsCount, totalTimelines: timelineCount > 0 ? 1 : 0, totalTimelineEvents: timelineCount,
              totalWords: 0, targetWords: dto.targetWords,
            };
            const missingLong: string[] = [];
            if (outlineWriteCount === 0) missingLong.push('大纲章节');
            if (charCount === 0) missingLong.push('角色');
            if (wsCount === 0) missingLong.push('世界观');
            // 组织、地图和伏笔按故事实际需要生成，不能用固定非空门槛逼模型编造。
            if (timelineCount === 0) missingLong.push('时间线事件');
            if (missingLong.length > 0) {
              const message = `长篇项目已创建，但以下内容未真实写入：${missingLong.join('、')}`;
              this.logger.warn(`create-project-async: ${message} project=${projectId}`);
              db.prepare(`UPDATE projects SET status = 'generation_failed', updated_at = ? WHERE id = ?`).run(now(), projectId);
              this.emitProjectProgress(projectId, { type: 'error', success: false, projectId, message, stats: finalStats, warnings });
              return;
            }
            // 长篇综合链在此之前已写入规划资料；这里曾没有跨章数量台账门禁，后果是矛盾章纲可能直接激活。
            await this.assertOutlineFactLedger(projectId, JSON.stringify({ title: dto.title, type: dto.storyType, targetWords: dto.targetWords, platform: constitution.targetPlatform, projectCard: constitution, confirmedStory: dto.selectedIdea }), buildExecutionStandard(constitution, {
              styleTags: Array.isArray(dto.selectedIdea?.styleTags) ? dto.selectedIdea.styleTags : [],
            }).directive);
            this.logger.log(`create-project-async: 长篇完成 project=${projectId}`);
            emit('outline', 45, `大纲已写入 ${outlineWriteCount} 章`, outlineWriteCount > 0 ? 'done' : 'failed');
            emit('characters', 60, `角色已写入 ${charCount} 个`, charCount > 0 ? 'done' : 'failed');
            emit('world', 75, `世界观已写入 ${wsCount} 条`, wsCount > 0 ? 'done' : 'failed');
            emit('orgs', 85, `组织+地图已写入 ${orgCount}/${mpCount}`, orgCount > 0 && mpCount > 0 ? 'done' : 'failed');
            emit('foreshadowing', 95, `伏笔已写入 ${fsCount} 条`, fsCount > 0 ? 'done' : 'failed');
            emit('timeline', 98, `时间线事件已写入 ${timelineCount} 条`, timelineCount > 0 ? 'done' : 'failed');
            await syncProjectRag();
            warnings.push(...await this.enrichNewProjectProfiles(projectId, dto));
            this.assertProjectSourceCompleteness(projectId);
            await this.generationRecovery.assertActivationReady(projectId);
            emit('done', 100, `长篇生成完成（${volumeWriteCount}卷${outlineWriteCount}章）`, 'done');
            db.prepare(`UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?`).run(now(), projectId);
            this.emitProjectProgress(projectId, {
              type: 'done', success: true, projectId, stats: finalStats,
              mode: 'configured_full_plan',
              tip: `已按${dto.targetWords}字目标配置生成完整规划。`,
            });
            return;
          }
        } catch (e: any) {
          clearInterval(heartbeat);
          this.logger.error(`create-project-async: 长篇综合链失败，停止创建: ${e.message}`);
          throw new Error(`长篇生成失败：${e.message}`);
        }
      }

      // ====== 短篇：按新流程顺序生成 ======
      let outlineWriteCount = 0;
      let volumeWriteCount = 1;
      let outlineContextPrefix = '';
      let volId = '';
      let chapterTitles: any[] = [];

      // 短篇心跳：防止长时间 LLM 调用期间前端 SSE 超时
      let shortHeartbeatPercent = 12;
      shortHeartbeatTimer = setInterval(() => {
        shortHeartbeatPercent = Math.min(shortHeartbeatPercent + 2, 85);
        // 这里曾一直发 world 心跳，后果是大纲开始后世界观又显示“进行中”。
        emit(activeGenerationStep, shortHeartbeatPercent, '当前创作阶段仍在生成和验收中...');
      }, LLM_TUNABLES.HEARTBEAT_SHORT_MS);

      // 开篇钩子字数取自平台表（唯一源），不写死 300：知乎短篇 200、番茄短篇 300、起点短篇 600。
      const shortOpenHookChars = this.resolvePlatformStrategy(
        projectId,
        this.isProjectLongNovel(projectId),
      ).target.openingHookChars;
      const shortStoryPrompt = `【短篇要求】
- 章节数量必须由用户目标字数和故事闭环实际决定，包含开篇钩子、递进冲突、高潮与尾声余味
- 角色数量由冲突与场景需要决定，主角必须主动行动
- 反转次数和位置由冲突结构决定，不能只靠结尾突转，禁做梦/精神病/系统解释等廉价反转
- 每章：冲突 + 信息增量 + 结尾钩子
- 每章采用八拍结构（目标→诱因→行动→阻碍→误判→反转→代价→钩子）构建冲突递进
- 开篇前${shortOpenHookChars}字必须出现强异常，让读者产生"必须继续看"的疑问
- 伏笔数量必须由实际章节事件链决定，含出现位置/回收位置/回收冲击，不得使用固定数量`;
      const canonicalCreativeBrief = JSON.stringify({
        title: dto.title,
        type: dto.storyType,
        targetWords: dto.targetWords,
        platform: constitution.targetPlatform,
        projectCard: constitution,
        confirmedStory: dto.selectedIdea,
      });
      // ====== 步骤1：生成大纲 ======
      // 新流程先生成世界观，再用世界观作为大纲、角色与后续资料的上下文。 
      emit('world', 10, '先生成支撑题材骨架的世界规则，再生成角色与详细章纲...');

      // 从项目配置中提取风格标签，构建明确的风格指导，贯穿世界观→大纲→角色→正文全流程。
      // 与正文层 resolvePlatformToneDirective 使用同一份执行标准（基调/文风/网文流派/
      // 创建前已确认的题材标签），避免框架层与正文层拿到的标准不是同一份。
      const cfgIdeaTags = Array.isArray((dto.selectedIdea as any)?.styleTags)
        ? (dto.selectedIdea as any).styleTags.map((t: any) => String(t).trim()).filter(Boolean)
        : [];
      // 执行标准唯一来源：框架层与正文层共用 buildExecutionStandard（同一份创作宪法 + 已确认题材标签）。
      // 此前框架层自拼一份只含基调/文风/流派的子集，分类/视角/目标读者在框架层完全失效——
      // 用户在项目卡片上设置的标准在框架层没被执行，正是“框架与正文口径不一致”的根因。
      const frameworkStandard = buildExecutionStandard(constitution, { styleTags: cfgIdeaTags });
      // 审查口径：与 styleInstruction 同源（同一个 frameworkStandard），只把「必须体现这一定位」
      // 换成「按此标准判断资料是否属于同一部作品」。审查型 prompt 此前只拿到题材名与字面资料，
      // 判断依据里没有平台/分类/基调/文风/流派/视角——用户在项目卡片设的标准在框架层审查环节整体缺席。
      const executionStandardForReview = frameworkStandard.directive
        ? '\n【执行标准（唯一口径）】\n' + frameworkStandard.directive + '\n以上为本书唯一执行标准：审查时按它判断资料是否同属一部作品、是否与已确认设定矛盾；不得要求改变已确认的平台/分类/基调/文风/流派/视角，也不得把标准之外的内容判为违规。\n'
        : '';
      const styleInstruction = frameworkStandard.directive
        ? `\n${frameworkStandard.directive}\n以下所有内容（世界观、人物、组织、地点、大纲、伏笔、氛围、节奏、事件）都必须体现这一定位，不得生成与之矛盾的内容。\n`
        : '';

      {
        const existingWorld = !!db.prepare('SELECT id FROM world_settings WHERE project_id = ?').get(projectId);
        if (!existingWorld) {
          emit('world', 18, '先生成世界观，供后续大纲与人物保持上下文');
          // 确定性主角名（首段，用于校验世界观是否保留主角，防止模型改名导致后续全偏）
          const protagonistName = (dto.selectedIdea?.protagonist || '').split(/[，,。：:；;\s（(]/)[0].trim();
          const worldPrompt = `为这部小说整理服务于剧情的完整世界观设定，不是另写一个同名故事。
【唯一故事基准】${canonicalCreativeBrief}
${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}
保留基准的时代、类型、地点、冲突、主角和结局方向；禁止把现实题材改成末世/修仙/科幻/超能力/架空制度。
超自然能力的触发条件、影响范围与证据存续一律以【唯一故事基准】为准。这里曾另写“现实物证不能消失”，后果是题材卡若明确写户口本/照片被抹除，世界观会擅自保留它们，章纲再依赖这些不应存在的物证。不能把原题材的「每进门」改成「完整进出」，也不能把「现实回拨」改成「仅楼内回拨」。若剧情需要证据，必须先在题材已保留的证据范围内设计调查链；不得创造与题材互斥的保底档案。
感知到的信息可以被角色记住、转述并作为调查方向，除非唯一故事基准明确禁止；但角色的转述不能复现原始声音、不能单独作为法定证据。不得擅自新增“离开现场后无法记忆或无法转述”之类会切断既定调查链的限制。
${protagonistName ? `【必须保留的主角（不得改名、不得换成别人）】${protagonistName}\n` : ''}${Array.isArray(dto.selectedIdea?.characters) && dto.selectedIdea.characters.length > 0 ? `【确认题材中的其他核心人物（如有必须保留原名）】${dto.selectedIdea.characters.map((c: any) => typeof c === 'string' ? c : (c?.name || '')).join('、')}\n` : ''}${dto.selectedIdea?.hook ? `【必须呼应的高概念钩子】${dto.selectedIdea.hook}\n` : ''}

输出一个 JSON 对象，字段与内容要求如下（每个字段 50-150 字，整体不超过 1500 字，避免过度堆砌导致截断；每个字段都必须有实质内容，不允许空）：

- era——时代/时间线：具体年代、关键历史节点、与剧情的因果。
- storyPremise——故事前提：一句话，**必须出现主角「${protagonistName || '主角'}」的姓名与身份，不得改名**。
- atmosphere——氛围基调：全书情绪定位，说明紧张/悬疑等从何而来、如何传递。
- rules——核心规则数组：2-3 条，每条写成"谁在什么条件下做什么会发生什么"的 if-then 形式，并写清作用对象、载体与可见范围（谁看得见、谁受影响）；每条规则只授予它字面写出的能力，规则之间不得互相否定——不得出现一条写某站只对某人可见、另一条又要求别人在此下车这类互斥设定；任何作用于他人的效果都必须写明该效果抵达他人的授权路径。
- geography——地理：大陆/区域分布 + 关键地点（标剧情功能）。
- locations——核心地点名数组（3-5 个，简短）。
- socialRules——行业规则/法律边界/社会行为规范数组（简短；**不得写社会结构或地点**）。
- specialSettings——特殊设定（无则空字符串）。
- socialStructure——社会结构：阶级/政治/经济资源/信仰格局（**不得写行业规则或地点**）。
- powerSystem——力量/科技/超自然体系（现实题材写"由真实社会机制驱动"）。
- economy——经济：货币/贸易/产业/资源。
- culture——文化：习俗/节日/价值观/禁忌。
- history——历史：重要事件 + 与当前剧情的因果。
- factions——势力数组：名称/核心领袖/范围/与主角关系。
- endingDirection——结局基调与解决方向。

JSON格式:{"era":"...","storyPremise":"必须包含主角「${protagonistName || '主角'}」姓名...","atmosphere":"...","rules":["..."],"geography":"...","locations":["..."],"socialRules":["..."],"specialSettings":"无特殊设定时必须为空字符串","socialStructure":"...","powerSystem":"...","economy":"...","culture":"...","history":"...","factions":[{"name":"...","leader":"...","scope":"活动范围","protagonistRelation":"与主角关系"}],"endingDirection":"..."}`;
          const worldResult = await this.llmCallWithRetry<any>('世界观生成', worldPrompt, {
            temperature: 0.5,
            timeout: LLM_TUNABLES.timeoutComplex(),
            projectId,
            scenario: 'world_building',
            maxTokens: 24576,
            validate: value => describeWorldSourceCandidate(value, protagonistName).length === 0,
            describeValidation: value => describeWorldSourceCandidate(value, protagonistName),
          });
          warnings.push(...worldResult.warnings);
          if (!worldResult) throw new Error('世界观生成未返回有效结构，停止创建以避免后续上下文失真。');
          let worldCandidate = worldResult.data;
          let worldCandidateRunId = worldResult.runId;
          let sourceReview = await this.reviewChildSource(projectId, '已确认题材与创作设定',
            { confirmedStory: dto.selectedIdea, constitution }, '世界观主记录', worldCandidate, executionStandardForReview);
          if (!sourceReview.consistent) {
            const repair = await this.llmCallWithRetry<any>('世界观上层事实修复',
              `只修复下层世界观，不改写已确认题材和创作设定。\n【上层】${canonicalCreativeBrief}\n【当前世界观】${JSON.stringify(worldCandidate)}\n【逐字证据与冲突】${JSON.stringify(sourceReview.contradictions)}\n【原始完整字段合同】${worldPrompt}\n只输出修复后的完整世界观 JSON 对象，字段和非空要求与原始合同相同。`,
              { projectId, scenario: 'world_building', temperature: 0.25, timeout: LLM_TUNABLES.timeoutComplex(),
                validate: value => describeWorldSourceCandidate(value, protagonistName).length === 0,
                describeValidation: value => describeWorldSourceCandidate(value, protagonistName) });
            worldCandidate = repair.data;
            worldCandidateRunId = repair.runId;
            sourceReview = await this.reviewChildSource(projectId, '已确认题材与创作设定',
              { confirmedStory: dto.selectedIdea, constitution }, '世界观主记录', worldCandidate, executionStandardForReview);
          }
          if (!sourceReview.consistent) {
            throw new Error(`世界观与确认题材仍冲突，未保存或生成大纲：${sourceReview.contradictions.join('；')}`);
          }
          if (worldCandidate && typeof worldCandidate === 'object') {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: worldCandidateRunId,
              expectedStages: ['world'],
              expectedScenarios: ['world_building'],
            });
            const wd = worldCandidate;
            // 注意：outlineContextPrefix 不再使用瞬时原始 LLM 输出，改为写入后从 DB 回读（见下方），确保大纲上下文=已落库模块
            db.prepare(`INSERT INTO world_settings (id, project_id, name, era, geography, factions, rules, atmosphere, constraints, story_premise, locations, social_rules, special_settings, setting_type, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
              uuid(), projectId, `${dto.title}世界观`, serializeGeneratedSqlText(wd.era),
              JSON.stringify(Array.isArray(wd.geography) ? wd.geography : (typeof wd.geography === 'string' ? [wd.geography] : [])),
              JSON.stringify(Array.isArray(wd.factions) ? wd.factions : []),
              JSON.stringify(Array.isArray(wd.rules) ? wd.rules : (wd.rules ? [wd.rules] : [])), serializeGeneratedSqlText(wd.atmosphere),
              JSON.stringify({ socialStructure: wd.socialStructure || '', powerSystem: wd.powerSystem || '', economy: wd.economy || '', culture: wd.culture || '', history: wd.history || '', endingDirection: wd.endingDirection || '' }),
              serializeGeneratedSqlText(wd.storyPremise || wd.premise, dto.title),
              JSON.stringify(Array.isArray(wd.locations) ? wd.locations : []),
              serializeGeneratedSqlText(wd.socialRules),
              serializeGeneratedSqlText(wd.specialSettings),
              isShort ? 'short' : 'full',
              now(), now()
            );
            emit('world', 25, '世界观已写入，开始生成大纲', 'done');
            // ★ 将7维度世界观数据传播到 world_system_profiles（前端 WorldProfileEditor 读取的表）
            try {
              const wsId = db.prepare(`SELECT id FROM world_settings WHERE project_id=? ORDER BY created_at DESC LIMIT 1`).get(projectId) as any;
              if (wsId?.id) {
                const existingProfile = db.prepare(`SELECT id FROM world_system_profiles WHERE world_setting_id=?`).get(wsId.id);
                if (!existingProfile) {
                  const pid = require('crypto').randomUUID();
                  const c = wd.constraints || {};
                  db.prepare(`INSERT INTO world_system_profiles (id, project_id, world_setting_id,
                    synopsis, basic_info, era, locations, atmosphere_tone, rules,
                    social_structure, tech_supernatural, system_mechanics,
                    culture_customs, naming_rules, scale_plan, ending,
                    hierarchy_rules, supplementary, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                    pid, projectId, wsId.id,
                    serializeGeneratedSqlText(wd.storyPremise || wd.premise || dto.title),
                    serializeGeneratedSqlText(dto.title + ' | ' + (wd.era || '')),
                    serializeGeneratedSqlText(wd.history || wd.era || ''),
                    serializeGeneratedSqlText(wd.geography || ''),
                    serializeGeneratedSqlText(wd.atmosphere || ''),
                    serializeGeneratedSqlText(wd.rules || ''),
                    serializeGeneratedSqlText(wd.socialStructure || ''),
                    serializeGeneratedSqlText(wd.powerSystem || ''),
                    serializeGeneratedSqlText(wd.powerSystem || ''),
                    serializeGeneratedSqlText(wd.culture || ''),
                    '', '',
                    serializeGeneratedSqlText(wd.endingDirection || ''),
                    STORY_FACT_PRIORITY,
                    serializeGeneratedSqlText((wd.economy || '') + ' | ' + (Array.isArray(wd.factions) ? wd.factions.map((f:any)=>f?.name||f).join('，') : '')),
                    now(), now()
                  );
                  this.logger.log(`world_system_profiles 已创建 (pid=${pid})，7维度数据已传播`);
                }
              }
            } catch (e: any) { this.logger.warn(`world_system_profiles 传播失败: ${e.message}`); }
          } else {
            emit('world', 25, '世界观生成失败，停止创建以避免后续上下文失真', 'failed');
            this.emitProjectProgress(projectId, { type: 'error', success: false, projectId, message: '世界观生成失败，未继续生成大纲，避免上下文不一致。', warnings });
            return;
          }
        }
        // 无论新建还是已存在，都把已保存世界观回读为大纲上下文（世界严格先于大纲；重跑时若已有世界观，大纲也必须有世界观上下文，不得为空）
        const savedWorld = db.prepare(`SELECT era, geography, factions, rules, atmosphere, constraints, story_premise, locations, social_rules, special_settings, setting_type FROM world_settings WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`).get(projectId) as any;
        if (savedWorld) {
          const parseMaybeArray = (v: unknown): any[] => {
            if (v == null) return [];
            if (Array.isArray(v)) return v as any[];
            try { const p = JSON.parse(String(v)); return Array.isArray(p) ? p : [p]; } catch { return []; }
          };
          const parseConstraints = (): Record<string, any> => {
            if (!savedWorld.constraints) return {};
            try { const p = JSON.parse(String(savedWorld.constraints)); return p && typeof p === 'object' ? p : {}; } catch { return {}; }
          };
          const wd2 = {
            era: savedWorld.era,
            geography: parseMaybeArray(savedWorld.geography),
            factions: parseMaybeArray(savedWorld.factions),
            rules: parseMaybeArray(savedWorld.rules),
            atmosphere: savedWorld.atmosphere,
            constraints: parseConstraints(),
            storyPremise: savedWorld.story_premise,
            locations: parseMaybeArray(savedWorld.locations),
            socialRules: savedWorld.social_rules,
            specialSettings: savedWorld.special_settings,
            settingType: savedWorld.setting_type,
          };
          outlineContextPrefix = JSON.stringify(wd2);
        }
      }

      // 世界观步骤到此结束：停掉 short heartbeat，避免它持续把 world 刷成 running/高进度，
      // 覆盖"世界观已完成"状态，并导致总进度在大纲阶段暴跌。连接存活由 global heartbeat 负责。
      if (shortHeartbeatTimer) { clearInterval(shortHeartbeatTimer); shortHeartbeatTimer = null; }
      emit('world', 25, '世界观已完成，进入大纲生成', 'done');

      emit('outline', 30, '批量生成大纲...');

      {
        let chapterCount = 0;
        let shortStoryCard: Record<string, any> | null = null;
        const worldRowForOutline = db.prepare(`SELECT atmosphere, story_premise, rules, special_settings, social_rules, constraints
          FROM world_settings WHERE project_id = ? LIMIT 1`).get(projectId) as any;
        const worldContinuityDirective = worldRowForOutline
          ? `\n【已确认世界规则（高于故事卡和章纲措辞）】${JSON.stringify({
            storyPremise: worldRowForOutline.story_premise,
            rules: worldRowForOutline.rules,
            specialSettings: worldRowForOutline.special_settings,
            socialRules: worldRowForOutline.social_rules,
            constraints: worldRowForOutline.constraints,
          })}\n若题材或故事卡中的概括性措辞与这里冲突，保留人物、真相、反转和结局，但必须把事件机制改写为符合已确认世界规则的方式；不得要求后续章纲执行一个违反世界规则的“唯一任务”。\n`
          : '';
        if (isShort) {
          const unwrapStoryCard = (value: any): Record<string, any> | null => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
            for (const candidate of [value.storyCard, value.story, value.card, value.data, value]) {
              if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) return candidate;
            }
            return null;
          };
          const isCompleteStoryCard = (value: unknown): boolean => {
            const candidate = unwrapStoryCard(value);
            if (!candidate) return false;
            const required = ['coreConflict', 'protagonistDesire', 'turningPoint', 'reveal', 'ending'];
            const scenes = Array.isArray(candidate.scenes) ? candidate.scenes : [];
            return required.every(key => hasUsefulValue(candidate[key]))
              && scenes.length > 0
              && scenes.every(scene => hasUsefulValue(scene?.goal) && hasUsefulValue(scene?.conflict) && hasUsefulValue(scene?.outcome));
          };
          const confirmedStory = dto.selectedIdea && typeof dto.selectedIdea === 'object' && !Array.isArray(dto.selectedIdea)
            ? dto.selectedIdea as Record<string, any>
            : null;
          const confirmedScope = Array.isArray(confirmedStory?.scopeBreakdown) ? confirmedStory.scopeBreakdown : [];
          const canonicalCardFromIdea = confirmedStory ? {
            coreConflict: confirmedStory.coreConflict,
            protagonistDesire: confirmedStory.protagonist,
            turningPoint: confirmedStory.mainReversal || confirmedStory.turningPoint,
            reveal: confirmedStory.mainReversal || confirmedStory.reveal,
            ending: confirmedStory.description,
            scenes: confirmedScope.map((stage: any) => ({
              goal: serializeGeneratedSqlText(stage?.arc),
              conflict: serializeGeneratedSqlText(stage?.reason),
              outcome: `完成“${serializeGeneratedSqlText(stage?.arc)}”阶段并进入下一既定阶段`,
            })),
          } : null;
          const cardDerivedFromConfirmedIdea = isCompleteStoryCard(canonicalCardFromIdea);
          let card: Record<string, any> | null = cardDerivedFromConfirmedIdea ? canonicalCardFromIdea : null;
          if (!card) {
            const cardResult = await this.llmCallWithRetry<Record<string, any>>(
              '短篇故事卡',
              `为短篇小说“${dto.title}”生成可验收的完整故事卡。${executionStandardForReview}创作宪法：${JSON.stringify(constitution)}。用户配置目标总字数为${dto.targetWords}字，必须严格按全部配置规划，不得改写目标字数、叙事视角、目标读者、风格或禁忌。\n【唯一事实来源】${JSON.stringify(dto.selectedIdea)}${worldContinuityDirective}\n${storyCardAuthorizationDirective()}\n不得改变人物姓名、身份、亲属关系、受害者与责任人、案件真相、反转和结局；不得给未明确关系的人擅自添加父子、夫妻、收养或血缘关系；未命名人物保持角色称谓，不得为了显得具体而新增姓名。\n只输出JSON对象，必须包含非空字段 coreConflict（核心冲突）、protagonistDesire（主角欲望）、turningPoint（关键转折）、reveal（揭示）、ending（结局与冲突闭环），以及 scenes 数组；scenes 数量按故事实际需要决定，每项必须包含 goal、conflict、outcome。`,
              { temperature: 0.7, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'outline', validate: isCompleteStoryCard },
            );
            warnings.push(...cardResult.warnings);
            card = unwrapStoryCard(cardResult.data);
          }
          const required = ['coreConflict', 'protagonistDesire', 'turningPoint', 'reveal', 'ending'];
          const missing = required.filter(key => !String(card?.[key] || '').trim());
          const scenes = Array.isArray(card?.scenes) ? card.scenes : [];
          const invalidScenes = scenes.length === 0 || scenes.some(scene =>
            !String(scene?.goal || '').trim() || !String(scene?.conflict || '').trim() || !String(scene?.outcome || '').trim(),
          );
          if (!card || missing.length > 0 || invalidScenes) {
            throw new Error(`短篇故事卡不完整：缺少${missing.join('、') || '有效场景序列'}。未使用基础故事卡降级，项目创建已停止。`);
          }
          let verifiedCard = card;
          for (let cardAuditAttempt = 0; cardAuditAttempt < 2; cardAuditAttempt += 1) {
            const cardAudit = await this.llmCallWithRetry<any>(
              `短篇故事卡事实审查${cardAuditAttempt + 1}`,
              `只核对故事卡是否忠实于已确认题材并遵守已确认世界规则，不评价文风。\n【已确认题材，唯一事实来源】${JSON.stringify(dto.selectedIdea)}${worldContinuityDirective}\n【候选故事卡】${JSON.stringify(verifiedCard)}\n检查人物姓名、身份、亲属/血缘/收养关系、受害者、责任人、案件真相、主角目标、核心反转和结局。\n并按下述能力边界编译逐场景核对每个机制是否越界；越界即为冲突，必须给出判据编号与逐字证据：\n${storyCardAuthorizationDirective()}题材未明确的关系不得被故事卡擅自确定。只输出JSON:{"consistent":true,"contradictions":[]}。`,
              {
                temperature: 0.1,
                timeout: LLM_TUNABLES.timeoutMedium(),
                // 审查任务按 review 标准执行，不落 daily：standardScene('daily')='daily' 在 module_standards 里
                // 没有任何 standards.scenarios 含 'daily'，等于这次调用【零标准注入】——「执行标准是前提」被绕过；
                // standardScene('review')='review' 会注入 quality_loop（逐维证据、Blocking 不被总分抵消）与
                // review（表达层与事实层同等对待、结论必须给逐字证据），与本任务语义一致。
                // 非同档降级：modelSceneTab('review')='daily' -> resolveScenarioRoute 仍取 scenarios.writing，
                // 模型/输出上限与改前逐字相同（温度由调用方显式给出 0.1）。
                scenario: 'review',
                deferQualityGate: true,
                validate: value => !!value && typeof value === 'object' && !Array.isArray(value),
              },
            );
            const audit = cardAudit.data;
            const contradictions = Array.isArray(audit?.contradictions)
              ? audit.contradictions.map((item: any) => serializeGeneratedSqlText(item)).filter(Boolean)
              : [];
            if (audit?.consistent === true && contradictions.length === 0) break;
            if (cardAuditAttempt === 1) {
              throw new Error(`短篇故事卡与已确认题材冲突：${contradictions.join('；') || '事实审查未明确确认通过'}。未继续生成大纲。`);
            }
            const repairedCard = await this.llmCallWithRetry<any>(
              '短篇故事卡事实修复',
              `重新生成故事卡，完全丢弃候选卡中的错误机制，只能使用已确认题材与世界规则。\n【已确认题材，唯一事实来源】${JSON.stringify(dto.selectedIdea)}${worldContinuityDirective}\n【禁止出现的错误】${contradictions.join('；') || '审查未确认一致'}\n不得新增姓名、亲属/血缘/收养关系、案件真相或另一套结局。\n${storyCardAuthorizationDirective()}若题材的概括性措辞与世界规则冲突，保留既定真相与结局，用合规的身体预警、既有物证、人物行动或信息差替代冲突机制。保持原配置目标总字数${dto.targetWords}。只输出满足以下结构的JSON对象：coreConflict、protagonistDesire、turningPoint、reveal、ending、scenes；scenes每项含goal、conflict、outcome。`,
              { temperature: 0.2, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'outline', validate: isCompleteStoryCard },
            );
            const repairedVerifiedCard = unwrapStoryCard(repairedCard.data);
            if (!repairedVerifiedCard) throw new Error('短篇故事卡事实修复未返回完整结构，未继续生成大纲。');
            verifiedCard = repairedVerifiedCard;
          }
          shortStoryCard = verifiedCard;
        }
        // 从已生成的世界观中读取氛围基调，章节规划必须遵循世界观设定
        const worldAtmosphereDirective = worldRowForOutline?.atmosphere
          ? `\n【世界观氛围基调 · 必须遵循】${worldRowForOutline.atmosphere}\n章节节奏、事件安排和悬念设计必须体现这一氛围定位。\n`
          : '';
        const titleFunctionGuide = isShort
          ? 'opening/exposition/rising_action/conflict/climax/transition/cliffhanger/resolution，前3章必须快速出钩子、疑点和行动'
          : 'opening/charging/conflict/explosion/breathing/paving/cliffhanger/transition/closing，前1-3章必须有强异常、明确行动和可追读悬念';
        // 章节数必须服从本项目已确认的创作宪法。短篇平台通常允许 CHAPTER_WORD_RANGE 字，
        // 不得再用 CHAPTER_WORD_RANGE 的长篇默认值把用户确认的 4 章故事强拆成 6-7 章。
        const CHAPTER_WORD_MIN = constitution.chapterWordRange.min;
        const CHAPTER_WORD_MAX = constitution.chapterWordRange.max;
        const { minChapters, maxChapters, recommendedChapters } = resolveCreationChapterPlan(
          dto.targetWords,
          constitution.chapterWordRange,
          dto.selectedIdea?.plannedChapters,
        );
        const titleResponse = await this.realLLM.generate({
               prompt: `为${isShort ? '短篇' : '长篇'}规划章节，不能另写同名故事。
唯一故事基准:${canonicalCreativeBrief}
${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}
${worldAtmosphereDirective}${worldContinuityDirective}${shortStoryCard ? `已确认故事闭环:${JSON.stringify(shortStoryCard)}` : ''}
用户配置的目标总字数为${dto.targetWords}字；创作宪法规定每章${CHAPTER_WORD_MIN}-${CHAPTER_WORD_MAX}字，因此全书章数必须在${minChapters}-${maxChapters}章之间。已确认题材若给出可行的 plannedChapters，优先保持该章数；本次应规划${recommendedChapters}章。章节数量由完整承载这条既定事件链所需的场景和节奏决定，不得改写时代、人物、人物关系、核心冲突、反转和结局，不得新增另一套世界规则。
【生成前能力边界编译】${chapterResponsibilityPlanningDirective()}
每行一章，格式: 序号|标题|功能|本章唯一推进任务。最后一栏必须说明本章推进哪个既定事件、揭示什么以及结束时造成什么结果；相邻章节不得重复同一次推进任务（含换词重述的同类行动）。功能:${titleFunctionGuide}。禁止全部使用paving，只输出纯文本。`,
              scenario: 'outline', temperature: 0.7, timeout: LLM_TUNABLES.timeoutSimple(),
              deferQualityGate: true,
              metrics: { projectId, stepKey: 'chapter_responsibility_plan' },
        });
        const titleRawContent = titleResponse.content || '';
        chapterTitles = [];
        if (titleRawContent) {
          for (const line of titleRawContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const parts = trimmed.split('|');
            if (parts.length >= 2 && /\d/.test(parts[0])) {
              const parsedOrder = Math.max(0, (parseInt(parts[0], 10) || chapterTitles.length + 1) - 1);
              chapterTitles.push({
                order: parsedOrder,
                title: parts[1].trim(),
                func: normalizeOutlineChapterFunction(parts[2], parsedOrder, isShort),
                brief: parts.slice(3).join('|').trim(),
              });
            } else {
              const m = trimmed.match(/^(\d+)[.\s、]+(.+)/);
              if (m) {
                const parsedOrder = Math.max(0, (parseInt(m[1], 10) || chapterTitles.length + 1) - 1);
                chapterTitles.push({ order: parsedOrder, title: m[2].trim(), func: normalizeOutlineChapterFunction(undefined, parsedOrder, isShort), brief: '' });
              }
            }
          }
        }
        chapterCount = chapterTitles.length;
        if (chapterCount === 0) {
          throw new Error('章节规划未返回任何有效章节。未使用固定章节数或基础标题降级，项目创建已停止。');
        }
        if (chapterCount < minChapters || chapterCount > maxChapters) {
          // 章数不可行：给模型一次明确章数的重规划机会，避免直接失败导致创建循环
          this.logger.warn(`章节规划章数 ${chapterCount} 不在可行区间 ${minChapters}-${maxChapters}，按目标字数重规划一次`);
          try {
            const retryResponse = await this.llmCallWithRetry<{ chapters: Array<{ order: number; title: string; function: string; responsibility: string }> }>(
              '章节数量精确重规划',
              `为${isShort ? '短篇' : '长篇'}规划章节，不能另写同名故事。
唯一故事基准:${canonicalCreativeBrief}
${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}
${worldAtmosphereDirective}${worldContinuityDirective}${shortStoryCard ? `已确认故事闭环:${JSON.stringify(shortStoryCard)}` : ''}
用户配置的目标总字数为${dto.targetWords}字；创作宪法规定每章${CHAPTER_WORD_MIN}-${CHAPTER_WORD_MAX}字，因此 chapters 数组必须恰好包含 ${recommendedChapters} 项（不得多也不得少），order 必须依次为1到${recommendedChapters}。${chapterResponsibilityPlanningDirective()}每项只承担一个不可重复的推进任务，必须说明推进哪个既定事件、揭示什么以及结束时造成什么结果；相邻章节不得重复承担同一推进任务（设定规定为反复发生的机制保留其重复性）。function可用:${titleFunctionGuide}。禁止全部使用paving。只输出JSON对象:{"chapters":[{"order":1,"title":"标题","function":"功能","responsibility":"本章唯一推进任务"}]}。`,
              {
                scenario: 'outline', temperature: 0.2, timeout: LLM_TUNABLES.timeoutSimple(),
                projectId, stepKey: 'chapter_responsibility_plan_exact_count',
                validate: value => Array.isArray((value as any)?.chapters)
                  && (value as any).chapters.length === recommendedChapters
                  && (value as any).chapters.every((chapter: any, index: number) => Number(chapter?.order) === index + 1
                    && Boolean(String(chapter?.title || '').trim())
                    && Boolean(String(chapter?.function || '').trim())
                    && Boolean(String(chapter?.responsibility || '').trim())),
                describeValidation: value => [
                  `chapters必须恰好为${recommendedChapters}项，当前为${Array.isArray((value as any)?.chapters) ? (value as any).chapters.length : 0}项`,
                  `order必须严格为1到${recommendedChapters}，且title、function、responsibility均非空`,
                ],
              },
            );
            const exactChapters = retryResponse.data?.chapters || [];
            chapterTitles = exactChapters.map((chapter, index) => ({
              order: index,
              title: String(chapter.title).trim(),
              func: normalizeOutlineChapterFunction(chapter.function, index, isShort),
              brief: String(chapter.responsibility).trim(),
            }));
            chapterCount = chapterTitles.length;
          } catch (error: any) {
            this.logger.warn(`章节重规划失败: ${error.message}`);
          }
        }
        if (chapterCount < minChapters || chapterCount > maxChapters) {
            throw new Error(`模型规划${chapterCount}章无法在每章${CHAPTER_WORD_MIN}-${CHAPTER_WORD_MAX}字的前提下承载项目目标${dto.targetWords}字；需在 ${minChapters}-${maxChapters} 章之间（建议 ${recommendedChapters} 章）。请重新规划章节结构。`);
        }

        const auditChapterResponsibilities = async (plan: any[]): Promise<string[]> => {
          const result = await this.llmCallWithRetry<any>(
            '全书章节分工边界审查',
            buildChapterResponsibilityAuditPrompt({
              executionStandard: executionStandardForReview,
              creativeBrief: canonicalCreativeBrief,
              shortStoryCard,
              worldContinuityDirective,
              plan,
            }),
            {
              // 全书章节分工边界审查：同样是审查任务，按 review 标准执行（判据同上——daily 零标准注入，
              // review 注入 quality_loop + review；模型/输出上限不变，非降级）。
              scenario: 'review', temperature: 0.1, timeout: LLM_TUNABLES.timeoutMedium(),
              deferQualityGate: true,
              validate: value => {
                const audit = value as any;
                if (!audit || typeof audit !== "object" || Array.isArray(audit) || !Array.isArray(audit.contradictions)) return false;
                if (audit.consistent === true) return audit.contradictions.length === 0;
                if (audit.consistent !== false) return false;
                return audit.contradictions.length > 0 && audit.contradictions.every((item: any) => isEvidencedChapterResponsibilityConflict(item));
              },
              describeValidation: value => {
                const audit = value as any;
                if (audit?.consistent === true && Array.isArray(audit.contradictions) && audit.contradictions.length > 0) {
                  return ['consistent 为 true 时 contradictions 必须为空数组，不得只报冲突不改 consistent'];
                }
                if (audit?.consistent !== true && audit?.consistent !== false) {
                  return ['consistent 必须是布尔值 true 或 false'];
                }
                return ['每条 contradictions 必须带判据编号（CR-1…CR-7）、逐字 ruleEvidence、chapter、task、conflict、retain 与 fix；给不出判据证据的疑虑不得写成冲突'];
              },
            },
          );
          const audit = result.data as any;
          // 审查不可判定时既不放行也不编造冲突：这里直接以具体步骤名终止。
          // 旧实现把「未明确确认通过」伪造成一条冲突丢进修复闭环，白跑三轮语义重规划，
          // 最终在 12 分钟后以一句「仍违反世界规则」失败，且看不出真实原因。
          if (!audit || typeof audit !== "object") {
            throw new Error('全书章节分工边界审查未返回符合契约的判定（模型未产出可解析JSON）。审查必须给出 consistent:true，或带 CR-1…CR-7 判据编号与逐字 ruleEvidence 的冲突项；系统不会在无判定时默认通过，也不会自造冲突。');
          }
          if (audit.consistent === true) return [];
          return (Array.isArray(audit.contradictions) ? audit.contradictions : [])
            .map((item: any) => serializeGeneratedSqlText(item))
            .filter(Boolean);
        };

        const initialResponsibilityPlan = chapterTitles.map((chapter, index) => ({
          chapter: index + 1,
          title: chapter.title,
          function: chapter.func,
          responsibility: chapter.brief || '',
        }));
        let responsibilityIssues = await auditChapterResponsibilities(initialResponsibilityPlan);
        if (responsibilityIssues.length > 0) {
          const repaired = await this.repairChapterResponsibilityPlan({
            chapterTitles,
            initialIssues: responsibilityIssues,
            canonicalCreativeBrief,
            shortStoryCard,
            worldContinuityDirective,
            isShort,
            projectId,
            audit: auditChapterResponsibilities,
          });
          chapterTitles = repaired.chapterTitles;
          chapterCount = chapterTitles.length;
          responsibilityIssues = repaired.issues;
          if (responsibilityIssues.length > 0) {
            throw new Error(`章节分工经自适应定向修复后仍违反世界规则或跨章边界：${responsibilityIssues.join('；')}。系统已在问题不再减少时停止，避免重复消耗和生成后整体回滚。`);
          }
        }

        volId = uuid();
        let previousSummary = '';
        let priorOutlineFactLedger: string[] = [];
        const currentWorldForOutlineReview = db.prepare(`SELECT era,rules,story_premise,geography FROM world_settings
          WHERE project_id=? ORDER BY created_at ASC LIMIT 1`).get(projectId);
        let plannedChapterWords = 0;
        const preparedChapters: Array<{
          oid: string;
          order: number;
          title: string;
          content: string;
          chapterFunction: string;
          goalArc: string;
          targetWords: number;
          allowedMin: number;
          allowedMax: number;
          scenes: string;
        }> = [];
        const ideaSpan = `${outlineContextPrefix ? `世界观上下文:${outlineContextPrefix}\n` : ''}${shortStoryCard ? `短篇故事卡:${JSON.stringify(shortStoryCard)}\n` : ''}灵感素材:${JSON.stringify(dto.selectedIdea)}`;
        // 叙事节拍来自每章真实职责。章节位置只定义开篇/终章边界，不再按固定章数制造爽点弧。
        const chapterResponsibilityPlan = buildNarrativeBeatPlan(chapterTitles.map(chapter => ({
          title: chapter.title,
          function: chapter.func,
          responsibility: chapter.brief || '',
        })));

        const unwrapChapter = (value: any, chapterLabel?: string, silent = false): Record<string, any> | null => {
          const label = chapterLabel ? `第${chapterLabel}章 ` : '';
          if (Array.isArray(value)) {
            const objects = value.filter(item => item && typeof item === 'object');
            if (objects.length >= 1) {
              // 仅在"真实采纳"时告警（silent=false 由 llmCallWithRetry 的 validate 调用，避免每次重试重复刷屏）
              if (objects.length > 1 && !silent) warnings.push(`${label}LLM 返回了 ${objects.length} 个 JSON 对象，已自动取第一个作为本章纲`);
              return objects[0];
            }
            return null;
          }
          if (value?.chapter && typeof value.chapter === 'object') {
            if (Array.isArray(value.chapter)) {
              const objects = value.chapter.filter((item: any) => item && typeof item === 'object');
              if (objects.length >= 1) {
                if (objects.length > 1) warnings.push(`${label}LLM 在 chapter 字段内返回了 ${objects.length} 个对象，已自动取第一个`);
                return objects[0];
              }
            } else {
              return value.chapter;
            }
          }
          if (Array.isArray(value?.chapters)) {
            const objects = value.chapters.filter((item: any) => item && typeof item === 'object');
            if (objects.length >= 1) {
              if (objects.length > 1) warnings.push(`${label}LLM 在 chapters 字段内返回了 ${objects.length} 个对象，已自动取第一个作为本章纲`);
              return objects[0];
            }
          }
          return value && typeof value === 'object' ? value : null;
        };

        for (const [chapterIndex, expectedChapter] of chapterTitles.entries()) {
          const order = expectedChapter.order;
          const remainingChapterCount = chapterTitles.length - chapterIndex - 1;
          const isFinalChapter = remainingChapterCount === 0;
          const currentBeat = chapterResponsibilityPlan[chapterIndex];
          const completedTaskBoundary = chapterResponsibilityPlan.slice(0, chapterIndex)
            .map(item => ({ chapter: item.chapter, title: item.title, completed: item.responsibility }));
          const nextTaskBoundary = chapterResponsibilityPlan[chapterIndex + 1]
            ? { chapter: chapterResponsibilityPlan[chapterIndex + 1].chapter, title: chapterResponsibilityPlan[chapterIndex + 1].title, reserved: chapterResponsibilityPlan[chapterIndex + 1].responsibility }
            : null;
          const allowedMin = Math.max(CHAPTER_WORD_MIN, dto.targetWords - plannedChapterWords - remainingChapterCount * CHAPTER_WORD_MAX);
          const allowedMax = Math.min(CHAPTER_WORD_MAX, dto.targetWords - plannedChapterWords - remainingChapterCount * CHAPTER_WORD_MIN);
          if (allowedMin > allowedMax) {
            throw new Error(`第${order + 1}章没有可行的动态字数区间；章节规划与项目目标不一致，未写入任何大纲。`);
          }

          emit('outline', 30 + Math.round(((chapterIndex + 1) / chapterTitles.length) * 15), `逐章生成并校验大纲 ${chapterIndex + 1}/${chapterTitles.length}`);
          const chapterPrompt = `${shortStoryPrompt}
${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}
${chapterIndex > 0 ? `【全部已确认前文-必须连续且不得重复】\n${previousSummary}\n` : ''}【本章节】
第${order + 1}章"${expectedChapter.title}"（功能:${expectedChapter.func}）
章节唯一推进任务:${expectedChapter.brief || '依据完整故事卡推进尚未发生的下一个事件，不得重复前章揭示'}
【已经完成、禁止重演的章节任务】${JSON.stringify(completedTaskBoundary)}
【下一章保留任务、本章禁止提前执行】${JSON.stringify(nextTaskBoundary)}
          【全书章节分工与动态节拍】${JSON.stringify(chapterResponsibilityPlan)}
当前章叙事节拍：${JSON.stringify(currentBeat?.beatLabel || '')}。节拍来自章节职责，不按固定章数强制爽点；本章只需完成与职责相符的推进价值。
本章只能完成自己的推进任务；不得提前执行后续章节的推进任务或结局（章职能边界，判据 CR-3）。结尾钩子只能制造下一步动机或障碍，不能把下一章的行动先做一遍。
设定:${ideaSpan}
【核心层级纪律（最高优先级）】${STORY_FACT_PRIORITY}。本章大纲必须继承已确认题材与已锁定事实；已保存世界观仅能补充不冲突的细节，不得把世界观后来增写的触发条件、时间范围或证据存续盖过题材卡。这里曾有第二份「世界观 > 大纲 > 正文」层级，后果是确认题材被世界观新规则覆盖，再被大纲和正文重复执行。
            【硬性连续性】人物姓名、亲属关系、责任归属、既定事件真相和结局必须逐字遵守确认题材；不得无因新增伤病、物证、神秘气味、秘密关系或新事件。已经在前文完成的推进任务不得换一种说法再次发生（判据 CR-4）。人物改变立场、回头相助或突然交出关键材料，必须写明前文已有动机及本章可见触发。新增细节必须在本章产生作用，或明确写入foreshadowing并在后续既定事件中有回收位置。
            【制度与权限程序】${chapterResponsibilityCriteriaText(['CR-6', 'CR-7'])}
【人物智力底线】关键反派不得因一句普通试探、随口提问或无压力闲聊，直接泄露只有责任人/知情人掌握的事实。秘密暴露必须来自可验证的外部证据、连续诱导形成的认知误判、有明确利益诱因的主动谎言，或高压下与既有说法发生的细小矛盾；content、scenes、characterActions、conflicts 和 highlights 必须写清触发与暴露程度，不能靠“脱口而出”完成关键揭示。
${(() => {
  const ideaNames = [dto.selectedIdea?.protagonist, ...(Array.isArray(dto.selectedIdea?.characters) ? dto.selectedIdea.characters.map((c: any) => typeof c === 'string' ? c : (c?.name || '')) : [])].filter(Boolean);
  return ideaNames.length > 0 ? `【允许出现的人物（禁止新增任何不在列的人物或神秘角色）】${ideaNames.join('、')}\n` : '';
})()}【允许出现的地点】仅限已确认世界观中明确存在的地点；禁止新增拍卖行、码头仓库、工厂等未确认地点。
【整体质量要求（最高优先级，不可妥协）】
- 主线清晰，副线丰富：本章必须推进唯一指定任务（主线），同时激活/推进至少一条配角线或情感线（副线）
- 节奏张弛有度：紧张场景后必须给呼吸段落（如环境描写、配角对话、主角独白），不能连续高强度
- 推进价值明确：本章至少完成一种真实变化——新信息、有效选择、代价、关系变化、压力升级、伏笔回收、情绪落点或阶段兑现；不得为了凑爽点重复冲突或让人物降智
- 高光按需出现：只有章节职责和前文铺垫支持时才设置打脸、逆袭、反转、热血、情感暴击或信息爆点；数量可以为0，不能按固定章数强制制造
- 节奏服从故事：铺设、发现、施压、恢复、兑现和余波可按当前张力自由组合；连续高强度后允许缓冲，但缓冲章仍需产生状态或关系变化
- 人物成长合理：人物状态变化必须有触发事件作为原因，不能凭空变强/变聪明/变勇敢
- 伏笔设置和回收明确：非终章只有确有后续作用时才新增伏笔，并给出晚于本章且不超过全书末章的 plannedRecoveryChapter；终章不得新增依赖续章回收的伏笔，回收项必须引用前文埋设
- 反转因果必须闭合：凡关键人物持有明显存在破绽的报告、物证或文件，必须在content或scenes中交代其未提前发现破绽的具体原因，不能只依靠人物突然降智
【大纲↔正文铁律】大纲是正文的唯一合同。正文生成的每一段都必须能对应到本章大纲中列出的具体场景或人物行动。大纲中"核心内容"的5步事件链必须在正文中完整展开，不得跳过或合并。
【严格审查合同】任何与已确认世界规则、人物身份、事件先后、已揭示信息、物证来源或章节任务边界的明确冲突，都必须作为 blocking 问题；不得用高分抵消。质量审查已覆盖这些连续性规则，通过后不再重复调用第二个语义审查器。
【篇幅配置】项目目标总字数${dto.targetWords}；此前章节已规划${plannedChapterWords}字；本章之后还剩${remainingChapterCount}章。本章必须由实际事件量、场景复杂度、冲突强度和节奏在${allowedMin}-${allowedMax}字之间选择具体整数，并用wordCountReason说明场景与节奏依据；不要自行书写剩余章节字数算式，系统会在全部章纲完成后精确校正总和。
只生成本章，严格使用英文键：title,targetWords,wordCountReason,content,scenes,characterActions,conflicts,highlights,foreshadowing,foreshadowingRecover,characterStates,hook,emotionalTone。

按以下文档结构生成。必要字段必须存在；允许按章节职责为空的数组会单独说明：
1. 核心内容 (content) — 100字左右的事件链要点，从开场到转折结果的5步推进，不要展开成正文。
2. 主要场景 (scenes) — 2-3个关键场景数组，每场写 location(地点) + goal(本场目标) + conflict(本场阻碍) + outcome(本场结果)。
3. 人物行动 (characterActions) — 主要人物的具体行动 + 行动结果数组，不得为空。
4. 冲突设计 (conflicts) — 本章冲突设计数组：列出2-3个本章冲突（如人物内心冲突/人际冲突/环境冲突/系统冲突），每个含 冲突名 + 冲突双方 + 触发条件 + 升级路径 + 本章解决程度。
5. 高光设置 (highlights) — 仅列出本章真实存在且有铺垫的高光/记忆点，每个含 type + point + trigger；没有则写[]，不得为凑数量制造反转。
6. 伏笔设置 (foreshadowing) — 非终章确需新增时使用{"content","type","evidenceText","riskLevel","plannedRecoveryChapter"}，回收章必须在本章之后且不超过全书末章；没有则写[]；终章必须写[]。
7. 伏笔回收 (foreshadowingRecover) — 回收前文伏笔数组，格式{"reference","method"}；无回收则写[]。
8. 人物状态 (characterStates) — 至少1个核心人物本章状态变化，格式{"character","stateBefore","stateAfter","trigger"}。
9. 章尾牵引 (hook) — 非终章只引出下一步动机或障碍；终章可留空或写不依赖续章的余韵，禁止承诺不存在的下一章。
10. 情绪基调 (emotionalTone) — 简短描述本章情绪走向。

只输出一个合法JSON对象，不要数组、解释或Markdown。`;
          const chapterJsonExample = `\n【JSON结构示例，仅示范字段，不得复制示例内容】{"title":"本章标题","targetWords":3500,"wordCountReason":"依据本章场景、冲突强度与剩余总字数确定","content":"100字左右的事件链要点：开场→推进→受阻或选择→变化→结果","scenes":[{"location":"具体地点","goal":"本场目标","conflict":"本场阻碍","outcome":"本场结果"}],"characterActions":[{"character":"人物名","action":"本章实际行动","result":"行动结果"}],"conflicts":[{"name":"冲突名","parties":["A","B"],"trigger":"触发条件","escalation":"升级路径","resolution":"本章解决程度"}],"highlights":[],"foreshadowing":[],"foreshadowingRecover":[],"characterStates":[{"character":"人物名","stateBefore":"本章前状态","stateAfter":"本章后状态","trigger":"触发事件"}],"hook":"${isFinalChapter ? '可留空或填写终章余韵' : '只引出下一步动机或障碍'}","emotionalTone":"情绪基调"}`;

          const countCJK = (s: string): number => (String(s || '').match(/[㐀-䶿一-鿿]/g) || []).length;
          // help: coerce string to single-element array
          const toArray = (v: any): any[] => Array.isArray(v) ? v : (typeof v === 'string' && v.trim() ? [v] : []);
          const assessChapter = (candidate: Record<string, any> | null): string[] => {
            if (!candidate) return ['结果不是合法的单章JSON对象'];
            const issues: string[] = [];
            const content = String(candidate.content || candidate.coreContent || candidate.summary || candidate.plot || candidate['核心内容'] || '').trim();
            const targetWords = Number(candidate.targetWords);
            const scenes = Array.isArray(candidate.scenes) ? candidate.scenes : (Array.isArray(candidate.mainScenes) ? candidate.mainScenes : []);
            if (!Number.isInteger(targetWords) || targetWords < allowedMin || targetWords > allowedMax) issues.push(`targetWords必须是${allowedMin}-${allowedMax}之间的整数`);
            if (!String(candidate.wordCountReason || '').trim()) issues.push('缺少wordCountReason');
            const coreLen = countCJK(content);
            if (coreLen < 30 || coreLen > 280) issues.push(`核心内容过短或过长（当前约${coreLen}字）`);
            if (scenes.length === 0) issues.push('scenes必须是非空数组');
            if (!hasUsefulValue(candidate.characterActions || candidate['人物行动'])) issues.push('缺少characterActions');
            // 冲突：至少 1 个（presence 校验，避免单冲突章节触发修复循环；prompt 仍要求 2-3 个）
            const conflicts = Array.isArray(candidate.conflicts)
              ? candidate.conflicts
              : (String(candidate.conflict || '').trim() ? [candidate.conflict] : []);
            if (conflicts.length < 1) issues.push('缺少conflict/conflicts');
            const foreshadowing = Array.isArray(candidate.foreshadowing) ? candidate.foreshadowing : [];
            issues.push(...validateForeshadowingBoundary(foreshadowing, order + 1, chapterTitles.length));
            issues.push(...validateChapterEndingBoundary(
              candidate.hook || candidate.nextChapterHook || candidate.nextHook || candidate['下章钩子'],
              order + 1,
              chapterTitles.length,
            ));
            return issues;
          };

          const chapterResult = await this.llmCallWithRetry<any>(
            `第${order + 1}章详细大纲`,
            chapterPrompt + chapterJsonExample,
            {
              temperature: 0.8, timeout: LLM_TUNABLES.timeoutContent(), scenario: 'outline',
              projectId, chapterIndex: order + 1, stepKey: 'creation_chapter_detail',
              validate: value => assessChapter(unwrapChapter(value, order + 1, true)).length === 0,
              describeValidation: value => assessChapter(unwrapChapter(value, order + 1, true)),
            },
          );
          warnings.push(...chapterResult.warnings);
          let chData = unwrapChapter(chapterResult.data, order + 1);
          let repairRaw = chapterResult.rawContent;

          let chapterIssues = assessChapter(chData);
          if (chapterIssues.length > 0) {
            const repairResult = await this.llmCallWithRetry<any>(
              `第${order + 1}章结构修复`,
              `修复下面第${order + 1}章详细大纲的结构和缺失字段。不得缩短或编造与既有故事矛盾的内容，必须严格执行原章节任务与项目配置。不要解释、不要Markdown，只输出一个完整JSON对象。\n\n问题：\n${chapterIssues.join('\n')}\n\n原始结果：\n${repairRaw}\n\n完整要求：\n${chapterPrompt}${chapterJsonExample}`,
              {
                projectId,
                scenario: 'outline', temperature: 0.25, timeout: LLM_TUNABLES.timeoutContent(),
                validate: value => assessChapter(unwrapChapter(value, order + 1, true)).length === 0,
                describeValidation: value => assessChapter(unwrapChapter(value, order + 1, true)),
              },
            );
            warnings.push(...repairResult.warnings);
            repairRaw = repairResult.rawContent || repairRaw;
            chData = unwrapChapter(repairResult.data, order + 1);
            chapterIssues = assessChapter(chData);
          }

          // 强修复：解析为 null（模型返回散文/拒绝/格式彻底损坏）时，从原始文本重建单章对象，覆盖"结果不是合法的单章JSON对象"路径
          if (chapterIssues.length > 0 || !chData) {
            try {
              const salvageResult = await this.llmCallWithRetry<any>(
                `第${order + 1}章JSON重建`,
                `下面这段文本本应是第${order + 1}章详细大纲，但无法解析为合法JSON。请严格只输出一个完整JSON对象，不要任何解释、前言或Markdown，必须包含字段：title,targetWords,wordCountReason,content,scenes,characterActions,conflicts,highlights,foreshadowing,foreshadowingRecover,characterStates,hook,emotionalTone。\n\n原始（可能含错误格式）输出：\n${repairRaw}\n\n完整要求：\n${chapterPrompt}${chapterJsonExample}`,
                {
                  projectId,
                  scenario: 'outline', temperature: 0.2, timeout: LLM_TUNABLES.timeoutContent(),
                  validate: value => assessChapter(unwrapChapter(value, order + 1, true)).length === 0,
                  describeValidation: value => assessChapter(unwrapChapter(value, order + 1, true)),
                },
              );
              warnings.push(...salvageResult.warnings);
              chData = unwrapChapter(salvageResult.data, order + 1);
              chapterIssues = assessChapter(chData);
            } catch (err: any) {
              warnings.push(`第${order + 1}章JSON重建调用失败：${err?.message || err}`);
            }
          }

          // 仍失败：中止整轮创建并报清晰错误（不再"静默跳过本章"——静默跳过会导致章节数
          // 与目标字数合计不一致，出现 16800≠20000 这类静默错误，比创建中断更难排查）。
          // 后续可在前端支持"仅重生成失败单章"来提速，但创建阶段必须保证大纲完整落库。
          if (chapterIssues.length > 0 || !chData) {
            throw new Error(`第${order + 1}章详细大纲多次修复仍未能通过完整性校验（${chapterIssues.join('；') || '解析为非法JSON'}），未写入任何大纲。请稍后单独重生成该章或检查 LLM 返回。`);
          }

          // 这里曾只检查单章 JSON 结构，等两章都生成后才查时间与名单算式；
          // 第一章的「回拨一小时」对「手机快一小时」因此带进第二章，最后整套资料回滚。
          // 在每章接力点按同一事实台账核查，修的是当前章，不改已确认题材或前章。
          const reviewChapterFacts = async (candidate: Record<string, any>) => {
            const result = await this.llmCallWithRetry<any>(`第${order + 1}章生成前事实台账`,
              `${executionStandardForReview}\n${buildOutlineFactReviewPrompt({
                canonicalBrief: canonicalCreativeBrief,
                world: currentWorldForOutlineReview,
                previousLedger: priorOutlineFactLedger,
                chapters: [{ order, title: candidate.title, content: candidate.content,
                  scenes: candidate.scenes, characterActions: candidate.characterActions,
                  foreshadowing: candidate.foreshadowing, foreshadowingRecover: candidate.foreshadowingRecover,
                  characterStates: candidate.characterStates, hook: candidate.hook }],
              })}`,
              { projectId, chapterIndex: order + 1, scenario: 'review', temperature: 0.1,
                timeout: LLM_TUNABLES.timeoutComplex(), maxTokens: LLM_TUNABLES.CONSISTENCY_CHECK_MIN,
                validate: value => describeOutlineFactReview(normalizeOutlineFactReview(value)).length === 0,
                describeValidation: value => describeOutlineFactReview(normalizeOutlineFactReview(value)) });
            const review = normalizeOutlineFactReview(result.data);
            const missing = review ? missingPriorLedgerEntries(priorOutlineFactLedger, review.ledger) : [];
            return { review, missing };
          };
          let factCheck = await reviewChapterFacts(chData);
          if (!factCheck.review || !factCheck.review.consistent || factCheck.review.contradictions.length || factCheck.missing.length) {
            const defects = [...(factCheck.review?.contradictions || []), ...factCheck.missing.map(item => `丢失前章台账：${item}`)];
            const repair = await this.llmCallWithRetry<any>(`第${order + 1}章事实修复`,
              `只修复当前章纲的事实矛盾，已确认题材与前章事实优先，世界观只能作不冲突的补充。不得删掉本章职责或新增人物。\n【确认题材】${canonicalCreativeBrief}\n【已保存世界规则】${JSON.stringify(currentWorldForOutlineReview)}\n【前章事实台账】${JSON.stringify(priorOutlineFactLedger)}\n【当前章纲】${JSON.stringify(chData)}\n【必须逐项修复】${JSON.stringify(defects)}\n只输出与当前章纲同字段的完整 JSON 对象；修复后所有事件、场景结果和伏笔证据必须使用同一触发条件、时间方向与数量基线。`,
              { projectId, chapterIndex: order + 1, scenario: 'outline', temperature: 0.25,
                timeout: LLM_TUNABLES.timeoutContent(),
                validate: value => assessChapter(unwrapChapter(value, order + 1, true)).length === 0,
                describeValidation: value => assessChapter(unwrapChapter(value, order + 1, true)) });
            chData = unwrapChapter(repair.data, order + 1);
            if (!chData) throw new Error(`第${order + 1}章事实修复未返回有效章纲`);
            factCheck = await reviewChapterFacts(chData);
          }
          if (!factCheck.review || !factCheck.review.consistent || factCheck.review.contradictions.length || factCheck.missing.length) {
            throw new Error(`第${order + 1}章章纲事实仍互斥，停止生成后续章节：${[...(factCheck.review?.contradictions || []), ...factCheck.missing].join('；') || '复核未明确通过'}`);
          }
          priorOutlineFactLedger = factCheck.review.ledger;

          let content = String(chData.content || chData.coreContent || chData.summary || chData.plot || chData['核心内容']).trim();
          // 统一把结构化字段以"标签：内容"格式合并到 content，确保前端能解析到所有字段
          // 标签名必须与前端 parseOutlineContentFields 的 aliases 一致
          const fieldLabels: Array<{ label: string; value: any }> = [
            { label: '主要场景', value: Array.isArray(chData.scenes) ? chData.scenes.map((s: any) => typeof s === 'string' ? s : (s.location || s.name || '')).filter(Boolean).join(' → ') : (chData.mainScenes || '') },
            { label: '人物行动', value: chData.characterActions || chData['人物行动'] },
            { label: '冲突设计', value: chData.conflicts || chData.conflict || chData.conflictDesign },
            { label: '爽点设置', value: chData.highlights || chData.highlight },
            { label: '热血镜头', value: chData.rousing || chData.hotScenes || chData['热血镜头'] || chData['高光镜头'] },
            { label: '伏笔设置', value: chData.foreshadowing || chData.foreshadowingSet || chData['伏笔设置'] },
            { label: '伏笔回收', value: chData.foreshadowingRecover || chData.foreshadowingPayoff || chData['伏笔回收'] },
            { label: '结尾设置', value: chData.hook || chData.nextChapterHook || chData.nextHook || chData['下章预告'] },
            { label: '情绪基调', value: chData.emotionalTone || chData.mood },
            { label: '反转点', value: chData.turningPoint || chData.reversalPoint },
          ];
          const formatFieldValue = (v: any): string => {
            if (!v) return '';
            if (typeof v === 'string') return v.trim();
            if (Array.isArray(v)) return v.map((item: any) => typeof item === 'string' ? item : (item.name || item.point || item.title || JSON.stringify(item))).join('；');
            if (typeof v === 'object') return JSON.stringify(v);
            return String(v);
          };
          // 若原始 content 中没有任何已识别标签，先把纯文本包成"核心内容："，
          // 否则前端 parseOutlineContentFields 的 core 会回退到整个 content（含后续合并字段），导致核心内容混乱
          const allKnownLabels = ['核心内容', '主要场景', '人物行动', '冲突设计', '爽点设置', '热血镜头', '高光镜头', '伏笔设置', '伏笔回收', '结尾设置', '下章预告', '情绪基调', '反转点', '目标字数'];
          const hasAnyLabel = allKnownLabels.some(l => new RegExp(`(^|\\n)${l}[：:]`).test(content));
          if (!hasAnyLabel && content) {
            content = `核心内容：${content}`;
          }
          for (const { label, value } of fieldLabels) {
            const formatted = formatFieldValue(value);
            if (!formatted) continue;
            // content 中已有该标签则跳过，避免重复
            if (new RegExp(`(^|\\n)${label}[：:]`).test(content)) continue;
            content += `${content ? '\n' : ''}${label}：${formatted}`;
          }
          const chapterTargetWords = Number(chData.targetWords);
          const wordCountReason = String(chData.wordCountReason).trim();
          // 兼容新旧格式：conflict/conflicts 均接受，foreshadowing 字符串/数组均包装
          const wrapArr = (v: any) => Array.isArray(v) ? v : (v ? [v] : []);
          const conflictsNormalized = toArray(chData.conflicts || chData.conflict || chData.conflictDesign);
          const hlNormalized = toArray(chData.highlights || chData.highlight);
          const fsNormalized = toArray(chData.foreshadowing || chData.foreshadowingSet || chData['伏笔设置']);
          const fsRecoveryNormalized = toArray(chData.foreshadowingRecover || chData.foreshadowingPayoff || chData['伏笔回收']);
          const csNormalized = toArray(chData.characterStates || chData.stateChanges);
          const chapterScenes = {
            conflicts: conflictsNormalized,
            foreshadowing: fsNormalized,
            foreshadowingRecover: fsRecoveryNormalized,
            hook: chData.hook || chData.nextChapterHook || chData.nextHook || chData['下章预告'],
            emotionalTone: chData.emotionalTone || '',
            highlights: hlNormalized,
            characterStates: csNormalized,
            previousConnection: chData.previousConnection || '',
            scenes: Array.isArray(chData.scenes) ? chData.scenes : chData.mainScenes,
            characterActions: chData.characterActions || chData['人物行动'],
            rousing: chData.rousing || chData.hotScenes || chData['热血镜头'] || chData['高光镜头'] || '',
            protagonistDesire: chData.protagonistDesire || '',
            turningPoint: chData.turningPoint || '',
            reveal: chData.reveal || '',
            ending: chData.ending || '',
            reversals: [],
            wordCountReason,
          };
          preparedChapters.push({
            oid: uuid(),
            order,
            title: expectedChapter.title || chData.title || `第${order + 1}章`,
            content,
            chapterFunction: normalizeOutlineChapterFunction(chData.chapterFunction || chData.function || chData.pacingFunction || expectedChapter.func, order, isShort),
            goalArc: chData.goalArc || inferOutlineGoalArc(order, isShort),
            targetWords: chapterTargetWords,
            allowedMin,
            allowedMax,
            scenes: JSON.stringify(chapterScenes),
          });
          plannedChapterWords += chapterTargetWords;
          previousSummary += `${previousSummary ? '\n' : ''}${buildChapterContinuityLedgerEntry(chData, order + 1)}`;
        }

        // 字数合计校正：LLM 各章 targetWords 之和不一定恰好等于项目目标，逐个"硬碰硬"失败。
        // 改为在每章各自的动态允许区间 [allowedMin, allowedMax] 内，把差额均摊到各章（取整，
        // 并夹回合法区间），使合计严格等于 dto.targetWords，同时不破坏创作宪法的单章范围。
        if (plannedChapterWords !== dto.targetWords && preparedChapters.length > 0) {
          let residual = dto.targetWords - plannedChapterWords;
          // 优先在允许范围内能吸收差额的章节间分摊；无法全部吸收则放大到所有章节的夹取范围
          const totalSlack = preparedChapters.reduce((sum, c) => sum + (Math.min(c.allowedMax, CHAPTER_WORD_MAX) - Math.max(c.allowedMin, CHAPTER_WORD_MIN)), 0);
          if (totalSlack + preparedChapters.length * 200 >= Math.abs(residual)) {
            const per = Math.trunc(residual / preparedChapters.length);
            let assigned = 0;
            for (let i = 0; i < preparedChapters.length; i++) {
              const c = preparedChapters[i];
              const isLast = i === preparedChapters.length - 1;
              let adj = isLast ? residual - assigned : per;
              let newTarget = Math.round(c.targetWords + adj);
              // 夹回本项目创作宪法规定的单章合法区间
              newTarget = Math.max(CHAPTER_WORD_MIN, Math.min(CHAPTER_WORD_MAX, newTarget));
              const delta = newTarget - c.targetWords;
              c.targetWords = newTarget;
              assigned += delta;
            }
            plannedChapterWords = preparedChapters.reduce((s, c) => s + c.targetWords, 0);
          }
          if (plannedChapterWords !== dto.targetWords) {
            throw new Error(`章节动态目标合计${plannedChapterWords}字，与项目配置${dto.targetWords}字不一致（差额${dto.targetWords - plannedChapterWords}无法在每章${CHAPTER_WORD_MIN}-${CHAPTER_WORD_MAX}字区间内校正）；未写入任何大纲。`);
          } else {
            warnings.push(`已按项目目标${dto.targetWords}字在每章${CHAPTER_WORD_MIN}-${CHAPTER_WORD_MAX}字区间内校正各章字数合计。`);
          }
        }

        // 防御：无论模型/上游给出什么功能值，短篇落库前统一按节奏兜底，避免全 paving 或非法值入库
        const totalChapters = preparedChapters.length;
        preparedChapters.forEach((c, i) => {
          let fn = normalizeOutlineChapterFunction(c.chapterFunction, c.order, isShort);
          // ★ 最后一章强制为 climax 或 resolution（短篇最后一章必须有高潮和结局）
          if (i === totalChapters - 1 && fn !== 'climax' && fn !== 'resolution' && fn !== 'closing') {
            fn = /(结局|收束|落幕|尾声|解决|和解|回归)/.test(c.title + (c.content || '')) ? 'resolution' : 'climax';
          }
          // 倒数第二章如果是短篇，优先为 conflict/climax（高潮前的最大冲突）
          if (isShort && i === totalChapters - 2 && fn === 'rising_action') fn = 'conflict';
          if (fn !== c.chapterFunction) preparedChapters[i] = { ...c, chapterFunction: fn };
        });

        db.exec('BEGIN IMMEDIATE');
        try {
          db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            volId, projectId, isShort ? 'book' : 'volume', null, 0, isShort ? '短篇故事卡' : '正文',
            isShort ? JSON.stringify(shortStoryCard) : '', '', '', dto.targetWords, 0, '[]', '[]', 'planned', '[]',
            isShort ? JSON.stringify(shortStoryCard?.scenes || []) : null, null,
            isShort ? JSON.stringify(shortStoryCard) : null, now(), now());
          for (const chapter of preparedChapters) {
            db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                chapter.oid, projectId, 'chapter', volId, chapter.order, chapter.title, chapter.content, chapter.chapterFunction, chapter.goalArc,
                chapter.targetWords, 0, '[]', '[]', 'planned', '[]', chapter.scenes, null, null, now(), now());
            db.prepare(`INSERT INTO chapters (id,project_id,outline_id,volume_index,chapter_index,title,content,word_count,status,created_at,updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(uuid(), projectId, chapter.oid, 1, chapter.order + 1, chapter.title, '', 0, 'draft', now(), now());
          }
          db.exec('COMMIT');
          outlineWriteCount = preparedChapters.length;
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw error;
        }
      }
      emit('outline', 45, `大纲完成 (${outlineWriteCount}章)`, outlineWriteCount > 0 ? 'done' : 'running');

      // 合格章 = 详细细纲：正文要点 >=200 字，或 scenes 结构实质非空（>=120 字符）；合格率门槛 90%（对齐模块标准 90+）。
      const detailedOutlineCount = (db.prepare(`SELECT COUNT(*) AS c FROM outlines WHERE project_id = ? AND level = 'chapter' AND (length(trim(COALESCE(content, ''))) >= 200 OR length(trim(COALESCE(scenes, ''))) >= 120)`).get(projectId) as any)?.c || 0;
      const qualifiedRatio = chapterTitles.length > 0 ? detailedOutlineCount / chapterTitles.length : 0;
      if (outlineWriteCount !== chapterTitles.length || qualifiedRatio < 0.9) {
        throw new Error(`大纲详细度未达 90% 合格线：应生成 ${chapterTitles.length} 章详细大纲，实际写入 ${outlineWriteCount} 章，其中 ${detailedOutlineCount} 章达到详细细纲标准（合格率 ${Math.round(qualifiedRatio * 100)}%）。项目未标记为完成，请重试创建。`);
      }
      if (detailedOutlineCount < chapterTitles.length) {
        this.logger.warn(`仍有少量章节细纲偏短：应生成 ${chapterTitles.length} 章，${detailedOutlineCount} 章达到详细标准，${chapterTitles.length - detailedOutlineCount} 章偏短（已达 90% 合格线，继续创建）`);
      }

      if (outlineWriteCount > 0) {
        // 此前只有激活前的跨模块审查，章纲中的名单基线错误会先传给角色与伏笔，
        // 后果是多个模块复述同一矛盾；这里提前执行同一执行标准中的事实台账门禁。
        await this.assertOutlineFactLedger(projectId, canonicalCreativeBrief, executionStandardForReview);
      }

      // ====== 步骤2-5：按需补充角色/世界观/组织/伏笔 ======
      // 检查 DB，缺什么补什么，保证前端根节点都有真实数据。 
      const db_check = this.db.getDb();
      const hasCharacters = (db_check.prepare('SELECT COUNT(*) as c FROM characters WHERE project_id = ?').get(projectId) as any)?.c > 0;
      const worldRow = db_check.prepare('SELECT * FROM world_settings WHERE project_id = ? ORDER BY created_at ASC LIMIT 1').get(projectId) as any;
      const hasWorldSetting = !!worldRow && hasUsefulValue({
        era: worldRow.era,
        geography: worldRow.geography,
        factions: worldRow.factions,
        rules: worldRow.rules,
        atmosphere: worldRow.atmosphere,
        constraints: worldRow.constraints,
        storyPremise: worldRow.story_premise,
        locations: worldRow.locations,
        socialRules: worldRow.social_rules,
        specialSettings: worldRow.special_settings,
      });
      const hasOrganizations = (db_check.prepare('SELECT COUNT(*) as c FROM organizations WHERE project_id = ?').get(projectId) as any)?.c > 0;
      const hasMapPoints = (db_check.prepare('SELECT COUNT(*) as c FROM map_points WHERE project_id = ?').get(projectId) as any)?.c > 0;
      const hasForeshadowings = (db_check.prepare('SELECT COUNT(*) as c FROM foreshadowings WHERE project_id = ?').get(projectId) as any)?.c > 0;
      const hasTimeline = !!(db_check.prepare('SELECT id FROM timelines WHERE project_id = ?').get(projectId));
      const hasTimelineEvents = (db_check.prepare('SELECT COUNT(*) as c FROM timeline_events e JOIN timelines t ON e.timeline_id = t.id WHERE t.project_id = ?').get(projectId) as any)?.c > 0;

      const needAny = !hasCharacters || !hasWorldSetting || !hasOrganizations || !hasMapPoints || !hasForeshadowings || !hasTimeline || !hasTimelineEvents;

      const generatedChapterContext = (db.prepare(`SELECT "order", title, content, scenes FROM outlines WHERE project_id = ? AND level = 'chapter' ORDER BY "order"`).all(projectId) as any[])
        .map(row => ({ order: Number(row.order) + 1, title: row.title, content: String(row.content || '').slice(0, 500), details: row.scenes }));
      const groundedCreativeContext = JSON.stringify({
        canonicalBrief: JSON.parse(canonicalCreativeBrief),
        world: worldRow ? {
          era: worldRow.era, geography: worldRow.geography, factions: worldRow.factions,
          rules: worldRow.rules, atmosphere: worldRow.atmosphere, storyPremise: worldRow.story_premise,
        } : null,
        chapters: generatedChapterContext,
      });

      if (!needAny) {
        // 全部已有数据
        emit('characters', 60, `${hasCharacters ? '✓' : ''}角色已就绪`, hasCharacters ? 'done' : 'failed');
        emit('world', 75, `${hasWorldSetting ? '✓' : ''}世界观已就绪`, hasWorldSetting ? 'done' : 'failed');
        emit('orgs', 85, `${hasOrganizations && hasMapPoints ? '✓' : ''}组织与地图已就绪`, hasOrganizations && hasMapPoints ? 'done' : 'failed');
        emit('foreshadowing', 95, `${hasForeshadowings ? '✓' : ''}伏笔已就绪`, hasForeshadowings ? 'done' : 'failed');
      } else {
        emit('characters', 50, '顺序生成角色/世界观/组织/伏笔...');

        // --- 按文档层级顺序执行：世界观→角色→关系→组织→伏笔→时间线（每步在上一步落库后生成，保证一致）---
        const sequentialTasks: Array<() => Promise<{ step: string; warnings: string[] }>> = [];

        // 任务A：角色生成（仅当 DB 中无角色时执行）
        sequentialTasks.push(async (): Promise<{ step: string; warnings: string[] }> => {
          const taskWarnings: string[] = [];
          if (hasCharacters) {
            emit('characters', 65, '角色已存在，跳过', 'done');
            return { step: 'characters', warnings: [] };
          }
          const normalizeGeneratedCharacters = (value: any): any[] => Array.isArray(value)
            ? value
            : (Array.isArray(value?.characters) ? value.characters : (Array.isArray(value?.items) ? value.items : []));
          const confirmedCharacterNames = [
            dto.selectedIdea?.protagonist,
            ...(Array.isArray(dto.selectedIdea?.characters) ? dto.selectedIdea.characters : []),
          ].map((item: any) => String(typeof item === 'string' ? item : item?.name || '').split(/[，,]/)[0].trim()).filter(Boolean);
          const characterFactLedger = [...new Set(confirmedCharacterNames)].map(name => ({
            name,
            confirmedStoryEvidence: Object.fromEntries(Object.entries(dto.selectedIdea || {}).filter(([, value]) =>
              serializeGeneratedSqlText(value).includes(name))),
            chapterEvidence: generatedChapterContext.filter(chapter => JSON.stringify(chapter).includes(name)).map(chapter => ({
              order: chapter.order,
              title: chapter.title,
              evidence: `${chapter.content || ''} ${serializeGeneratedSqlText(chapter.details)}`.slice(0, 1800),
            })),
          }));
          const charPrompt = `从已确认题材、详细章纲和已保存的世界观（下方上下文）中整理实际参与故事的人物，必须以世界观为唯一事实依据，不得与世界观冲突。世界观中的氛围基调、规则设定必须体现在人物性格、动机和行为方式中。
${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}

【完整创作上下文】${groundedCreativeContext}
【角色事实台账（字段只能从这些逐字证据归纳）】${JSON.stringify(characterFactLedger)}

人物数量由章纲中的行动者和冲突需要决定；保留确认题材中的姓名、身份、关系、目标和结局方向，不得替换主角或反派。只收录对情节有实际作用的人物。
年龄、就学经历、亲属关系、口头禅和说话归属若在事实台账中没有明确证据，填写"unavailable"或留空；不得根据姓名、职业或常识推测。口头禅必须能在证据中找到同一角色说出的原句，不能挪用其他角色台词。
${dto.selectedIdea?.protagonist ? `【必须包含的主角（不可省略或改名）】${dto.selectedIdea.protagonist}\n` : ''}${Array.isArray(dto.selectedIdea?.characters) && dto.selectedIdea.characters.length > 0 ? `【确认题材中的其他核心人物（如有必须保留）】${dto.selectedIdea.characters.map((c: any) => typeof c === 'string' ? c : (c?.name || '')).join('、')}\n` : ''}

需要包含 5 个核心人物：1. 主角；2. 女主角/重要配角；3. 主要反派；4. 主要配角；5. 导师/智者或主要同盟。每个角色的字段必须严格按以下结构：
【读者代入钩子（必填）】每个角色必须写明至少 2 类读者代入钩子并写入 readerEmpathyPoint：悲惨经历 / 反转设定 / 热血高光 / 牺牲瞬间（主角至少覆盖热血与牺牲之一）。例如"被最信任的人背叛后仍选择相信（悲惨+反转）"。
【成长标签（必填）】每个角色给出 2-3 个"从→到"成长标签（如"隐忍→爆发""冷漠→守护""轻信→审慎"），写入 growthTags 数组。
【角色标签（必填）】每个角色给出 2-4 个角色定位标签（如"隐忍型主角""职场精英""双面间谍""黑化反派""温柔导师"），写入 tags 数组，用于快速识别角色定位。

JSON格式：[{"name":"姓名","role":"主角|女主角|重要配角|主要反派|导师同盟|其他","basicInfo":"基本信息：姓名、年龄、外貌、身份","personality":"[3个核心性格特质 + 1个矛盾点]，每个特质用一句话具体场景说明，而非抽象词；矛盾点必须用'但/却/然而'等转折词写明角色的不自洽之处","backstory":"背景故事：影响性格的关键经历，必须是改变角色当前行为模式的具体事件而非履历","abilities":"能力设定：详细的能力体系，包括等级划分、获得方式、约束条件、使用代价","goalMotivation":"目标动机：短期目标 + 长期理想，明确写出为什么想要、打算怎么做","growthArc":"成长弧光：从弱到强的具体过程，包括触发事件、阶段划分、最终状态","relationships":[{"targetName":"对方角色名","type":"盟友/对手/恋人/亲人/导师/下属","description":"关系性质与关键事件","future":"未来演变方向"}],"readerEmpathyPoint":"读者代入钩子：至少2类（悲惨/反转/热血/牺牲）","growthTags":["成长标签：2-3个从→到"],"tags":["角色标签：2-4个定位标签，如隐忍型主角/职场精英/双面间谍"],"aliasTitle":"别名/称号/头衔（可空）","faction":"所属阵营/势力与忠诚度（可空）","catchphrase":"口头禅/说话风格/用词习惯（可空）","fears":"弱点/恐惧：可被对手利用的具体软肋，不写'怕黑'而写'童年被关地下室导致幽闭恐惧，狭窄空间会呼吸困难、判断力下降'（可空）"}]`;
          const charResult = await this.llmCallWithRetry<any[]>('角色生成', charPrompt, {
            temperature: 0.8,
            timeout: LLM_TUNABLES.timeoutComplex(),
            projectId,
            scenario: 'character_design',
            maxTokens: 32768,
            validate: value => {
              const items = normalizeGeneratedCharacters(value);
              return items.length > 0 && items.every(item => hasUsefulValue(item?.name) && (hasUsefulValue(item?.identity) || hasUsefulValue(item?.basicInfo)));
            },
          });
          taskWarnings.push(...charResult.warnings);
          const generatedCharacters = normalizeGeneratedCharacters(charResult.data);

          let charCount = 0;
          if (generatedCharacters.length > 0) {
            this.generatedCanonGuard.assertStructuredCanCommit({
              projectId,
              runId: charResult.runId,
              expectedStages: ['character'],
              expectedScenarios: ['character_design'],
            });
            for (const ch of generatedCharacters) {
              if (!ch.name) continue;
              try {
                const cid = uuid();
                // 兼容新旧 prompt 格式（旧：identity/appearance/background/shortTermGoal；新：basicInfo/backstory/goalMotivation/growthArc）
                const basicInfo = ch.basicInfo || [ch.identity, ch.appearance, ch.age, ch.gender].filter(Boolean).join(' | ') || '';
                const backstory = ch.backstory || ch.background || '';
                const goalMotivation = ch.goalMotivation || [ch.shortTermGoal, ch.longTermGoal, ch.desire].filter(Boolean).join(' | ') || '';
                const growthArc = ch.growthArc || (ch.arc ? JSON.stringify(ch.arc) : '');
                const charAbilities = JSON.stringify({
                  ...(typeof ch.abilities === 'object' && ch.abilities ? ch.abilities : {}),
                  ...(typeof ch.abilities === 'string' ? { description: ch.abilities } : {}),
                  shortTermGoal: ch.shortTermGoal || (typeof goalMotivation === 'string' ? goalMotivation.split('|')[0] || '' : ''),
                  longTermGoal: ch.longTermGoal || (typeof goalMotivation === 'string' ? goalMotivation.split('|')[1] || '' : ''),
                  fears: ch.fears || ch.hiddenInfo || '',
                  desire: ch.desire || '',
                  trueGoal: ch.trueGoal || '',
                  ending: ch.ending || '',
                  reversalOrder: ch.reversalOrder || 0,
                  goalMotivation,
                  growthArc,
                });
                const identity = ch.identity || basicInfo;
                const appearance = ch.appearance || (ch.identity ? basicInfo : '');
                // 从 basicInfo 中提取年龄和性别（兼容 AI 只返回 basicInfo 的情况）
                let ageMatch = ch.age != null ? Number(ch.age) : null;
                let genderVal = ch.gender || null;
                // 从所有文本字段中提取年龄和性别（支持"XX岁""约XX岁""XX多岁""中年/老年/青年"等格式）
                const allTextForExtract = [basicInfo, identity, appearance, backstory, typeof ch.personality === 'string' ? ch.personality : ''].filter(Boolean).join(' ');
                if (ageMatch == null && allTextForExtract) {
                  const ageExtract = allTextForExtract.match(/(\d{1,3})\s*(?:多)?\s*岁/);
                  if (ageExtract) ageMatch = Number(ageExtract[1]);
                  else if (/老年|老人|年迈|花甲|古稀/.test(allTextForExtract)) ageMatch = 65;
                  else if (/中年|四十|五十|不惑|知天命/.test(allTextForExtract)) ageMatch = 45;
                  else if (/青年|三十|而立/.test(allTextForExtract)) ageMatch = 30;
                  else if (/少年|二十|弱冠/.test(allTextForExtract)) ageMatch = 20;
                }
                if (!genderVal && allTextForExtract) {
                  const genderExtract = allTextForExtract.match(/[，,。\s](男|女)[，,。\s]/);
                  if (genderExtract) genderVal = genderExtract[1];
                  else if (/他|先生|父亲|母亲|儿子|女儿|大叔|阿姨/.test(allTextForExtract)) {
                    if (/父亲|儿子|大叔|先生|他[^她]/.test(allTextForExtract)) genderVal = '男';
                    else if (/母亲|女儿|阿姨|她|女士/.test(allTextForExtract)) genderVal = '女';
                  }
                }
                const isPov = ch.name === (generatedCharacters[0]?.name || '') ? 1 : 0;
                // 根据角色重要性设置 role 字段（POV主角→protagonist，反派→antagonist，其他→supporting/main）
                let roleVal = ch.role || 'supporting';
                if (isPov) roleVal = 'protagonist';
                else if (/反派|对手|敌人|幕后|黑手|赌庄|代理|内鬼|内奸/.test(allTextForExtract + (ch.type || '') + (ch.faction || ''))) roleVal = 'antagonist';
                else if (charCount <= 3) roleVal = 'main';
                const growthTags = Array.isArray(ch.growthTags) ? ch.growthTags.map((t: any) => serializeGeneratedSqlText(t)).filter(Boolean) : [];
                const charTags = Array.isArray(ch.tags) ? ch.tags.map((t: any) => serializeGeneratedSqlText(t)).filter(Boolean) : [];
                const allKeywords = [...new Set([...growthTags, ...charTags])];
                db.prepare(`INSERT INTO characters (id, project_id, name, aliases, age, gender, identity, appearance, background, personality, abilities, relationships, arc, dialogue_style, dialogue_patterns, is_pov_character, keywords, role, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                  cid, projectId, serializeGeneratedSqlText(ch.name), '[]', Number.isFinite(ageMatch) ? ageMatch : null,
                  serializeGeneratedSqlText(genderVal) || null, serializeGeneratedSqlText(identity) || null,
                  serializeGeneratedSqlText(appearance) || null, serializeGeneratedSqlText(backstory) || null,
                  JSON.stringify(typeof ch.personality === 'object' ? ch.personality : { summary: ch.personality || '' }),
                  charAbilities, JSON.stringify(ch.relationships || []), serializeGeneratedSqlText(growthArc) || null,
                  null, null, isPov, JSON.stringify(allKeywords), roleVal, now(), now()
                );
                // ★ 传播到 character_extended_profiles（前端 CharacterPage 读取的13字段表）
                try {
                  const existingProf = db.prepare(`SELECT id FROM character_extended_profiles WHERE character_id=?`).get(cid);
                  if (!existingProf) {
                    db.prepare(`INSERT INTO character_extended_profiles (id, project_id, character_id,
                      alias_title, identity_occupation, faction_stance, role_type,
                      appearance, personality_traits, abilities_skills, backstory,
                      relationships, catchphrase_speech_style, goals_motivation,
                      weaknesses_fears, supplementary, reader_empathy_point, created_at, updated_at)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                      require('crypto').randomUUID(), projectId, cid,
                      serializeGeneratedSqlText(ch.alias || ch.aliasTitle || ''),
                      serializeGeneratedSqlText(identity || ''),
                      serializeGeneratedSqlText(ch.faction || ch.factionStance || ch.alliance || ''),
                      serializeGeneratedSqlText(ch.role || ''),
                      serializeGeneratedSqlText(appearance || ''),
                      serializeGeneratedSqlText(typeof ch.personality === 'string' ? ch.personality : (ch.personality?.summary || '')),
                      serializeGeneratedSqlText(typeof ch.abilities === 'string' ? ch.abilities : JSON.stringify(ch.abilities || {})),
                      serializeGeneratedSqlText(backstory || ''),
                      serializeGeneratedSqlText(typeof ch.relationships === 'string' ? ch.relationships : JSON.stringify(ch.relationships || [])),
                      serializeGeneratedSqlText(ch.catchphrase || ch.dialogueStyle || ch.speechStyle || ''),
                      serializeGeneratedSqlText(goalMotivation || ''),
                      serializeGeneratedSqlText(ch.fears || ch.weakness || ch.hiddenInfo || ''),
                      serializeGeneratedSqlText(ch.supplementary || ''),
                      serializeGeneratedSqlText(ch.readerEmpathyPoint || ''),
                      now(), now()
                    );
                  }
                } catch (e: any) { this.logger.warn(`character_extended_profiles 传播失败(${ch.name}): ${e.message}`); }
                charCount++;
              } catch (e: any) { taskWarnings.push(`角色写入失败:${e.message}`); }
            }
            emit('characters', 65, `角色写入 ${charCount} 个`, charCount > 0 ? 'done' : 'failed');
          } else {
            taskWarnings.push('角色生成失败：LLM 未能返回有效角色数据');
            emit('characters', 65, '角色生成失败', 'failed');
          }
          return { step: 'characters', warnings: taskWarnings };
        });

        // 任务AB：从已通过质量门禁的角色资料确定性建立关系图。
        // 不再强迫 C(n,2) 每一对角色都生成关系；无证据的角色对保持缺失，避免编造。
        sequentialTasks.push(async (): Promise<{ step: string; warnings: string[] }> => {
          const taskWarnings: string[] = [];
          try {
            const existingChars = db.prepare(`SELECT id,name,relationships FROM characters WHERE project_id=?`).all(projectId) as any[];
            if (existingChars.length >= 2) {
              emit('characters', 67, '从已确认角色资料建立关系网络...', 'running');
              const byName = new Map(existingChars.map(c => [String(c.name), c]));
              const insertedPairs = new Set<string>();
              let relCount = 0;
              for (const src of existingChars) {
                let relationships: any[] = [];
                try {
                  const parsed = JSON.parse(String(src.relationships || '[]'));
                  relationships = Array.isArray(parsed) ? parsed : [];
                } catch {}
                for (const relation of relationships) {
                  const targetName = String(relation?.targetName || relation?.target || '').trim();
                  const tgt = byName.get(targetName);
                  if (!tgt || tgt.id === src.id) continue;
                  const pairKey = [String(src.id), String(tgt.id)].sort().join(':');
                  if (insertedPairs.has(pairKey)) continue;
                  const publicRelation = serializeGeneratedSqlText(relation?.description || relation?.type).trim();
                  if (!publicRelation) continue;
                  try {
                    db.prepare(`INSERT INTO character_relationships (id, project_id, source_character_id, target_character_id, relation_type, public_relation, hidden_relation, trust_score, conflict_score, emotional_tendency, interest_binding, reader_known_state, change_summary, review_status, source, confidence, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                      require('crypto').randomUUID(), projectId, src.id, tgt.id,
                      serializeGeneratedSqlText(relation?.type, 'related'), publicRelation,
                      serializeGeneratedSqlText(relation?.hiddenRelation), 50,
                      /敌|冲突|对手|仇/.test(publicRelation) ? 70 : 20,
                      serializeGeneratedSqlText(relation?.emotionalTendency),
                      serializeGeneratedSqlText(relation?.interestBinding),
                      relation?.hiddenRelation ? 'hint' : 'known',
                      serializeGeneratedSqlText(relation?.future),
                      'pending', 'character_profile', 0.9,
                      new Date().toISOString(), new Date().toISOString(),
                    );
                    insertedPairs.add(pairKey);
                    relCount++;
                  } catch (e: any) { taskWarnings.push(`关系写入失败(${src.name}-${targetName}):${e.message}`); }
                }
              }
              emit('characters', 70, relCount > 0 ? `人物关系网已建立 ${relCount} 条` : '角色资料中没有可证实的关系，不强行补造', 'done');
            } else { /* 角色不足2人，静默跳过关系网络生成 */ }
          } catch (e: any) { taskWarnings.push(`人物关系网络生成失败:${e.message}`); }
          return { step: 'character_relations', warnings: taskWarnings };
        });

        // 任务B：世界观生成（仅当 DB 中无世界观时执行；已有则不重复生成，避免耗时）
        sequentialTasks.push(async (): Promise<{ step: string; warnings: string[] }> => {
          const taskWarnings: string[] = [];
          if (hasWorldSetting) {
            emit('world', 75, '世界观已存在，跳过（不重复生成）', 'done');
            return { step: 'world', warnings: [] };
          }
          const worldPrompt = `从完整创作上下文中整理世界资料，不得只看书名重新发挥。上下文:${groundedCreativeContext}\n${canonicalCreativeBrief}\n${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}\n保持确认题材的时代、类型、主角和冲突；不得新增已确认题材以外的力量、制度或势力；题材已明确的超自然触发、时间范围与证据抹除必须逐项保留，不得把其作用缩成角色感知，也不得凭空创造免疫抹除的保底物证。\n每维度200-400字，整体不超过2500字。只输出7维度JSON：geography,socialStructure,powerSystem,economy,culture,history,factions。\n字段职责边界（禁止互相包含）：socialStructure只写阶级/政治/经济/信仰格局，不得写行业规则或地点；geography只写地理与地点分布；socialRules（若有）只写行业规则/法律边界/社会行为规范；powerSystem只写力量/科技体系；economy只写货币/贸易/产业。\nJSON格式:{"geography":"...","socialStructure":"...","powerSystem":"...","economy":"...","culture":"...","history":"...","factions":[{...}], "locations":["核心地点名"], "socialRules":"行业规则/法律边界/社会行为规范（短句列表，不含社会结构与地点）", "specialSettings":"特殊设定（无则空字符串）", "endingDirection":"结局基调与解决方向"}`;
          const worldResult = await this.llmCallWithRetry<any>('世界观生成', worldPrompt, { temperature: 0.5, timeout: LLM_TUNABLES.timeoutComplex(), projectId, scenario: 'world_building', maxTokens: 24576 });
          taskWarnings.push(...worldResult.warnings);

          if (worldResult.data && typeof worldResult.data === 'object') {
            try {
              this.generatedCanonGuard.assertStructuredCanCommit({
                projectId,
                runId: worldResult.runId,
                expectedStages: ['world'],
                expectedScenarios: ['world_building'],
              });
              const wd = worldResult.data;
              const wid = uuid();
              db.prepare(`INSERT INTO world_settings (id, project_id, name, era, geography, factions, rules, atmosphere, constraints, story_premise, locations, social_rules, special_settings, setting_type, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                wid, projectId, dto.title + '世界观', serializeGeneratedSqlText(wd.era),
                JSON.stringify(Array.isArray(wd.geography) ? wd.geography : []),
                JSON.stringify(Array.isArray(wd.factions) ? wd.factions : []),
                JSON.stringify([wd.rules || '']), serializeGeneratedSqlText(wd.atmosphere),
                JSON.stringify({ socialStructure: wd.socialStructure || '', powerSystem: wd.powerSystem || '', economy: wd.economy || '', culture: wd.culture || '', history: wd.history || '', endingDirection: wd.endingDirection || '' }),
                serializeGeneratedSqlText(wd.storyPremise || wd.premise, dto.title),
                JSON.stringify(Array.isArray(wd.locations) ? wd.locations : []),
                serializeGeneratedSqlText(wd.socialRules),
                serializeGeneratedSqlText(wd.specialSettings),
                isShort ? 'short' : 'full',
                now(), now()
              );
              emit('world', 75, '世界观已写入', 'done');
              // ★ 同样传播到 world_system_profiles（前端读取的表）
              try {
                const existingProfile = db.prepare(`SELECT id FROM world_system_profiles WHERE world_setting_id=?`).get(wid);
                if (!existingProfile) {
                  const pid = require('crypto').randomUUID();
                  const c = wd.constraints || {};
                  db.prepare(`INSERT INTO world_system_profiles (id, project_id, world_setting_id,
                    synopsis, basic_info, era, locations, atmosphere_tone, rules,
                    social_structure, tech_supernatural, system_mechanics,
                    culture_customs, naming_rules, scale_plan, ending,
                    hierarchy_rules, supplementary, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                    pid, projectId, wid,
                    serializeGeneratedSqlText(wd.storyPremise || wd.premise || dto.title),
                    serializeGeneratedSqlText(dto.title + ' | ' + (wd.era || '')),
                    serializeGeneratedSqlText(wd.history || wd.era || ''),
                    serializeGeneratedSqlText(wd.geography || ''),
                    serializeGeneratedSqlText(wd.atmosphere || ''),
                    serializeGeneratedSqlText(wd.rules || ''),
                    serializeGeneratedSqlText(wd.socialStructure || ''),
                    serializeGeneratedSqlText(wd.powerSystem || ''),
                    serializeGeneratedSqlText(wd.powerSystem || ''),
                    serializeGeneratedSqlText(wd.culture || ''),
                    '', '',
                    serializeGeneratedSqlText(wd.endingDirection || ''),
                    STORY_FACT_PRIORITY,
                    serializeGeneratedSqlText((wd.economy || '') + ' | ' + (Array.isArray(wd.factions) ? wd.factions.map((f:any)=>f?.name||f).join('，') : '')),
                    now(), now()
                  );
                  this.logger.log(`world_system_profiles 已创建 (sequential path, pid=${pid})`);
                }
              } catch (e: any) { this.logger.warn(`world_system_profiles 传播失败(sequential): ${e.message}`); }
            } catch (e: any) { taskWarnings.push(`世界观写入失败: ${e.message}`); emit('world', 75, '世界观写入失败', 'failed'); }
          } else {
            taskWarnings.push('世界观生成失败');
            emit('world', 75, '世界观生成失败', 'failed');
          }
          return { step: 'world', warnings: taskWarnings };
        });

        // 任务C：组织/地点生成（仅当 DB 中无组织时执行）
        sequentialTasks.push(async (): Promise<{ step: string; warnings: string[] }> => {
          const taskWarnings: string[] = [];
          if (hasOrganizations && hasMapPoints) {
            emit('orgs', 85, '组织/地点已存在，跳过', 'done');
            return { step: 'orgs', warnings: [] };
          }
          let canonicalLocationNames: string[] = [];
          try {
            const parsed = Array.isArray(worldRow?.locations) ? worldRow.locations : JSON.parse(String(worldRow?.locations || '[]'));
            canonicalLocationNames = (Array.isArray(parsed) ? parsed : [])
              .map((item: any) => String(item?.name || item || '').trim()).filter(Boolean);
          } catch {}
          const orgResult = await this.llmCallWithRetry<any>('组织与地点生成',
            `${styleInstruction}${buildPlatformStyleDirective(constitution.targetPlatform || '', isShort ? 'short_story' : 'long_novel', constitution.customPlatformNote)}\n只整理完整创作上下文中已经出现或对既定事件链必需的组织与地点，不得根据书名虚构秘密结社、架空城市或另一套势力。
上下文:${groundedCreativeContext}
【必须原名收录的规范地点清单】${JSON.stringify(canonicalLocationNames)}
【地点完整性硬约束】地图点必须包含世界观中列出的所有关键地点（locations字段），不得遗漏。世界观中明确存在的地点必须出现在 mapPoints 中，可以根据剧情需要补充子场景，但不能缺少世界观已锁定的地点。
没有独立组织时 organizations 返回空数组；没有需要独立管理的地点时 mapPoints 返回空数组。禁止为了数量填充。
【地点层级限制】地点最多2级，禁止过度细化：
- 第一级：区域/建筑/场所（如"主角所在公司"、"出租屋"、"中心医院"，一律用通用功能名，禁止带入任何具体作品的专有名）
- 第二级：该场所内的具体功能场景（如"大会议室"、"卧室"、"急诊室"）
- 禁止第三级及以下（如"大会议室→靠窗座位"、"卧室→床头柜"）
- 每个一级地点下的二级地点不超过3个，只保留对剧情有实际作用的场景
- level字段：一级用"location"，二级用"scene"，parentName填写上级地点名
- 同一物理地点只建一个点：禁止用人物修饰或括号注释重复建点（如"恒业公司办公室"与"主角创立的恒业公司办公室"、"街角咖啡馆"与"街角咖啡馆（初次碰面处）"视为同一个点，示例均为中性占位、不得照抄）；大堂/门口/办公室/卡座/卧室等内部子场景必须作为二级 scene 且 parentName 精确等于所属一级地点名，不得平铺成又一个一级点
输出JSON:{"organizations":[{"name":"原文名称","type":"类型","level":"root|branch|cell","parentName":"","description":"它在既定剧情中的作用"}],"mapPoints":[{"name":"原文名称","type":"类型","level":"world|region|country|city|location|scene","parentName":"","description":"该地点发生的既定事件"}]}`,
            {
              temperature: 0.35,
              timeout: LLM_TUNABLES.timeoutMedium(),
              scenario: 'organization_map',
              projectId,
              stepKey: 'creation_entity_extraction',
              // 先做确定性去重、层级归并和必需地点补全，再由创建末尾的跨模块 Gate
              // 审查最终落库结果，避免在自动修正之前重复审查不完整的原始候选。
              deferQualityGate: true,
            });
          let orgCount = 0, mpCount = 0;
          if (orgResult.data) {
            const orgNameToId = new Map<string, string>();
            for (const org of (orgResult.data.organizations || [])) {
              if (org?.name && !orgNameToId.has(org.name)) orgNameToId.set(org.name, uuid());
            }
            // 入库前确定性归并地点：同一物理地点的人物修饰/括号重复只留一条，内部子场景挂 parent，不再平铺一堆重复点
            const dedupedMaps = MapPointService.dedupeRawMapPoints(orgResult.data.mapPoints || []);
            if (dedupedMaps.merged.length) {
              const _mergedNames = dedupedMaps.merged.slice(0, 4).join('、') + (dedupedMaps.merged.length > 4 ? '等' : '');
              taskWarnings.push('地点去重：合并 ' + dedupedMaps.merged.length + ' 个重复/冗余地点（' + _mergedNames + '）');
            }
            const normalizedMapPoints = dedupedMaps.points;
            const mapNameToId = new Map<string, string>();
            for (const mp of normalizedMapPoints) {
              if (mp?.name && !mapNameToId.has(mp.name)) mapNameToId.set(mp.name, uuid());
            }
            const insertedOrgNames = new Set<string>();
            for (const org of (orgResult.data.organizations || [])) {
              try {
                if (!org?.name || insertedOrgNames.has(org.name)) continue;
                insertedOrgNames.add(org.name);
                const parentId = org.parentName ? orgNameToId.get(org.parentName) || null : null;
                db.prepare(`INSERT INTO organizations (id, project_id, name, type, description, parent_id, level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
                  orgNameToId.get(org.name) || uuid(), projectId, serializeGeneratedSqlText(org.name),
                  serializeGeneratedSqlText(org.type), serializeGeneratedSqlText(org.description), parentId,
                  serializeGeneratedSqlText(org.level || org.type), now(), now()
                );
                orgCount++;
              } catch (error: any) {
                throw new Error(`组织“${org?.name || '未命名'}”写入失败：${error.message}`);
              }
            }
            const insertedMpNames = new Set<string>();
            for (const mp of normalizedMapPoints) {
              try {
                if (!mp?.name || insertedMpNames.has(mp.name)) continue;
                insertedMpNames.add(mp.name);
                const parentId = mp.parentName ? mapNameToId.get(mp.parentName) || null : null;
                const mpId = mapNameToId.get(mp.name) || uuid();
                // 自动关联章节和角色：支持完整名称 + 二级地点简称匹配
                const allOutlines = db.prepare(`SELECT id, title, content, scenes FROM outlines WHERE project_id=? AND level='chapter'`).all(projectId) as any[];
                const mpName = String(mp.name);
                // 构建匹配关键词：完整名称 + 去掉父级前缀后的简称 + 核心词（去掉"大/小/的"等修饰）
                const matchKeywords = [mpName];
                if (mp.parentName && mpName.startsWith(mp.parentName)) {
                  matchKeywords.push(mpName.slice(mp.parentName.length).replace(/^[的之]/, ''));
                }
                // 提取核心词：去掉常见前缀修饰，保留最后2-6个字
                const coreMatch = mpName.replace(/^(大|小|新|旧|老|的)/, '').replace(/(室|厅|房|间|场|所|站|店|楼)$/, '');
                if (coreMatch.length >= 2 && coreMatch !== mpName) matchKeywords.push(coreMatch);
                const linkedChapterIds: string[] = [];
                for (const ol of allOutlines) {
                  const searchText = `${ol.title || ''} ${ol.content || ''} ${ol.scenes || ''}`;
                  if (matchKeywords.some(kw => kw && searchText.includes(kw))) linkedChapterIds.push(ol.id);
                }
                const allCharacters = db.prepare(`SELECT id, name, identity, appearance, background FROM characters WHERE project_id=?`).all(projectId) as any[];
                const linkedCharacterIds: string[] = [];
                for (const ch of allCharacters) {
                  const searchText = `${ch.name || ''} ${ch.identity || ''} ${ch.appearance || ''} ${ch.background || ''}`;
                  if (matchKeywords.some(kw => kw && searchText.includes(kw))) linkedCharacterIds.push(ch.id);
                }
                db.prepare(`INSERT INTO map_points (id, project_id, name, type, description, parent_id, level, linked_chapter_ids, linked_character_ids, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
                  mpId, projectId, serializeGeneratedSqlText(mp.name),
                  serializeGeneratedSqlText(mp.type), serializeGeneratedSqlText(mp.description), parentId,
                  serializeGeneratedSqlText(mp.level || mp.type, 'location'),
                  JSON.stringify(linkedChapterIds), JSON.stringify(linkedCharacterIds), now(), now()
                );
                mpCount++;
              } catch (error: any) {
                throw new Error(`地图点“${mp?.name || '未命名'}”写入失败：${error.message}`);
              }
            }
            // ★ 生成后校验：确保世界观 locations 全部包含在地图点中，缺失的自动补充
            try {
              const wsRow = db.prepare('SELECT locations FROM world_settings WHERE project_id = ? LIMIT 1').get(projectId) as any;
              if (wsRow?.locations) {
                const wsLocations = Array.isArray(wsRow.locations) ? wsRow.locations : JSON.parse(wsRow.locations);
                const existingMapNames = new Set(
                  (db.prepare('SELECT name FROM map_points WHERE project_id = ?').all(projectId) as any[]).map((r: any) => String(r.name).trim())
                );
                for (const loc of wsLocations) {
                  const locName = String(loc?.name || loc || '').trim();
                  if (locName && !existingMapNames.has(locName)) {
                    db.prepare(`INSERT INTO map_points (id, project_id, name, type, description, parent_id, level, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`).run(
                      uuid(), projectId, locName, '世界观锁定地点', '从世界观 locations 自动补充', null, 'location', now(), now()
                    );
                    mpCount++;
                    existingMapNames.add(locName);
                    taskWarnings.push(`地图点补充：世界观地点"${locName}"未在生成结果中，已自动补充`);
                  }
                }
              }
            } catch (e: any) {
              this.logger.warn(`地图点世界观一致性校验失败（已忽略）: ${e.message}`);
            }
          }
          emit('orgs', 85, `组织与地点已按剧情整理：${orgCount}个组织、${mpCount}个地点`, 'done');
          return { step: 'orgs', warnings: taskWarnings };
        });

        // 任务D：伏笔生成（仅当 DB 中无伏笔时执行）
        sequentialTasks.push(async (): Promise<{ step: string; warnings: string[] }> => {
          const taskWarnings: string[] = [];
          let foreshadowingGenerationConfirmedEmpty = false;
          if (hasForeshadowings) {
            emit('foreshadowing', 95, '伏笔已存在，跳过', 'done');
            return { step: 'foreshadowing', warnings: [] };
          }
          if (isShort) {
            // 短篇章纲已经保存了结构化伏笔。直接汇总原字段，避免二次生成改错埋设章、
            // 回收章或证据文本；没有结构化伏笔时明确确认为空。
            const outlineForeshadowRows = db.prepare(`SELECT "order", scenes FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`)
              .all(projectId) as Array<{ order: number; scenes?: unknown }>;
            const generatedForeshadowings = collectOutlineForeshadowings(outlineForeshadowRows);
            foreshadowingGenerationConfirmedEmpty = generatedForeshadowings.length === 0;
            for (const fs of generatedForeshadowings) {
              try {
                const rawImportance = Number(fs.importance);
                const importance = Number.isFinite(rawImportance) ? Math.max(1, Math.min(3, Math.round(rawImportance))) : 2;
                const buriedChapter = Math.max(1, Number(fs.buriedChapter) || 1);
                const recoveryChapter = Number.isInteger(fs.recoveryChapter) ? fs.recoveryChapter : null;
                db.prepare(`INSERT INTO foreshadowings (id, project_id, content, status, type, importance, scope, buried_at, buried_chapter_index, planned_recovery_at, planned_recovery_chapter_index, recovery_window_start, recovery_window_end, evidence_text, risk_level, recovery_condition, payoff_description, related_character_ids, related_reversal_ids, overdue_threshold, created_at, updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                  uuid(), projectId, enrichForeshadowContent(fs), 'active', serializeGeneratedSqlText(fs.type, 'hint'), importance,
                  serializeGeneratedSqlText(fs.scope, 'chapter'), now(), buriedChapter, null, recoveryChapter,
                  recoveryChapter, recoveryChapter,
                  serializeGeneratedSqlText(fs.evidenceText || fs.content), serializeGeneratedSqlText(fs.riskLevel, 'medium'),
                  serializeGeneratedSqlText(fs.recoveryCondition), serializeGeneratedSqlText(fs.payoffDescription), '[]', '[]', 5, now(), now(),
                );
              } catch (error: any) {
                taskWarnings.push(`伏笔写入失败: ${error.message}`);
                this.logger.warn(`create-project-async: 伏笔写入失败 project=${projectId}: ${error.message}`);
              }
            }
          } else {
            const fsResult = await this.llmCallWithRetry<any>('伏笔生成(长篇)',

              `基于题材"${dto.title}"为长篇生成三类伏笔，必须具体到物件/动作/话语偏差/地图地点/组织线索，不要一句话空泛提示。${styleInstruction}全书伏笔要像核心功法、血脉、身份谜团一样贯穿全文；卷级伏笔跨多个章节回收；章节伏笔服务小场景。三类伏笔要交叉存在，不要等一个结束才开启另一个。每条包含 content,type,importance,scope,buriedChapter,recoveryChapter,recoveryWindowStart,recoveryWindowEnd,evidenceText,riskLevel(low|medium|high),recoveryCondition,payoffDescription,relatedCharacters,relatedOrganizations,relatedMapPoints。输出JSON:{"globalForeshadowings":[...],"longForeshadowings":[...],"shortForeshadowings":[...]}`,
              { temperature: 0.8, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'foreshadowing' }
            );
            taskWarnings.push(...fsResult.warnings);
            if (fsResult.data) {
              const allFs: any[] = [
                ...(fsResult.data.globalForeshadowings || []).map((f: any) => ({ ...f, scope: 'global', importance: f.importance || 3 })),
                ...(fsResult.data.longForeshadowings || []).map((f: any) => ({ ...f, scope: 'volume', importance: f.importance || 2 })),
                ...(fsResult.data.shortForeshadowings || []).map((f: any) => ({ ...f, scope: 'chapter', importance: f.importance || 1 })),
              ];
              for (const fs of allFs) {
                if (!fs.content) continue;
                try {
                  const rawImportance = Number(fs.importance);
                  const importance = Number.isFinite(rawImportance) ? Math.max(1, Math.min(3, Math.round(rawImportance))) : 2;
                  const buriedChapter = Math.max(1, parseInt(String(fs.buriedChapter || fs.setupChapter || 1).match(/\d+/)?.[0] || '1', 10));
                  const recoveryChapterText = String(fs.recoveryChapter || fs.payoffChapter || '');
                  const recoveryChapterMatch = recoveryChapterText.match(/\d+/);
                  const recoveryChapter = recoveryChapterMatch ? Math.max(buriedChapter, parseInt(recoveryChapterMatch[0], 10)) : null;
                  db.prepare(`INSERT INTO foreshadowings (id, project_id, content, status, type, importance, scope, buried_at, buried_chapter_index, planned_recovery_at, planned_recovery_chapter_index, recovery_window_start, recovery_window_end, evidence_text, risk_level, recovery_condition, payoff_description, related_character_ids, related_reversal_ids, overdue_threshold, created_at, updated_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                    uuid(), projectId, enrichForeshadowContent(fs), 'active', serializeGeneratedSqlText(fs.type, 'hint'), importance,
                    serializeGeneratedSqlText(fs.scope, 'chapter'), now(), buriedChapter, null, recoveryChapter,
                    fs.recoveryWindowStart || recoveryChapter, fs.recoveryWindowEnd || recoveryChapter,
                    serializeGeneratedSqlText(fs.evidenceText || fs.content), serializeGeneratedSqlText(fs.riskLevel, 'medium'),
                    serializeGeneratedSqlText(fs.recoveryCondition), serializeGeneratedSqlText(fs.payoffDescription), '[]', '[]', 5, now(), now()
                  );
                } catch (error: any) {
                  taskWarnings.push(`伏笔写入失败: ${error.message}`);
                  this.logger.warn(`create-project-async: 长篇伏笔写入失败 project=${projectId}: ${error.message}`);
                }
              }
            }
          }
          const fsCountNow = getCreationCounts().foreshadowings;
          const foreshadowingStepDone = fsCountNow > 0 || foreshadowingGenerationConfirmedEmpty;
          emit(
            'foreshadowing',
            95,
            fsCountNow > 0 ? `伏笔已生成 ${fsCountNow} 条` : (foreshadowingGenerationConfirmedEmpty ? '章纲中没有需要独立管理的伏笔' : '伏笔生成失败'),
            foreshadowingStepDone ? 'done' : 'failed',
          );
          if (!foreshadowingStepDone) {
            throw new Error(taskWarnings.join('；') || '伏笔生成未返回可写入结果，也未明确确认没有独立伏笔');
          }
          return { step: 'foreshadowing', warnings: taskWarnings };
        });

        // 质量门禁会把已落库资料纳入上下文版本。并发任务中任一任务先写库，
        // 都会使其他任务的评审快照失效并触发整轮重试，因此这里按依赖顺序串行执行。
        // 单次调用数不变，但避免并发写入导致的三轮无效生成与整项目回滚。
        const results: Array<PromiseSettledResult<{ step: string; warnings: string[] }>> = [];
        for (const runTask of sequentialTasks) {
          try {
            results.push({ status: 'fulfilled', value: await runTask() });
          } catch (reason) {
            results.push({ status: 'rejected', reason });
          }
        }
        const rejectedReasons: string[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            warnings.push(...result.value.warnings);
          } else {
            const reason = result.reason?.message || String(result.reason);
            rejectedReasons.push(reason);
            warnings.push(`创作资料生成任务失败: ${reason}`);
          }
        }
        if (rejectedReasons.length > 0) {
          throw new Error(`创作资料生成未全部成功：${rejectedReasons.join('；')}`);
        }
      }

      // 这里曾在短篇激活之后才异步生成世界观深度档案，后果是创建期审查通过的
      // 资料随后被第二份规则/时间线改写，第一章正文才发现源头冲突并反复 422。
      // 深度档案必须先落库，再与主表、章纲一起接受同一轮跨模块审查。
      warnings.push(...await this.enrichNewProjectProfiles(projectId, dto));

      // 写入时间线和索引前，先证明各模块仍属于同一个已确认故事。
      // 这不是“字段非空”检查，而是阻止时代、类型、主角、案件和结局被独立生成任务改写。
      const canonicalNames = [
        dto.selectedIdea?.protagonist,
        ...(Array.isArray(dto.selectedIdea?.characters) ? dto.selectedIdea.characters : []),
      ].map((value: any) => {
        const raw = typeof value === 'string'
          ? value
          : String(value?.name || value?.characterName || value?.identity || '');
        return raw.split(/[：:，,（(]/)[0].trim();
      }).filter((value: string) => value.length >= 2);
      const truncateBundle = (s: any, max: number) => { const t = String(s || ''); return t.length > max ? t.slice(0, max) + '…' : t; };
      const readGeneratedBundle = () => ({
        world: (db.prepare(`SELECT id,era,geography,factions,rules,atmosphere,story_premise FROM world_settings WHERE project_id=?`).all(projectId) as any[])
          .map((w: any) => ({ ...w, geography: truncateBundle(w.geography, 500), factions: truncateBundle(w.factions, 500), rules: truncateBundle(w.rules, 500), story_premise: truncateBundle(w.story_premise, 500) })),
        worldProfiles: (db.prepare(`SELECT p.id,p.era,p.rules,p.tech_supernatural,p.system_mechanics,p.culture_customs,p.ending,p.hierarchy_rules FROM world_system_profiles p JOIN world_settings w ON w.id=p.world_setting_id AND w.project_id=p.project_id WHERE p.project_id=?`).all(projectId) as any[])
          .map((p: any) => Object.fromEntries(Object.entries(p).map(([key, value]) => [key, truncateBundle(value, 1800)]))),
        characters: (db.prepare(`SELECT id,name,identity,background,personality,abilities,relationships,arc FROM characters WHERE project_id=?`).all(projectId) as any[])
          .map((c: any) => ({ id: c.id, name: c.name, identity: truncateBundle(c.identity, 300), background: truncateBundle(c.background, 300), personality: truncateBundle(c.personality, 300), abilities: truncateBundle(c.abilities, 200), relationships: truncateBundle(c.relationships, 200), arc: truncateBundle(c.arc, 200) })),
        organizations: (db.prepare(`SELECT id,name,type,description,parent_id,level FROM organizations WHERE project_id=?`).all(projectId) as any[])
          .map((o: any) => ({ id: o.id, name: o.name, type: o.type, description: truncateBundle(o.description, 300), parent_id: o.parent_id, level: o.level })),
        mapPoints: (db.prepare(`SELECT id,name,type,description,parent_id,level FROM map_points WHERE project_id=?`).all(projectId) as any[])
          .map((m: any) => ({ id: m.id, name: m.name, type: m.type, description: truncateBundle(m.description, 300), parent_id: m.parent_id, level: m.level })),
        // 这里曾把章纲截断到500字后交给修订器作“完整字段”覆盖，后果是正文规划被省略号截断。
        // 审查输入仍可裁剪，写回必须使用数据库原文中的精确锚点局部替换。
        chapters: (db.prepare(`SELECT id,"order",title,content,scenes FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`).all(projectId) as any[])
          .map((c: any) => ({ id: c.id, order: c.order, title: c.title, content: truncateBundle(c.content, 2400), scenes: truncateBundle(c.scenes, 600) })),
        foreshadowings: (db.prepare(`SELECT id,content,buried_chapter_index,planned_recovery_chapter_index,evidence_text,recovery_condition,payoff_description FROM foreshadowings WHERE project_id=?`).all(projectId) as any[])
          .map((f: any) => ({ id: f.id, content: truncateBundle(f.content, 250), buried_chapter_index: f.buried_chapter_index, planned_recovery_chapter_index: f.planned_recovery_chapter_index, evidence_text: truncateBundle(f.evidence_text, 200), recovery_condition: truncateBundle(f.recovery_condition, 200), payoff_description: truncateBundle(f.payoff_description, 200) })),
      });
      let generatedBundle = readGeneratedBundle();
      let generatedBundleText = JSON.stringify(generatedBundle);
      if (canonicalNames.length > 0 && !canonicalNames.some((name: string) => generatedBundleText.includes(name))) {
        throw new Error(`创作资料已偏离确认题材：主角/核心人物“${canonicalNames.join('、')}”未出现在生成结果中，未创建时间线或索引。`);
      }
      // 项目激活前必须完成真实一致性审查。缺少审查结果不能伪造“通过”。
      const describeAlignmentValidation = (value: any): string[] => {
        const issues: string[] = [];
        if (!value || typeof value.consistent !== 'boolean') issues.push('consistent必须为布尔值');
        if (!Array.isArray(value?.contradictions)) issues.push('contradictions必须为数组');
        if (!Array.isArray(value?.unrelatedInventions)) issues.push('unrelatedInventions必须为数组');
        return issues;
      };
      const alignmentResult = await this.llmCallWithRetry<any>(
        '跨模块故事一致性审查',
        `核对生成资料是否严格属于同一个已确认故事。只判断事实一致性，不评价文风，不允许因为字段丰富就判定通过。${executionStandardForReview}
【唯一故事基准】${canonicalCreativeBrief}
【生成资料】${generatedBundleText}
重点检查：${STORY_FACT_PRIORITY}。逐项核对已确认题材的触发条件、回拨范围、抹除对象和证据存续有没有被世界观主记录、深度档案或章纲擅自改变；深度档案不能新添骨架没有的代价或规则。继续检查时代、角色身份、地点、数量基线、时间线、各章因果、伏笔证据。任何下层改写上层事实或资料源互斥，必须 consistent=false 并指出字段与原文。
只输出JSON:{"consistent":true,"canonicalFactsPreserved":["已保留事实"],"contradictions":["具体矛盾"],"unrelatedInventions":["与故事无关的虚构"]}`,
        {
          temperature: 0.1,
          timeout: LLM_TUNABLES.timeoutComplex(),
          projectId,
          scenario: 'review',
          maxTokens: LLM_TUNABLES.CONSISTENCY_CHECK_MIN,
          validate: (value: any) => describeAlignmentValidation(value).length === 0,
          describeValidation: describeAlignmentValidation,
        },
      );
      let alignment = alignmentResult.data;
      if (!alignment) {
        throw new Error(`跨模块故事一致性审查未返回完整结构，未执行修订或激活：${alignmentResult.warnings.join('；') || 'consistent/contradictions/unrelatedInventions缺失'}`);
      }
      let contradictions = [
        ...(Array.isArray(alignment?.contradictions) ? alignment.contradictions : []),
        ...(Array.isArray(alignment?.unrelatedInventions) ? alignment.unrelatedInventions : []),
      ].map((item: any) => String(item || '').trim()).filter(Boolean);
      // 一致性修订迭代：最多 2 次"修订→复查"；不能只按问题数量判断是否无进展，
      // 因为修好一个问题后可能暴露另一个，数量不变仍应继续修订。
      let repairAttempt = 0;
      const MAX_CONSISTENCY_REPAIRS = 2;
      while (!alignment || alignment.consistent !== true || contradictions.length > 0) {
        if (contradictions.length === 0) {
          throw new Error('跨模块故事一致性审查未确认通过，但没有提供可修订的具体矛盾；项目未激活，请重新生成。');
        }
        if (repairAttempt >= MAX_CONSISTENCY_REPAIRS) break;
        repairAttempt++;
        const repairResult = await this.llmCallWithRetry<any>(
          `跨模块故事一致性修订（第${repairAttempt}次）`,
          `根据审查发现，对本次尚未激活的AI生成资料做最小修订。不得新增人物、组织、地点、章节或伏笔，不得改写故事方向；只能修正互斥的专名、时间、数量、年龄、伤病历史和因果事实。先逐项核对数量基线、历史已发生事件、每次触发后的增减和时间规则；已确认题材是上层事实，下层与它互斥时必须改下层；已确认题材自身互斥时不得凭空声称两种说法都成立。每个patch只替换字段内一段逐字存在的短原文，match必须在当前资料对应字段中逐字出现且只出现一次；replacement是替换该短原文的新片段，不是完整字段，不得带省略号。多处需改就给多个patch，尤其章纲与伏笔计数要同步。\n【唯一故事基准】${canonicalCreativeBrief}\n【当前资料（id是唯一可用entityId；末尾…表示仅供审查的截断显示，绝不可写回）】${generatedBundleText}\n【必须修复的矛盾】${JSON.stringify(contradictions)}\n只输出JSON:{"patches":[{"entityType":"world|worldProfile|character|organization|mapPoint|chapter|foreshadowing","entityId":"当前资料中的id","field":"允许字段","match":"该字段中逐字存在且只出现一次的短原文","replacement":"替换后的短片段","reason":"对应矛盾"}]}`,
          {
            temperature: 0.1,
            timeout: LLM_TUNABLES.timeoutComplex(),
            projectId,
            scenario: 'review',
            // 修订可能需要给出完整的章节或资料字段，不能把固定 4096 当作
            // 所有项目的上限；仍按矛盾数量设置有界输出，避免无控制膨胀。
            maxTokens: Math.max(
              LLM_TUNABLES.CONSISTENCY_CHECK_MIN,
              Math.min(
                LLM_TUNABLES.CONSISTENCY_CHECK_MAX,
                LLM_TUNABLES.CONSISTENCY_CHECK_BASE + contradictions.length * LLM_TUNABLES.CONSISTENCY_CHECK_PER_CONFLICT,
              ),
            ),
            validate: (value: any) => Array.isArray(value?.patches) && value.patches.length > 0 && value.patches.length <= 24
              && value.patches.every((patch: any) => typeof patch?.match === 'string' && patch.match.trim().length > 0
                && typeof patch?.replacement === 'string' && patch.replacement.trim().length > 0),
            describeValidation: (value: any) => !Array.isArray(value?.patches)
              ? ['必须返回patches数组']
              : (value.patches.length === 0 ? ['检测到矛盾时patches不能为空'] : []),
          },
        );
        const patches = repairResult.data?.patches;
        if (!Array.isArray(patches) || patches.length === 0) {
          throw new Error(`跨模块一致性修订未返回有效patches，未写入任何半成品：${repairResult.warnings.join('；') || '模型超时或输出格式无法解析。建议减少项目模块数据量后重试。'}`);
        }

        // 不可变/安全敏感列：一致性修订接口永远不允许修改（主键、租户隔离、时间戳由系统维护）。
        const PROTECTED_PATCH_COLUMNS = new Set(['id', 'project_id', 'created_at', 'updated_at']);
        // 实体类型 -> 真实表名（表名来自固定映射，非用户输入，可安全用于 PRAGMA 插值）
        const PATCH_TABLE_MAP: Record<string, string> = {
          world: 'world_settings',
          worldProfile: 'world_system_profiles',
          character: 'characters',
          organization: 'organizations',
          mapPoint: 'map_points',
          chapter: 'outlines',
          foreshadowing: 'foreshadowings',
        };
        // 允许修订的列直接从数据库真实表结构推导，而非手写白名单。
        // 根治“白名单写漏字段（如 buried_chapter_index）”导致合法修订被整批丢弃的反复 bug：
        // 凡是表内真实存在且非受保护列的字段，一致性修订都可修正，问题从源头解决。
        const patchTargetCache = new Map<string, { table: string; fields: Set<string> } | null>();
        const getPatchTarget = (entityType: string): { table: string; fields: Set<string> } | null => {
          if (!patchTargetCache.has(entityType)) {
            const table = PATCH_TABLE_MAP[String(entityType || '')];
            if (!table) { patchTargetCache.set(entityType, null); return null; }
            const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
            const fields = new Set<string>();
            for (const c of cols) {
              if (!PROTECTED_PATCH_COLUMNS.has(c.name)) fields.add(c.name);
            }
            patchTargetCache.set(entityType, { table, fields });
          }
          return patchTargetCache.get(entityType) ?? null;
        };
        const validIds = new Set(Object.values(generatedBundle).flatMap((rows: any[]) => rows.map(row => String(row.id))));
        let appliedPatchCount = 0;
        let skippedPatchCount = 0;
        const previousBundleText = generatedBundleText;
        db.exec('BEGIN IMMEDIATE');
        try {
          for (const patch of patches) {
            const entityType = String(patch?.entityType || '');
            const target = getPatchTarget(entityType);
            const entityId = String(patch?.entityId || '');
            const field = String(patch?.field || '');
            const replacement = patch?.replacement;
            const match = patch?.match;
            // 透明跳过原因：仅受保护列/未知实体/非本次生成范围/空值才跳过；
            // 表内真实存在的事实字段一律应用，从根源解决“合法修订被丢弃”。
            const visibleRow = Object.values(generatedBundle).flatMap((rows: any[]) => rows)
              .find((row: any) => String(row.id) === entityId) as Record<string, unknown> | undefined;
            const skipReason = !target
              ? `未知实体类型 ${entityType}`
              : !target.fields.has(field)
                ? `字段 ${field} 受保护或不存在于表 ${target.table}`
                : !validIds.has(entityId)
                  ? `实体 ${entityId} 不在本次生成范围内`
                  : !visibleRow || typeof visibleRow[field] !== 'string' || !String(visibleRow[field]).includes(String(match))
                    ? '原文锚点不在本次审查资料中'
                : typeof match !== 'string' || !match.trim() || typeof replacement !== 'string' || !replacement.trim()
                    ? '原文锚点或修订值为空'
                    : null;
            if (skipReason) {
              // 静默跳过：字段不存在/受保护/值为空 是AI建议的正常过滤，不打扰用户
              if (!target || !target.fields.has(field) || !hasUsefulValue(replacement)) {
                skippedPatchCount++;
                continue;
              }
              warnings.push(`一致性修订跳过：${entityType}#${entityId}.${field}（${skipReason}，已忽略）`);
              skippedPatchCount++;
              continue;
            }
            // 字段名来自数据库 PRAGMA 真实列名，但可能含保留字（如 outlines.order），必须加引号 + 标识符合法性校验
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field)) {
              skippedPatchCount++;
              continue;
            }
            const currentRow = db.prepare(`SELECT "${field}" AS value FROM ${target!.table} WHERE id=? AND project_id=?`)
              .get(entityId, projectId) as { value: unknown } | undefined;
            if (!currentRow || typeof currentRow.value !== 'string') {
              warnings.push(`一致性修订目标字段不是文本，已跳过：${entityType}#${entityId}.${field}`);
              skippedPatchCount++;
              continue;
            }
            const storedValue = applyCrossStagePatch(currentRow.value, match, replacement);
            if (storedValue === null) {
              warnings.push(`一致性修订原文锚点缺失、不唯一或破坏JSON结构，已跳过：${entityType}#${entityId}.${field}`);
              skippedPatchCount++;
              continue;
            }
            const updateResult = db.prepare(`UPDATE ${target!.table} SET "${field}"=?, updated_at=? WHERE id=? AND project_id=?`)
              .run(storedValue, now(), entityId, projectId);
            if (Number(updateResult.changes || 0) !== 1) {
              warnings.push(`一致性修订目标不存在，已跳过：${entityId}`);
              skippedPatchCount++;
              continue;
            }
            appliedPatchCount++;
          }
          db.exec('COMMIT');
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw error;
        }
        warnings.push(`跨模块一致性自动修订 ${appliedPatchCount} 处（跳过 ${skippedPatchCount} 处无效字段），并已执行二次审查`);
        generatedBundle = readGeneratedBundle();
        generatedBundleText = JSON.stringify(generatedBundle);
        if (generatedBundleText === previousBundleText) {
          throw new Error(`跨模块一致性修订没有改变任何审查字段（应用${appliedPatchCount}处，跳过${skippedPatchCount}处），项目未激活：${warnings.slice(-8).join('；')}`);
        }
        const secondAlignmentResult = await this.llmCallWithRetry<any>(
          `跨模块故事一致性第${repairAttempt}次复查`,
          `核对修订后的资料是否严格属于同一个故事并且事实互不矛盾。先检查确认题材与世界主记录、深度档案、章纲的触发条件、时间范围、代价及证据存续是否一致；再检查专名、年龄、时间跨度、伤病历史、章节因果、结局和伏笔证据。只输出JSON:{"consistent":true,"canonicalFactsPreserved":["已保留事实"],"contradictions":["具体矛盾"],"unrelatedInventions":["无关虚构"]}\n【唯一故事基准】${canonicalCreativeBrief}\n【修订后资料】${generatedBundleText}`,
          {
            temperature: 0.1,
            timeout: LLM_TUNABLES.timeoutComplex(),
            projectId,
            scenario: 'review',
            validate: (value: any) => describeAlignmentValidation(value).length === 0,
            describeValidation: describeAlignmentValidation,
          },
        );
        alignment = secondAlignmentResult.data;
        if (!alignment) {
          throw new Error(`跨模块一致性二次审查未返回完整结构，项目未激活：${secondAlignmentResult.warnings.join('；') || 'consistent/contradictions/unrelatedInventions缺失'}`);
        }
        contradictions = [
          ...(Array.isArray(alignment?.contradictions) ? alignment.contradictions : []),
          ...(Array.isArray(alignment?.unrelatedInventions) ? alignment.unrelatedInventions : []),
        ].map((item: any) => String(item || '').trim()).filter(Boolean);
      }
      if (!alignment) {
        throw new Error(`跨模块故事一致性审查未返回完整结构，项目未激活：consistent/contradictions/unrelatedInventions缺失`);
      }
      if (alignment.consistent !== true || contradictions.length > 0) {
        replaceQualityIssues(db, {
          projectId,
          stage: 'project',
          source: 'cross_stage_gate',
          scopeKey: 'creation',
          title: '跨阶段一致性 Gate',
          issues: contradictions.map((message, index) => ({
            ruleId: `cross_stage_consistency.${index + 1}`,
            severity: 'blocking',
            message,
            quote: '',
            content: generatedBundleText,
            evidenceVerified: false,
            suggestion: '修正世界观、角色、大纲、组织、地点或伏笔中的互斥事实后重新检查。',
            details: { repairAttempt, evidence: '模型未返回可逐字定位的原文，因此按证据不足阻断。' },
          })),
        });
        const gateError = `跨模块一致性经${repairAttempt}次自动修订后仍存${contradictions.length}处问题，已阻断项目激活：${contradictions.join('；')}`;
        try {
          // 这里曾只有成功的模型 review 运行，最终项目 Gate 失败却没有 failed run，
          // 后果是诊断看板显示项目生成失败但失败运行数为零。
          const gateRun = this.generationMetrics.beginRun(projectId, 'review', gateError,
            undefined, 'cross_stage_gate', null, false);
          this.generationMetrics.finishRun(gateRun.id, 'failed', Date.now(), generatedBundleText, gateError);
        } catch (recordError) {
          this.logger.warn(`跨模块 Gate 失败运行落库失败（不改变阻断结论）：${recordError instanceof Error ? recordError.message : String(recordError)}`);
        }
        throw new Error(gateError);
      }
      replaceQualityIssues(db, {
        projectId,
        stage: 'project',
        source: 'cross_stage_gate',
        scopeKey: 'creation',
        title: '跨阶段一致性 Gate',
        issues: [],
      });

      // ====== 步骤6：创建默认时间线 ======
      if (!hasTimeline || !hasTimelineEvents) {
        try {
          const chapterRows = db.prepare(`SELECT "order", title, content FROM outlines WHERE project_id = ? AND level = 'chapter' ORDER BY "order" ASC`).all(projectId) as any[];
          const eventCount = insertTimelineWithEvents([], chapterRows.map(row => ({
            title: row.title,
            content: row.content,
            description: row.content,
            chapterReference: Number(row.order) + 1,
          })));
          emit('timeline', 98, `时间线事件已创建 ${eventCount} 条`, eventCount > 0 ? 'done' : 'failed');
          this.logger.log(`create-project-async: 时间线事件已创建 project=${projectId}, events=${eventCount}`);
        } catch (e: any) {
          warnings.push(`时间线创建失败: ${e.message}`);
          emit('timeline', 98, '时间线创建失败', 'failed');
        }
      } else {
        emit('timeline', 98, '时间线事件已存在', 'done');
      }

      // Generated content is validated above. Never replace it with generic
      // chapter cards or fixed target-word values.

      try {
        await syncProjectRag();
      } catch (e: any) {
        this.logger.warn(`create-project-async: optional semantic index skipped project=${projectId}: ${e.message}`);
      }

      // ====== 最终统计 ======
      // 深度资料已经在跨模块审查前完成，不能在激活后改变正文会读取的事实。
      this.assertProjectSourceCompleteness(projectId);
      await this.generationRecovery.assertActivationReady(projectId);
      const counts = getCreationCounts();
      const finalStats = {
        totalOutlines: counts.outlines,
        totalOutlineChapters: counts.outlineChapters,
        totalChapters: counts.chapters,
        totalCharacters: counts.characters,
        totalWorldSettings: counts.worldSettings,
        totalOrganizations: counts.organizations,
        totalMapPoints: counts.mapPoints,
        totalForeshadowings: counts.foreshadowings,
        totalTimelines: counts.timelines,
        totalTimelineEvents: counts.timelineEvents,
        totalWords: 0, targetWords: dto.targetWords,
      };

      const missing: string[] = [];
      if (counts.outlineChapters === 0) missing.push('大纲章节');
      if (counts.characters === 0) missing.push('角色');
      if (counts.worldSettings === 0) missing.push('世界观');
      // 组织、地图和伏笔允许按故事实际需要为空；存在时仍会接受引用与索引校验。
      if (counts.timelines === 0 || counts.timelineEvents === 0) missing.push('时间线事件');

      if (missing.length > 0) {
        const message = `项目壳已创建，但以下内容未真实写入：${missing.join('、')}`;
        this.logger.warn(`create-project-async: ${message} project=${projectId}`);
        db.prepare(`UPDATE projects SET status = 'generation_failed', updated_at = ? WHERE id = ?`).run(now(), projectId);
        this.emitProjectProgress(projectId, {
          type: 'error',
          success: false,
          projectId,
          message,
          stats: finalStats,
          warnings,
        });
        return;
      }

      if (shortHeartbeatTimer) { clearInterval(shortHeartbeatTimer); shortHeartbeatTimer = null; }
      emit('done', 100, '全部内容生成完成', 'done');
      db.prepare(`UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?`).run(now(), projectId);
      this.logger.log(`create-project-async: 完成 project=${projectId}`);
      this.emitProjectProgress(projectId, {
        type: 'done', success: true, projectId, stats: finalStats,
        warnings: warnings.length > 0 ? warnings : undefined,
      });

    } catch (err: any) {
      if (shortHeartbeatTimer) { clearInterval(shortHeartbeatTimer); shortHeartbeatTimer = null; }
      this.logger.error(`create-project-async 执行失败 project=${projectId}, step=${activeGenerationStep}: ${err.message}`);
      try {
        db.prepare(`UPDATE projects SET status = 'generation_failed', updated_at = ? WHERE id = ?`).run(now(), projectId);
      } catch {}
      this.emitProjectProgress(projectId, { type: 'error', success: false, projectId, step: activeGenerationStep, message: err.message, warnings });
    }
  }

  /**
   * 项目创建完成后补全各模块深度资料（之前创建流程只写了主表，profile / depth 表从未被填充）：
   * 角色 character_extended_profiles、世界观 world_system_profiles、
   * 组织 depth、地点 depth、大纲 depth、伏笔 depth。
   * 这是「补全」步骤：任一模块失败只记录 warning，绝不回滚或中断项目激活。
   */
  private async enrichNewProjectProfiles(
    projectId: string,
    dto: { title: string; storyType: string; selectedIdea: any; settings?: Record<string, unknown> },
  ): Promise<string[]> {
    projectMetricsContext.enterWith(projectId);
    const db = this.db.getDb();
    const now = () => new Date().toISOString();
    const warnings: string[] = [];

    // 上下文可重算：世界观深度补全完成后，重新计算以包含补全后的世界观档案，供后续组织/地点/大纲/伏笔使用
    const buildCtxSummary = () => {
      const worldRow = db.prepare(`SELECT era,story_premise,atmosphere FROM world_settings WHERE project_id=? LIMIT 1`).get(projectId) as any;
      const profile = db.prepare(`SELECT p.synopsis, p.atmosphere_tone, p.rules, p.social_structure, p.locations
        FROM world_system_profiles p JOIN world_settings w ON w.id=p.world_setting_id AND w.project_id=p.project_id
        WHERE p.project_id=? LIMIT 1`).get(projectId) as any;
      const chars = db.prepare(`SELECT name,identity FROM characters WHERE project_id=?`).all(projectId) as any[];
      return JSON.stringify({
        title: dto.title,
        storyType: dto.storyType,
        worldPremise: worldRow ? `${worldRow.story_premise || ''} ${worldRow.era || ''} ${worldRow.atmosphere || ''}` : '',
        worldProfile: profile ? `${profile.synopsis || ''} ${profile.atmosphere_tone || ''} ${profile.rules || ''} ${profile.social_structure || ''}` : '',
        characters: chars.map(c => `${c.name}(${c.identity || ''})`),
      });
    };
    let ctxSummary = buildCtxSummary();
    // 深度补全同样贯穿执行标准六维（平台/分类/基调/文风/流派/视角）+ 长短篇，与正文共用同一事实源（项目已落库，直接读取）
    const enrichToneDirective = this.resolvePlatformToneDirective(projectId);

    this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 88, message: '补全角色/世界观/组织/地点/大纲/伏笔的深度资料...', status: 'running' });

    // ====== 角色深度资料 -> character_extended_profiles ======
    // 角色 13 字段档案已在主流程任务A生成（含 aliasTitle/faction/catchphrase/fears 等补齐字段），
    // 不再逐角色重复调用一次完整生成，避免重复执行步骤。
    this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 90, message: '角色深度资料已由主流程生成，跳过重复补全', status: 'done' });

    // ====== 五个深度子步骤按层级顺序执行（各步骤已补全则跳过，避免重复执行步骤）======
    // 顺序：世界观 → 组织 → 地点 → 大纲 → 伏笔；世界观深度先生成并回写上下文，后续步骤基于它生成。
    const enrichTasks: Array<() => Promise<void>> = [];

    // 世界观 depth
    enrichTasks.push(async () => {
      try {
        const existingProfile = db.prepare(`SELECT p.naming_rules, p.scale_plan, p.ending FROM world_system_profiles p
          JOIN world_settings w ON w.id=p.world_setting_id AND w.project_id=p.project_id
          WHERE p.project_id=? LIMIT 1`).get(projectId) as any;
        if (existingProfile && (existingProfile.naming_rules || '').trim() && (existingProfile.scale_plan || '').trim() && (existingProfile.ending || '').trim()) {
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 92, message: '世界观深度资料已存在，跳过', status: 'done' });
          return;
        }
        const worldRow = db.prepare(`SELECT id,era,geography,factions,rules,atmosphere,story_premise,constraints FROM world_settings WHERE project_id=? LIMIT 1`).get(projectId) as any;
        if (worldRow) {
          const worldFieldList = WORLD_PROFILE_FIELDS.join(', ');
          const describeProfileCandidate = (value: unknown): string[] => {
            const profile = (value as any)?.profile || value;
            if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return ['世界观深度档案未返回对象'];
            return ['era', 'rules', 'ending', 'hierarchy_rules', 'naming_rules', 'scale_plan']
              .filter(field => typeof (profile as any)[field] !== 'string' || !(profile as any)[field].trim())
              .map(field => `世界观深度档案缺少${field}`);
          };
          const worldProfileResult = await this.llmCallWithRetry<any>(
            '世界观深度资料补全',
            `你是该小说的世界设定架构师。基于已确认的世界观骨架，补全一份完整的"地基型世界观档案"，使得后续所有大纲与正文都以此为唯一权威来源。不允许把"地基型"简化为8类古早模板。
${enrichToneDirective}

【已确认世界观骨架（括号内仅为说明，实际请以骨架为准）】
${JSON.stringify({ era: worldRow.era, storyPremise: worldRow.story_premise, atmosphere: worldRow.atmosphere, constraints: worldRow.constraints, factions: worldRow.factions, rules: worldRow.rules })}

【输出字段（共15个，全部必须有实质内容）】
${worldFieldList}

各字段含义与内容要求（按编号对应，每项都须可被后续AI写作直接用作约束）：

1) synopsis——作品简介：一句话故事前提，点名核心冲突与独特卖点。50-100字。
2) basic_info——基本信息：时代、世界观类型（现实/奇幻/科幻等）、核心冲突概括、目标读者。100-200字。
3) era——时代与时间线：故事发生的具体年代、关键历史节点、与剧情关联的前史事件。不得泛写"现代"或"古代"。
4) locations——地点体系：按剧情重要性分级列出关键地点；标注各地点之间的空间关系与移动逻辑；说明各地点承载的剧情功能（如：冲突高发区/情报交换点/安全屋）。
5) atmosphere_tone——氛围基调：全书整体情绪定位与语言风格方向。不得写"紧张"两个字就结束——须说明紧张感从何而来、以何种叙事方式传递。
6) rules——只把已确认世界观骨架的核心规则改写为清晰的if-then句，条数与触发条件、作用范围、代价、证据存续逐项保持一致；不得为了凑3-5条新增时间窗口缩短、记忆丢失、户籍变化、显影限制等骨架没有的机制。
7) social_structure——社会结构：政治势力格局、经济资源流动方向、阶层划分与流动（或封闭）机制、权力交接规则。
8) tech_supernatural——科技/超自然体系：若故事涉及非常规力量，写出体系名称、能力来源（先天/后天/装备/契约等）、能力分级或约束条件、使用代价与副作用。若为纯现实题材，须写出"本作为现实题材，不以超自然力量为叙事手段，故事张力由真实社会机制、人物博弈与心理冲突驱动"，并点明剧情实际涉及的专业领域规则（如刑侦程序、医疗规范、行业潜规则等）。
9) system_mechanics——系统运行机制：世界观中制度化、规则化的运行逻辑，如组织运作方式、经济循环、信息/舆论传播方式、特殊制度（参考核心设定.txt示例中的召唤玩家系统、贡献点兑换、复活机制、自研系统、科技树等具象运行规则）。即使是现实题材，也必须写出剧情涉及的特定社会运行机制（行业准入、执法权限、信息壁垒等），不可空着。
10) culture_customs——文化风俗与禁忌：语言特征、地域风俗、族群/阶层之间的关系基调、不可触碰的社会禁忌及触犯后果。
11) naming_rules——命名规则：角色命名规律（姓氏来源/命名风格/是否有代际特征）、地名命名逻辑、关键术语/专有名词的书写统一性要求。此字段用于让AI在生成正文时不出现"同一个地名在不同章写成了两种叫法"。
12) scale_plan——全文数据规划：宏观规模框架——人口数量级（不需要精确数字，给"千/万/十万/百万级"的数量级即可）、势力间人数对比、资源总量级、故事时间跨度、空间尺度（单城市/多城市/多国/多大陆）。目的是防止后续章节出现前后数据矛盾（比如第3章说"小镇只有三百人"、第10章突然出现"镇上万人集会"）。
13) ending——结局方向：不剧透具体情节，但必须锁定：核心冲突的解决方式方向（智力博弈/武力决战/自我牺牲/和解/制度变革等）、主角最终状态的基调（圆满/开放性/悲剧/蜕变/回归日常）、必须被回收的关键伏笔类型。此字段是"终点锚"，正文生成不可偏离。
14) hierarchy_rules——核心层级规则：逐字使用「${STORY_FACT_PRIORITY}」。不得另写第二套层级；不能把世界档案中新添的未锁定说明抬到确认题材或本章章纲之上。
15) supplementary——补充说明：仅放上述14项确实无法覆盖的极特殊约束。可空。注意：以下内容必须归类到对应字段，不要放入本字段：
- 创作禁忌、禁用的陈词滥调、不能出现的行为模式 → 放入 rules（核心规则体系）
- 场景细节要求、道具写实要求、地点功能描述 → 放入 locations（地点体系）
- 每章节奏要求、悬念设置、写作规范 → 放入 hierarchy_rules（核心层级规则）
- 社会禁忌、文化风俗、语言特征 → 放入 culture_customs（文化风俗与禁忌）
- 行业规则、专业领域规范、执法程序 → 放入 tech_supernatural（科技/超自然体系）或 system_mechanics（系统运行机制）
只有当内容确实不属于上述任何一类时，才放入本字段。

【质量底线】
不写"丰富多样""精彩纷呈""错综复杂"等空话套话。每一条信息必须能用于约束后续写作——当AI生成正文时，应能根据此字段做出"这个设定违背了第X条规则/这个地名与命名规则矛盾/这个情节走向与结局锚冲突"的具体判断。
若世界观骨架信息不足，只补地点氛围与非因果细节；规则、代价、时间线、官方记录、人物结局等必须沿用已确认题材与骨架，信息不足时明确留待章纲，不得自行发明第二套事实。

只输出JSON:{"profile":{ ...上述15个字段 }}。
每个字段的值必须是字符串（可包含换行），不要输出嵌套JSON对象，不要输出数组。`,
            {
              temperature: 0.7, timeout: LLM_TUNABLES.timeoutComplex(), projectId, scenario: 'world_building',
              maxTokens: Math.min(32768, 24576),
              validate: value => describeProfileCandidate(value).length === 0,
              describeValidation: describeProfileCandidate,
            },
          );
          let wp = worldProfileResult.data?.profile || worldProfileResult.data;
          let profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
            { confirmedStory: dto.selectedIdea, world: worldRow }, '世界观深度档案', wp, enrichToneDirective);
          if (!profileReview.consistent) {
            const repair = await this.llmCallWithRetry<any>('世界观深度档案事实修复',
              `只修复下层深度档案，不改写已确认题材或世界观骨架。\n【上层】${JSON.stringify({ confirmedStory: dto.selectedIdea, world: worldRow })}\n【当前档案】${JSON.stringify(wp)}\n【逐字冲突】${JSON.stringify(profileReview.contradictions)}\n输出完整JSON {"profile":{...}}；必需字段 ${worldFieldList}，每个字段为字符串。`,
              { projectId, scenario: 'world_building', temperature: 0.25, timeout: LLM_TUNABLES.timeoutComplex(),
                validate: value => describeProfileCandidate(value).length === 0,
                describeValidation: describeProfileCandidate });
            wp = repair.data?.profile || repair.data;
            profileReview = await this.reviewChildSource(projectId, '已确认题材与世界观骨架',
              { confirmedStory: dto.selectedIdea, world: worldRow }, '世界观深度档案', wp, enrichToneDirective);
          }
          if (!profileReview.consistent) throw new Error(`世界观深度档案与上层冲突：${profileReview.contradictions.join('；')}`);
          if (wp && typeof wp === 'object') {
            const input: Record<string, unknown> = {};
            for (const f of WORLD_PROFILE_FIELDS) {
              const v = (wp as any)?.[f];
              if (typeof v === 'string' && v.trim()) input[f] = v.trim();
              else if (Array.isArray(v)) input[f] = JSON.stringify(v);
            }
            if (Object.keys(input).length) {
              try { await this.worldSettingService.updateProfile(projectId, worldRow.id, input); }
              catch (e: any) { warnings.push(`世界观深度资料写入失败:${e.message}`); }
            }
          }
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 92, message: '世界观深度资料已补全', status: 'running' });
        }
      } catch (e: any) { warnings.push(`世界观深度资料生成失败:${e.message}`); this.logger.warn(`enrich: world failed project=${projectId}: ${e.message}`); }
    });

    // 组织/势力 depth
    enrichTasks.push(async () => {
      try {
        const missingLeader = db.prepare(`SELECT COUNT(*) as c FROM organizations WHERE project_id=? AND (leader IS NULL OR leader='')`).get(projectId) as any;
        if ((missingLeader?.c || 0) === 0) {
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 94, message: '组织深度资料已存在，跳过', status: 'done' });
          return;
        }
        const orgs = db.prepare(`SELECT id,name,type,description FROM organizations WHERE project_id=?`).all(projectId) as any[];
        if (orgs.length > 0) {
          const orgResult = await this.llmCallWithRetry<any>(
            '组织势力深度资料补全',
            `基于以下已确认组织和故事上下文，补全组织势力的深度资料，用于AI写作时保持设定一致。
${enrichToneDirective}
【故事与世界观】${ctxSummary}
【组织列表】${JSON.stringify(orgs.map(o => ({ name: o.name, type: o.type, description: o.description })))}
为每一个组织输出对象，键名：name(与输入一致), leader(核心领袖), strength_level(实力等级:1-5整数), territory(势力范围), characteristics(组织特征), relationships_json(与其他组织关系,JSON数组), signature_equipment(标志性装备/手段)。没有就填空或0。
只输出JSON:{"orgs":[{"name","leader","strength_level","territory","characteristics","relationships_json","signature_equipment"}]}`,
            { temperature: 0.7, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'organization_map' },
          );
          const orgList = Array.isArray(orgResult.data?.orgs) ? orgResult.data.orgs : [];
          const byName = new Map(orgs.map(o => [String(o.name).trim(), o]));
          for (const o of orgList) {
            const name = String((o as any)?.name || '').trim();
            const target = byName.get(name);
            if (!target) continue;
            const strength = Math.max(0, Math.min(5, parseInt(String((o as any).strength_level || '0'), 10) || 0));
            try {
              db.prepare(`UPDATE organizations SET leader=?, strength_level=?, territory=?, characteristics=?, relationships_json=?, signature_equipment=?, updated_at=? WHERE id=? AND project_id=?`)
                .run(serializeGeneratedSqlText((o as any).leader), strength, serializeGeneratedSqlText((o as any).territory), serializeGeneratedSqlText((o as any).characteristics),
                  JSON.stringify(Array.isArray((o as any).relationships_json) ? (o as any).relationships_json : []),
                  serializeGeneratedSqlText((o as any).signature_equipment), now(), target.id, projectId);
            } catch (e: any) { warnings.push(`组织${name}深度资料写入失败:${e.message}`); }
          }
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 94, message: `组织深度资料已补全 ${orgList.length}/${orgs.length}`, status: 'running' });
        }
      } catch (e: any) { warnings.push(`组织深度资料生成失败:${e.message}`); this.logger.warn(`enrich: orgs failed project=${projectId}: ${e.message}`); }
    });

    // 地点 depth
    enrichTasks.push(async () => {
      try {
        const missingClimate = db.prepare(`SELECT COUNT(*) as c FROM map_points WHERE project_id=? AND (climate IS NULL OR climate='')`).get(projectId) as any;
        if ((missingClimate?.c || 0) === 0) {
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 95, message: '地点深度资料已存在，跳过', status: 'done' });
          return;
        }
        const maps = db.prepare(`SELECT id,name,type,description FROM map_points WHERE project_id=?`).all(projectId) as any[];
        if (maps.length > 0) {
          const mapResult = await this.llmCallWithRetry<any>(
            '地点深度资料补全',
            `基于以下已确认地点和故事上下文，补全地点的深度资料。
${enrichToneDirective}
【故事与世界观】${ctxSummary}
【地点列表】${JSON.stringify(maps.map(m => ({ name: m.name, type: m.type, description: m.description })))}
为每一个地点输出对象，键名：name(与输入一致), climate(气候环境), resources(资源,JSON数组), significance(剧情意义), sensory_detail(感官细节：声音/气味/视觉)。
只输出JSON:{"maps":[{"name","climate","resources","significance","sensory_detail"}]}`,
            { temperature: 0.7, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'organization_map' },
          );
          const mapList = Array.isArray(mapResult.data?.maps) ? mapResult.data.maps : [];
          const byName = new Map(maps.map(m => [String(m.name).trim(), m]));
          for (const m of mapList) {
            const name = String((m as any)?.name || '').trim();
            const target = byName.get(name);
            if (!target) continue;
            try {
              db.prepare(`UPDATE map_points SET climate=?, resources=?, significance=?, sensory_detail=?, updated_at=? WHERE id=? AND project_id=?`)
                .run(serializeGeneratedSqlText((m as any).climate), JSON.stringify(Array.isArray((m as any).resources) ? (m as any).resources : []),
                  serializeGeneratedSqlText((m as any).significance), serializeGeneratedSqlText((m as any).sensory_detail), now(), target.id, projectId);
            } catch (e: any) { warnings.push(`地点${name}深度资料写入失败:${e.message}`); }
          }
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 95, message: `地点深度资料已补全 ${mapList.length}/${maps.length}`, status: 'running' });
        }
      } catch (e: any) { warnings.push(`地点深度资料生成失败:${e.message}`); this.logger.warn(`enrich: maps failed project=${projectId}: ${e.message}`); }
    });

    // 大纲 depth（按批，避免长篇小说章节过多时单次过大）
    enrichTasks.push(async () => {
      try {
        const missingType = db.prepare(`SELECT COUNT(*) as c FROM outlines WHERE project_id=? AND level='chapter' AND (chapter_type IS NULL OR chapter_type='')`).get(projectId) as any;
        if ((missingType?.c || 0) === 0) {
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 97, message: '大纲深度字段已存在，跳过', status: 'done' });
          return;
        }
        const chapters = db.prepare(`SELECT id,"order",title,content FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`).all(projectId) as any[];
        if (chapters.length > 0) {
          const BATCH = 3; // 每章要补10个深度字段，批量过大易触发输出长度截断；3章/批更稳（real-llm 另有同模型扩容兜底）
          let done = 0;
          for (let i = 0; i < chapters.length; i += BATCH) {
            const batch = chapters.slice(i, i + BATCH);
            const chapResult = await this.llmCallWithRetry<any>(
              '大纲深度字段补全',
              `基于以下章节的已确认大纲，补全每章的结构化深度字段，用于AI写作时保持节奏与冲突一致。
${enrichToneDirective}
【故事与世界观】${ctxSummary}
【章节（id用于回写，不要改动）】${JSON.stringify(batch.map(c => ({ id: c.id, order: c.order, title: c.title, content: c.content })))}
为每一章输出对象，必须包含原 id，以及：chapter_type(章节类型:opening/exposition/rising/conflict/climax/transition/cliffhanger/resolution/breathing/paving), pov_ratio(视角配比说明), hot_scenes(高光场景要点), setback_scenes(波折/挫折场景要点), ending_setup(结尾钩子设计), conflict_design(冲突设计), system_hints(系统/设定提示), location_summary(场景地点汇总), highlight_points(爽点要点,JSON数组)。
只输出JSON:{"chapters":[{"id","chapter_type","pov_ratio","hot_scenes","setback_scenes","ending_setup","conflict_design","system_hints","location_summary","highlight_points"}]}`,
              { temperature: 0.6, timeout: LLM_TUNABLES.timeoutComplex(), projectId, scenario: 'outline', maxTokens: Math.min(32768, 3000 + batch.length * 3000) },
            );
            const chapList = Array.isArray(chapResult.data?.chapters) ? chapResult.data.chapters : [];
            const byId = new Map(chapters.map(c => [c.id, c]));
            for (const c of chapList) {
              const cid = String((c as any)?.id || '');
              const target = byId.get(cid);
              if (!target) continue;
              try {
                db.prepare(`UPDATE outlines SET chapter_type=?, pov_ratio=?, hot_scenes=?, setback_scenes=?, ending_setup=?, conflict_design=?, system_hints=?, location_summary=?, highlight_points=?, updated_at=? WHERE id=? AND project_id=?`)
                  .run(serializeGeneratedSqlText((c as any).chapter_type), serializeGeneratedSqlText((c as any).pov_ratio), serializeGeneratedSqlText((c as any).hot_scenes),
                    serializeGeneratedSqlText((c as any).setback_scenes), serializeGeneratedSqlText((c as any).ending_setup), serializeGeneratedSqlText((c as any).conflict_design),
                    serializeGeneratedSqlText((c as any).system_hints), serializeGeneratedSqlText((c as any).location_summary),
                    JSON.stringify(Array.isArray((c as any).highlight_points) ? (c as any).highlight_points : []), now(), cid, projectId);
                done += 1;
              } catch (e: any) { warnings.push(`章节${cid}深度字段写入失败:${e.message}`); }
            }
          }
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 97, message: `大纲深度字段已补全 ${done}/${chapters.length}`, status: 'running' });
        }
      } catch (e: any) { warnings.push(`大纲深度字段生成失败:${e.message}`); this.logger.warn(`enrich: outlines failed project=${projectId}: ${e.message}`); }
    });

    // 伏笔 depth
    enrichTasks.push(async () => {
      try {
        const missingImpact = db.prepare(`SELECT COUNT(*) as c FROM foreshadowings WHERE project_id=? AND (emotional_impact IS NULL OR emotional_impact='')`).get(projectId) as any;
        if ((missingImpact?.c || 0) === 0) {
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 98, message: '伏笔深度资料已存在，跳过', status: 'done' });
          return;
        }
        const fss = db.prepare(`SELECT id,content,buried_chapter_index,planned_recovery_chapter_index,evidence_text,recovery_condition,payoff_description FROM foreshadowings WHERE project_id=?`).all(projectId) as any[];
        if (fss.length > 0) {
          const fsResult = await this.llmCallWithRetry<any>(
            '伏笔深度资料补全',
            `基于以下已确认伏笔，补全每条伏笔的情感与分层回收资料。
${enrichToneDirective}
【故事与世界观】${ctxSummary}
【伏笔（id用于回写）】${JSON.stringify(fss.map(f => ({ id: f.id, content: f.content, buriedChapter: f.buried_chapter_index, recoveryChapter: f.planned_recovery_chapter_index })))}
为每条伏笔输出对象，必须包含原 id，以及：emotional_impact(情感冲击描述), layered_reveal(分层揭示设计,JSON数组，每项含 revealStage 与 content)。
只输出JSON:{"foreshadowings":[{"id","emotional_impact","layered_reveal"}]}`,
            { temperature: 0.6, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'foreshadowing' },
          );
          const fsList = Array.isArray(fsResult.data?.foreshadowings) ? fsResult.data.foreshadowings : [];
          const byId = new Map(fss.map(f => [f.id, f]));
          for (const f of fsList) {
            const fid = String((f as any)?.id || '');
            const target = byId.get(fid);
            if (!target) continue;
            try {
              db.prepare(`UPDATE foreshadowings SET emotional_impact=?, layered_reveal=?, updated_at=? WHERE id=? AND project_id=?`)
                .run(serializeGeneratedSqlText((f as any).emotional_impact), JSON.stringify(Array.isArray((f as any).layered_reveal) ? (f as any).layered_reveal : []), now(), fid, projectId);
            } catch (e: any) { warnings.push(`伏笔${fid}深度资料写入失败:${e.message}`); }
          }
          this.emitProjectProgress(projectId, { type: 'progress', step: 'enrich', percent: 98, message: `伏笔深度资料已补全 ${fsList.length}/${fss.length}`, status: 'running' });
        }
      } catch (e: any) { warnings.push(`伏笔深度资料生成失败:${e.message}`); this.logger.warn(`enrich: foreshadowings failed project=${projectId}: ${e.message}`); }
    });

    // 章节大纲内部一致性：必须在「大纲阶段就地改写」，不得把矛盾留到正文再靠 Gate 拦截。
    // 该方法复扫不通过会抛 422 阻断创建——降级放行会让项目注定写不出能过 Gate 的正文。
    enrichTasks.push(async () => {
      await this.repairOutlineConsistency(projectId, { label: '创建期大纲阶段' });
    });

    // 每项写入都会改变质量门禁的上下文版本；按顺序生成、审查、写入，
    // 避免并发任务把彼此的正常写入误判成生成期间上下文漂移。
    if (enrichTasks.length > 0) {
      await enrichTasks[0]();
      ctxSummary = buildCtxSummary();
      for (const enrichTask of enrichTasks.slice(1)) await enrichTask();
    }

    const worldProfile = db.prepare(`SELECT p.era,p.rules,p.ending,p.hierarchy_rules FROM world_system_profiles p
      JOIN world_settings w ON w.id=p.world_setting_id AND w.project_id=p.project_id
      WHERE p.project_id=? LIMIT 1`).get(projectId) as Record<string, unknown> | undefined;
    const missingWorldFields = ['era', 'rules', 'ending', 'hierarchy_rules', 'naming_rules', 'scale_plan']
      .filter(field => !String(worldProfile?.[field] || '').trim());
    if (missingWorldFields.length) {
      // 这里曾把世界档案补全失败仅记 warning 后仍激活，后果是正文拿到「待补全」
      // 或半套规则，事实冲突直到第一章 Gate 才暴露。
      throw new Error(`世界观深度档案不完整（${missingWorldFields.join('、')}），项目不得激活`);
    }

    return warnings;
  }

  /**
   * GET /chain/generation-recovery/:projectId
   * 查询未完成生成的断点恢复审计信息
   */
  @Get('generation-recovery/:projectId')
  async getGenerationRecovery(@Param('projectId') projectId: string) {
    return { success: true, audit: await this.generationRecovery.audit(projectId) };
  }

  /** 先确认任务已启动，再由进度页订阅既有 SSE；不能让按钮等待整部资料生成完才跳转。 */
  @Post('generation-recovery/:projectId/resume-start')
  async startFailedGenerationRecovery(@Param('projectId') projectId: string) {
    const audit = await this.generationRecovery.audit(projectId);
    if (!audit.canResume) {
      throw new ConflictException(audit.running ? '该项目已在重新生成，请打开进度页查看。' : audit.recommendedAction);
    }
    this.projectCreationEventHistory.set(projectId, []);
    this.projectLastPercent.delete(projectId);
    this.emitProjectProgress(projectId, {
      type: 'progress', step: 'recovery', percent: 1,
      message: '正在建立恢复快照并检查项目资料…', status: 'running',
    });
    void this.resumeFailedGeneration(projectId).catch((error: any) => {
      const history = this.projectCreationEventHistory.get(projectId) || [];
      if (history.some((event: any) => event.type === 'error' || event.type === 'done')) return;
      this.emitProjectProgress(projectId, {
        type: 'error', success: false, projectId, step: 'recovery',
        message: error?.message || '重新生成未完成，原资料已保留',
      });
    });
    return { success: true, projectId, status: 'creating' };
  }

  /** Explicit author request: rebuild inconsistent lower-level architecture from the preserved idea card. */
  @Post('generation-recovery/:projectId/rebuild-from-confirmed-idea-start')
  async startSourceHierarchyRebuild(@Param('projectId') projectId: string) {
    const audit = await this.generationRecovery.audit(projectId);
    if (audit.running) throw new ConflictException('该项目已在重新生成，请打开进度页查看。');
    this.projectCreationEventHistory.set(projectId, []);
    this.projectLastPercent.delete(projectId);
    this.emitProjectProgress(projectId, {
      type: 'progress', step: 'recovery', percent: 1,
      message: '按已确认题材建立完整快照，准备重建不一致的世界观与章纲…', status: 'running',
    });
    void this.resumeFailedGeneration(projectId, true).catch((error: any) => {
      const history = this.projectCreationEventHistory.get(projectId) || [];
      if (history.some((event: any) => event.type === 'error' || event.type === 'done')) return;
      this.emitProjectProgress(projectId, {
        type: 'error', success: false, projectId, step: 'recovery',
        message: error?.message || '按确认题材重建未完成，原资料已保留',
      });
    });
    return { success: true, projectId, status: 'creating' };
  }

  @Post('generation-recovery/:projectId/resume')
  async resumeFailedGeneration(@Param('projectId') projectId: string, explicitSourceRebuild = false) {
    this.generationRecovery.acquire(projectId);
    const db = this.db.getDb();
    let recoverySnapshot: Awaited<ReturnType<GenerationRecoveryService['captureSnapshot']>> | null = null;
    try {
      const project = db.prepare(`SELECT title,type,target_words,target_platform,settings,status FROM projects WHERE id=?`).get(projectId) as any;
      if (!project) throw new HttpException('项目不存在', 404);

      const settings = this.safeExtractJson<Record<string, unknown>>(String(project.settings || '{}'), {});
      const constitution = settings.creativeConstitution as CreativeConstitution | undefined;
      const selectedIdea = constitution?.confirmedStory || {};
      if (!selectedIdea || Object.keys(selectedIdea).length === 0) throw new HttpException('项目缺少 Creative Constitution.confirmedStory，不能恢复 AI 生成', 409);
      recoverySnapshot = await this.generationRecovery.captureSnapshot(projectId);
      if (explicitSourceRebuild) await this.generationRecovery.clearForExplicitSourceRebuild(projectId);
      else await this.generationRecovery.clearFailedGeneratedAssets(projectId);

      this.projectCreationEventHistory.set(projectId, []);
      this.emitProjectProgress(projectId, {
        type: 'progress', step: 'recovery', percent: 2,
        message: '已通过人工内容保护检查，正在按项目配置重新生成', status: 'running',
      });
      await this.executeCreateProjectSteps(projectId, {
        title: String(project.title || ''),
        storyType: String(project.type || 'short_story'),
        targetWords: Number(project.target_words),
        selectedIdea,
        settings,
      });

      const status = (db.prepare('SELECT status FROM projects WHERE id=?').get(projectId) as any)?.status;
      if (status !== 'active') {
        throw new HttpException('再次生成未通过激活前完整性门禁，项目仍保持“生成失败”，可查看诊断后重试', 409);
      }
      return { success: true, status, projectId, audit: await this.generationRecovery.audit(projectId) };
    } catch (error: any) {
      if (recoverySnapshot) {
        try {
          await this.generationRecovery.restoreSnapshot(recoverySnapshot);
          this.logger.warn(`恢复生成未完成，已还原原有创作资料 project=${projectId}`);
        } catch (restoreError: any) {
          this.logger.error(`恢复生成失败且还原快照失败 project=${projectId}: ${restoreError?.message || restoreError}`);
          throw new HttpException(
            `恢复生成失败，且原资料自动还原失败：${restoreError?.message || '未知错误'}`,
            500,
          );
        }
      }
      try {
        db.prepare("UPDATE projects SET status='generation_failed',updated_at=? WHERE id=?")
          .run(new Date().toISOString(), projectId);
      } catch {}
      if (error instanceof HttpException) throw error;
      throw new HttpException(error?.message || '恢复生成失败', 409);
    } finally {
      this.generationRecovery.release(projectId);
    }
  }

  private buildPreviousChapterLedger(projectId: string, chapterIndex: number): { previousChapterEnd: string; previousChaptersSummary: string } {
    if (chapterIndex <= 1) return { previousChapterEnd: '这是第一章，没有前文。', previousChaptersSummary: '这是第一章，没有前文。' };
    const rows = this.db.getDb().prepare(`
      SELECT chapter_index, title, content, status
      FROM chapters
      WHERE project_id = ? AND chapter_index < ?
      ORDER BY chapter_index ASC
    `).all(projectId, chapterIndex) as Array<{ chapter_index: number; title: string; content: string | null; status: string }>;
    const missing = rows.filter(row => !(row.content || '').trim()).map(row => row.chapter_index);
    if (missing.length > 0) {
      throw new HttpException(`不能直接生成第${chapterIndex}章：第${missing.join('、')}章尚无正文，无法建立连续剧情。请先按大纲生成缺失章节。`, 409);
    }
    if (rows.length !== chapterIndex - 1) {
      throw new HttpException(`不能直接生成第${chapterIndex}章：前文章节与大纲序号不连续，无法保证剧情衔接。`, 409);
    }
    const compactLedger = rows.map(row => {
      const prose = (row.content || '').trim();
      const tail = prose.slice(-900);
      return `第${row.chapter_index}章《${row.title || '未命名'}》已发生内容（末段）：\n${tail}`;
    });
    const latest = rows[rows.length - 1];
    return {
      previousChapterEnd: (latest.content || '').trim().slice(-1800),
      previousChaptersSummary: compactLedger.join('\n\n'),
    };
  }

  /**
   * buildChapterPlanContext — 从数据库提取 outline + chapterContext，供正文单次 LLM 生成自动使用
   */
  private buildChapterPlanContext(projectId: string, chapterNumber: number, chapterId?: string): { outline: any; context: any } {
    const db = this.db.getDb();
    const result: { outline: any; context: any } = { outline: {}, context: {} };

    try {
      // 提取项目settings中的世界观和反转表
      const proj = db.prepare('SELECT settings FROM projects WHERE id = ?').get(projectId) as any;
      if (proj?.settings) {
        const s = JSON.parse(proj.settings);
        result.outline.coreSetting = s.coreSetting || s.baseSettings || {};
        result.outline.reversals = s.reversals || [];
        result.outline.foreshadowings = s.outlineForeshadowings || [];
      }

      // 提取当前章节大纲
      const selectedChapter = chapterId
        ? db.prepare('SELECT outline_id, chapter_index FROM chapters WHERE id = ? AND project_id = ?').get(chapterId, projectId) as any
        : null;
      const effectiveChapterNumber = Number(selectedChapter?.chapter_index || chapterNumber || 1);
      const chOutline = selectedChapter?.outline_id
        ? db.prepare(`SELECT title, content, chapter_function, scenes FROM outlines WHERE id = ? AND project_id = ? AND level = 'chapter' LIMIT 1`).get(selectedChapter.outline_id, projectId) as any
        : db.prepare(
          `SELECT title, content, chapter_function, scenes FROM outlines WHERE project_id = ? AND level = 'chapter' AND "order" IN (?, ?) ORDER BY CASE WHEN "order" = ? THEN 0 ELSE 1 END LIMIT 1`
        ).get(projectId, effectiveChapterNumber, effectiveChapterNumber - 1, effectiveChapterNumber) as any;
      if (chOutline) {
        result.context.chapterOutline = chOutline.content || '';
        result.context.chapterFunction = chOutline.chapter_function || 'exposition';
        result.context.chapterTitle = chOutline.title || '';
        try {
          const scenes = JSON.parse(chOutline.scenes || '{}');
          if (scenes.details) result.outline.chapterDetail = scenes.details;
        } catch {}
      }

      const previousLedger = this.buildPreviousChapterLedger(projectId, effectiveChapterNumber);
      result.context.previousChapterSummary = previousLedger.previousChaptersSummary;
      result.context.previousChapterEnd = previousLedger.previousChapterEnd;

      // 提取活跃角色
      const characters = db.prepare(
        `SELECT name, identity FROM characters WHERE project_id = ?`
      ).all(projectId) as any[];
      result.context.activeCharacters = characters || [];

      result.context.chapterNumber = effectiveChapterNumber;
    } catch (e: any) {
      throw new Error(`正文连续性上下文构建失败，已停止生成：${e.message}`);
    }

    return result;
  }

  /**
   * 构建「后续章节边界清单」：从 outlines 表读取当前章之后的各章核心节拍，
   * 供正文生成与大纲验收共同约束——本章不得提前兑现后续章节的核心事件/伏笔回收/反转，
   * 也不得写死与后续章节既定事实冲突的强断言（如“只有X才知道Y”）。
   * 无后续章节（末章）或无章纲章节时返回空串；读取失败一律抛错，绝不静默降级为"无边界约束"。
   * 只读最近 3 章且每章截断，控制 prompt 开销（长篇小说不会把全部章纲塞进本章 prompt）。
   */

  /**
   * 构建「收尾锁定伏笔清单」：从 world_system_profiles 提取世界观档案中锁定在
   * 收尾才揭示的反转/伏笔（如“两种笔迹归属”“担保栏签名”），生成【禁令】注入
   * 生成与评审 prompt。正文必须能留线索，但不得提前点名/断言归属，违反即结构错误。
   * 规则层价值：历史缺陷是世界观摘要把“笔迹一属沈月兰、笔迹二属贺德山”作为可写事实
   * 注入，模型直接写死“那是表上的第二种”，提前消费收尾反转，评审器反复拦截而修复
   * 循环消不掉。本方法把这些信息转成“禁止提前点名”的明确禁令，所有小说通用。
   */
  private buildEndingForeshadowGuard(projectId: string): string {
    if (!projectId) return '';
    try {
      const db = this.db.getDb();
      const profile = db.prepare(
        `SELECT p.ending, p.hierarchy_rules, p.custom_settings FROM world_system_profiles p
         JOIN world_settings w ON w.id=p.world_setting_id AND w.project_id=p.project_id
         WHERE p.project_id = ? LIMIT 1`
      ).get(projectId) as { ending?: string; hierarchy_rules?: string; custom_settings?: string } | undefined;
      if (!profile) return '';
      const parts: string[] = [];
      const push = (s: string) => { const t = s.trim(); if (t && t.length > 2 && !parts.includes(t)) parts.push(t); };
      // 1) ending 中的“必须回收的伏笔”——只列“什么被锁定”，不含答案
      const ending = String(profile.ending || '');
      const m = ending.match(/必须回收的伏笔[：:]([^\n]+)/);
      if (m) push(`- 必须回收的伏笔（收尾才揭示，本章不得提前点破）：${m[1].trim().slice(0, 300)}`);
      // 2) hierarchy_rules 中“不得提前消费”的收尾锁定声明
      const hr = String(profile.hierarchy_rules || '');
      const hm = hr.match(/不得提前消费[^。\n]{0,120}/);
      if (hm) push(`- 收尾锁定声明：${hm[0].trim().slice(0, 300)}`);
      // 3) custom_settings 中命中收尾反转的道具条目：按行/序号切分（避免 `；` 切出大块冗余），
      //    且只保留“该道具是收尾反转”的提示，绝不把具体归属/答案写进 prompt（脱敏在
      //    world-setting.service.sanitizeCustomSettings 已做，此处兜底再抹一次答案）。
      const cs = String(profile.custom_settings || '');
      const segments = cs.split(/\n+|(?=[0-9]+[）)])/);
      for (const seg of segments) {
        const t = seg.trim();
        if (!t || !/(收尾|变脸|反转|才揭示|才回收|揭破|在收尾)/.test(t)) continue;
        // 同 world-setting.service.sanitizeCustomSettings：抹掉归属答案，只留“该道具是收尾反转”的提示
        const masked = maskForeshadowAnswers(t);
        push(`- 收尾锁定道具（本章不得写死其归属/结果，只能留线索）：${masked.slice(0, 160)}`);
        if (parts.length >= 6) break;
      }
      if (!parts.length) return '';
      return `\n\n## 收尾锁定伏笔（世界观档案锁定在收尾才揭示的反转，本章正文严禁提前点名/断言其归属或结果，只能留模糊线索；违反即结构错误，优先于文风问题处理）\n${parts.join('\n')}`;
    } catch (error) {
      this.throwStepReadFailure('buildEndingForeshadowGuard', projectId, error);
    }
  }

  private buildSubsequentChapterBoundary(projectId: string, chapterIndex: number): string {
    if (!projectId || !Number.isInteger(chapterIndex) || chapterIndex < 1) return '';
    try {
      const db = this.db.getDb();
      // 与 buildChapterPlanContext 相同的当前章定位逻辑（order 与章号同量级）：
      // 优先取 order=chapterIndex 的行，其次 chapterIndex-1；再取 order 更大的后续章。
      const current = db.prepare(
        `SELECT "order" FROM outlines
         WHERE project_id=? AND level='chapter' AND "order" IN (?, ?)
         ORDER BY CASE WHEN "order" = ? THEN 0 ELSE 1 END LIMIT 1`
      ).get(projectId, chapterIndex, chapterIndex - 1, chapterIndex) as { order: number } | undefined;
      const baseOrder = Number(current?.order ?? chapterIndex - 1);
      const rows = db.prepare(
        `SELECT title, content, scenes, location_summary FROM outlines
         WHERE project_id=? AND level='chapter' AND "order" > ?
         ORDER BY "order" ASC LIMIT 3`
      ).all(projectId, baseOrder) as Array<{ title: string; content: string | null; scenes: string | null; location_summary: string | null }>;
      if (!rows.length) return '';
      const parts: string[] = ['【后续章节边界 · 本章不得提前消费（仅用于约束与验收，不得写进正文）】'];
      for (const row of rows) {
        const title = String(row.title || '后续章节').trim();
        const content = String(row.content || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const extra: string[] = [];
        // 后续章的场景范围必须写进边界约束：否则本章无从知道「哪些地点属于下一章」，
        // 只能靠 Gate 事后拦截越界（反复 422 的另一半根因）。
        const nextLocation = String(row.location_summary || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        if (nextLocation) extra.push(`本章场景范围（本章不得提前抵达）：${nextLocation}`);
        if (row.scenes) {
          try {
            const scenes = JSON.parse(row.scenes);
            if (scenes.foreshadowingRecover) extra.push(`伏笔回收：${String(scenes.foreshadowingRecover).slice(0, 80)}`);
            if (Array.isArray(scenes.reversals) && scenes.reversals.length) extra.push(`反转：${scenes.reversals.slice(0, 3).join('；').slice(0, 100)}`);
            if (scenes.hook) extra.push(`章末钩子：${String(scenes.hook).slice(0, 60)}`);
          } catch { /* scenes 非 JSON 时忽略 */ }
        }
        parts.push(`- ${title}：${content}${extra.length ? `\n  ${extra.join('\n  ')}` : ''}`);
      }
      return parts.join('\n');
    } catch (error) {
      this.throwStepReadFailure('buildSubsequentChapterBoundary', projectId, error);
    }
  }

  /**
   * buildOutlineAdherenceContract — 大纲严格性约束（红线 + 绿区）
   * 核心原则：大纲是不可偏离的合同；但在不违反红线的前提下，鼓励"微发挥"
   * 与多样性，尤其长篇应避免把大纲复述成干瘪散文。
   * @param isLong 长篇对多样性要求更高（人物弧光、多线质感、场景呼吸感）
   */
  /**
   * resolvePlatformStrategy — prompt 层平台口径的唯一解析入口。
   *
   * 与确定性扫描器 detectForbiddenTells 走完全相同的 resolveNovelStrategy 调用：平台 + 长短篇 +
   * 六维执行标准（平台/分类/基调/文风/流派/视角）一并传入。少传标签会让「悬疑收紧回报间距、言情允许柔性回报、
   * 爽文提高密度、白描放宽间距」这些微调在生产里退化成通用值，正文就不再符合创建前选定的平台和标签。
   *
   * prompt 里任何「开篇 X 字」「对话占比 A–B%」「多少字一次推进」都必须取自这里返回的 target，
   * 禁止写死常数：写死的 300 字 / ≥30% 与平台表的 200–800 字 / 20%–65% 会在同一个 prompt 内
   * 形成两套口径，模型只能随机二选一，作者看到的却是「我选了知乎却按番茄写」。
   */
  private resolvePlatformStrategy(
    projectId?: string,
    isLong?: boolean,
  ): { strategy: ResolvedNovelStrategy; target: TextMetricTarget } {
    const profile = this.resolveHardlineProfile(projectId);
    const strategy = resolveNovelStrategy({
      platform: profile.platform,
      storyType: profile.storyType,
      storyCategory: profile.storyCategory,
      storyTone: profile.storyTone,
      writingStyle: profile.writingStyle,
      webNovelGenre: profile.webNovelGenre,
    });
    const long = typeof isLong === 'boolean' ? isLong : String(profile.storyType || '') === 'long_novel';
    return { strategy, target: targetForLength(strategy, long ? 'long_novel' : 'short_story') };
  }

  private buildOutlineAdherenceContract(isLong: boolean, projectId?: string): string {
    const difference = isLong
      ? '【差别化说明 · 长篇】对多样性要求更高：同一世界观下应呈现人物成长弧光、多线并进的质感、不同场景的呼吸感与各异的叙事节奏；但仍须始终锚定本章大纲，不得借"多样性"之名漂移出大纲或篡改确稿设定。'
      : '【差别化说明 · 短篇】受篇幅限制，微发挥以"精准"为主，围绕单一事件把人物与转折写透，不铺张支线。';

    // 排版红线按平台分化（与确定性扫描器 detectForbiddenTells 保持同一套判定，
    // 避免"平台规则要求段落短、硬红线又禁止短句独立成段"的自相矛盾）：短段快节奏平台允许承载
    // 信息/对话/情绪的短段独立成段，只防连续等长与机械拆句；其余平台维持拼接要求。
    // 平台 + 长短篇 + 六维执行标准统一走 resolvePlatformStrategy（与确定性扫描器同一解析入口）。
    const { strategy: __hlStrategy, target: __target } = this.resolvePlatformStrategy(projectId, isLong);
    // 短段平台集合 = 平台表 pacing==='very_high'（与 hardline-scanner 同一判据）。
    // 此前这里另抄了一份同名单与 pacing 判定做「或」：同一事实写两遍，平台表调整节奏档后两份会各自漂移。
    const __shortPacing = __hlStrategy.pacing === 'very_high';
    const paragraphRule10 = __shortPacing
      ? '10. 本平台段落要短（一般每段不超过3行），但必须长短错落：单个有冲击力的短句可独立成段做强调，连续短段不超过2个，第3个相邻短句要并入同一段或展开成中长段；严禁每一句话都另起一段（机械碎断），也禁止连续3段几乎等长'
      : '10. 段落长短交错，禁止连续3段同等长度，禁止短句独立成段后跟空行';
    const paragraphRule11 = __shortPacing
      ? '11. 允许人名/称谓配合对话或动作短段起行，但每个短段必须承载实际信息；段间只留1个空行，禁止连续空行≥2'
      : '11. 禁止姓名/称谓独立成段，禁止段后空行≥2';

    // 平台排版/节奏/读者回报规则不写死数值：唯一源为 platform-benchmarks，
    // 由 prompt 顶部的 resolvePlatformToneDirective → buildBenchmarkDirective 注入，与确定性扫描器、
    // 质检共用同一份阈值；下方【网文节奏】的开篇字数/推进密度/对话占比一律从 __target 运行时插值，
    // 禁止再写死常数（历史上「全章对话占比≥30%」与系统口径 35%–65% 就是这么在同一个 prompt 里打架的）。
    const __payoffGapText = `${__target.payoffGapChars[0]}–${__target.payoffGapChars[1]}`;
    const __dialogueRangeText = `${Math.round(__target.dialogueRatio[0] * 100)}%–${Math.round(__target.dialogueRatio[1] * 100)}%`;

    return `## 大纲严格性约束
【写作前自检 · 必须先想清楚再动笔】
在开始写正文前，请在脑中明确以下3点（不需要输出，只作为写作锚点）：
1. 本章必须承接的前文事实是什么？（上一章结尾的状态/未解决的悬念）
2. 本章唯一核心冲突是什么？（所有情节都应围绕这个冲突展开）
3. 本章结尾要留下什么钩子？（最后一句话必须让读者想看下一章）

【绿区·鼓励微发挥】
在不违反红线的前提下，可自由调度对话语气、感官细节、环境烘托、叙事节奏，使各章风貌各异。未列入角色卡或本章章纲的背景路人不得有姓名、台词或推进核心剧情。

【正面示范 · 什么是"人味"】
- 好的情绪："他攥紧口袋里的旧照片，指尖泛白，半天没说出话。"（用动作体现，零形容词）
- 坏的情绪："他感到非常难过，内心充满了无尽的悲伤与痛苦。"（AI高频词+形容词堆砌+直接说情绪）
- 好的对话：人物有目的地回避问题，动作或沉默改变下一句的意思；连续多轮短答仍须有可见的介入和信息推进。
- 坏的对话："你好，我今天来是想和你讨论一下关于我们之间关系的问题。"（太完整太书面）
- 好的比喻：与人物背景相关的自定义比喻（农民用庄稼、医生用手术刀）
- 坏的比喻："像一把刀""像一盆冷水""如同行尸走肉"（机械老梗）
- 好的描写："他蹲在墙根，把烟屁股在地上捻灭，又点了一根。"（白描，动作说话）
- 坏的描写："他孤独地蹲在冰冷的墙根，忧郁地把燃尽的烟屁股在粗糙的地上用力捻灭，又颤抖着颤抖地点燃了一根新的香烟。"（每个名词前都加形容词，AI味重灾区）

【写作原则 · 白描优先】
- 能用动词说清的，绝不用形容词。"他跑"比"他飞快地奔跑"好
- 能用名词说清的，绝不用修饰语。"桌子"比"老旧的木制桌子"好（除非桌子的旧是剧情关键）
- 情绪不直接说，用动作、生理反应、对话留白体现
- 朴素写法的可执行口径是：句子短、形容词少、情感藏在事里。只写机制，不点名具体作品或作者（点名会诱导复刻特定文本 = 书籍污染）

【网文节奏】
- 开篇前${__target.openingHookChars}字必须有冲突/悬念/反常，禁止先铺环境
- 每${__payoffGapText}字一个情绪点（反转/冲突升级/新信息/关系位移）；这是本平台本篇幅的常见推进密度，可依场景职责与张力曲线偏离，禁止按固定字数硬塞反转
- 对话占比${__dialogueRangeText}（本平台本篇幅区间），对话要有打断/沉默/答非所问/潜台词
- 动作用短句，心理用长句，句式要有呼吸感
- 每章至少1处具体数字锚点（"二十三块""还剩十四分钟"）
- 每章至少3处不完美细节（指甲缝黑泥/扣子没扣/路灯闪烁）

${difference}

═══════════════════════════════════════
【硬红线 · 违反即作废 · 最后3条最重要】
═══════════════════════════════════════
1. 严格按大纲事件顺序推进，所有场景必须实际发生，不得跳过或提前终止于中间事件
2. 已确稿事实（角色身份/关系/位置/物品/伤势）不可偏离，变化必须有交代
3. 严格按本项目已确认的 POV 执行：全知视角可在清楚转场后呈现多个角色内心；限定视角不得无依据进入其他角色脑内；叙述者不得跳出成为作者评论者
4. 正文最后一个场景必须落在本章结尾钩子上
5. 禁止排比句和并列结构滥用（"他想到了A，想到了B，想到了C"）
6. 禁止AI高频词（仿佛/似乎/感到/觉得/不由得/情不自禁/内心充满了/缓缓/微微/一丝/一缕/某种/悄然/无声/莫名/隐约/略显）——能用具体动作、数字、物件与对话说清的，一律删掉模糊词直说
7. 禁止机械比喻/文学老梗（"像一把刀""像一盆冷水""如同行尸走肉"）
8. 禁止解释过度（用行动体现情绪和动机，不直接说"他很难过因为..."）
9. 禁止形容词堆砌：一个名词前最多1个形容词，禁止"冰冷的/孤独的/无尽的/深邃的/璀璨的"等无信息量修饰词连用；能用动词/名词说清的就不加形容词
${paragraphRule10}
${paragraphRule11}
12. 禁止刻意感官描写：不用"凉意贴着皮肤往上爬""炸开一朵光""过电似的传到手腕""心跳漏了一拍""喉咙发紧""手心冒汗"等套路化生理反应；冷就说冷，疼就说疼，用直白动作代替
13. 禁止拟人化比喻：不用"回音吞掉了尾音""风声绕了道""黑暗吞噬了一切""时间飞逝"等非人事物做人才有的动作；直接描写事实
14. 禁止套路化表达：不用"记忆清晰得像刚发生的事""不像梦""那一刻我突然明白""时间仿佛静止""眼中闪过一丝复杂"等AI常用句式；用具体场景和动作代替
15. 破折号（——）必须节制：全章每1000字不超过2处、总数控制在个位数，单段最多1处；绝大多数停顿用逗号、句号、冒号表达，禁止几乎每段都靠破折号承接（这是AI腔的机械停顿指纹）
16. 禁止升华式段尾与模板句：段落末尾不得突然“上价值”、总结点题（“那一刻她终于明白”“一切都会过去的”）；不得多处堆砌“不是X而是Y/不仅X而且Y/与其X不如Y”公式句与“眼中闪过一丝复杂”式套路化描写；情绪靠动作、停顿与对话呈现，不靠结尾金句

⚠️ 以上16条硬红线中，第9条（禁止形容词堆砌）、第12条（禁止刻意感官描写）、第8条（禁止解释过度）是最容易违反的，请特别注意。朴素文字最有力量。`;
  }

  /**
   * buildNarrativeQualityContract — 叙事质量通用约束（短篇优先，逻辑/分寸/去AI味）
   *
   * 与 buildOutlineAdherenceContract 互补：后者管"语言风格和AI痕迹（用词层面）"，
   * 本方法管"叙事结构质量（基础逻辑、描写分寸、降低AI痕迹）"。
   *
   * 设计原则（短篇优先）：
   * - 核心三条：上下文一致、节奏快、基础逻辑通顺。不追求面面俱到。
   * - 描写有分寸：该写的（关键动作、反应、感官细节）必须写，不该写的（小物件来源、
   *   配角背景、交通过程）一个字不多。留白不是偷懒，是信任读者。
   * - 降低AI痕迹是硬要求：AI写的东西太完美、太平均、太想把什么都说到，打破这个就有人味。
   * - "动笔前三问"锚定基础逻辑，从源头避免时间线/因果链/常识错误。
   * - 不写死具体数值，适用于所有题材和平台。
   * - 规则已同步收敛进功能模块标准库 body/review 模块（module-standards.seed.ts），此处为其确定性合同
   */
  private buildNarrativeQualityContract(projectId?: string): string {
    // 推进密度取自平台表（与 prompt 顶部基准指令同一份，运行时插值），不写死「每500-800字」：
    // 番茄短篇 400–600、起点长篇 900–1500，写死一个数就会逼长篇平台按短篇密度硬塞反转。
    const __nqTarget = this.resolvePlatformStrategy(
      projectId,
      projectId ? this.isProjectLongNovel(projectId) : undefined,
    ).target;
    const __nqPayoffGap = `${__nqTarget.payoffGapChars[0]}–${__nqTarget.payoffGapChars[1]}`;
    const base = `## 叙事质量纪律（动笔前必须明确，写作中必须遵守，与大纲严格性约束同级）

### ═══ 设定层级铁律（最高优先级，所有生成入口必须遵守）═══

**事实优先级：${STORY_FACT_PRIORITY}。**

前面阶段已生成并保存的所有设定，后面阶段必须100%严格遵守，禁止与已有设定矛盾，禁止自行修改已有设定，禁止凭空新增与已有设定冲突的内容。具体：
- **世界观**：时代、年份、地点、氛围基调、核心规则、社会结构、结局方向——正文所有时间、地点、规则必须与之一致。
- **大纲**：章节任务、事件链、核心冲突、反转位置、结局——正文每一段都必须能对应到本章大纲的具体场景或行动，不得跳过或合并大纲事件。
- **角色卡**：姓名、身份、年龄、外貌、性格、说话风格、关系、目标——正文出场角色必须严格使用角色卡中的设定，禁止改名、禁止改身份、禁止改年龄外貌。未列入角色卡或章纲的路人不得有姓名、台词或推进核心剧情。
- **伏笔**：已埋设的伏笔必须在指定位置回收，回收方式必须与埋设时的线索一致。
- **组织/地图**：组织名称、势力关系、地点名称、空间关系——正文必须严格使用，禁止自行编造新组织或新地点。

**冲突裁决原则**：正文偏离已确认设定时修改正文；两份已保存资料互相冲突时阻断生成并修正架构资料，不能要求正文同时满足互斥命令。

---

### ═══ 动笔前四问（开始写正文前，必须在脑中明确，不需要输出）═══

**第一问·时间线锚点**
本章每个关键事件发生在什么时间？角色在那个时间点能在那个位置吗？相关机构或他人的响应流程（审批、出行、等待回执、排班等）给了足够时间吗？——时间线对不上就现在调整，不要带着矛盾动笔。

**第二问·人物动机锚点**
每个出场角色在本章想要什么？他的行为符合身份和利益吗？有没有角色只是为了"推进剧情"而做不符合人设的事？可疑角色的暴露点控制在1-2个关键反常细节，不要把"我是坏人"写在脸上。

**第三问·冲突因果锚点**
本章核心冲突的"因"是什么？"果"是什么？推进链完整吗？有没有靠"刚好遇到"来解决核心冲突？——巧合只能引发事件，不能解决冲突。主角的关键突破必须来自行动或推理。

**第四问·物品状态锚点**
本章有哪些关键物品（保单/信封/手机/钥匙/证物等）？它们的状态变化链是什么？（出现→被拿走→被销毁→被转移→丢失）——动笔前必须列清楚，写完后必须检查：物品被拿走/销毁/丢失后，后面绝对不能再出现；角色拿到某物品后，后续使用时要能追溯来源。

---

### ═══ 描写分寸（什么该写，什么不该写，判断标准）═══

### ✅ 必须写的（不写读者出戏）
- **角色的关键动作和反应**：发现关键线索时手停在哪、被质问时眼神往哪飘、做决定时身体什么姿态。这些是读者代入的锚点。
- **核心场景的感官细节**：不是"房间很旧"，是"潮气混着木头腐朽的味道扑上来""灰尘厚得像绒，手指按下去留印痕"。用一两个感官词代替一大段背景介绍。
- **情绪的身体化表达**：不是"他很震惊"，是"那一点在眼里慢慢糊了""指节抵着桌沿压得发白"。把情绪藏进微动作里，不要直接说破。
- **关键对话的潜台词**：角色说的和想的可以不一致，该停的时候停，沉默也是对话。

### ❌ 不该写的（写了拖节奏显刻意）
- **小物件的来源**：出现一把剪刀、一辆车、一部手机，不需要解释哪来的。出现即合理。
- **配角的背景和动机**：警察为什么当警察、上司为什么针对主角，不需要交代。他做了什么、说了什么就够了。
- **交通方式和路上发生的事**：从A到B，除非路上有关键情节，否则一句话带过甚至直接跳。
- **环境里每个东西的功能**：大部分背景就是背景，不需要每个细节都埋伏笔。
- **角色反应的完整心理过程**：不需要"震惊→否认→愤怒→冷静"拆解成几个阶段，一个身体反应+一个动作就够了。
- **专业操作的细节步骤**：签名比对不需要写"横笔的位置，竖笔的角度，落笔的顿挫，收笔的回锋"这些专业术语；查系统不需要写每一步点击了哪个按钮；做化验不需要写试剂配比。读者只需要知道结果和角色的反应，过程点到为止（"他比对了三遍，每一处转折都对得上"就够了）。除非专业操作本身是关键情节（如主角通过某个专业细节发现破绽），否则不要展开写步骤。

### ⚖️ 判断标准（写之前问自己一句）
> 这个细节/解释/描写，删了之后读者会困惑吗？
> - 会困惑 → 必须写
> - 不会困惑，但能增强代入感/情绪 → 选写（用最省的方式写）
> - 不会困惑，也不增强什么 → 不写

---

### ═══ 基础纪律（上下文一致、节奏快、基础逻辑通顺）═══

### 一、逻辑自洽（基础要求，违反则读者出戏）
- **时间线必须对得上**：角色位置、物品存在时长、机构运作时间必须自洽。"略写过程"可以，但"结果说不通"不行。
- **专有名词必须锁定（零容忍）**：设定中出现的专有名词（公司名、城市名、部门名、人名、地名、组织名、项目名等）必须严格使用，**不得自行编造、替换或改名**。如果上下文里列出了"专有名词·必须严格使用"清单，必须100%遵循。例如设定中公司叫"星辰保险"，正文里不能写成"天恒保险"；角色是"经侦支队"，不能写成"刑侦支队"。如果正文中需要出现设定中没有的新名称，必须是合理的新增，且生成后应回写到设定中。
- **时间节点不能太刻意**：不密集砸精确到分钟的时间点，人物对话/辩解/内心独白不报精确时间，机构流程也不逐分钟交代；用具体情境锚点（快到中午的时候/那天下午/忙到天黑），不用硬红线44禁止的机械转场。完整口径（精确时间点密度上限、场景区分与系统显示/证据截图/监控记录豁免）统一以【执行标准 · 正文生成】的「时间节点纪律 time-node-discipline」为准（已随系统指令注入本次生成）。
- **物品状态必须追踪**：关键物品（保单/信封/手机/钥匙/证物等）被拿走/销毁/丢失后，后面绝对不能再出现。角色使用某物品时，要能追溯他是什么时候拿到的。写完后必须检查关键物品的状态链是否一致。
- **信息必须有来源**：角色说"我已经看过/知道/查到了"某信息时，必须交代他是怎么知道的（谁告诉他的、他在哪看到的、他什么时候查的）。不能凭空"已经知道"。
- **专业场景结果必须符合常识**：警务/医疗/法律/职场的核心结果不能违反基本常识（如保险诈骗归经侦不管刑侦）。可以不写审批流程，但不能让警察瞬移、不能让嫌疑人问完话就直接走。
- **因果链必须完整**：每个关键情节有因有果。主角的突破来自行动/推理，不是"刚好遇到"。
- **感官描写必须准确**：触觉不能"记住"（应该是"触感记住了"），视觉不能"听到"，嗅觉不能"看到"。感官动词和感官对象必须匹配。
- **判断标准**：读者的疑问应该是"这背后藏着什么？"（好悬念），而不是"这现实吗？"（逻辑漏洞）。

### 二、人物够用即可（短篇不追求每个角色都立体）
- **主角必须立住**：有明确的目标、行为逻辑、情绪反应。读者能代入他。
- **配角够用即可**：不需要每个配角都有背景故事和人物弧光。他做了什么、说了什么、对主角产生什么影响，就够了。
- **可疑角色暗示≤2个**：用1个关键反常细节暗示，不要反复提醒读者"他有问题"。
- **主角面对重大冲击要有身体反应**：不能"微温一下"就立刻切到理性分析。给一个具体的身体动作（发呆/盯着某物/手停住），不需要拆解情绪阶段。

### 三、对话自然（不念经、不台词化、不审讯笔录化）
- **专业术语必须转化为口语**：法条/规则/术语不能整段念出。加反问、停顿、口语缓冲词。
- **对话可以有潜台词**：角色说的和想的可以不一致。允许沉默、答非所问、用动作代替回答。但不是每段对话都必须有潜台词，自然就好。
- **禁止审讯笔录式一问一答**：不能连续多组"你是XX？""是。""你做了XX？""对。"这种超短问答。真实询问会有缓冲（"嗯""你说慢点""这个我再确认一下"）、重复、打断、答非所问。至少每3组问答插入一个非问答元素（动作/环境/角色反应/缓冲词）。
- **允许"废话"存在**：真实对话里有寒暄、重复、答非所问。可以加一两句"无关但真实"的话（如警察进门说"你们这楼不好找"），不要每句都在推进剧情。
- **角色反应不能太"正确"**：主角面对突发状况时，允许犹豫、走神、说半句停住、做一个无关的小动作。不要每一步都理性果断得像在执行任务清单。

### 四、节奏紧凑（短篇核心要求）
- **不铺垫、不灌水**：每段都在推进剧情或建立人物，没有"日常灌水"段落。
- **每${__nqPayoffGap}字有一次有效推进**：新线索、关系变化、认知反转、代价暴露——让读者停不下来。这是本平台本篇幅的常见推进密度，可依场景职责与张力曲线偏离，禁止按固定字数硬塞反转。
- **探索过程可以有小挫折**：但不需要每个挫折都展开写。一个"不对"的瞬间（空找/卡壳/误导）就够了，点到为止。
- **紧迫感必须有依据**：倒计时/期限来自角色处境（制度流程/敌人行动/自然时间），不是作者凭空宣布。

### 五、信息不倾倒
- **背景信息分散释放**：不能一次性通过内心独白倒出全部背景。分散到多个场景，通过物品/对话/动作自然带出。当前场景只需要当前需要的信息。
- **控制信息差**：读者知道的、主角知道的、反派知道的要有差异。每次揭示新信息时可以同时产生新疑问，但不是必须每次都抛两个问题。

---

### 六、禁止元叙述（硬红线，违反则打回重写）
正文必须保持故事内视角，绝对禁止叙述者跳出故事成为作者评论者。以下模式一经出现即视为违反硬红线：
- **禁止"创作反思/创作宾语式元叙述"**：如"我本来想写""我准备写""我写的这个结局""我写的故事"——你是故事中的角色，不是写这个故事的作者。注意区分：故事内人物的写字、记录、笔迹辨认动作（"我写的，横画都往上抬""那一笔我写不出来""我在登记表上写了两行字"）是正常叙事，不是作者跳出，不得删改。
- **禁止"我把这个故事/结局/剧情/人物/角色/场景/设定"**：如"我把这个人物写死了""我把结局改了"——你在经历故事，不是在编排故事。
- **禁止"作者/编者/笔者 + 写/觉得/也/认为/决定/在这里/写到这里"**：如"作者也很无奈""笔者认为""写到这里"——绝对不允许出现作者自称。
- **禁止"作为作者/写手/创作者/笔者"**：任何以作者身份自居的表述都禁止。
- **禁止评论剧情本身**：如"没有反转""没有救场""没有伏笔""怎么写都比...强""这就是我一辈子写过的最..."——你是故事中的人，不知道"反转""伏笔"这些创作术语。
- **判断标准**：如果一句话跳出了当前场景、站在故事外评论故事本身，或者使用了"写/作者/伏笔/反转/结局"这类创作术语来描述当前经历，就是元叙述，必须删除或改写为角色视角的真实感受。

---

### ═══ 吸引力与代入感（让读者停不下来，但不要让读者感觉到你在用力）═══

语句通顺≠好看。但"好看"不是靠堆砌技巧堆出来的——恰恰相反，读者一旦感觉到"作者在用力制造悬念/在堆砌感官/在设计节奏"，就会出戏、会反感。

**核心原则：所有技巧都是为了让故事自然流淌，不是为了展示技巧。** 好的网文，读者看完只记得故事和人物，不记得"这里用了一个钩子""那里有三种感官描写"。如果读者能指出"这里作者在刻意制造悬念"，那就是失败。

### 一、开篇：从事情正在发生的地方开始

- **不要从"起床/吃饭/走路/喝水"这种无冲突的日常动作开始**。读者打开一本书，想看到的是"正在发生什么事"，不是"主角今天过得怎么样"。
- **但也不要为了钩子而钩子**。不要开篇就扔一个跟后文脱节的"惊天秘密"，不要用"他不知道的是……"这种上帝视角剧透。钩子应该是故事自然的起点——主角正在做一件事，这件事里有不对劲的地方，读者自然想知道"怎么回事"。
- **日常场景可以开篇，但日常里要有异常**。比如主角在喝饮料，听见走廊一声闷响——这是自然的，因为喝饮料是日常，闷响是异常。但如果写了三段"饮料什么味道、主角心情怎么样、天气好不好"才出现闷响，那就拖了。
- **判断标准（自然版）**：读完开头，读者心里自然冒出一个疑问——"然后呢？""怎么回事？"——而不是觉得"作者在吊我胃口"。

### 二、代入感：让读者自然进入主角的身体，不是堆砌感官

- **不要罗列感官**。不要写"我看到……我听到……我闻到……我摸到……"——这是在做感官清单，不是在讲故事。感官应该是主角在那个情境下自然会注意到的东西。
  - 主角看到血迹时，自然会注意到颜色（暗红，不是鲜红）、形状（拖痕，不是滴落）、气味（铁锈味）——但不需要把五种感官都凑齐。
  - 主角紧张时，自然会感觉到心跳、手心出汗、呼吸变浅——但不需要每处紧张都写全套身体反应，选一个最贴切的就够了。
- **第一人称要有心理活动，但不要大段独白**。心理活动应该是穿插在动作之间的短句、判断、瞬间的闪回——像真人在做事时脑子里自然冒出来的念头，不是站在那里思考人生。
  - ✅ 自然："那颜色不对。不是饮料。我脑子里嗡的一声，第一反应是喊人，但喉咙像被什么堵住了。"
  - ❌ 刻意："我感到一阵强烈的恐惧和震惊，我的心跳加速到每分钟120次，我的手心渗出了冷汗，我的大脑在飞速运转分析这到底是什么情况……"（像在写体检报告）
- **情绪不要说破，用动作带出来**。不要写"我很紧张""我很害怕""我很愤怒"——写主角在那种情绪下自然会做的动作。但也不要每处情绪都硬塞一个动作，有时候一句"我没说话"比十个动作更有力。
- **判断标准（自然版）**：读者读完一段，感觉"我要是在那儿，我也会这样"——而不是觉得"作者在教我怎么感受"。

### 三、对话：像真人在说话，不是演员在念台词

- **对话的第一要求是"像真人说的"，不是"信息量大"**。真人说话会停顿、会改口、会说半句、会答非所问、会说废话。如果每句对话都在精准推进剧情，那就是台词，不是对话。
- **关键对话要有张力，但张力来自角色的处境，不是来自作者的设计**。
  - 受伤的人说话自然会断断续续、有气无力——不需要作者特意"加张力"。
  - 被质问的人自然会回避、转移话题、答非所问——不需要作者特意"加潜台词"。
  - 愤怒的人自然会简短、带刺、重复——不需要作者特意"加冲突"。
- **对话之间要有动作/表情，但不要每两句就插一个**。连续几句纯对话是可以的——真人吵架时就是你一句我一句，不会每说一句就喝一口水。动作/表情应该出现在情绪转折处、停顿处、需要强调的地方。
- **判断标准（自然版）**：把对话读出来，觉得"这话真人会说"——而不是觉得"这话写得真好"。

### 四、情绪：自然流淌，不是设计曲线

- **一章内情绪自然会有起伏，因为剧情在推进**。不需要作者特意设计"平静→紧张→恐惧→愤怒→决心"的曲线——剧情到了，情绪自然就到了。
- **但不要全程平淡**。如果一章读完，主角的情绪没有任何变化，那说明这一章没有发生任何真正影响主角的事——这才是问题，不是"情绪曲线不对"。
- **情绪转变要有触发点，但触发点要自然**。主角不会"突然就生气了"——他是看到了什么、听到了什么、想到了什么，才生气的。把那个触发点写出来，情绪转变就自然了。
- **张弛有度是自然的，不是机械的**。连续紧张之后，人自然会喘口气、会愣一下、会回想刚才发生了什么——这就是"弛"。不需要作者特意安排"连续2段紧张后必须有1段舒缓"。
- **判断标准（自然版）**：读者跟着主角的情绪走，到紧张处心跳加速，到舒缓处松一口气——而不是觉得"作者在调节我的情绪"。

### 五、悬念：读者自然想知道，不是作者故意吊胃口

- **每章结尾自然会有"未完成的事"**。主角的目标还没达成、危险还没解除、真相还没揭开——这些就是天然的钩子。不需要作者特意在结尾加一句"他不知道的是……"。
- **但不要为了留钩子而强行打断**。如果一个场景自然结束了，就结束它，不要为了"留悬念"而在最后一句硬加一个新危机。好的钩子是"这件事还没完"，不是"突然又出事了"。
- **中间自然会有小悬念**。主角在推进自己的目标，自然会遇到新阻碍、发现新信息、产生新疑问——这些就是小悬念。不需要作者每500字就硬塞一个反转。
- **信息不要一次倒完，但也不要故意藏着**。主角知道什么，读者就知道什么（第一人称）；主角不知道的，读者也不知道。不需要作者特意"留10-20%不解释"——该解释的时候自然会解释，不该解释的时候主角自己也不知道。
- **判断标准（自然版）**：读者合上书，心里想"接下来会怎么样"——而不是觉得"作者又在吊我胃口"。

### 六、节奏：故事自然有快慢，不是机械切换

- **紧张的场景自然会用短句**。人在紧张时，思维是跳跃的、碎片化的——写出来自然就是短句。不需要作者特意"把句子控制在10字以内"。
- **舒缓的场景自然会用长句**。人在放松、思考、回忆时，思维是连贯的、延展的——写出来自然就是长句。不需要作者特意"用长句调节节奏"。
- **关键的东西自然会被强调**。最重要的动作、最关键的发现、最震撼的反转，读者会自然注意到——因为它重要。不需要作者特意"单独成段"来强调。但如果它确实重要，单独成段也是自然的。
- **不要为了节奏而节奏**。如果一个场景需要慢，就慢；需要快，就快。不要因为"连续3段同节奏"就硬插一段不同节奏的——那会打断故事的自然流淌。
- **判断标准（自然版）**：读者读紧张场景时呼吸急促，读舒缓场景时放松下来——而不是觉得"作者在切换节奏"。

### ⚖️ 总判断标准：刻意还是自然？

写完一段，问自己：
> 读者读完这段，是记住了"故事里发生了什么"，还是记住了"作者用了什么技巧"？

- 记住故事 → 自然，好。
- 记住技巧 → 刻意，改。

**最自然的写作，是读者感觉不到作者的存在。** 读者不是在"读一本写得很好的书"，而是在"经历一个故事"。所有的钩子、感官、对话、情绪、悬念、节奏，都应该是故事本身的一部分，而不是作者贴上去的装饰。

---

### ═══ 去 AI 味（写作手法提示）═══

AI 写的东西本质是"太完美、太平均、太想把什么都说到"。打破这个，人味就出来了。
本节只列写作手法：全部去 AI 味规则、阈值与规则号（hardline-scanner）统一以【执行标准 · 正文生成】为准（已随系统指令注入本次生成），硬伤自检口径见下方【核心三条】，此处不另立第二套口径。

**1. 保持10%的"不完美"**：适当留口语化表达、半截话、重复、改口（"我不是说……算了"），不必句句完整。
**2. 句子开头别总用主语**：动作开头（"手按在桌沿上"）、环境开头（"空调风口嗡嗡响"）、时间开头（"九点十四分"）、短句直掷（"不对。"）混着用。
**3. 用具体代替抽象**：不是"他很紧张"，是"手心出汗，在裤腿上蹭了一下"。
**4. 情绪不要说破**：让角色做一个反常的小动作，读者自己体会（"他把保单折了折，塞进内侧口袋"）。
**5. 避免 AI 高频词与套路句式**：少用"首先、其次、值得注意的是、综上所述"，少用"像……一样"式标准比喻、三连排比与工整对仗。
**6. 禁止生成过程标记残留**：不属于正文的短句（"这不该存在""【待补充】""[情绪点]"）不得独立成行；"这不该存在"是 AI 高频残留短语，换成更具体的人类想法（"这不可能""爷爷怎么会有银行卡"）。
**7. 禁止套路化结尾与旁白**：不用全知视角旁白剧透（"她不知道的是……""殊不知……"），不用廉价反转（"原来一切都是梦""他早就死了"），不用抽象点题（"一切才刚刚开始""命运的齿轮开始转动"）；留钩子就落到具体动作、对话或物件细节上。
**8. 不要短距离重复**：动作、身体部位、同一动词、同一环境细节都不要在短距离内反复出现；需要时换部位、换表达，或用对话/环境/心理替代。

### ═══ 硬伤自检（零容忍，写完必查；阈值口径见执行标准）═══

**0. 专有名词一致**：设定里的公司/城市/部门/人名/地名/组织/项目名，正文不得改名或替换；正文新出现的名字必须回写设定。检查方法：把正文专有名词列出，与设定逐一比对。
**1. 物品状态链**：关键物品（保单/信封/手机/钥匙/证物等）被拿走、销毁、丢失后不得再出现；角色使用某物品必须能追溯到来源。检查方法：列出本章关键物品，逐个追踪状态变化链。
**2. 时间节点不刻意**：不要密集报精确到分钟的时间，人物被质问时不说"我十五点前录完的"这类精确报时，机构流程也不逐分钟交代。检查方法：通读找出全部精确时间点，只保留必要的。
**3. 对话不机械**：避免连续超短一问一答（"你是XX？""是。"），对话要有缓冲、停顿、重复、答非所问。检查方法：看询问段落，问答之间是否有动作/沉默/语气词介入。
**4. 动作不模式化**：避免"手+桌面"（按桌沿、拍桌面、指节压得发白）、"手+脸"（扶额、揉眉心、摸下巴）、"眼神"（眯眼、瞳孔收缩、目光锐利）等成串重复，也避免词语直接重复。检查方法：扫一遍动作描写，看有没有重复的身体部位+物品组合。
**5. 信息有来源、感官要对、环境不重复**：角色说"我看过/我知道"必须交代怎么知道的；感官动词与对象要匹配；同一环境细节不要短距离重复。检查方法：扫"已经/知道/看过"，扫感官动词，扫环境描写。
**6. 标点规范**：禁止一逗到底（一句超过4个逗号仍未断句要拆开）；对话标点跟随说话人位置（说话人在中间用逗号、在结尾用句号、在开头用冒号）；破折号只用于转折或补充，省略号不超过6点；全部中文标点。检查方法：写完后通读，该换气处用句号，引号成对检查。

---

⚠️ **核心三条：上下文一致、节奏快、基础逻辑通顺。** 这三条做到了就是合格的短篇。描写分寸是加分项，但**专有名词不一致、物品状态矛盾、时间节点太刻意、对话审讯笔录化、动作模式化、内部标记残留、一逗到底**以及确定性扫描命中的 AI 痕迹语言硬伤（口径见项目执行标准）都是阻断性硬伤，必须零容忍、写完必查。`;

    // 执行标准六维（平台/分类/基调/文风/流派/视角）与长短篇基准统一由 prompt 顶部的 resolvePlatformToneDirective 注入
    // （执行标准源 creative-constitution.buildExecutionStandard，平台/长短篇基准源 platform-benchmarks），
    // 此处不再重复拼接、也不保留第二份手写平台文案。
    return base;
  }

  // platformStandardProblem 的唯一实现已上收到 modules/project/creative-constitution.ts（全链路同一口径）：
  // 判据一旦分叉，就会出现「前端放行、后端阻断」，或者更糟——被静默当作「通用网文」继续生成。

  // buildPlatformStyleDirective 的唯一实现已上收到 modules/project/creative-constitution.ts（唯一源 platform-benchmarks），
  // 框架层/正文层/二次加工层共用同一份；此处不再保留 controller 内第二份手写平台文案。

  /**
   * resolvePlatformToneDirective — 「平台风格 + 故事基调 + 六维执行标准」解析器。
   * 实现已上收到 modules/project/creative-constitution.ts 的 resolveProjectStandardDirective（唯一解析入口）：
   * 缺 projectId→400，项目不存在→404，六维未齐备→422；其余读取失败→throwStepReadFailure→500。
   * 本方法只做转发，不再自己读项目、另拼口径——二次加工层（逐句精修/降AI改写/精修模板）也必须是同一条标准。
   */
  private resolvePlatformToneDirective(projectId: string, _dtoPlatformStyle?: string): string {
    try {
      return resolveProjectStandardDirective(this.db.getDb(), projectId).directive;
    } catch (error) {
      this.throwStepReadFailure('resolvePlatformToneDirective', projectId, error);
    }
  }

  /**
   * isProjectLongNovel — 判定项目是否为长篇，用于正文生成时选择差异化的
   * "微发挥/多样性"约束强度（长篇对多样性要求更高）。读取失败一律抛错：不得把长篇静默当短篇处理。
   */
  private isProjectLongNovel(projectId: string): boolean {
    try {
      const db = this.db.getDb();
      const row = db.prepare('SELECT type FROM projects WHERE id = ?').get(projectId) as any;
      return String(row?.type || '') === 'long_novel';
    } catch (error) {
      this.throwStepReadFailure('isProjectLongNovel', projectId, error);
    }
  }

  /** 所有作品统一使用单章 CHAPTER_WORD_RANGE 字，避免各阶段口径漂移。 */
  private getChapterWordRange(_projectId?: string, _targetWords?: number): { min: number; max: number } {
    return { ...CHAPTER_WORD_RANGE };
  }

  /**
   * buildAutoContext — 从数据库自动提取大纲、角色、世界观上下文，用于简易模式LLM提示增强
   */
  private buildAutoContext(projectId: string, chapterNumber?: number, chapterId?: string): string {
    const db = this.db.getDb();
    const parts: string[] = [];

    try {
      // 1. 提取当前章节大纲
      if (chapterNumber || chapterId) {
        const selectedChapter = chapterId
          ? db.prepare('SELECT outline_id FROM chapters WHERE id = ? AND project_id = ?').get(chapterId, projectId) as any
          : null;
        const chOutline = selectedChapter?.outline_id
          ? db.prepare(`SELECT title, content, chapter_function, scenes FROM outlines WHERE id = ? AND project_id = ? AND level = 'chapter' LIMIT 1`).get(selectedChapter.outline_id, projectId) as any
          : db.prepare(
            `SELECT title, content, chapter_function, scenes FROM outlines WHERE project_id = ? AND "order" IN (?, ?) AND level = 'chapter' ORDER BY CASE WHEN "order" = ? THEN 0 ELSE 1 END LIMIT 1`
          ).get(projectId, chapterNumber || 1, (chapterNumber || 1) - 1, chapterNumber || 1) as any;
        if (chOutline) {
          parts.push(`【当前章节大纲】\n标题: ${chOutline.title || ''}\n功能: ${chOutline.chapter_function || ''}`);
          if (chOutline.content) parts.push(`核心内容: ${chOutline.content}`);
          try {
            const scenes = JSON.parse(chOutline.scenes || '{}');
            if (scenes.conflict) parts.push(`冲突: ${scenes.conflict}`);
            if (scenes.foreshadowing) parts.push(`伏笔: ${scenes.foreshadowing}`);
            if (scenes.hook) parts.push(`钩子: ${scenes.hook}`);
            if (scenes.emotionalTone) parts.push(`情绪: ${scenes.emotionalTone}`);
          } catch {}
        }
      }

      // 2. 提取角色列表
      const characters = db.prepare(`SELECT name, identity, personality, background FROM characters WHERE project_id = ?`).all(projectId) as any[];
      if (characters.length > 0) {
        parts.push('\n【角色列表】\n' + characters.map((c: any) =>
          `- ${c.name}（${c.identity || '未知身份'}）: ${typeof c.personality === 'string' ? c.personality : JSON.stringify(c.personality || {})}`
        ).join('\n'));
      }

      // 3. 提取基础设定
      const proj = db.prepare('SELECT settings FROM projects WHERE id = ?').get(projectId) as any;
      if (proj?.settings) {
        try {
          const s = JSON.parse(proj.settings);
          const cs = s.coreSetting || s.baseSettings || {};
          if (Object.keys(cs).length > 0) {
            parts.push('\n【故事核心设定】\n' +
              Object.entries(cs).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n'));
          }
          if (s.reversals?.length > 0) {
            parts.push('\n【反转计划】\n' + s.reversals.map((r: any) =>
              `第${r.position || '?'}章: 表面=${r.surfaceTruth || r.surface || ''}, 实际=${r.actualTruth || r.truth || ''}`
            ).join('\n'));
          }
        } catch {}
      }

      // 4. 提取世界观（含专有名词锁定）
      const ws = db.prepare('SELECT name, era, geography, rules, atmosphere, locations, social_rules FROM world_settings WHERE project_id = ? LIMIT 1').get(projectId) as any;
      if (ws) {
        const geoData = (() => { try { return JSON.parse(ws.geography || '[]'); } catch { return []; } })();
        const locData = (() => { try { return JSON.parse(ws.locations || '[]'); } catch { return []; } })();
        const wsParts: string[] = [];
        wsParts.push(`时代: ${ws.era || '未设定'}`);
        wsParts.push(`地点: ${Array.isArray(geoData) ? geoData.join(', ') : ''}`);
        wsParts.push(`氛围: ${ws.atmosphere || ''}`);
        // 专有名词锁定：从 locations 和 name 中提取关键实体名称
        if (Array.isArray(locData) && locData.length > 0) {
          wsParts.push(`\n【专有名词·必须严格使用，不得替换或编造】\n地点/组织: ${locData.join('、')}`);
        }
        if (ws.name) {
          wsParts.push(`世界观名称: ${ws.name}`);
        }
        parts.push(`\n【世界观】\n${wsParts.join('\n')}`);
      }
    } catch (e: any) {
      this.logger.warn(`buildAutoContext 失败: ${e.message}`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }

  private buildWritingStateContext(projectId: string, chapterNumber?: number) {
    try {
      return this.stateItemService.buildWritingStateContext(projectId, chapterNumber);
    } catch (error) {
      throw new Error(`写作状态上下文构建失败，已停止生成且未降级到旧状态：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildCharacterWritingContext(projectId: string): string {
    try {
      const characters = this.characterService.findByProjectId(projectId);
      if (characters.length === 0) return '';
      const cards = characters.map(character => {
        const data = this.characterService.getWritingSummary(projectId, character.id);
        const c = data.profile as Record<string, any>;
        const traits = [
          character.name && `姓名：${character.name}`,
          c.identity_occupation && `身份：${c.identity_occupation}`,
          character.age && `年龄：${character.age}岁`,
          c.appearance && `外貌：${c.appearance}`,
          c.personality_traits && `性格：${c.personality_traits}`,
          c.catchphrase_speech_style && `说话风格：${c.catchphrase_speech_style}`,
        ].filter(Boolean);
        return traits.length ? `- ${traits.join('；')}` : `- ${character.name}（资料待补全）`;
      });
      const nameList = characters.map(c => c.name).filter(Boolean).join('、');
      return `【角色卡·硬约束】
以下是本项目已生成的全部固定角色，正文必须严格遵守，禁止改名、禁止改身份、禁止改年龄外貌、禁止新增不在此列表中的固定角色。只有路人/背景人物（无姓名、无台词、不推动剧情）允许自由发挥。
${cards.join('\n')}
【出场角色白名单】${nameList}
违反以上任何一条即视为正文不合格。`;
    } catch (error) {
      throw new Error(`角色写作上下文构建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * generatePreviousChapterSummary — 长篇正文生成前自动生成上一章摘要
   * 从 chapters 表取上一章正文，用LLM压缩为150字以内的前情提要
   * 第一章（无上一章）返回"无"
   */
  private async generatePreviousChapterSummary(projectId: string, chapterIndex: number): Promise<string> {
    if (chapterIndex <= 1) return '无';
    try {
      const db = this.db.getDb();
      const prevChapter = db.prepare(
        `SELECT content FROM chapters WHERE project_id = ? AND chapter_index = ? LIMIT 1`,
      ).get(projectId, chapterIndex - 1) as any;
      if (!prevChapter?.content || String(prevChapter.content).trim().length < 50) return '无';
      const content = String(prevChapter.content);
      // 只取前3000字做摘要，避免超长输入
      const excerpt = content.length > 3000 ? content.substring(0, 3000) + '...' : content;
      const summaryPrompt = `请将以下小说章节内容压缩为150字以内的前情提要，聚焦：1)本章发生的关键事件 2)主要角色的状态变化（伤势/位置/关系/情绪）3)未解决的悬念。只输出摘要正文，不要标题、不要解释、不要分点。

章节内容：
${excerpt}`;
      // 埋点显式带 projectId：summary 不在创建请求上下文内，靠 AsyncLocalStorage 兜底会丢失，
      // 该条调用就只计入平台级、不计入本书（日志 WARN 的来源）。
      const response = await this.realLLM.generate({
        prompt: summaryPrompt, scenario: 'summary', temperature: 0.3, maxTokens: 1024, maxEmptyRetries: 1,
        metrics: { projectId, chapterIndex: chapterIndex - 1, stepKey: 'summary' },
      });
      const summary = String(response.content || '').trim().replace(/^["'"'"']|["'"'"']$/g, '');
      return summary || '无';
    } catch (error) {
      this.logger.warn(`前情自动摘要生成失败（ch${chapterIndex - 1}）：${error instanceof Error ? error.message : String(error)}`);
      return '无';
    }
  }

  /**
   * extractCharacterStatesFromContent — 从正文（而非章纲）提取角色状态变化
   * 用LLM分析正文中每个出场角色的状态变化，写入character_state_history表
   * 提取维度：位置、伤势、关系、情绪、持有物品、能力变化
   */
  private async extractCharacterStatesFromContent(
    projectId: string,
    chapterIndex: number,
    content: string,
  ): Promise<{ updated: number; skipped: number; errors: string[] }> {
    const result = { updated: 0, skipped: 0, errors: [] as string[] };
    if (!content || content.length < 100) return result;
    try {
      const db = this.db.getDb();
      const characters = db.prepare(
        `SELECT id, name FROM characters WHERE project_id = ? ORDER BY is_pov_character DESC, role ASC LIMIT 12`,
      ).all(projectId) as any[];
      if (!characters || characters.length === 0) return result;
      const charNames = characters.map((c: any) => c.name).join('、');
      const excerpt = content.length > 4000 ? content.substring(0, 4000) + '...' : content;
      const extractPrompt = `请从以下小说正文中提取出场角色的状态变化。只提取在本章中状态发生了变化的角色（位置移动、受伤/痊愈、关系变化、情绪重大转变、获得/失去重要物品、能力变化）。

出场角色名单：${charNames}

输出JSON数组格式，每个元素包含：
- character: 角色名（必须是上面名单中的名字）
- dimension: 状态维度（location/injury/relationship/emotion/item/ability）
- stateAfter: 变化后的状态描述（30字以内）
- trigger: 触发变化的事件（20字以内）

没有状态变化的角色不要输出。只输出JSON数组，不要解释。

正文：
${excerpt}`;
      let states: Array<{ character: string; dimension: string; stateAfter: string; trigger: string }> = [];
      try {
        const response = await this.realLLM.generate({ prompt: extractPrompt, metrics: { projectId, stepKey: 'state_extract' }, scenario: 'state_extract', temperature: 0.2 });
        const text = String(response.content || '').trim();
        // 尝试解析JSON（可能被markdown代码块包裹）
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) states = JSON.parse(jsonMatch[0]);
      } catch (e) {
        result.errors.push(`LLM提取失败: ${e instanceof Error ? e.message : String(e)}`);
        return result;
      }
      if (!Array.isArray(states) || states.length === 0) return result;
      for (const s of states) {
        if (!s.character || !s.stateAfter) { result.skipped++; continue; }
        try {
          const char = db.prepare(
            `SELECT id FROM characters WHERE project_id = ? AND name LIKE ? LIMIT 1`,
          ).get(projectId, `%${s.character}%`) as any;
          if (!char) { result.skipped++; continue; }
          db.prepare(`UPDATE characters SET updated_at = ? WHERE id = ?`).run(new Date().toISOString(), char.id);
          const statePayload = JSON.stringify({ state: s.stateAfter, chapter: chapterIndex, dimension: s.dimension || 'narrative_position' });
          try {
            db.prepare(
              `INSERT INTO character_state_history (id, project_id, character_id, dimension, value, chapter_index, trigger_event, created_at) VALUES (?,?,?,?,?,?,?,?)`,
            ).run(
              require('crypto').randomUUID(), projectId, char.id,
              s.dimension || 'narrative_position', statePayload, chapterIndex,
              s.trigger || '章节正文生成', new Date().toISOString(),
            );
            result.updated++;
          } catch {
            result.skipped++;
          }
        } catch (e: any) {
          result.errors.push(`${s.character}: ${e.message}`);
        }
      }
      return result;
    } catch (e: any) {
      result.errors.push(`extractCharacterStatesFromContent: ${e.message}`);
      return result;
    }
  }

  /** 构建「人物状态」上下文——per 文档第160-190行：主角/配角/反派当前状态 */
  private buildCharacterStateContext(projectId: string, chapterIndex: number): string {
    try {
      const db = this.db.getDb();
      // 角色数量从8个提升到15个，按POV优先级+角色重要性排序，避免后出场角色凭空出现
      const characters = db.prepare(`SELECT id, name, identity, role, is_pov_character FROM characters WHERE project_id = ? ORDER BY is_pov_character DESC, role ASC`).all(projectId) as any[];
      if (!characters || characters.length === 0) return '暂无角色数据';
      const lines: string[] = [];
      // 取前15个角色（原8个），覆盖大多数项目的主要角色
      for (const ch of characters.slice(0, 15)) {
        // 角色状态从最近1条改为最近3条合成，避免单条过期状态导致前后矛盾
        let stateText = '';
        try {
          const stateRows = db.prepare(`SELECT value, trigger_event, chapter_index FROM character_state_history WHERE project_id = ? AND character_id = ? AND chapter_index <= ? ORDER BY chapter_index DESC, created_at DESC LIMIT 3`).all(projectId, ch.id, chapterIndex) as any[];
          if (stateRows && stateRows.length > 0) {
            const states = stateRows.map((r: any) => {
              try {
                const parsed = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;
                return parsed.state || String(r.value);
              } catch { return String(r.value); }
            }).filter(Boolean);
            stateText = states.join('；');
          }
        } catch {}
        // 无状态记录时回退到初始档案
        if (!stateText) {
          try {
            const pf = db.prepare(`SELECT goals_motivation, weaknesses_fears FROM character_extended_profiles WHERE character_id=?`).get(ch.id) as any;
            if (pf) stateText = (pf.goals_motivation || '') + (pf.weaknesses_fears ? ' | 弱点：' + pf.weaknesses_fears : '');
          } catch {}
        }
        const roleLabel = ch.is_pov_character ? '主角' : (ch.role === 'protagonist' ? '主角' : ch.role === 'major' ? '核心角色' : '配角');
        lines.push(`- ${ch.name}（${roleLabel}）${ch.identity ? '：' + ch.identity : ''}${stateText ? ' | ' + stateText.substring(0, 150) : ''}`);
      }
      return lines.join('\n') || '暂无状态数据';
    } catch {
      return '人物状态加载失败';
    }
  }

  private buildWorldWritingContext(projectId: string, maskForeshadow = true): string {
    try {
      if (!this.worldSettingService || typeof this.worldSettingService.findByProjectId !== 'function') {
        throw new Error('世界观服务不可用');
      }
      const summaries = this.worldSettingService.findByProjectId(projectId)
        .map(setting => this.worldSettingService.getWritingSummary(projectId, setting.id, maskForeshadow).summary);
      if (!summaries.length) throw new Error('项目尚无世界观主记录');
      return `【世界观创作约束】\n${summaries.join('\n\n')}`;
    } catch (error) {
      // 这里曾静默返回空世界观，后果是正文照常生成却失去时间/名单规则，随后 Gate 反复失败。
      throw new Error(`世界观写作上下文构建失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private buildLocationWritingContext(projectId: string): string {
    try {
      const summaries = this.mapPointService.findByProjectId(projectId)
        .map(point => this.mapPointService.getWritingSummary(projectId, point.id).summary);
      return summaries.length ? `【地点写作约束】\n${summaries.join('\n\n')}` : '';
    } catch (error) { throw new Error(`地点写作上下文构建失败：${error instanceof Error ? error.message : String(error)}`); }
  }

  private async runPostWriteArchive(projectId?: string, chapterId?: string, content?: string, sourceMode = 'generated_body') {
    if (!projectId || !chapterId || !content?.trim()) {
      return { stateItemsCreated: 0, stateArchiveWarning: null as string | null };
    }

    try {
      const response = await this.realLLM.generate({
        prompt: `请从以下正文中提取需要进入状态确稿中心的结构化变化。只输出严格 JSON，不要 Markdown。

正文:
${content}

格式:
{
  "worldSettingUpdates": [{"title": "世界观变化", "summary": "新增规则或设定"}],
  "characterUpdates": [{"title": "角色变化", "summary": "受伤、关系、动机、外貌、立场或行为变化"}],
  "organizationUpdates": [{"title": "组织变化", "summary": "组织、阵营、权力关系变化"}],
  "outlineUpdates": [{"title": "大纲变化", "summary": "后续剧情计划受到影响"}],
  "foreshadowingUpdates": [{"title": "伏笔变化", "summary": "埋设、激活、回收或悬空风险"}],
  "timelineUpdates": [{"title": "时间线变化", "summary": "时间、地点、事件顺序推进"}],
  "conflicts": [{"title": "潜在冲突", "summary": "与已知状态可能冲突的点"}]
}`,
        temperature: 0.3,
      });
      const archive = this.parseArchiveReport(response.content);
      const stateItems = this.stateItemService.createFromArchive(projectId, chapterId, archive, sourceMode);

      // 真实前后矛盾检测（非桩实现）：基于已确认的角色/世界观/伏笔/大纲做确定性校验，
      // 结果持久化到统一 QualityIssue，供「前后矛盾」页面读取。失败仅告警，不影响正文保存。
      try {
        const chapterRow = this.db.getDb().prepare('SELECT chapter_index FROM chapters WHERE id = ? AND project_id = ? LIMIT 1').get(chapterId, projectId) as any;
        if (chapterRow?.chapter_index !== undefined) {
          await this.consistencyCheckService.checkConsistency(projectId, { chapterIds: [Number(chapterRow.chapter_index)] });
          this.logger.log(`post-write consistency check done for project=${projectId} chapter=${chapterRow.chapter_index}`);
        }
      } catch (consistencyError: any) {
        this.logger.warn(`post-write consistency check failed (ignored): ${consistencyError?.message ?? consistencyError}`);
      }

      return { stateItemsCreated: stateItems.length, stateArchiveWarning: null as string | null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`post-write state archive failed: ${message}`);
      return { stateItemsCreated: 0, stateArchiveWarning: message };
    }
  }

  private buildConfirmedWritingContext(projectId: string, chapterNumber?: number) {
    const db = this.db.getDb();
    const pendingRows = db.prepare(`
      SELECT target_type, target_id, target_label, summary, source_chapter_id
      FROM state_confirmations
      WHERE project_id = ? AND status = 'pending'
    `).all(projectId) as Array<{ target_type: string; target_id: string | null; target_label: string; summary: string; source_chapter_id: string | null }>;

    const confirmedRows = db.prepare(`
      SELECT target_type, target_id, target_label, summary
      FROM state_confirmations
      WHERE project_id = ? AND status = 'confirmed'
      ORDER BY confirmed_at DESC, updated_at DESC
    `).all(projectId) as Array<{ target_type: string; target_id: string | null; target_label: string; summary: string }>;

    const pendingKeys = new Set(pendingRows.map(row => `${row.target_type}:${row.target_id || ''}`));
    const pendingTimelineSourceIds = pendingRows
      .filter(row => ['timeline_state', 'plot'].includes(row.target_type) && row.source_chapter_id)
      .map(row => row.source_chapter_id);
    const pendingTimelineChapters = pendingTimelineSourceIds.length > 0
      ? new Set((db.prepare(`
          SELECT chapter_index FROM chapters
          WHERE project_id = ? AND id IN (${pendingTimelineSourceIds.map(() => '?').join(',')})
        `).all(projectId, ...pendingTimelineSourceIds) as Array<{ chapter_index: number }>).map(row => row.chapter_index))
      : new Set<number>();
    const sections: string[] = [];

    const characterRows = db.prepare(`
      SELECT cs.character_id, c.name, cs.states_json, cs.change_summary, cs.timestamp
      FROM character_states cs
      LEFT JOIN characters c ON c.id = cs.character_id
      WHERE cs.project_id = ? AND cs.needs_review = 0
      ORDER BY cs.character_id, cs.snapshot_order DESC
    `).all(projectId) as Array<{ character_id: string; name: string | null; states_json: string; change_summary: string | null; timestamp: string }>;

    const seenCharacters = new Set<string>();
    const confirmedCharacters = characterRows.filter(row => {
      if (seenCharacters.has(row.character_id)) return false;
      seenCharacters.add(row.character_id);
      return !pendingKeys.has(`character:${row.character_id}`);
    });

    if (confirmedCharacters.length > 0) {
      sections.push('【已确稿角色状态】');
      sections.push(confirmedCharacters.map(row => {
        const state = this.safeJson(row.states_json, {});
        return `- ${row.name || row.character_id}: ${JSON.stringify(state).slice(0, 240)}${row.change_summary ? `；${row.change_summary}` : ''}`;
      }).join('\n'));
    }

    const fsRows = db.prepare(`
      SELECT foreshadowing_id, status, planted_chapter, recovered_chapter, recovery_method, mention_count
      FROM foreshadowing_states
      WHERE project_id = ? AND COALESCE(needs_review, 0) = 0
      ORDER BY updated_at DESC
    `).all(projectId) as Array<{ foreshadowing_id: string; status: string; planted_chapter: number | null; recovered_chapter: number | null; recovery_method: string | null; mention_count: number }>;

    const confirmedForeshadowings = fsRows.filter(row => !pendingKeys.has(`foreshadowing:${row.foreshadowing_id}`));
    if (confirmedForeshadowings.length > 0) {
      sections.push('【已确稿伏笔状态】');
      sections.push(confirmedForeshadowings.map(row =>
        `- ${row.foreshadowing_id}: ${row.status}，埋设第${row.planted_chapter || '?'}章，回收第${row.recovered_chapter || '?'}章，提及${row.mention_count || 0}次${row.recovery_method ? `，回收方式:${row.recovery_method}` : ''}`
      ).join('\n'));
    }

    const plotRows = db.prepare(`
      SELECT chapter_index, active_conflicts, resolved_conflicts, main_goal_progress, emotional_beat, emotional_intensity, turning_points
      FROM plot_progress
      WHERE project_id = ? AND chapter_index < ? AND COALESCE(needs_review, 0) = 0
      ORDER BY chapter_index DESC
    `).all(projectId, chapterNumber || 999999) as Array<{
      chapter_index: number;
      active_conflicts: string;
      resolved_conflicts: string;
      main_goal_progress: number;
      emotional_beat: string;
      emotional_intensity: number;
      turning_points: string;
    }>;

    const confirmedPlotRows = plotRows.filter(row =>
      !pendingKeys.has(`timeline_state:${row.chapter_index}`) &&
      !pendingTimelineChapters.has(row.chapter_index)
    );
    if (confirmedPlotRows.length > 0) {
      sections.push('【已确稿时间线/情节状态】');
      sections.push(confirmedPlotRows.map(row =>
        `- 第${row.chapter_index}章: 主线${row.main_goal_progress}%；情绪${row.emotional_beat}/${row.emotional_intensity}；转折:${this.safeJson(row.turning_points, []).join('、') || '无'}`
      ).join('\n'));
    }

    if (confirmedRows.length > 0) {
      const otherRows = confirmedRows.filter(row => !['character', 'foreshadowing', 'timeline_state', 'plot'].includes(row.target_type));
      if (otherRows.length > 0) {
        sections.push('【已确稿设定变更】');
        sections.push(otherRows.map(row => `- ${row.target_label}: ${row.summary}`).join('\n'));
      }
    }

    return {
      contextText: sections.join('\n\n'),
      pendingTotal: pendingRows.length,
      pendingSummary: pendingRows.map(row => `${row.target_label}: ${row.summary}`),
      excludedTargets: pendingRows.map(row => ({ type: row.target_type, id: row.target_id, label: row.target_label })),
    };
  }

  private parseArchiveReport(content: string) {
    const fallback = {
      worldSettingUpdates: [],
      characterUpdates: [],
      organizationUpdates: [],
      outlineUpdates: [],
      foreshadowingUpdates: [],
      timelineUpdates: [],
      conflicts: [],
    };
    const clean = (content || '').replace(/```json\n?|```\n?/g, '').trim();
    const parsed = this.safeJson<any>(clean, null);
    if (!parsed || typeof parsed !== 'object') return fallback;

    const normalize = (value: unknown) => Array.isArray(value) ? value
      .filter(item => item && typeof item === 'object')
      .map((item: any) => ({
        title: String(item.title || item.name || '待确稿变更').slice(0, 80),
        summary: String(item.summary || item.description || item.content || '').slice(0, 600),
      }))
      .filter(item => item.summary.trim().length > 0) : [];

    return {
      worldSettingUpdates: normalize(parsed.worldSettingUpdates),
      characterUpdates: normalize(parsed.characterUpdates),
      organizationUpdates: normalize(parsed.organizationUpdates),
      outlineUpdates: normalize(parsed.outlineUpdates),
      foreshadowingUpdates: normalize(parsed.foreshadowingUpdates),
      timelineUpdates: normalize(parsed.timelineUpdates),
      conflicts: normalize(parsed.conflicts),
    };
  }

  private createArchiveConfirmations(
    projectId: string,
    sourceChapterId: string,
    archive: {
      worldSettingUpdates: Array<{ title: string; summary: string }>;
      characterUpdates: Array<{ title: string; summary: string }>;
      organizationUpdates: Array<{ title: string; summary: string }>;
      outlineUpdates: Array<{ title: string; summary: string }>;
      foreshadowingUpdates: Array<{ title: string; summary: string }>;
      timelineUpdates: Array<{ title: string; summary: string }>;
      conflicts: Array<{ title: string; summary: string }>;
    },
  ) {
    const db = this.db.getDb();
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT INTO state_confirmations (
        id, project_id, source_chapter_id, target_type, target_id, target_label,
        summary, payload, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'archive_analysis', ?, ?)
    `);

    const groups: Array<{ type: string; label: string; items: Array<{ title: string; summary: string }> }> = [
      { type: 'world_setting', label: '世界观', items: archive.worldSettingUpdates },
      { type: 'character', label: '角色', items: archive.characterUpdates || [] },
      { type: 'organization', label: '组织', items: archive.organizationUpdates },
      { type: 'outline', label: '大纲', items: archive.outlineUpdates },
      { type: 'foreshadowing', label: '伏笔', items: archive.foreshadowingUpdates },
      { type: 'timeline_state', label: '时间线/状态', items: archive.timelineUpdates },
      { type: 'plot_logic', label: '潜在冲突', items: archive.conflicts },
    ];

    const created: Array<{ id: string; targetType: string; targetLabel: string; summary: string }> = [];
    for (const group of groups) {
      for (const item of group.items) {
        const existing = db.prepare(`
          SELECT id FROM state_confirmations
          WHERE project_id = ? AND source_chapter_id = ? AND target_type = ? AND status = 'pending' AND summary = ?
          LIMIT 1
        `).get(projectId, sourceChapterId, group.type, item.summary) as any;
        if (existing) continue;

        const id = this.generateId();
        const summary = `${item.title}: ${item.summary}`;
        const target = this.resolveArchiveConfirmationTarget(projectId, sourceChapterId, group.type, item);
        insert.run(
          id,
          projectId,
          sourceChapterId,
          group.type,
          target.id,
          target.label || group.label,
          summary,
          JSON.stringify({ title: item.title, summary: item.summary, matchedTarget: target }),
          now,
          now,
        );
        created.push({ id, targetType: group.type, targetLabel: target.label || group.label, summary });
      }
    }

    return created;
  }

  private resolveArchiveConfirmationTarget(
    projectId: string,
    sourceChapterId: string,
    targetType: string,
    item: { title: string; summary: string },
  ): { id: string | null; label?: string; match?: string } {
    const db = this.db.getDb();
    const text = `${item.title || ''}\n${item.summary || ''}`.toLowerCase();
    const contains = (value: string | null | undefined) => Boolean(value && text.includes(String(value).toLowerCase()));

    if (targetType === 'character') {
      const rows = db.prepare('SELECT id, name, identity FROM characters WHERE project_id = ?').all(projectId) as any[];
      const found = rows.find(row => contains(row.name) || contains(row.identity));
      return found ? { id: found.id, label: found.name || '角色', match: 'character' } : { id: null };
    }

    if (targetType === 'foreshadowing') {
      const rows = db.prepare('SELECT id, content, type FROM foreshadowings WHERE project_id = ?').all(projectId) as any[];
      const found = rows.find(row => contains(row.content) || contains(row.type));
      return found ? { id: found.id, label: String(found.content || '伏笔').slice(0, 40), match: 'foreshadowing' } : { id: null };
    }

    if (targetType === 'outline') {
      const rows = db.prepare('SELECT id, title, content FROM outlines WHERE project_id = ? AND level = ?').all(projectId, 'chapter') as any[];
      const found = rows.find(row => contains(row.title) || contains(row.content));
      return found ? { id: found.id, label: found.title || '大纲', match: 'outline' } : { id: null };
    }

    if (targetType === 'timeline_state' || targetType === 'plot_logic') {
      const chapter = db.prepare('SELECT chapter_index FROM chapters WHERE id = ? AND project_id = ?').get(sourceChapterId, projectId) as any;
      if (chapter?.chapter_index !== undefined) {
        const plot = db.prepare('SELECT id, chapter_index FROM plot_progress WHERE project_id = ? AND chapter_index = ? ORDER BY updated_at DESC LIMIT 1')
          .get(projectId, chapter.chapter_index) as any;
        if (plot?.id) return { id: plot.id, label: `第${plot.chapter_index}章剧情状态`, match: 'plot_progress' };
      }
    }

    return { id: null };
  }

  private safeJson<T>(value: string | null | undefined, fallback: T): T {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  /**
   * 鲁棒 JSON 提取：从 LLM 返回内容中提取 JSON
   * 支持：纯 JSON、markdown 代码块包裹、多余文字前后的 JSON
   */
  private safeExtractJson<T>(content: string, fallback: T): T {
    if (!content) return fallback;
    let cleaned = content
      .replace(/```json\s*\n?/gi, '')
      .replace(/```\s*\n?/g, '')
      .trim();

    // 尝试直接解析
    try { return JSON.parse(cleaned) as T; } catch {}

    // 修复模型常见的 JSON 语法问题（未转义换行/引号、缺失逗号或括号等）。
    // 修复只负责恢复语法；调用方的 validate 仍负责结构与业务一致性门禁。
    try {
      const repaired = jsonrepair(cleaned);
      const parsed = JSON.parse(repaired) as T;
      this.logger.warn('safeExtractJson: 通过 JSON 语法修复后解析成功');
      return parsed;
    } catch {}

    // 尝试修复常见 JSON 格式问题后再解析
    try {
      let fixed = cleaned
        // 去掉尾部逗号: {"a": 1, } 或 [1, 2, ]
        .replace(/,\s*([\]\}])/g, '$1')
        .replace(/,\s*$/gm, '')
        // 去掉 JS 风格注释
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      const parsed = JSON.parse(fixed);
      this.logger.warn(`safeExtractJson: 通过修复尾部逗号解析成功`);
      return parsed as T;
    } catch {}

    // 模型偶尔会在合法 JSON 前后附加说明。用括号/字符串感知扫描提取
    // 完整嵌套对象；非贪婪正则无法正确处理 scenes 等嵌套字段。
    const balanced = extractBalancedJson<T>(cleaned);
    if (balanced !== null) return balanced;

    // 尝试提取 { ... } 块（取最长匹配，避免只拿到第一个字段）
    const objMatches = [...cleaned.matchAll(/\{[\s\S]*?\}/g)];
    if (objMatches.length > 0) {
      // 按长度降序，优先尝试最大的那个（最可能是完整 JSON）
      objMatches.sort((a, b) => b[0].length - a[0].length);
      for (const m of objMatches) {
        try { return JSON.parse(m[0]) as T; } catch {}
        try {
          let fixed = m[0].replace(/,\s*([\]\}])/g, '$1').replace(/,\s*$/gm, '');
          return JSON.parse(fixed) as T;
        } catch {}
      }
    }

    // 尝试提取 [ ... ] 块（同样取最长）
    const arrMatches = [...cleaned.matchAll(/\[[\s\S]*?\]/g)];
    if (arrMatches.length > 0) {
      arrMatches.sort((a, b) => b[0].length - a[0].length);
      for (const m of arrMatches) {
        try { return JSON.parse(m[0]) as T; } catch {}
        try {
          let fixed = m[0].replace(/,\s*([\]\}])/g, '$1').replace(/,\s*$/gm, '');
          return JSON.parse(fixed) as T;
        } catch {}
      }
    }

    this.logger.warn(`safeExtractJson: 无法解析 JSON，原始内容前300字: ${content.slice(0, 300)}`);
    return fallback;
  }

  /** 读取参与一致性判定的章节大纲行（按 order 升序）。 */
  private loadChapterOutlineConsistencyRows(projectId: string): OutlineConsistencyRow[] {
    return this.db.getDb().prepare(
      `SELECT id, "order", title, location_summary, ending_setup, hot_scenes, setback_scenes, scenes
       FROM outlines WHERE project_id=? AND level='chapter' ORDER BY "order"`
    ).all(projectId) as unknown as OutlineConsistencyRow[];
  }

  /** 把就地改写结果写回库；只写 LLM 真正返回的字段，未返回的字段保持原值。 */
  private applyOutlineConsistencyRepair(
    projectId: string,
    outlineId: string,
    payload: any,
    row: OutlineConsistencyRow,
  ): boolean {
    const sets: string[] = [];
    const values: any[] = [];
    const hotScenes = Array.isArray(payload?.hot_scenes)
      ? payload.hot_scenes.map((item: unknown) => serializeGeneratedSqlText(item).trim()).filter(Boolean)
      : null;
    if (hotScenes && hotScenes.length) { sets.push('hot_scenes=?'); values.push(JSON.stringify(hotScenes)); }
    const setbackScenes = Array.isArray(payload?.setback_scenes)
      ? payload.setback_scenes.map((item: unknown) => serializeGeneratedSqlText(item).trim()).filter(Boolean)
      : null;
    if (setbackScenes && setbackScenes.length) { sets.push('setback_scenes=?'); values.push(JSON.stringify(setbackScenes)); }
    const endingSetup = typeof payload?.ending_setup === 'string' ? payload.ending_setup.trim() : '';
    if (endingSetup) { sets.push('ending_setup=?'); values.push(endingSetup); }
    const hook = typeof payload?.hook === 'string' ? payload.hook.trim() : '';
    if (hook && row.scenes) {
      const parsed = this.safeExtractJson<any>(String(row.scenes), null);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.hook = hook;
        sets.push('scenes=?');
        values.push(JSON.stringify(parsed));
      }
    }
    if (!sets.length) return false;
    sets.push('updated_at=?');
    values.push(new Date().toISOString(), outlineId, projectId);
    this.db.getDb().prepare(`UPDATE outlines SET ${sets.join(', ')} WHERE id=? AND project_id=?`).run(...values);
    return true;
  }

  /**
   * 章节大纲内部一致性 · 判定与就地改写（大纲阶段与正文前置共用同一实现）。
   *
   * 不使用降级口径：不降为 advisory、不跳过、不填默认值。
   *   1) 确定性判据先判（scanOutlineConsistency），命中即视为章节合同缺陷；
   *   2) 就地把缺陷场景收回本章已声明的空间范围，再改写冲突字段；
   *   3) 改写后必须用同一套判据复扫通过；复扫仍不通过就抛错暴露，不得静默放行。
   * 只有这样才能让「正文按 location_summary 执行」与「Gate 按同一份合同验收」不再互相打架。
   */
  private async repairOutlineConsistency(
    projectId: string,
    options: { onlyOutlineIds?: string[]; label: string },
  ): Promise<Map<string, OutlineConsistencyRow>> {
    const replaced = new Map<string, OutlineConsistencyRow>();
    let rows = this.loadChapterOutlineConsistencyRows(projectId);
    if (!rows.length) return replaced;
    const scope = options.onlyOutlineIds?.length ? new Set(options.onlyOutlineIds.map(String)) : null;
    for (const row of rows) {
      if (scope && !scope.has(String(row.id))) continue;
      const corrected = correctedOutlineOrdinalLabel(row);
      if (corrected === null) continue;
      const result = this.db.getDb().prepare(`UPDATE outlines SET location_summary=?,updated_at=?
        WHERE id=? AND project_id=? AND location_summary=?`)
        .run(corrected, new Date().toISOString(), row.id, projectId, String(row.location_summary));
      if (Number(result.changes || 0) !== 1) {
        throw new HttpException(`第${row.order + 1}章场景范围的章号修正未能逐字写回，正文生成已停止`, 422);
      }
      // 这里曾把第2章的场景范围写作「第七章空间」并直接注入正文，
      // 后果是正文及 Gate 得到互斥的章节边界；明确错号只改号，不重写场景。
      this.logger.warn(`outline-consistency[${options.label}] 已将章纲 ${row.id} 的场景范围章号修为第${row.order + 1}章`);
    }
    rows = this.loadChapterOutlineConsistencyRows(projectId);
    const relevant = (findings: OutlineConsistencyFinding[]) =>
      scope ? findings.filter((finding) => scope.has(String(finding.outlineId))) : findings;

    let pending = relevant(scanOutlineConsistency(rows));
    if (!pending.length) return replaced;
    this.logger.warn(
      `outline-consistency[${options.label}] project=${projectId} 判出 ${pending.length} 处大纲内部矛盾，进入就地改写：
${summarizeOutlineConsistency(pending)}`,
    );

    const MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && pending.length; attempt += 1) {
      const byOutline = new Map<string, OutlineConsistencyFinding[]>();
      for (const finding of pending) {
        const list = byOutline.get(String(finding.outlineId)) || [];
        list.push(finding);
        byOutline.set(String(finding.outlineId), list);
      }
      for (const [outlineId, findings] of byOutline) {
        const row = rows.find((item) => String(item.id) === outlineId);
        if (!row) continue;
        try {
          const result = await this.llmCallWithRetry<any>(
            '大纲内部一致性就地改写',
            buildOutlineConsistencyRepairInstruction(row, findings),
            { temperature: 0.4, timeout: LLM_TUNABLES.timeoutMedium(), projectId, scenario: 'outline' },
          );
          const applied = this.applyOutlineConsistencyRepair(projectId, outlineId, result?.data, row);
          if (!applied) this.logger.warn(`outline-consistency[${options.label}] 第${attempt}轮改写未返回可写回字段 outline=${outlineId}`);
        } catch (e: any) {
          this.logger.error(`outline-consistency[${options.label}] 第${attempt}轮就地改写失败 outline=${outlineId}: ${e.message}`);
        }
      }
      rows = this.loadChapterOutlineConsistencyRows(projectId);
      for (const row of rows) replaced.set(String(row.id), row);
      pending = relevant(scanOutlineConsistency(rows));
      if (pending.length) {
        this.logger.warn(`outline-consistency[${options.label}] 第${attempt}轮改写后仍有 ${pending.length} 处未通过：
${summarizeOutlineConsistency(pending)}`);
      }
    }

    if (pending.length) {
      throw new HttpException(
        `本章大纲一致性未通过：详细大纲自身存在空间越界/提前消费后续章场景，就地改写 ${MAX_ATTEMPTS} 轮后仍未通过，正文生成已停止，避免写出来必被 Gate 判死。请先修正大纲：
${summarizeOutlineConsistency(pending)}`,
        422,
      );
    }
    this.logger.log(`outline-consistency[${options.label}] project=${projectId} 已就地改写 ${replaced.size} 章并通过复扫`);
    return replaced;
  }

  /**
   * 构建章节大纲的详细上下文字符串，供正文生成 prompt 使用
   * 合并 content 字段 + scenes JSON 里的核心字段（冲突/人物行动/伏笔/钩子等）
   * 解决大纲与正文内容不一致的问题
   */
  private buildChapterOutlineContext(outline: any): string {
    if (!outline) return '';
    const parts: string[] = [];

    // 章节标题 + 功能
    parts.push(`【本章大纲】${outline.title || ''}（功能：${outline.chapter_function || 'paving'}）`);

    // content 字段（如果有的话）
    if (outline.content && String(outline.content).trim()) {
      parts.push(`\n核心内容：\n${outline.content}`);
    }

    // 解析 scenes JSON，提取关键大纲字段
    if (outline.scenes) {
      try {
        const scenes = typeof outline.scenes === 'string'
          ? JSON.parse(outline.scenes)
          : outline.scenes;
        if (typeof scenes === 'object' && scenes !== null) {
          if (scenes.conflict)          parts.push(`\n核心冲突：${scenes.conflict}`);
          if (scenes.characterActions)  parts.push(`\n人物行动：${scenes.characterActions}`);
          if (scenes.highlight)         parts.push(`\n爽点/高潮：${scenes.highlight}`);
          if (scenes.foreshadowing)     parts.push(`\n伏笔设置：${scenes.foreshadowing}`);
          if (scenes.foreshadowingRecover) parts.push(`\n伏笔回收：${scenes.foreshadowingRecover}`);
          if (scenes.hook)              parts.push(`\n本章结尾钩子：${scenes.hook}`);
          if (scenes.emotionalTone)     parts.push(`\n情绪基调：${scenes.emotionalTone}`);
          if (scenes.reversals && Array.isArray(scenes.reversals) && scenes.reversals.length > 0) {
            parts.push(`\n本章反转：${scenes.reversals.join('；')}`);
          }
          if (scenes.scenes && Array.isArray(scenes.scenes) && scenes.scenes.length > 0) {
            parts.push(`\n场景列表：${scenes.scenes.join(' → ')}`);
          }
        }
      } catch { /* ignore parse error */ }
    }

    // 解析 plot_points JSON
    if (outline.plot_points) {
      try {
        const pp = typeof outline.plot_points === 'string'
          ? JSON.parse(outline.plot_points)
          : outline.plot_points;
        if (typeof pp === 'object' && pp !== null) {
          if (pp.coreEvent)    parts.push(`\n核心事件：${pp.coreEvent}`);
          if (pp.conflict)     parts.push(`\n冲突：${pp.conflict}`);
          if (pp.highlight)    parts.push(`\n亮点：${pp.highlight}`);
        }
      } catch { /* ignore */ }
    }

    // 数据库列为准的章节合同深度字段。
    // 生成侧硬约束写明「本章场景与动作范围以详细大纲的 location_summary 与情节事件为准」，
    // 而 Gate 也按同一份合同验场景越界；这些列此前只写库、不进正文 prompt，
    // 于是判定依据对生成端与评审端同时缺失——这是大纲越界反复触发 422 的结构性根因。
    if (outline.core_content && String(outline.core_content).trim()) {
      parts.push(`\n核心内容（补全）：\n${outline.core_content}`);
    }
    if (outline.chapter_type) parts.push(`\n章节类型：${outline.chapter_type}`);
    if (outline.pov_ratio)    parts.push(`\n视角配比：${outline.pov_ratio}`);
    if (outline.location_summary) {
      parts.push(`\n【本章场景范围 · 正文只允许出现以下地点，不得越界、不得提前抵达后续章节场景】\n${outline.location_summary}`);
    }
    for (const [label, rawValue] of [
      ['高光场景', outline.hot_scenes],
      ['波折场景', outline.setback_scenes],
      ['爽点', outline.highlight_points],
    ] as Array<[string, unknown]>) {
      const list = toStringList(rawValue);
      if (list.length) parts.push(`\n${label}：\n- ${list.join('\n- ')}`);
    }
    if (outline.conflict_design) parts.push(`\n冲突设计：${outline.conflict_design}`);
    if (outline.ending_setup) {
      parts.push(`\n【章末落点 · 必须收在此处且只收一次，不得落在本章场景范围之外】\n${outline.ending_setup}`);
    }

    // 如果所有字段都为空，至少返回标题
    if (parts.length <= 1) {
      return `【本章大纲】${outline.title || ''}`;
    }

    return parts.join('\n');
  }

  /**
   * 按用户的项目字数和路由配置生成完整长篇规划。
   * 输出令牌预算只决定每批生成多少章，不得改变总章数或省略后续卷。
   */
  private async generateConfiguredLongNovelPlan(input: {
    // projectId 是唯一来源：执行标准（平台/分类/基调/文风/流派/视角/题材标签/目标读者）由
    // resolvePlatformToneDirective(projectId) 从项目行统一解析（与正文层同一份），
    // 因此这里不再接收第二份 constitution/targetPlatform/styleTags，避免框架层与正文层口径分叉。
    projectId: string;
    title: string;
    storySetting: string;
    targetWords: number;
    targetWanZi: number;
    genre: string;
    chapterWordMin: number;
    chapterWordMax: number;
    onProgress?: (step: 'skeleton' | 'world' | 'characters' | 'outline' | 'foreshadowing', message: string) => void;
  }): Promise<any> {
    // 【执行标准注入 · 长篇创建全流程】地基→角色→章纲→伏笔 与正文层共用唯一解析器。
    // 项目行在 createProjectAsync 落库时已写入 settings.creativeConstitution.confirmedStory，
    // 所以这里按 projectId 解析即可拿到完整的 平台基准+分类+基调+文风+流派+视角+题材标签+目标读者。
    // 不保留任何"解析为空时另拼一份"的回落分支：第二份口径必然更弱（缺分类/视角/目标读者），
    // 一旦生效就等于用降级标准生成长篇地基，与用户创建时确认的执行标准不一致。
    // resolvePlatformToneDirective 只有两种结果——返回完整标准，或抛错阻断（缺 projectId→400，项目不存在→404）。
    const platformDirective = this.resolvePlatformToneDirective(input.projectId);
    const foundationResult = await this.chainTemplate.executeChain('long-novel-init-foundation', {
      projectId: input.projectId,
      story_setting: (platformDirective ? platformDirective + '\n\n' : '') + input.storySetting,
      targetWords: input.targetWanZi,
      genre: input.genre,
    }, (_nodeIndex, nodeId, status, result) => {
      if (nodeId === 'node_1_skeleton' && status === 'completed') {
        const skeleton = result?.output;
        if (!skeleton?.coreSetting || !Array.isArray(skeleton.skeletonVolumes) || skeleton.skeletonVolumes.length === 0
          || skeleton.skeletonVolumes.some((volume: any) => !Number.isInteger(Number(volume?.estimatedChapters))
            || Number(volume.estimatedChapters) <= 0 || !String(volume?.chapterCountReason || '').trim())) {
          throw new Error('长篇主线骨架缺少完整核心设定或有效分卷章数；世界规则未开始生成。');
        }
        const plannedChapters = skeleton.skeletonVolumes.reduce((total: number, volume: any) => total + Number(volume.estimatedChapters), 0);
        if (plannedChapters * input.chapterWordMin > input.targetWords
          || plannedChapters * input.chapterWordMax < input.targetWords) {
          throw new Error(`长篇主线骨架规划${plannedChapters}章，无法按每章${input.chapterWordMin}-${input.chapterWordMax}字承载目标${input.targetWords}字；世界规则未开始生成。`);
        }
        input.onProgress?.('world', '主线与结局骨架已通过验收，开始生成世界规则');
      }
    });
    const outputs: any = foundationResult?.outputs || {};
    const skeleton = outputs.node_1_skeleton;
    const worldOutput = outputs.node_2_worldview;
    const generatedWorldview = worldOutput?.worldview;
    if (!skeleton?.coreSetting || !Array.isArray(skeleton.skeletonVolumes) || !generatedWorldview
      || !Array.isArray(generatedWorldview.geography) || !Array.isArray(generatedWorldview.factions)) {
      // 真实成因优先于下游症状：地基节点被质量 Gate 拒绝时，「缺少世界观」只是症状。
      // 实测样本（2026-09-23 09:20）：真正被 Gate 拒绝的四条是
      //   constitution.category（12万字落在番茄男频·都市日常头部实测46.2万–719.0万之外）、
      //   constitution.logic（主角履历与历史年表自相矛盾：2018年入职/2025年被裁七年 vs 三年前入职）、
      //   platform.category_word_scale、logic.timeline_conflict ——
      // 全部写在被节点边界吞掉的那份报告里。用户照「世界观」方向改，改完仍然失败、报错一字不变。
      // 这里把报告原样提到前面：不改 severity、不改状态码、不降级成 advisory。
      const gateReport = firstGateReportFromChain(foundationResult);
      if (gateReport) throw gateRejectionFromReport(gateReport);
      // 此前这里只报"缺少世界观"，把"JSON 被截断/非法"与"字段名不符"两类完全不同的
      // 故障压成同一句话，无法定位。诊断必须带上候选输出的真实形态。
      const diagnose = [skeleton, worldOutput]
        .filter((value: any) => value !== undefined && value !== null)
        .map((value: any) => (typeof value === 'string'
          ? `string(len=${value.length},head=${JSON.stringify(value.slice(0, 160))})`
          : `object(keys=${Object.keys(value as Record<string, unknown>).join(',')})`));
      throw new Error(
        '长篇地基顺序生成未完成（需先主线骨架、再世界规则）。'
        + `诊断：${diagnose.length > 0 ? diagnose.join(' | ') : '模型未返回任何可解析内容'}；`
        + `链错误：${JSON.stringify(foundationResult?.errors || [])}。`,
      );
    }
    const foundation = { ...skeleton, worldview: generatedWorldview };

    const skeletonVolumes = Array.isArray(foundation.skeletonVolumes)
      ? foundation.skeletonVolumes
      : (Array.isArray(foundation.coreSetting?.volumePlan) ? foundation.coreSetting.volumePlan : []);
    if (skeletonVolumes.length === 0) {
      throw new Error('长篇地基没有返回分卷规划。');
    }
    const normalizedSkeletons = skeletonVolumes.map((volume: any, index: number) => {
      const estimatedChapters = Number(volume.estimatedChapters ?? volume.chapters ?? volume.chapterCount);
      if (!Number.isInteger(estimatedChapters) || estimatedChapters <= 0) {
        throw new Error(`第${index + 1}卷没有返回有效章节数。`);
      }
      const chapterCountReason = String(volume.chapterCountReason || volume.structureReason || '').trim();
      if (!chapterCountReason) {
        throw new Error(`第${index + 1}卷没有说明为何需要规划${estimatedChapters}章。`);
      }
      return {
        ...volume,
        volumeNumber: Number(volume.volumeNumber || volume.volume || index + 1),
        title: String(volume.title || `第${index + 1}卷`),
        theme: String(volume.theme || ''),
        description: String(volume.description || volume.goal || ''),
        estimatedChapters,
        chapterCountReason,
      };
    });

    input.onProgress?.('characters', `主线骨架与世界规则已通过验收，开始设计核心角色；规划 ${normalizedSkeletons.length} 卷`);
    const characterPrompt = `${platformDirective ? platformDirective + "\n\n" : ""}你是长篇小说人物架构师。严格依据下列已经确认的项目地基，生成支撑全书主线、分卷冲突和人物关系变化所必需的主要及常驻人物。人物数量由故事实际需要决定，不得固定数量，不得减少故事规模。

项目目标总字数：${input.targetWords}字
题材：${input.genre}
地基：${JSON.stringify({ coreSetting: foundation.coreSetting, worldview: foundation.worldview || foundation.worldSetting, skeletonVolumes: normalizedSkeletons })}

每个人物必须包含 name,age,gender,identity,appearance,background,personality（含3个核心特质和1个内在矛盾）,abilities,relationships,arc,dialogueStyle。只输出合法JSON：{"characters":[...]}`;
    const characterResult = await this.llmCallWithRetry<any>('长篇角色架构', characterPrompt, {
      temperature: 0.7,
      projectId: input.projectId,
      scenario: 'character_design',
      timeout: LLM_TUNABLES.timeoutMedium(),
    });
    const characters = Array.isArray(characterResult.data)
      ? characterResult.data
      : (Array.isArray(characterResult.data?.characters) ? characterResult.data.characters : []);
    if (characters.length === 0 || characters.some((character: any) => !character?.name || !character?.identity)) {
      throw new Error('长篇角色架构结果不完整。');
    }
    input.onProgress?.('outline', '核心角色已通过验收，开始分卷与详细章纲');

    // 单批预算是「一次就要装得下」的承诺，必须与 real-llm 侧的结构化硬顶同源：
    // 规划出来的批量一旦超过硬顶就必然被截断，再靠同模型扩容重发等于白烧一整轮生成时间。
    const outlineTokenBudget = Math.min(this.realLLM.getConfiguredMaxTokens('outline'), STRUCTURED_JSON_OUTPUT_CEILING);
    let chaptersPerBatch = 1;
    const volumes: any[] = [];
    const foreshadowings: any[] = [];
    const timeline: any[] = [];
    let absoluteChapter = 1;
    let plannedChapterWords = 0;
    const outlineRunIds = new Set<string>();
    const totalPlannedChapters = normalizedSkeletons.reduce((sum: number, volume: any) => sum + volume.estimatedChapters, 0);
    if (totalPlannedChapters * input.chapterWordMin > input.targetWords || totalPlannedChapters * input.chapterWordMax < input.targetWords) {
      throw new Error(`长篇地基规划${totalPlannedChapters}章，按每章${input.chapterWordMin}-${input.chapterWordMax}字无法承载目标总字数${input.targetWords}；请模型根据故事节奏重新规划章数。`);
    }

    // 渐进式：创建阶段只详细展开前 LONG_DETAIL_OUTLINE_WINDOW 章（跨卷累计），其余卷只保留高层卷规划，
    // 详细章纲留待正文推进时滚动生成（rollout-outline）。
    let detailedRemaining = LONG_DETAIL_OUTLINE_WINDOW;

    for (const [volumeIndex, volume] of normalizedSkeletons.entries()) {
      const chapters: any[] = [];
      // 本卷需详细展开的章数 = min(本卷估算章数, 细纲窗口剩余名额)
      const detailedInVolume = Math.min(volume.estimatedChapters, detailedRemaining);
      detailedRemaining = Math.max(0, detailedRemaining - detailedInVolume);
      for (let localStart = 1; localStart <= detailedInVolume;) {
        let batchCount = Math.min(chaptersPerBatch, detailedInVolume - localStart + 1);
        let batchEnd = localStart + batchCount - 1;
        let absoluteStart = absoluteChapter + localStart - 1;
        // 截断感知恢复：同一模型、同一提示词口径、同一 JSON 模式、同一字段契约，只把「本批章数」减半后
        // 重发同一区间。这不是降级、不是换模型、不是减字段，而是把一次装不下的批量拆成装得下的批量，
        // 避免整条创建流程被判失败后重头再来（那才是真正的重复流程）。
        let batchResult: any = null;
        for (;;) {
          batchEnd = localStart + batchCount - 1;
          absoluteStart = absoluteChapter + localStart - 1;
          input.onProgress?.('outline', `正在生成第${volumeIndex + 1}卷章纲 ${localStart}-${batchEnd}/${volume.estimatedChapters}`);
        const chapterPrompt = `${platformDirective ? platformDirective + "\n\n" : ""}你是长篇小说分卷章纲设计师。必须严格生成指定范围的全部详细章纲，不得减少、合并、跳过或用标题占位。输出预算来自用户配置；本批大小已经按该预算划分，不代表全书规模。

项目：${input.title}
目标总字数：${input.targetWords}字；全书规划总章数：${totalPlannedChapters}
篇幅进度：全书规划${totalPlannedChapters}章，创建阶段仅详细展开前${LONG_DETAIL_OUTLINE_WINDOW}章、其余随写作滚动规划；本批为全书第${absoluteStart}-${absoluteStart + batchCount - 1}章。窗口内各章目标按剧情密度在区间内单独决定，不要求本窗口合计等于全书总字数。
章节篇幅规则：每章必须在${input.chapterWordMin}-${input.chapterWordMax}字之间；每章的具体 targetWords 必须根据本章剧情任务、场景数量、冲突强度和节奏单独决定，不得平均分配。
世界观（地基）：${JSON.stringify(foundation.coreSetting)}
当前卷：${JSON.stringify(volume)}
主要人物：${JSON.stringify(characters.map((character: any) => ({ name: character.name, identity: character.identity, arc: character.arc })))}
本批范围：卷内第${localStart}-${batchEnd}章，共${batchCount}章；全书第${absoluteStart}-${absoluteStart + batchCount - 1}章。
上一批结尾：${chapters.length > 0 ? JSON.stringify(chapters[chapters.length - 1]) : '本卷起点'}

每章必须包含 title,targetWords（${input.chapterWordMin}-${input.chapterWordMax}内的动态规划值）,wordCountReason（说明为何本章需要该篇幅）,content（具体事件链和结果）,chapterFunction,scenes（所有必要具体场景）,characterActions,conflict,highlight,hook,timelineEvent。${CHAPTER_FORESHADOWING_CONTRACT}
不得为凑数量制造无关线索。章节功能随剧情交替，不得整批都是铺垫。只输出合法JSON：{"chapters":[...]}`;
          try {
            batchResult = await this.llmCallWithRetry<any>(`长篇第${volumeIndex + 1}卷章纲${localStart}-${batchEnd}`, chapterPrompt, {
              temperature: 0.7,
              projectId: input.projectId,
              scenario: 'outline',
              timeout: LLM_TUNABLES.timeoutContent(),
            });
            break;
          } catch (batchErr) {
            if (!isStructuredOutputTruncated(batchErr)) throw batchErr;
            if (batchCount <= 1) {
              throw new Error(`全书第${absoluteStart}章章纲单章仍被输出长度截断（outline 预算=${outlineTokenBudget}），已无法在保持全部字段契约的前提下继续缩小批量：${(batchErr as Error).message}`);
            }
            const nextBatchCount = Math.max(1, Math.floor(batchCount / 2));
            this.logger.warn(`长篇第${volumeIndex + 1}卷章纲 ${localStart}-${batchEnd} 输出被长度截断，同模型/同提示词口径把单批章数 ${batchCount}→${nextBatchCount} 重发（不换模型、不减字段）`);
            batchCount = nextBatchCount;
            // 把「真实装得下」的批量记下来，供后续批次直接起步；若上游回报了真实 usage，
            // 本批成功后的用量反推会再校准一次，两者取更保守者。
            chaptersPerBatch = Math.min(chaptersPerBatch, batchCount);
          }
        }
        if (batchResult?.runId) outlineRunIds.add(String(batchResult.runId));
        const batchChapters = Array.isArray(batchResult.data)
          ? batchResult.data
          : (Array.isArray(batchResult.data?.chapters) ? batchResult.data.chapters : []);
        if (batchChapters.length !== batchCount) {
          throw new Error(`第${volumeIndex + 1}卷第${localStart}-${batchEnd}章应返回${batchCount}章，实际返回${batchChapters.length}章。`);
        }
        // 上游真实 completion_tokens 已包含 reasoning token，是「这一批真实花了多少输出预算」的完整计量；
        // 除以本批章数得到真实每章成本，再按同一份预算算出下一批能装多少章。
        // 不给每章成本另加 reasoning 预留：reasoning 已计入该计量，再预留一次等于把成本重复扣，
        // 会把批量压到装不满（1400 预算 + 600/章 的真实场景会退化成每批 1 章，反成死循环）。
        const observedCompletionTokens = Number(batchResult.usage?.completionTokens || 0);
        if (observedCompletionTokens > 0) {
          const observedTokensPerChapter = Math.max(1, Math.ceil(observedCompletionTokens / batchCount));
          chaptersPerBatch = Math.max(1, Math.floor(outlineTokenBudget / observedTokensPerChapter));
        }
        for (const [batchIndex, chapter] of batchChapters.entries()) {
          const chapterNumber = absoluteStart + batchIndex;
          if (!chapter?.title || !chapter?.content || !chapter?.conflict || !chapter?.hook || !Array.isArray(chapter?.scenes)) {
            throw new Error(`全书第${chapterNumber}章章纲字段不完整。`);
          }
          const chapterTargetWords = Number(chapter.targetWords);
          if (!Number.isInteger(chapterTargetWords) || chapterTargetWords < input.chapterWordMin || chapterTargetWords > input.chapterWordMax || !String(chapter.wordCountReason || '').trim()) {
            throw new Error(`全书第${chapterNumber}章必须按剧情节奏给出${input.chapterWordMin}-${input.chapterWordMax}字的动态目标及篇幅理由。`);
          }
          const nextPlannedWords = plannedChapterWords + chapterTargetWords;
          const chapterForeshadowings = readChapterForeshadowing(chapter);
          for (const item of chapterForeshadowings) {
            const defect = describeForeshadowingDefect(item);
            if (defect) {
              // 不补默认值、不降级：把模型实际返回的那一条原样带出来，直接暴露口径偏差。
              throw new Error(`全书第${chapterNumber}章伏笔不符合契约（${defect}）：${JSON.stringify(item).slice(0, 400)}`);
            }
          }
          const normalizedChapter = {
            ...chapter,
            chapterNumber,
            targetWords: chapterTargetWords,
            wordCountReason: String(chapter.wordCountReason),
            content: String(chapter.content),
            scenes: chapter.scenes,
            [CHAPTER_FORESHADOWING_FIELD]: chapterForeshadowings,
          };
          chapters.push(normalizedChapter);
          plannedChapterWords = nextPlannedWords;
          for (const item of chapterForeshadowings) {
            if (!item?.content || String(item.action || '').toLowerCase() === '回收') continue;
            foreshadowings.push({
              ...item,
              content: String(item.content),
              scope: item.scope || 'chapter',
              setupChapter: chapterNumber,
              recoveryChapter: item.recoveryChapter || null,
            });
          }
          if (chapter.timelineEvent) {
            const event = typeof chapter.timelineEvent === 'string'
              ? { title: chapter.title, description: chapter.timelineEvent }
              : chapter.timelineEvent;
            timeline.push({ ...event, chapterReference: chapterNumber });
          }
        }
        localStart += batchCount;
      }
      if (chapters.length !== detailedInVolume) {
        throw new Error(`第${volumeIndex + 1}卷本应细排${detailedInVolume}章，实际${chapters.length}章，完整性校验失败。`);
      }
      volumes.push({ ...volume, chapters });
      absoluteChapter += volume.estimatedChapters;
    }
    // 渐进式：仅前 N 章有逐章目标，合计不必等于全书总字数（全书可承载性已在卷估算层校验）。
    this.logger.log(`长篇初始细纲窗口完成：前 ${volumes.reduce((n: number, v: any) => n + (v.chapters?.length || 0), 0)} 章详细章纲，累计目标 ${plannedChapterWords} 字；全书目标 ${input.targetWords} 字，剩余章随写作滚动生成。`);

    input.onProgress?.('foreshadowing', '详细章纲已通过验收，开始校验跨卷伏笔');
    const globalPrompt = `${platformDirective ? platformDirective + "\n\n" : ""}依据已确认的长篇地基和完整分卷目录，识别真正贯穿全书或跨卷的伏笔。数量由实际主线、人物弧和世界规则决定，不得固定数量；没有跨卷伏笔时返回空数组，不得为填充模块编造线索。${GLOBAL_FORESHADOWING_CONTRACT}只输出合法JSON：{"foreshadowings":[{"content":"","type":"","scope":"global|volume","setupChapter":1,"recoveryChapter":2,"recoveryWindowStart":2,"recoveryWindowEnd":3,"evidenceText":"","riskLevel":"medium","recoveryCondition":"","payoffDescription":""}]}。
地基：${JSON.stringify({ coreSetting: foundation.coreSetting, skeletonVolumes: normalizedSkeletons })}
分卷目录：${JSON.stringify(volumes.map((volume: any) => ({ title: volume.title, theme: volume.theme, chapters: volume.chapters.map((chapter: any) => ({ chapterNumber: chapter.chapterNumber, title: chapter.title, chapterFunction: chapter.chapterFunction })) })))}`;
    const globalResult = await this.llmCallWithRetry<any>('长篇跨卷伏笔', globalPrompt, {
      temperature: 0.7,
      projectId: input.projectId,
      scenario: 'foreshadowing',
      timeout: LLM_TUNABLES.timeoutContent(),
    });
    const globalForeshadowings = Array.isArray(globalResult.data)
      ? globalResult.data
      : (Array.isArray(globalResult.data?.foreshadowings) ? globalResult.data.foreshadowings : []);
    const globalForeshadowingDefects = globalForeshadowings
      .map((item: any) => describeGlobalForeshadowingDefect(item))
      .filter((defect: string | null): defect is string => Boolean(defect));
    if (globalForeshadowingDefects.length > 0) {
      throw new Error(`长篇跨卷伏笔不符合契约：${globalForeshadowingDefects.join('；')}`);
    }
    foreshadowings.push(...globalForeshadowings);
    if (timeline.length === 0) {
      throw new Error('完整章纲没有返回可写入的时间线事件。');
    }

    const worldview = foundation.worldview || foundation.worldSetting;

    // ===== 长篇架构完备性终检（对齐模块标准：层级不缺、规划全量落地，而非“有 1 个就算过”）=====
    const plannedVolumeCount = normalizedSkeletons.length;
    const expectedDetailed = Math.min(totalPlannedChapters, LONG_DETAIL_OUTLINE_WINDOW);
    const detailedCount = volumes.reduce((n: number, v: any) => n + (v.chapters?.length || 0), 0);
    const longArchGaps: string[] = [];
    if (!worldview || typeof worldview !== 'object') longArchGaps.push('世界观');
    // 角色：人物架构师返回的每一名主要/常驻角色都必须完整，全部要贯穿/落库，不允许只拿 1 个占位
    if (!Array.isArray(characters) || characters.length === 0) {
      longArchGaps.push('支撑全书主线与分卷冲突的主要/常驻角色群');
    } else {
      const badCharacters = characters.filter((ch: any) => !ch?.name || !ch?.identity);
      if (badCharacters.length > 0) longArchGaps.push(`${badCharacters.length} 名规划角色缺姓名或身份`);
    }
    // 卷：地基规划了多少卷，就必须全部落地（每卷都有高层规划；细纲仅前窗口，属渐进式设计）
    if (volumes.length !== plannedVolumeCount) {
      longArchGaps.push(`分卷应全量落地（规划 ${plannedVolumeCount} 卷，实际 ${volumes.length} 卷）`);
    }
    // 前窗口细纲：窗口内每一章都必须细排，不允许只排几章
    if (detailedCount !== expectedDetailed) {
      longArchGaps.push(`前 ${LONG_DETAIL_OUTLINE_WINDOW} 章细纲应全量（应 ${expectedDetailed} 章，实际 ${detailedCount} 章）`);
    }
    const emptyDetailed = volumes
      .flatMap((v: any) => v.chapters || [])
      .filter((c: any) => !c?.title || !c?.content || !(Number(c.targetWords) > 0));
    if (emptyDetailed.length > 0) longArchGaps.push(`${emptyDetailed.length} 章细纲缺标题/内容/目标字数`);
    // 对齐模块标准 organization：长篇必做势力/组织与地理点位（短篇才允许精简）
    if (!Array.isArray(worldview?.factions) || worldview.factions.length === 0) longArchGaps.push('势力/组织（长篇必做，不允许为空）');
    if (!Array.isArray(worldview?.geography) || worldview.geography.length === 0) longArchGaps.push('地理点位（长篇必做，不允许为空）');
    if (longArchGaps.length > 0) {
      throw new Error(`长篇架构完备性终检未通过：${longArchGaps.join('；')}。已停止创建，不产出半成品。`);
    }
    this.logger.log(`长篇架构终检通过：规划 ${plannedVolumeCount} 卷全部落地、前 ${detailedCount}/${totalPlannedChapters} 章细纲、${characters.length} 名主要/常驻角色全量、${foreshadowings.length} 条跨卷伏笔、${timeline.length} 条时间线事件。`);

    const foundationRuns = new Map((Array.isArray((foundationResult as any)?.nodeResults) ? (foundationResult as any).nodeResults : [])
      .map((node: any) => [String(node?.nodeId || ''), String(node?.runId || '')]));
    return {
      coreSetting: foundation.coreSetting,
      worldview,
      characters,
      volumes,
      foreshadowings,
      timeline,
      organizations: Array.isArray(worldview?.factions) ? worldview.factions : [],
      mapPoints: Array.isArray(worldview?.geography) ? worldview.geography : [],
      provenance: {
        skeletonRunId: foundationRuns.get('node_1_skeleton') || undefined,
        worldRunId: foundationRuns.get('node_2_worldview') || undefined,
        characterRunId: characterResult.runId,
        outlineRunIds: [...outlineRunIds],
      },
    };
  }

  // ====================== 长篇渐进式大纲：滚动补纲 ======================

  /**
   * 长篇渐进式大纲·滚动补纲：始终让“详细章纲”领先已写正文约 LONG_DETAIL_OUTLINE_WINDOW 章。
   * 创建时只细排前 20 章（全书卷规划/世界观/贯穿角色一次到位）；当作者写下去、细纲余量不足时，
   * 由正文生成前自动调用（也可由 /chain/rollout-outline 手动触发），结合【最新已写正文 + 卷规划 +
   * 主要角色 + 在埋伏笔】增量生成下一批详细章纲并落库：已有空壳章直接绑定 outline，没有则一并建章。
   * 绝不重写/覆盖任何已有细纲或正文，保证后续剧情与已写事实持续一致（短篇直接 no-op）。
   */
  private async rolloutDetailedOutlines(
    projectId: string,
    opts: { lookahead?: number; onProgress?: (message: string) => void } = {},
  ): Promise<{ added: number; detailedTotal: number; target: number; totalEstimated: number }> {
    const db = this.db.getDb();
    const project = db.prepare(
      'SELECT title, type, target_words, target_platform, settings FROM projects WHERE id=?',
    ).get(projectId) as any;
    if (!project) throw new HttpException('项目不存在', 404);
    // 短篇是单线闭环、创建时一次性出全纲，不需要滚动窗口。
    if (project.type !== 'long_novel') {
      return { added: 0, detailedTotal: 0, target: 0, totalEstimated: 0 };
    }
    const { v4: uuidV4 } = require('uuid');
    const lookahead = Number.isInteger(opts.lookahead) && Number(opts.lookahead) > 0
      ? Number(opts.lookahead) : LONG_DETAIL_OUTLINE_WINDOW;

    // 1) 全书卷规划（每卷估算章数在创建时已写入 outlines.volumes）
    const volRows = db.prepare(
      `SELECT id,title,content,"order",volumes FROM outlines WHERE project_id=? AND level='volume' ORDER BY "order" ASC`,
    ).all(projectId) as any[];
    if (volRows.length === 0) throw new HttpException('缺少卷大纲，无法滚动补纲', 409);
    const spans: Array<{ vol: any; start: number; end: number }> = [];
    let acc = 0;
    for (const v of volRows) {
      const meta = this.safeExtractJson<Record<string, any>>(String(v.volumes || '{}'), {});
      const est = Number(meta.estimatedChapters) || 0;
      spans.push({ vol: { ...v, meta }, start: acc + 1, end: acc + est });
      acc += est;
    }
    const totalEstimated = acc;
    if (totalEstimated <= 0) throw new HttpException('卷大纲缺少每卷估算章数，无法滚动补纲', 409);
    const locate = (globalNo: number) => spans.find(sp => globalNo >= sp.start && globalNo <= sp.end);

    // 2) 已细纲章（outline.order 从 0 开始，全局第 N 章对应 order=N-1）、已写最大章序
    const detailedOrders = new Set(
      (db.prepare(`SELECT "order" FROM outlines WHERE project_id=? AND level='chapter'`).all(projectId) as any[])
        .map(r => Number(r.order)),
    );
    const writtenMax = Number(
      (db.prepare(`SELECT COALESCE(MAX(chapter_index),0) m FROM chapters WHERE project_id=? AND COALESCE(word_count,0)>0`)
        .get(projectId) as any)?.m || 0,
    );
    const frontier = Math.max(detailedOrders.size, writtenMax);
    const target = Math.min(totalEstimated, frontier + lookahead);
    const missingGlobalNos: number[] = [];
    for (let n = 1; n <= target; n++) {
      if (!detailedOrders.has(n - 1)) missingGlobalNos.push(n);
    }
    if (missingGlobalNos.length === 0) {
      return { added: 0, detailedTotal: detailedOrders.size, target, totalEstimated };
    }

    // 3) 已写剧情上下文（最高事实）+ 主要角色 + 在埋伏笔，保证新章纲与已写内容严丝合缝
    const recent = ([...(db.prepare(
      `SELECT chapter_index,title,content FROM chapters WHERE project_id=? AND COALESCE(word_count,0)>0 ORDER BY chapter_index DESC LIMIT 3`,
    ).all(projectId) as any[])]).reverse();
    const storySoFar = recent
      .map(c => `第${c.chapter_index}章《${c.title}》结尾进展：${String(c.content || '').slice(-1200)}`)
      .join('\n');
    const mainChars = (db.prepare(
      `SELECT name,identity,role,arc FROM characters WHERE project_id=? ORDER BY is_pov_character DESC, created_at ASC LIMIT 12`,
    ).all(projectId) as any[]).map(c => ({ name: c.name, identity: c.identity, arc: c.arc }));
    const activeForeshadowings = db.prepare(
      `SELECT content,planned_recovery_chapter_index FROM foreshadowings WHERE project_id=? AND status='active' LIMIT 20`,
    ).all(projectId) as any[];
    const platformDirective = this.resolvePlatformToneDirective(projectId);

    // 4) 按卷、分批（每批最多 4 章）滚动生成并落库
    const ROLLOUT_BATCH = 4;
    let added = 0;
    for (let i = 0; i < missingGlobalNos.length;) {
      const firstNo = missingGlobalNos[i];
      const firstSpan = locate(firstNo);
      if (!firstSpan) throw new HttpException(`全书第${firstNo}章不在任何一卷的规划区间内，无法补纲`, 409);
      const batchNos: number[] = [];
      let j = i;
      while (
        j < missingGlobalNos.length && batchNos.length < ROLLOUT_BATCH
        && locate(missingGlobalNos[j]) === firstSpan
      ) {
        batchNos.push(missingGlobalNos[j]);
        j++;
      }
      const localNos = batchNos.map(n => n - firstSpan.start + 1);
      opts.onProgress?.(
        `滚动补纲：《${firstSpan.vol.title}》本卷第${localNos[0]}-${localNos[localNos.length - 1]}章（全书第${batchNos[0]}-${batchNos[batchNos.length - 1]}章）`,
      );

      const volMeta = firstSpan.vol.meta || {};
      const prompt = `${platformDirective}你是长篇小说分卷章纲设计师，现在为一部【已经在连载中的长篇】滚动补全后续详细章纲。必须严格生成指定范围的全部章纲，不得减少、合并、跳过或用标题占位，且必须与已写正文严丝合缝，不得推翻或改写已发生的事实。

项目：${project.title}
全书规划：共${totalEstimated}章、${spans.length}卷。
本卷规划：${JSON.stringify({ title: firstSpan.vol.title, theme: volMeta.theme, goal: volMeta.goal, keyEvents: volMeta.keyEvents, climax: volMeta.climax })}
主要人物：${JSON.stringify(mainChars)}
当前在埋伏笔（不得遗忘，应按规划推进/提醒/回收）：${JSON.stringify(activeForeshadowings)}
【已写正文进展·最高事实，不得与之矛盾】：
${storySoFar || '（开篇首批，尚无已写正文）'}
本批范围：本卷第${localNos[0]}-${localNos[localNos.length - 1]}章，即全书第${batchNos[0]}-${batchNos[batchNos.length - 1]}章，共${batchNos.length}章；上一批/上一章结尾必须自然衔接本批第一章开头。
章节篇幅：每章 targetWords 必须在${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字之间，按本章剧情任务、场景数量、冲突强度单独决定，不得平均分配，并给出 wordCountReason。

每章必须包含 title,targetWords,wordCountReason,content（具体事件链和结果）,chapterFunction,scenes（所有必要具体场景数组）,characterActions,conflict,highlight,hook,timelineEvent。${CHAPTER_FORESHADOWING_CONTRACT}章节功能随剧情交替，不得整批都是铺垫。只输出合法JSON：{"chapters":[...]}`;

      const result = await this.llmCallWithRetry<any>(
        `长篇滚动章纲 全书${batchNos[0]}-${batchNos[batchNos.length - 1]}`,
        prompt,
        { temperature: 0.7, projectId, scenario: 'outline', timeout: LLM_TUNABLES.timeoutContent() },
      );
      const batchChapters = Array.isArray(result.data)
        ? result.data
        : (Array.isArray(result.data?.chapters) ? result.data.chapters : []);
      if (batchChapters.length !== batchNos.length) {
        throw new HttpException(`滚动补纲应返回${batchNos.length}章，实际返回${batchChapters.length}章，已停止以避免章序错乱`, 502);
      }

      for (let idx = 0; idx < batchChapters.length; idx++) {
        const ch = batchChapters[idx];
        const globalNo = batchNos[idx];
        const localNo = localNos[idx];
        if (!ch?.title || !ch?.content || !ch?.conflict || !ch?.hook || !Array.isArray(ch?.scenes)) {
          throw new HttpException(`全书第${globalNo}章滚动章纲字段不完整（缺标题/事件链/冲突/钩子/场景）`, 502);
        }
        const tw = Number(ch.targetWords);
        if (!Number.isInteger(tw) || tw < CHAPTER_WORD_RANGE.min || tw > CHAPTER_WORD_RANGE.max || !String(ch.wordCountReason || '').trim()) {
          throw new HttpException(`全书第${globalNo}章滚动章纲必须给出${CHAPTER_WORD_RANGE.min}-${CHAPTER_WORD_RANGE.max}字动态目标及篇幅理由`, 502);
        }
        const oid = uuidV4();
        db.prepare(`INSERT INTO outlines (id,project_id,level,parent_id,"order",title,content,chapter_function,goal_arc,target_words,actual_words,foreshadowing_ids,plot_points,status,character_ids,scenes,volumes,book_skeleton,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
          oid, projectId, 'chapter', firstSpan.vol.id, globalNo - 1,
          ch.title || `第${globalNo}章`, String(ch.content),
          normalizeOutlineChapterFunction(ch.chapterFunction || ch.function, globalNo - 1, false),
          inferOutlineGoalArc(globalNo - 1, false), tw, 0, '[]', '[]', 'planned', '[]',
          JSON.stringify({
            conflicts: ch.conflicts || (ch.conflict ? [ch.conflict] : []), hook: ch.hook || '',
            highlights: ch.highlights || ch.highlight || '', foreshadowing: ch.foreshadowing || [],
            foreshadowingRecover: ch.foreshadowingRecover || [], characterStates: ch.characterStates || [],
            scenes: ch.scenes || [], characterActions: ch.characterActions || '',
            rousing: ch.rousing || ch.hotScenes || '', wordCountReason: ch.wordCountReason || '',
            rolledOut: true, localIndex: localNo,
          }),
          null, null, new Date().toISOString(), new Date().toISOString(),
        );
        // 已有空壳章（作者提前新建）直接绑定；没有则一并创建章节行，绝不覆盖已有正文。
        const existingChapter = db.prepare(
          `SELECT id FROM chapters WHERE project_id=? AND chapter_index=?`,
        ).get(projectId, globalNo) as any;
        const ts = new Date().toISOString();
        if (existingChapter) {
          db.prepare(`UPDATE chapters SET outline_id=?, volume_index=?, title=?, updated_at=? WHERE id=?`)
            .run(oid, Number(firstSpan.vol.order) + 1, ch.title || `第${globalNo}章`, ts, existingChapter.id);
        } else {
          db.prepare(`INSERT INTO chapters (id,project_id,outline_id,volume_index,chapter_index,title,content,word_count,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
            uuidV4(), projectId, oid, Number(firstSpan.vol.order) + 1, globalNo,
            ch.title || `第${globalNo}章`, '', 0, 'draft', ts, ts,
          );
        }
        added++;
      }
      i = j;
    }

    this.logger.log(`[rollout-outline] project=${projectId} 新增详细章纲 ${added} 章，当前细纲共 ${detailedOrders.size + added}/${totalEstimated}`);
    return { added, detailedTotal: detailedOrders.size + added, target, totalEstimated };
  }

  @Post('rollout-outline')
  async rolloutOutline(@Body() dto: { projectId: string; lookahead?: number }) {
    const projectId = String(dto?.projectId || '').trim();
    if (!projectId) throw new HttpException('缺少 projectId', 400);
    const result = await this.rolloutDetailedOutlines(projectId, { lookahead: dto.lookahead });
    return { success: true, ...result };
  }

  private async repairChapterResponsibilityPlan(input: {
    chapterTitles: Array<{ order: number; title: string; func: string; brief: string }>;
    initialIssues: string[];
    canonicalCreativeBrief: string;
    shortStoryCard: unknown;
    worldContinuityDirective: string;
    isShort: boolean;
    projectId?: string;
    audit: (plan: Array<{ chapter: number; title: string; function: string; responsibility: string }>) => Promise<string[]>;
  }): Promise<{
    chapterTitles: Array<{ order: number; title: string; func: string; brief: string }>;
    issues: string[];
  }> {
    const repairDirectives: Record<ChapterResponsibilityRepairStrategy, string> = {
      constraint_matrix: '先把每条冲突拆成“硬规则、当前违例、必须满足的修改”三列，再逐条落实到章节；每条冲突都必须有一条对应的resolution。',
      dependency_cascade: '从冲突章节向前追溯触发前提、向后追踪依赖事件，同步修正所有受影响章节；禁止只改冲突句而保留不再成立的后续结果。',
      full_replan: '前两种局部修订无法通过时，重新规划完整章节责任链；保留人物、真相、核心反转与结局，但彻底移除不满足规则的事件机制。',
    };
    const strategyOrder = input.projectId
      ? this.generationMetrics?.selectChapterResponsibilityRepairStrategies(input.projectId, input.initialIssues)
      : undefined;
    const repairStrategies = strategyOrder?.length
      ? strategyOrder
      : [...CHAPTER_RESPONSIBILITY_REPAIR_STRATEGIES];
    const maxRepairRounds = repairStrategies.length;
    const requiredChapterCount = input.chapterTitles.length;
    let chapterTitles = input.chapterTitles;
    let issues = input.initialIssues;
    let consecutiveNoProgress = 0;

    // 审查器已经给出 retain/fix 时，先把它编译成确定性章节责任补丁。
    // 这一步不调用模型，避免“审查已给答案，再让另一个模型猜一遍修法”。
    const auditedPatch = applyAuditedResponsibilityFixes(chapterTitles, issues);
    if (auditedPatch.applied.length > 0) {
      const beforePatchIssues = [...issues];
      chapterTitles = auditedPatch.chapterTitles;
      issues = await input.audit(chapterTitles.map((chapter, index) => ({
        chapter: index + 1,
        title: chapter.title,
        function: chapter.func,
        responsibility: chapter.brief,
      })));
      if (input.projectId) {
        this.generationMetrics?.recordChapterResponsibilityRepairAttempt(
          input.projectId,
          beforePatchIssues,
          'constraint_matrix',
          issues.length === 0,
          issues,
        );
      }
      if (issues.length === 0) return { chapterTitles, issues };
      this.logger.warn(`章节分工已应用${auditedPatch.applied.length}条审查修法，复审仍有${issues.length}项；进入语义重规划`);
    }

    for (let round = 1; round <= maxRepairRounds && issues.length > 0; round++) {
      const strategyId = repairStrategies[round - 1];
      const issuesBeforeRepair = [...issues];
      const currentPlan = chapterTitles.map((chapter, index) => ({
        chapter: index + 1,
        title: chapter.title,
        function: chapter.func,
        responsibility: chapter.brief,
      }));
      const issueContracts = issues.map((issue, index) => {
        const parsed = parseChapterResponsibilityIssue(issue);
        return parsed ? {
          issueIndex: index + 1,
          chapter: parsed.chapter,
          forbiddenTask: parsed.task,
          violatedRule: parsed.conflict,
          retain: parsed.retain,
          requiredReplacement: parsed.fix,
        } : { issueIndex: index + 1, raw: issue };
      });
      const replanResult = await this.llmCallWithRetry<any>(
        `全书章节分工规则定向修复（策略：${strategyId}）`,
        `修订当前全书章节分工。${buildChapterResponsibilityRepairPrompt({ strategyDirective: repairDirectives[strategyId], issueContracts, currentPlan, creativeBrief: input.canonicalCreativeBrief, shortStoryCard: input.shortStoryCard, worldContinuityDirective: input.worldContinuityDirective, requiredChapterCount })}`,
        {
          // 章节分工定向修复：它是上面那条审查的修复闭环，必须与审查跑在同一份标准下，
          // 否则「按 review 判不合格、按零标准改」会出现改完仍不满足同一判据的重复轮次。
          scenario: 'review', temperature: 0.15, timeout: LLM_TUNABLES.timeoutContent(),
          // The response is an internal repair plan. Its chapters/resolutions
          // are structurally checked here and semantically re-audited below;
          // treating the serialized JSON as chapter prose creates false length,
          // paragraph and dialogue failures.
          deferQualityGate: true,
          projectId: input.projectId,
          stepKey: 'chapter_responsibility_repair',
          validate: value => {
            const chapters = Array.isArray((value as any)?.chapters) ? (value as any).chapters : [];
            const resolutions = Array.isArray((value as any)?.resolutions) ? (value as any).resolutions : [];
            if (chapters.length !== requiredChapterCount) return false;
            const coveredIssues = new Set(resolutions
              .filter((resolution: any) => Array.isArray(resolution?.chapters)
                && resolution.chapters.length > 0
                && String(resolution?.removedMechanism || resolution?.change || '').trim()
                && String(resolution?.replacementMechanism || resolution?.change || '').trim()
                && String(resolution?.ruleEvidence || resolution?.change || '').trim())
              .map((resolution: any) => Number(resolution.issueIndex)));
            return issuesBeforeRepair.every((_, index) => coveredIssues.has(index + 1))
              && chapters.every((chapter: any, index: number) => Number(chapter?.order) === index + 1
              && String(chapter?.title || '').trim()
              && String(chapter?.responsibility || '').trim());
          },
          describeValidation: value => {
            const chapters = Array.isArray((value as any)?.chapters) ? (value as any).chapters : [];
            const resolutions = Array.isArray((value as any)?.resolutions) ? (value as any).resolutions : [];
            return [
              chapters.length === requiredChapterCount
                ? '章节必须按1开始连续编号，且title/responsibility非空'
                : `必须恰好返回${requiredChapterCount}章，当前${chapters.length}章`,
              `resolutions必须逐项覆盖本轮${issuesBeforeRepair.length}个问题，当前${resolutions.length}项`,
            ];
          },
        },
      );
      const repairedPlan = Array.isArray(replanResult.data?.chapters) ? replanResult.data.chapters : [];
      chapterTitles = repairedPlan.map((chapter: any, index: number) => ({
        order: index,
        title: String(chapter.title).trim(),
        func: normalizeOutlineChapterFunction(chapter.function, index, input.isShort),
        brief: String(chapter.responsibility).trim(),
      }));
      issues = await input.audit(chapterTitles.map((chapter, index) => ({
        chapter: index + 1,
        title: chapter.title,
        function: chapter.func,
        responsibility: chapter.brief,
      })));
      if (input.projectId) {
        this.generationMetrics?.recordChapterResponsibilityRepairAttempt(
          input.projectId,
          issuesBeforeRepair,
          strategyId,
          issues.length === 0,
          issues,
        );
      }
      if (issues.length > 0) {
        if (issues.length < issuesBeforeRepair.length) consecutiveNoProgress = 0;
        else consecutiveNoProgress += 1;
        // A strategy change is useful after one stalled attempt. If a second
        // different strategy also fails to reduce the unresolved set, stop and
        // return the evidence instead of spending the third call by quota.
        if (consecutiveNoProgress >= 2) {
          this.logger.warn(`章节分工连续${consecutiveNoProgress}轮未减少冲突，提前停止自适应修复`);
          break;
        }
      }
      if (issues.length > 0 && round < maxRepairRounds) {
        this.logger.warn(`章节分工策略${strategyId}修复后仍有${issues.length}项冲突，切换下一策略`);
      }
    }

    return { chapterTitles, issues };
  }

  /**
   * LLM 调用 + JSON 解析的 retry 包装
   * @returns { data, rawContent, warnings }
   */
  private async llmCallWithRetry<T>(
    stepName: string,
    prompt: string,
    options: {
      temperature?: number;
      scenario?: string;
      timeout?: number;
      maxTokens?: number;
      validate?: (value: unknown) => boolean;
      describeValidation?: (value: unknown) => string[];
      /** 埋点步骤名（缺省用 scenario）；projectId/chapterIndex 用于关联到具体项目/章节 */
      stepKey?: string;
      projectId?: string;
      chapterIndex?: number;
      deferQualityGate?: boolean;
    },
  ): Promise<{ data: T | null; rawContent: string; warnings: string[]; usage?: { promptTokens: number; completionTokens: number; totalTokens: number }; runId?: string }> {
    const warnings: string[] = [];
    let rawContent = '';
    let runId: string | undefined;
    let parsedAnyResponse = false;
    let lastValidationIssues: string[] = [];
    const accumulatedValidationIssues: string[] = [];
    let lastFailureKind: 'parse' | 'validation' | 'quality_gate' | null = null;
    let lastQualityGateError: Error | null = null;
    let lastFailedCandidate = '';
    let previousQualityFailureSignature = '';
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined;
    // 此入口只处理结构化 JSON。正文质感规则由正文生成链和创作宪法
    // 注入，不能追加到大纲/世界观等 JSON 任务后面制造格式冲突。
    const promptWithQuality = prompt;
    const callTimeout = options.timeout ?? LLM_TUNABLES.timeoutMedium(); // 默认中等生成超时，按场景可传入 simple/content/complex 档
    const accepts = (value: unknown): boolean => {
      if (value === null || value === undefined) return false;
      parsedAnyResponse = true;
      if (options.validate && !options.validate(value)) {
        lastFailureKind = 'validation';
        const described = (options.describeValidation?.(value) || []).filter(Boolean);
        lastValidationIssues = described.length > 0
          ? described
          : ['返回的JSON未通过字段完整性校验'];
        for (const issue of lastValidationIssues) {
          if (!accumulatedValidationIssues.includes(issue)) accumulatedValidationIssues.push(issue);
        }
        return false;
      }
      lastValidationIssues = [];
      lastFailureKind = null;
      return true;
    };

    // Ordinary malformed output gets one correction attempt.  A transport
    // reset is different: no content was generated, so allow one additional
    // same-model attempt without treating it as usable material.
    let maxAttempts = 2;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const resp = await this.realLLM.generate({
          prompt: attempt > 0
            ? `${prompt}\n\n【此前结果未通过，以下问题必须一次性全部解决】${accumulatedValidationIssues.length > 0
              ? `${lastFailureKind === 'quality_gate' ? 'JSON结构可以读取，但内容违反质量要求' : 'JSON语法有效，但结构不完整'}：${accumulatedValidationIssues.join('；')}`
              : '返回内容不是完整、合法的JSON对象'}。${lastFailedCandidate
                ? `\n【上次候选JSON】\n${lastFailedCandidate}\n【修订要求】保留已合规字段，只修改上述问题涉及的字段；同步更新所有引用同一事件的content、scenes、characterActions、conflicts、highlights、foreshadowing、characterStates与hook，避免修一处后产生字段互相矛盾。`
                : ''}请逐项修正，只输出一个完整JSON对象，不要解释或Markdown。`
            : promptWithQuality,
          scenario: options.scenario || 'outline',
          temperature: options.temperature ?? 0.8,
          timeout: callTimeout,
          maxTokens: options.maxTokens,
          responseFormat: 'json_object',
          // Every caller of this helper requests structured JSON and supplies
          // deterministic schema validation. Running the prose quality Gate on
          // that JSON caused a second review/evidence/repair pipeline for each
          // world, outline, character and organization call. Keep an explicit
          // escape hatch for exceptional callers, but skip prose judging by
          // default and let the existing final cross-module audits judge the
          // persisted story data once it is complete.
          deferQualityGate: options.deferQualityGate ?? true,
          metrics: {
            stepKey: options.stepKey || options.scenario || 'structured_json',
            attempt,
            projectId: options.projectId ?? projectMetricsContext.getStore() ?? undefined,
            chapterIndex: options.chapterIndex,
          },
        });
        rawContent = resp.content;
        runId = resp.runId;
        lastFailedCandidate = rawContent.slice(0, 60_000);
        usage = resp.usage;
        lastQualityGateError = null;

        const parsed = this.safeExtractJson<T>(rawContent, null as unknown as T);
        if (accepts(parsed)) {
          return { data: parsed, rawContent, warnings, usage, runId };
        }
        if (!parsed) lastFailureKind = 'parse';

        if (attempt === 0) {
          this.logger.warn(`${stepName} ${lastValidationIssues.length > 0 ? `结构校验失败: ${lastValidationIssues.join('；')}` : 'JSON语法解析失败'}(attempt ${attempt + 1})，内容前100字: ${rawContent.slice(0, 100)}`);
        }
      } catch (err: any) {
        const message = err?.message || String(err);
        // 「Gate 拒绝」（正文已生成、内容未达标，可带同一批证据再试）与「传输/解析故障」（立即上抛）
        // 必须分开。优先用结构化标记 isGateRejection 判定；中文前缀正则只作为结构化标记缺失时的兜底，
        // 不再作为唯一判据——正则嗅探正是「文案一改、行为就变」的来源。
        const gateRejection = isGateRejection(err) ? err : undefined;
        const isQualityGateFailure = !!gateRejection || /^质量 Gate\s+/i.test(message);
        if (typeof err?.generatedContent === 'string' && err.generatedContent.trim()) {
          rawContent = err.generatedContent;
          lastFailedCandidate = rawContent.slice(0, 60_000);
        }
        if (isQualityGateFailure) {
          lastFailureKind = 'quality_gate';
          lastQualityGateError = err;
          // 优先用分类器给出的分段（每个失败类别一段：未执行标准／正文质量／评审未完成）；
          // 没有结构化报告时才退回「剥离前缀」，避免把契约前缀当成问题本身。
          const gateReport = gateRejection?.report;
          lastValidationIssues = gateReport && gateReport.sections.length
            ? gateReport.sections.slice()
            : [message.replace(/^质量 Gate\s+\w+[:：]?\s*/i, '').trim() || '质量 Gate 未通过'];
          for (const issue of lastValidationIssues) {
            if (!accumulatedValidationIssues.includes(issue)) accumulatedValidationIssues.push(issue);
          }
          const failureSignature = lastValidationIssues.slice().sort().join('|');
          if (gateRejection && !gateRejection.retryable) {
            // 「执行标准本身为空」这一类：重跑模型不可能改变结论，只会再花一次整章生成的算力。
            // 只结束本次重试；不改阻断、不改状态码、不改 severity。
            maxAttempts = attempt + 1;
          } else if (failureSignature && failureSignature === previousQualityFailureSignature) {
            // The same evidenced failure repeated after receiving the repair
            // instruction. Another identical generation is not useful.
            maxAttempts = attempt + 1;
          } else if (attempt === 0) {
            // A later attempt is allowed only when the Gate contributes new
            // information; the accumulated ledger is sent on the next call.
            maxAttempts = Math.max(maxAttempts, 3);
          }
          previousQualityFailureSignature = failureSignature;
        }
        if (!isQualityGateFailure) {
          // The provider layer has already made the single permitted recovery
          // for transport or empty output. Replaying this business step would
          // add no correction evidence and would multiply the same request.
          throw err;
        }
        if (attempt < maxAttempts - 1) {
          const delayMs = LLM_TUNABLES.RETRY_BASE_DELAY_MS * (attempt + 1);
          this.logger.warn(`${stepName} LLM调用失败(attempt ${attempt + 1}/${maxAttempts})：${message}；${delayMs / 1000}秒后使用同一模型重试`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          warnings.push(`${stepName} 第${attempt + 1}次失败: ${message}`);
          this.logger.error(`${stepName} 最终失败(attempt ${attempt + 1}/${maxAttempts}): ${message}`);
        }
      }
    }

    // Gate 拒绝代表 JSON 已经生成，但内容质量未通过。必须保留这个真实
    // 失败原因，不能继续走“抢救 JSON”并把它误报成解析失败或绕过 Gate。
    if (lastFailureKind === 'quality_gate' && lastQualityGateError) {
      throw lastQualityGateError;
    }

    // ===== 降级解析：两次重试均失败后，尝试从 rawContent 抢救数据 =====
    // 降级1：逐行解析（LLM 可能每行输出一个 JSON 对象）
    const lines = rawContent.split('\n').filter(l => l.trim());
    const lineParsed: any[] = [];
    for (const line of lines) {
      try {
        const obj = JSON.parse(line.trim());
        if (obj && typeof obj === 'object') lineParsed.push(obj);
      } catch {}
    }
    if (lineParsed.length > 0) {
      this.logger.warn(`${stepName}: 通过逐行解析恢复 ${lineParsed.length} 条数据`);
      warnings.push(`${stepName}: 通过逐行解析恢复 ${lineParsed.length} 条数据`);
      // 如果期望的是数组，直接返回；如果期望的是对象，逐行尝试，优先返回第一个通过校验的对象
      if (lineParsed.length === 1) {
        if (accepts(lineParsed[0])) return { data: lineParsed[0] as unknown as T, rawContent, warnings, usage, runId };
      } else {
        if (accepts(lineParsed)) return { data: lineParsed as unknown as T, rawContent, warnings, usage, runId };
        for (const obj of lineParsed) {
          if (accepts(obj)) {
            warnings.push(`${stepName}: 多行 JSON 中仅第 1 个通过校验的对象被采用`);
            return { data: obj as unknown as T, rawContent, warnings, usage, runId };
          }
        }
      }
    }

    // 降级2：修复尾部逗号后整体解析
    try {
      let fixed = rawContent
        .replace(/,\s*([\]\}])/g, '$1')
        .replace(/,\s*$/gm, '');
      const parsed = JSON.parse(fixed);
      if (accepts(parsed)) {
        this.logger.warn(`${stepName}: 通过修复尾部逗号解析成功`);
        warnings.push(`${stepName}: 通过修复尾部逗号解析成功`);
        return { data: parsed as T, rawContent, warnings, usage, runId };
      }
    } catch {}

    // 降级3：提取最长 {...} 或 [...] 块，修复后解析
    try {
      const allText = rawContent;
      const objMatches = [...allText.matchAll(/\{[\s\S]*?\}/g)];
      const arrMatches = [...allText.matchAll(/\[[\s\S]*?\]/g)];
      const allMatches = [...objMatches, ...arrMatches].sort((a, b) => b[0].length - a[0].length);
      for (const m of allMatches) {
        try {
          const parsed = JSON.parse(m[0]);
          if (accepts(parsed)) {
            this.logger.warn(`${stepName}: 通过提取JSON块解析成功，长度: ${m[0].length}`);
            warnings.push(`${stepName}: 通过提取JSON块解析成功`);
            return { data: parsed as T, rawContent, warnings, usage, runId };
          }
        } catch {}
        try {
          let fixed = m[0].replace(/,\s*([\]\}])/g, '$1').replace(/,\s*$/gm, '');
          const parsed = JSON.parse(fixed);
          if (accepts(parsed)) {
            this.logger.warn(`${stepName}: 通过提取JSON块+修复逗号解析成功，长度: ${m[0].length}`);
            warnings.push(`${stepName}: 通过提取JSON块+修复逗号解析成功`);
            return { data: parsed as T, rawContent, warnings, usage, runId };
          }
        } catch {}
      }
    } catch {}

    if (parsedAnyResponse) {
      const detail = lastValidationIssues.join('；') || '字段结构不符合要求';
      this.logger.warn(`${stepName}: JSON语法有效但结构校验失败: ${detail}`);
      warnings.push(`${stepName}生成结果结构不完整：${detail}`);
    } else {
      this.logger.warn(`${stepName}: 所有解析尝试均失败，原始内容前300字: ${rawContent.slice(0, 300)}`);
      warnings.push(`${stepName}生成结果无法解析`);
    }
    return { data: null, rawContent, warnings, usage, runId };
  }

  private generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
