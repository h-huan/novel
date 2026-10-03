import { buildCanonPolicyDirective } from '../modules/canon/canon-policy';

export interface SourceHierarchyReview {
  consistent: boolean;
  contradictions: string[];
}

/** Preserve complete quoted findings whether the reviewer chose strings or objects. */
export function normalizeSourceHierarchyReview(value: unknown): SourceHierarchyReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const review = value as Record<string, unknown>;
  if (typeof review.consistent !== 'boolean' || !Array.isArray(review.contradictions)) return null;
  const contradictions = review.contradictions.map(item => {
    if (typeof item === 'string') return item.trim();
    if (item && typeof item === 'object' && !Array.isArray(item)) return JSON.stringify(item);
    return '';
  });
  if (contradictions.some(item => !item)) return null;
  if (review.consistent === (contradictions.length > 0)) return null;
  return { consistent: review.consistent, contradictions };
}

export function buildSourceHierarchyReviewPrompt(input: {
  parentName: string;
  parent: unknown;
  childName: string;
  child: unknown;
  executionStandard: string;
}): string {
  return `你是创作资料的一致性审查员。只判断冲突，不替作者改写世界观或其它已确认上层事实。
${buildCanonPolicyDirective()}
【执行标准】${input.executionStandard}
【当前上层资料：${input.parentName}】${JSON.stringify(input.parent)}
【待保存的下层资料：${input.childName}】${JSON.stringify(input.child)}
逐项核对已选平台、分类、基调、文风、流派、视角，以及世界规则与边界、角色身份/关系/知识、触发条件、作用对象与范围、数量基线、时间方向与累计时点、证据存续、因果链、卷/章任务和结局边界。
下层可以补充上层未定义的细节，但不能改变上层已经明确的事实；上层未明确的细节不得猜成硬性矛盾。
世界观一旦出现于上层资料，视为不可自动修改的地基：若下层与它冲突，只报告下层冲突点，不得建议修改、放宽、补丁式改写世界观来迁就下层。
“正文已锁定”代表编辑保护。锁定正文与世界观/Creative Constitution 真正互斥时必须报告并交给人工裁决；不得偷偷改任一侧。
已经发生并接受的正文与尚未执行的未来计划冲突、且不触及世界观或已确认故事核心时，应保留已经发生历史，未来计划是更低雪崩成本的修复点。
其它普通冲突必须按最小代价原则定位：优先选择修改范围最小、下游依赖最少、尚未执行且未锁定的资料；不得为了省事整层重写，更不得反向修改世界观。
发现互斥时 consistent=false；每条 contradictions 必须给出上层与下层的逐字短引文、字段位置、冲突推导，以及“应在下层哪个最小字段/事件点修复”的建议。下层必需字段缺失由结构门单独处理。
没有发现互斥时 consistent=true 且 contradictions=[]。只输出 JSON：{"consistent":true,"contradictions":[]}。`;
}
