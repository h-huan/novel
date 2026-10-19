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

export function premiseCausalPlanExample(): PremiseCausalLink[] {
  return [{ action: { field: 'activeChoice', quote: '本项实际行动的连续原文' },
    conditions: [{ field: 'escalation', quote: '本项已建立的必要条件连续原文' }],
    result: { field: 'payoff', quote: '由该行动和条件支撑的结果连续原文' } }];
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

export function premiseCausalCatalog(item: Record<string, unknown>, prefix: string) {
  return (Array.isArray(item.causalPlan) ? item.causalPlan : []).map((link, index) => ({
    ref: `${prefix}causalPlan[${index}]`, ...link,
  }));
}
