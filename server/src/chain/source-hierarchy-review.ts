import { STORY_FACT_PRIORITY } from '../modules/module-standards/module-standards.seed';

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
  // 权威顺序只引用 seed 的唯一机器常量，禁止在提示词里再发明第二套层级。
  return `你是创作资料的层级一致性审查员。只判断待保存资料是否服从更高层 Canon，不替作者改写任何上层事实。
【统一事实权威】${STORY_FACT_PRIORITY}
【执行标准】${input.executionStandard}
【当前上层资料：${input.parentName}】${JSON.stringify(input.parent)}
【待保存的下层资料：${input.childName}】${JSON.stringify(input.child)}
逐项核对已选平台、分类、基调、文风、流派、视角，以及世界规则与边界、角色身份/关系/知识、触发条件、作用对象与范围、数量基线、时间方向与累计时点、证据存续、因果链、卷/章任务和结局边界。
下层可以补充上层未定义的细节，但不能改变上层已经明确的事实；上层未明确的细节不得猜成硬性矛盾。若不同资料源本身互斥，只报告冲突并阻断保存/生成，禁止模型自行选择哪份事实胜出。
“正文已锁定”只代表编辑保护：自动系统不得修改锁定正文；它不把正文提升为高于 Creative Constitution、世界观或其他上层 Canon 的事实源。若上层 Canon 与锁定正文冲突，必须明确报告为需要人工裁决，不能通过改写任一侧自动调和。
对于可自动处理且不存在锁定保护的普通冲突，应只建议修改最低权威、未锁定且影响范围最小的依赖项；不得为了省事反向修改世界观或其它上层 Canon。
发现互斥时 consistent=false；每条 contradictions 必须给出上层与下层的逐字短引文、字段位置、权威层级和冲突推导，不得用解释性脑补调和。下层必需字段缺失由结构门单独处理。没有发现互斥时 consistent=true 且 contradictions=[]。只输出 JSON：{"consistent":true,"contradictions":[]}。`;
}