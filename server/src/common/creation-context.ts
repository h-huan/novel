/**
 * creation-context —— 当前“创作请求”的项目上下文（AsyncLocalStorage）
 *
 * 作用：一次 HTTP 创作请求（大纲/世界观/角色/组织/伏笔/正文……）内的所有 LLM 调用，
 * 即使调用点没有逐个在 LLMRequest.metrics 里显式带 projectId，也能通过这里兜底归属到对应小说，
 * 从而让「单本书看板」能看到这本书的全部生成环节，而不只是正文。
 *
 * 设计边界：
 *  - 灵感发现发生在项目创建之前，请求里没有 projectId，上下文为 null，归为平台级（符合预期）；
 *  - 定时任务/跨书归纳没有 HTTP 请求上下文，同样为 null（平台级）；
 *  - 正文链路显式传了 metrics.projectId 时以显式值为准（见 real-llm.service）。
 */
import { AsyncLocalStorage } from 'async_hooks';

export interface CreationCtx {
  projectId: string | null;
}

export const creationAsyncStorage = new AsyncLocalStorage<CreationCtx>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 只认 UUID 形态，避免把别的业务 id 误当成项目 id */
export function normalizeProjectId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t : null;
}

/** 从 params / query / body 中按常见字段名提取项目 id */
export function extractProjectId(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const o = input as Record<string, unknown>;
  for (const k of ['projectId', 'project_id', 'project', 'novelId']) {
    const hit = normalizeProjectId(o[k]);
    if (hit) return hit;
  }
  return null;
}

/** 供埋点兜底读取当前请求归属的项目 id */
export function currentCreationProjectId(): string | null {
  return creationAsyncStorage.getStore()?.projectId ?? null;
}

/** 一定发生在某本书内的创作场景（创建前的灵感发现、平台级定时自归纳用 daily/idea_*，不在内） */
// review（Gate 拒绝/正文评审）、state_extract（情节与伏笔状态提取）、__body_writing__（正文写作场景）
// 此前漏在名单外：这些场景缺 projectId 时只写平台级、不进任何一本书的单书看板，
// 且 recordStepMetric 的告警永不触发——即「静默空值」。补全后缺 projectId 会被显式暴露。
// long-novel-* 是【长篇创建】的两条链（地基 / 弹性大纲）：由创建流程在后台任务里调用，
// 那时项目行已落库，但 AsyncLocalStorage 里没有 projectId（创建请求发出时项目还不存在），
// 只靠请求上下文兜底必然为 null —— beginRun 既拿不到创作宪法，埋点又退化成平台级。
// 纳入名单后这类调用缺 projectId 会显式阻断，而不是静默写成 NULL。
// inspiration-seed-enrich 是灵感阶段的原料补全（项目尚未创建），刻意留在名单外。
const PROJECT_SCOPED_RE = /^(outline|world_building|character_design|organization_map|foreshadowing|timeline|title|writing|body_|chapter_synthesis|summary|continuation|refinement|quality_refine|consistency|character_review|review|state_extract|__body_writing__|cross_chapter|long-novel-)/;
const PROJECT_SCOPED_STEP_RE = /^(body_|__body_writing__|state_extract)/;
export function expectsProjectId(scenario?: string | null, stepKey?: string | null): boolean {
  return PROJECT_SCOPED_RE.test(String(scenario || '')) || PROJECT_SCOPED_STEP_RE.test(String(stepKey || ''));
}
