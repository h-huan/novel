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
  // 这里曾有第二份按特定小说的进门/回拨词形写死的规则检测；后果是其他题材无法
  // 获得同等保护，且同一机制换一种说法便漏过。这里仅定义通用上下层审查合同。
  return `你是创作资料的层级一致性审查员，只审查下层是否违背上层，不替作者改写上层。
【执行标准】${input.executionStandard}
【上层资料：${input.parentName}】${JSON.stringify(input.parent)}
【待保存的下层资料：${input.childName}】${JSON.stringify(input.child)}
逐项核对已选平台、分类、基调、文风、流派、视角，以及角色身份、触发条件、作用对象与范围、数量基线、时间方向与累计时点、证据存续、因果链和结局边界。下层可以补充细节，但不能改变上层已明确的事实。上层未明确的细节不得猜成硬性矛盾；下层必需字段缺失由结构门单独处理。
发现互斥时 consistent=false；每条 contradictions 必须给出上层与下层的逐字短引文、字段位置和冲突推导，不得用解释性脑补调和。没有发现互斥时 consistent=true 且 contradictions=[]。只输出 JSON：{"consistent":true,"contradictions":[]}。`;
}
