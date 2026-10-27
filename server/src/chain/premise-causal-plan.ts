/** A concise story plan, not model reasoning. Anchors point to actual planned events. */
export interface PremiseCausalAnchor { field: string; quote: string }
export interface PremiseCausalLink {
  action: PremiseCausalAnchor;
  conditions: PremiseCausalAnchor[];
  result: PremiseCausalAnchor;
}
// Field placement is not an event's causal role. A payoff paragraph may contain
// both a new action and its result; the semantic review must distinguish them.
const narrativeFields = ['protagonistSituation', 'openingEvent', 'coreConflict', 'activeChoice', 'escalation', 'reversalEffect', 'payoff', 'irreplaceableCarrier', 'secondOrderConsequence'];
const actionFields = narrativeFields, conditionFields = narrativeFields, resultFields = narrativeFields;
const foldQuotation = (value: string) => value.replace(/["'“”‘’]/g, '"');

/** Bind only existing same-premise text. No synonym, number, negation or story edit. */
export function bindPremiseCausalPlan(item: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(item.causalPlan)) return item;
  const bind = (anchor: any) => {
    if (!anchor || !narrativeFields.includes(anchor.field) || typeof anchor.quote !== 'string' || !anchor.quote.trim()) return anchor;
    const inField = (field: string): PremiseCausalAnchor | undefined => {
      const text = item[field];
      if (typeof text !== 'string') return;
      if (text.includes(anchor.quote)) return {field,quote:anchor.quote};
      const at = foldQuotation(text).indexOf(foldQuotation(anchor.quote));
      // Quote folding replaces one UTF-16 code unit with one: original offsets survive.
      if (at >= 0) return {field,quote:text.slice(at,at+anchor.quote.length)};
      // Model citations sometimes end a real clause with 。 when its source uses ；.
      // Recover only that terminal punctuation from ONE exact occurrence in the
      // declared field. Never infer content, synonyms, negation, numbers or events.
      if (/[。；]$/.test(anchor.quote)) {
        const stem = anchor.quote.slice(0, -1);
        const foldedStem = foldQuotation(stem);
        const foldedText = foldQuotation(text);
        const start = foldedText.indexOf(foldedStem);
        if (stem.length >= 8 && start >= 0
          && foldedText.indexOf(foldedStem, start + 1) === -1
          && /[。；]/.test(text.charAt(start + stem.length))) {
          return {field,quote:text.slice(start, start + stem.length + 1)};
        }
      }
    };
    const declared = inField(anchor.field);
    if (declared) return declared;
    const matches = narrativeFields.flatMap(field => {const found=inField(field);return found?[found]:[];});
    return matches.length === 1 ? matches[0] : anchor;
  };
  return {...item,causalPlan:item.causalPlan.map(link=>!link || typeof link!=='object' ? link : ({
    ...link,action:bind(link.action),result:bind(link.result),
    ...(Array.isArray(link.conditions)?{conditions:link.conditions.map(bind)}:{}),
  }))};
}

/** One independent generation/review contract: distinguish a genuine missing
 * story prerequisite from a citation plan that skips a later established event.
 * The model can use any count of steps, including one for true direct causality.
 */
export const PREMISE_CAUSAL_SEQUENCE_DIRECTIVE =
  '因果计划只绑定故事已写出的实际状态变化。中间动作不得直接标终局payoff：主角准备或提出请求，只能得到已发生的直接结果；若最终胜负还依赖后续物证取得/核验、他人到场、负责人认定、对手行动或程序决定，须把这些动作及既有条件接续成后续环节，不能让前一步越级产生终局。每个result只填写该步action及其已成立conditions实际产生的结果，不能把后续结果提前填写；后一步的条件必须已在故事字段中存在，不能由终局倒推。最后一个关键环节应承接真正的payoff与代价，条件缺失时不能靠改causalPlan引用伪造成立；普通直接因果允许一环，不按示例强制凑环节。';

export function premiseCausalPlanExample(): PremiseCausalLink[] {
  // Two-stage illustration prevents the old single action->payoff example
  // from teaching the model to attach a multi-step finale to the opening act.
  return [
    { action: { field: 'activeChoice', quote: '主角实际发起第一项行动的连续原文' },
      conditions: [{ field: 'openingEvent', quote: '促使该行动发生的已建立条件连续原文' }],
      result: { field: 'escalation', quote: '第一项行动当下真正产生的变化连续原文' } },
    { action: { field: 'reversalEffect', quote: '后续物证核验或决定者实际行动的连续原文' },
      conditions: [{ field: 'escalation', quote: '后续决定者已有证据与权限的连续原文' }],
      result: { field: 'payoff', quote: '经后续步骤才兑现的结局与代价连续原文' } },
  ];
}

export function premiseCausalPlanIssues(item: Record<string, unknown>): string[] {
  const plan = item.causalPlan;
  if (!Array.isArray(plan) || !plan.length) return ['缺少生成前causalPlan关键行动—条件—结果计划'];
  const errors: string[] = [], seen = new Set<string>();
  const anchor = (value: any, fields: string[]) => value && fields.includes(value.field)
    && typeof value.quote === 'string' && !!value.quote.trim()
    && typeof item[value.field] === 'string' && String(item[value.field]).includes(value.quote);
  for (const [index, link] of plan.entries()) {
    const ref = `causalPlan[${index}]`;
    if (!anchor(link?.action, actionFields) || !anchor(link?.result, resultFields)
      || !Array.isArray(link?.conditions) || link.conditions.some((row: unknown) => !anchor(row, conditionFields))) {
      errors.push(ref + '须绑定本题材实际故事字段的连续原文；引用不存在、跨题材或不能唯一定位时不得猜测');
      continue;
    }
    if (foldQuotation(link.action.quote) === foldQuotation(link.result.quote) || link.conditions.some((row: PremiseCausalAnchor) => foldQuotation(row.quote) === foldQuotation(link.result.quote)))
      errors.push(ref + '不能用同一结果断言自证行动或条件');
    const key = JSON.stringify(link);
    if (seen.has(key)) errors.push(ref + '重复同一因果环节');
    seen.add(key);
  }
  if (!plan.some(link => anchor(link?.result, resultFields) && link.result.field === 'payoff'))
    errors.push('causalPlan须覆盖主线兑现，不能只列开端或普通动作');
  return errors;
}

/** Called at the live generation boundary, never synthesizes missing plans from old text. */
export function assertPremiseCausalPlans(selection: { selected: Record<string, unknown>[] }): void {
  for (const item of selection.selected) {
    const errors = premiseCausalPlanIssues(item);
    if (errors.length) throw new Error(`已选题材 ${item.premiseId} 的生成前因果计划未完成：${errors.join('；')}`);
  }
}

/** Repair the citation index only. The model cannot change any story fact,
 * identity or a valid peer, and the independent semantic gates still follow. */
export function premiseCausalPlanRepairInput(selection: { selected: Record<string, unknown>[] }) {
  return selection.selected.filter(item => premiseCausalPlanIssues(item).length).map(item => ({
    premiseId: item.premiseId,
    ...Object.fromEntries(narrativeFields.map(field => [field, item[field]])),
    causalPlan: item.causalPlan, errors: premiseCausalPlanIssues(item),
  }));
}

export function applyPremiseCausalPlanRepairs<T extends { selected: Record<string, unknown>[] }>(selection: T, value: any): T {
  const targets = premiseCausalPlanRepairInput(selection), rows = value?.plans;
  if (!value || Object.keys(value).some(key => key !== 'plans') || !Array.isArray(rows)
    || rows.length !== targets.length || new Set(rows.map(row => row?.premiseId)).size !== targets.length
    || rows.some(row => !targets.some(item => item.premiseId === row?.premiseId)
      || Object.keys(row).some(key => !['premiseId', 'causalPlan'].includes(key))))
    throw new Error('因果计划修复只能逐项返回点名身份的causalPlan，不得修改故事或其它题材');
  const next = { ...selection, selected: selection.selected.map(item => {
    const row = rows.find(row => row.premiseId === item.premiseId);
    return row ? bindPremiseCausalPlan({ ...item, causalPlan: row.causalPlan }) : item;
  }) };
  assertPremiseCausalPlans(next);
  return next;
}

export function premiseCausalCatalog(item: Record<string, unknown>, prefix: string) {
  return (Array.isArray(item.causalPlan) ? item.causalPlan : []).map((link, index) => ({
    ref: `${prefix}causalPlan[${index}]`, ...link,
  }));
}
