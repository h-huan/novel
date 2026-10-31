
/** Preserve one-call aggregate coverage when the shared allowance cannot fund
 * all independent partitions. Batching is a latency optimization, never a
 * prerequisite for completing a valid five-card review under a small budget. */
export function shouldBatchIdeaPresentation(count:number,groupingMode:number,batchSize:number,availableReviewCalls:number):boolean {
  return groupingMode===0&&count>=4&&batchSize>=1&&count>batchSize
    &&availableReviewCalls>=Math.ceil(count/batchSize);
}
/** Reference cards are comparison material, not additional cards to be
 * assessed. Preserve every narrative fact needed for genuine relation,
 * choice, escalation, reversal and payoff comparison, without retransmitting
 * labels, author self-praise or execution settings for each peer review.
 * The actual target cards remain completely unchanged. */
export function compactIdeaPresentationReferences(references:readonly Record<string,any>[]) {
  // Keep peer platform/category/dimension facts and the complete story path:
  // independent cross-card checks can require them. Only an already-reviewed
  // peer's self-advertised noveltyProof is removed, never a source fact.
  const narrative=['position','title','storyType','targetPlatform','storyCategory',
    'hook','description','setting','protagonist','coreConflict','mainReversal',
    'ending','scopeBreakdown','uniquePoint','storyTone','writingStyle',
    'webNovelGenre','plotTags','submissionTags','pov'] as const;
  return references.map(row=>Object.fromEntries(narrative
    .filter(key=>row[key]!==undefined).map(key=>[key,row[key]])));
}
import { ideaReviewCitableNarrativeText } from './idea-review-evidence';
import { resolveQualityEvidence } from '../modules/writing-quality/quality-issue';
import { readerGoalReviewIssues, readerGoalGateIssues, type ReaderGoalReview } from './reader-goal-review';

export interface IdeaPresentationVerdict {
  position: number;
  title: string;
  titleCompelling: boolean;
  openingCompelling: boolean;
  distinctFromBatch: boolean;
  storyCoherent: boolean;
  payoffCredible: boolean;
  platformFit: boolean;
  storyEvidence: string;
  payoffEvidence: string;
  platformEvidence: string;
  qualityReason: string;
  readerQuestion: string;
  issues: string[];
  warnings?: string[];
  readerGoals?: ReaderGoalReview;
}

/** Verdict position is server-owned. Titles are NOT unique identities.
 * A title-keyed Map silently reused the last verdict when two candidates
 * shared a title, causing false rejection and further needless repair calls.
 * Bind to the exact original objects using the validated original positions. */
export function bindIdeaPresentationVerdicts<T extends {title:string}>(
 cards:readonly T[], verdicts:readonly IdeaPresentationVerdict[],
):Map<T,IdeaPresentationVerdict>{
 const bound=new Map<T,IdeaPresentationVerdict>();
 for(const verdict of verdicts){
   if(!Number.isInteger(verdict?.position)||verdict.position<1||verdict.position>cards.length)
     throw Error('完整卡独立审核位置缺失或越界，不得按标题猜测归属');
   const candidate=cards[verdict.position-1];
   if(verdict.title!==candidate.title||bound.has(candidate))
     throw Error('完整卡独立审核标题、位置不匹配或重复，不得错配其它故事');
   bound.set(candidate,verdict);
 }
 if(bound.size!==cards.length)throw Error('完整卡独立审核未覆盖全部实际候选');
 return bound;
}

/** Repair only an unambiguous same-row envelope error; never infer a verdict. */
function normalizePresentationEnvelope(row: any): any {
  const bridge = row?.payoffBridge;
  if (!row || typeof row !== 'object' || !bridge || typeof bridge !== 'object' || Array.isArray(bridge)) return row;
  const next = { ...row, payoffBridge: { ...bridge } };
  for (const key of ['readerGoals', 'issues', 'warnings']) {
    if (bridge[key] === undefined) continue;
    if (row[key] !== undefined && JSON.stringify(row[key]) !== JSON.stringify(bridge[key]))
      throw new Error('payoffBridge内外的' + key + '冲突，不能猜测审核结论');
    next[key] = bridge[key];
    delete next.payoffBridge[key];
  }
  return next;
}
/** Reference verdicts are never accepted again; unknown/duplicate target rows still fail. */
export function targetIdeaReviews(value: any, cards: readonly any[], references: readonly any[]): any {
  if (!Array.isArray(value?.reviews)) return value;
  const targets = new Set(cards.map(card => card.title));
  const referenceTitles = new Set(references.map(card => card.title).filter(title => !targets.has(title)));
  return { ...value, reviews: value.reviews.filter((row: any) => !referenceTitles.has(row?.title)).map(normalizePresentationEnvelope).map((row:any)=>({
    ...row, issues: Array.isArray(row?.issues) ? row.issues.map((issue:any)=> {
      if (typeof issue==='string') return issue;
      const criteria=['titleCompelling','openingCompelling','distinctFromBatch','storyCoherent','payoffCredible','platformFit'];
      const criterion = issue?.criterion ?? issue?.judgment;
      const reason = issue?.reason ?? issue?.detail;
      // Only a recognized structured reason is converted. Verdicts and evidence stay unchanged.
      if (issue && typeof issue==='object' && !Array.isArray(issue) && typeof reason==='string' && reason.trim()
        && !(issue.reason !== undefined && issue.detail !== undefined && issue.reason !== issue.detail)
        && criteria.includes(criterion) && !(issue.criterion !== undefined && issue.judgment !== undefined && issue.criterion !== issue.judgment)
        && (issue.field === undefined || (typeof issue.field==='string' && issue.field.trim())))
        return issue.field ? `${issue.field}（${criterion}）：${reason}` : `${criterion}：${reason}`;
      return issue;
    }) : row?.issues,
  })) };
}

/** Bind an independent semantic judgement to exactly the cards actually reviewed. */
export function presentationReviewIssues(value: any, cards: readonly any[], requireReaderGoals = false): string[] {
  if (!Array.isArray(value?.reviews)) return ['标题与首屏审查必须逐卡返回完整结论：缺少reviews数组'];
  if (value.reviews.length !== cards.length) {
    const seen=new Set(value.reviews.map((row:any)=>row?.position).filter((pos:unknown)=>Number.isInteger(pos)));
    const missing=cards.map((_card,index)=>index+1).filter(pos=>!seen.has(pos));
    return ['标题与首屏审查必须逐卡返回完整结论：要求'+cards.length+'项，实际'+value.reviews.length+'项，缺失位置='+JSON.stringify(missing)];
  }
  const seen = new Set<number>();
  const issues: string[] = [];
  for (const row of value.reviews) {
    if (requireReaderGoals || row?.readerGoals !== undefined) issues.push(...readerGoalReviewIssues(row?.readerGoals, ideaReviewCitableNarrativeText(cards[row?.position - 1] || {})).map(issue => '第' + (row?.position ?? '?') + '张题材审查：readerGoals.' + issue));
    if (!Number.isInteger(row?.position) || row.position < 1 || row.position > cards.length || seen.has(row.position)
      || row.title !== cards[row.position - 1].title
      || ['titleCompelling', 'openingCompelling', 'distinctFromBatch', 'storyCoherent', 'payoffCredible', 'platformFit'].some(key => typeof row[key] !== 'boolean')
      || ['storyEvidence', 'payoffEvidence', 'platformEvidence'].some(key => !resolveQualityEvidence(ideaReviewCitableNarrativeText(cards[row.position - 1]), row[key]).verified)
      || typeof row.qualityReason !== 'string' || row.qualityReason.trim().length < 8
      || typeof row.readerQuestion !== 'string' || row.readerQuestion.trim().length < 8
      || !Array.isArray(row.issues) || row.issues.some((issue: any) => typeof issue !== 'string' || !issue.trim())
      || ((!row.titleCompelling || !row.openingCompelling || !row.distinctFromBatch || !row.storyCoherent || !row.payoffCredible || !row.platformFit) && row.issues.length === 0)) {
      const card = cards[row?.position - 1];
      const prefix = `第${row?.position ?? '?'}张题材审查`;
      if (!card || seen.has(row.position) || row.title !== card.title) issues.push(`${prefix}：position须唯一且title须与对应题材原样一致`);
      for (const key of ['titleCompelling', 'openingCompelling', 'distinctFromBatch', 'storyCoherent', 'payoffCredible', 'platformFit']) {
        if (typeof row?.[key] !== 'boolean') issues.push(`${prefix}：${key}必须为布尔值`);
      }
      for (const key of ['storyEvidence', 'payoffEvidence', 'platformEvidence']) {
        if (!card || !resolveQualityEvidence(ideaReviewCitableNarrativeText(card), row?.[key]).verified) issues.push(`${prefix}：${key}不能连续定位到题材卡原文；必须逐字引用对应卡的hook、setting、description、ending或scopeBreakdown，不得引用executionStandard、分类规则或参考卡，不得改写或拼接`);
      }
      if (typeof row?.qualityReason !== 'string' || row.qualityReason.trim().length < 8) issues.push(`${prefix}：qualityReason至少8字`);
      if (typeof row?.readerQuestion !== 'string' || row.readerQuestion.trim().length < 8) issues.push(`${prefix}：readerQuestion至少8字`);
      if (!Array.isArray(row?.issues) || row.issues.some((issue: any) => typeof issue !== 'string' || !issue.trim())) issues.push(`${prefix}：issues必须是非空理由字符串数组，合格时可为空数组`);
      else if (['titleCompelling', 'openingCompelling', 'distinctFromBatch', 'storyCoherent', 'payoffCredible', 'platformFit'].some(key => row[key] === false) && !row.issues.length) issues.push(`${prefix}：存在false判据，issues须说明具体问题`);
    }
    if (Array.isArray(row?.issues) && row.issues.length && ['titleCompelling', 'openingCompelling', 'distinctFromBatch', 'storyCoherent', 'payoffCredible', 'platformFit'].every(key => row[key] === true)) {
      issues.push(`第${row.position}张题材审查：六项全部true却返回阻断issues，结论互斥；真实缺陷须把对应判据设false并给证据，可选表达建议须放warnings，不得仅按“建议”字样自动降级真实矛盾`);
    }
    if (row?.warnings !== undefined && (!Array.isArray(row.warnings) || row.warnings.some((item: any) => typeof item !== 'string' || !item.trim()))) issues.push(`第${row.position}张题材审查：warnings须为建议字符串数组`);
    seen.add(row?.position);
  }
  return issues;
}

export function presentationGateIssues(review: IdeaPresentationVerdict | undefined): string[] {
  if (!review) return ['标题与首屏吸引力未获得有效独立审查，不能宣称通过'];
  return [
    ...(!review.titleCompelling ? ['标题缺少具体利益冲突、反常关系或未解问题，只有意象或道具名，未形成点击承诺'] : []),
    ...(!review.openingCompelling ? ['首屏缺少立即可理解的危险、欲望或关系反差，只在介绍设定或职业查证流程'] : []),
    ...(!review.distinctFromBatch ? ['与同批题材的主动选择、冲突推进或反转路径雷同，不能只换职业和道具'] : []),
    ...(!review.storyCoherent ? ['题材因果或人物选择不成立，不能只凭噱头和字段齐全宣称精彩'] : []),
    ...(!review.payoffCredible ? ['标题与起始承诺未形成可信兑现，结局不能靠新增能力或省略程序条件收束'] : []),
    ...(!review.platformFit ? ['故事机制、分类或流派没有落实本次平台执行标准'] : []),
    ...review.issues,
    ...(review.readerGoals ? readerGoalGateIssues(review.readerGoals) : []),
  ];
}
