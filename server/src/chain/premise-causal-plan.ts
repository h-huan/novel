import { resolvePremiseSourceReference, resolvePremiseSourceAnchor, exactPremiseSourceFields } from './premise-source-bindings';
import { CAUSAL_OUTCOME_ATTRIBUTION_POLICY } from '../../shared/src/system-workflow-rules.registry';
/** A concise story plan, not model reasoning. Anchors point to actual planned events. */
export interface PremiseCausalAnchor { field: string; quote: string }
export interface PremiseCausalLink {
  action: PremiseCausalAnchor;
  conditions: PremiseCausalAnchor[];
  result: PremiseCausalAnchor;
}
// Field placement is not an event's causal role. A payoff paragraph may contain
// both a new action and its result; the semantic review must distinguish them.
export const PREMISE_CAUSAL_NARRATIVE_FIELDS = ['protagonistSituation', 'openingEvent', 'coreConflict', 'activeChoice', 'escalation', 'reversalEffect', 'payoff', 'irreplaceableCarrier', 'secondOrderConsequence'];
const narrativeFields=PREMISE_CAUSAL_NARRATIVE_FIELDS;
const actionFields = narrativeFields, conditionFields = narrativeFields, resultFields = narrativeFields;
const foldQuotation = (value: string) => value.replace(/["'“”‘’]/g, '"');

/** Bind only existing same-premise text. No synonym, number, negation or story edit. */
export function bindPremiseCausalPlan(item: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(item.causalPlan)) return item;
  const bind = (anchor: any) => {
    if(anchor && typeof anchor==='object' && 'sourceRef' in anchor){
      const quote=resolvePremiseSourceReference(item,anchor.sourceRef);
      const invalid={field:anchor.field,sourceRef:anchor.sourceRef};
      if(Object.keys(anchor).some(key=>!(['field','sourceRef','quote'] as string[]).includes(key))
        ||!quote||(anchor.quote!==undefined&&anchor.quote!==quote))return invalid;
      if(narrativeFields.includes(anchor.field)&&typeof item[anchor.field]==='string'&&String(item[anchor.field]).includes(quote))return {field:anchor.field,quote};
      const sourceAnchor=resolvePremiseSourceAnchor(item,anchor.sourceRef);
      if(sourceAnchor)return sourceAnchor;
      const matches=narrativeFields.filter(field=>typeof item[field]==='string'&&String(item[field]).includes(quote));
      return matches.length===1?{field:matches[0],quote}:invalid;
    }
    if (!anchor || !narrativeFields.includes(anchor.field) || typeof anchor.quote !== 'string' || !anchor.quote.trim()) return anchor;
    const inField = (field: string): PremiseCausalAnchor | undefined => {
      const text = item[field];
      if (typeof text !== 'string') return;
      if (text.includes(anchor.quote)) return {field,quote:anchor.quote};
      const at = foldQuotation(text).indexOf(foldQuotation(anchor.quote));
      // Quote folding replaces one UTF-16 code unit with one: original offsets survive.
      if (at >= 0) return {field,quote:text.slice(at,at+anchor.quote.length)};
      // Source prose and a JSON citation can have different line wrapping.
      // Recover ONLY a unique otherwise-identical contiguous quotation;
      // never change negation, digits, punctuation, characters or event roles.
      // Build the offset map so the returned evidence is verbatim source text.
      const textOffsets:number[]=[];
      let compactText='';
      for(let pos=0;pos<text.length;pos++){
        if(/\s/u.test(text[pos]))continue;
        compactText+=foldQuotation(text[pos]);textOffsets.push(pos);
      }
      const compactQuote=foldQuotation(anchor.quote).replace(/\s/gu,'');
      if(compactQuote.length>=8){
        const index=compactText.indexOf(compactQuote);
        if(index>=0&&compactText.indexOf(compactQuote,index+1)===-1){
          const quote=text.slice(textOffsets[index],textOffsets[index+compactQuote.length-1]+1);
          // A space *inside* an uninterrupted source term can change its
          // quoted identity (e.g. 空账 vs 空 账). Recover layout differences
          // only when the actual source span is itself whitespace-wrapped.
          if(quote.trim()&&(/[\r\n\t]/u.test(anchor.quote)||/[\r\n\t]/u.test(quote)))
            return {field,quote};
        }
      }
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
  const normalized={...item,causalPlan:item.causalPlan.map(link=>!link || typeof link!=='object' ? link : ({
    ...link,action:bind(link.action),result:bind(link.result),
    ...(Array.isArray(link.conditions)?{conditions:link.conditions.map(bind)}:{}),
  }))};
  // These labels can be byte-identical projections of ONE source section.
  // Renaming the last result address does not create a result or prove causality.
  // Keep the quote and every actual causal judgment unchanged.
  if(!normalized.causalPlan.some((link:any)=>link?.result?.field==='payoff')){
    const last=normalized.causalPlan.at(-1),field=last?.result?.field;
    const exact=exactPremiseSourceFields(item,item);
    if(['reversalEffect','secondOrderConsequence'].includes(field)&&exact.has(field)&&exact.has('payoff')
      &&item[field]===item.payoff&&typeof last.result.quote==='string'&&String(item.payoff).includes(last.result.quote))
      normalized.causalPlan[normalized.causalPlan.length-1]={...last,result:{...last.result,field:'payoff'}};
  }
  return normalized;

}

/** One independent generation/review contract: distinguish a genuine missing
 * story prerequisite from a citation plan that skips a later established event.
 * The model can use any count of steps, including one for true direct causality.
 */
export const PREMISE_CAUSAL_SEQUENCE_DIRECTIVE =
  'causalPlan的每个field只能取'+PREMISE_CAUSAL_NARRATIVE_FIELDS.join('、')+'。conditions是计划环节内的引用数组，绝不是新的故事字段；所有必要条件必须已存在于上述实际故事字段；引用式选优时这些字段由sourceBindings从固定原池原样投影，禁止为补条件重写或新增原文，然后才绑定引用。禁止另造顶层conditions、prerequisites或其它故事字段；最后一个关键结果须用field=payoff引用实际兑现，不能漏掉或用结果反充行动。因果计划只绑定故事已写出的实际状态变化。中间动作不得直接标终局payoff：主角准备或提出请求，只能得到已发生的直接结果；若最终胜负还依赖后续物证取得/核验、他人到场、负责人认定、对手行动或程序决定，须把这些动作及既有条件接续成后续环节，不能让前一步越级产生终局。每个result只填写该步action及其已成立conditions实际产生的结果，不能把后续结果提前填写；后一步的条件必须已在故事字段中存在，不能由终局倒推。'+CAUSAL_OUTCOME_ATTRIBUTION_POLICY+'条件缺失时不能靠改causalPlan引用伪造成立；普通直接因果允许一环，不按示例强制凑环节。示例仅说明引用形状和因果先后，绝不要求加入核验者、第三方裁决、证据或额外程序。每项实际声称的决定性结果都要有相应行动和条件；不能用一个局部结果跳到整片区域、全部关系或所有权利的变化。';

export function premiseCausalPlanExample(): PremiseCausalLink[] {
  // Two-stage illustration prevents the old single action->payoff example
  // from teaching the model to attach a multi-step finale to the opening act.
  return [
    { action: { field: 'activeChoice', quote: '主角实际发起第一项行动的连续原文' },
      conditions: [{ field: 'openingEvent', quote: '促使该行动发生的已建立条件连续原文' }],
      result: { field: 'escalation', quote: '第一项行动当下真正产生的变化连续原文' } },
    { action: { field: 'escalation', quote: '本故事后续实际执行并改变局面的行动连续原文' },
      conditions: [{ field: 'escalation', quote: '该行动发生之前已具备的必要条件连续原文' }],
      result: { field: 'payoff', quote: '由后续实际行动产生的最终结果连续原文' } },
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

export function applyPremiseCausalPlanRepairs<T extends { selected: Record<string, unknown>[] }>(
  selection: T, value: any, minimumSelectedCount = selection.selected.length,
): T {
  if (!Number.isSafeInteger(minimumSelectedCount) || minimumSelectedCount < 1
    || minimumSelectedCount > selection.selected.length)
    throw new Error('因果索引修复的最低候选数量无效');
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
  // A single model citation can have a stale word or an invented clause.
  // Never silently rewrite those facts or approve the invalid citation. In a
  // surplus preselection only, quarantine that one candidate rather than
  // discarding already-valid independent screening opportunities. Delivery
  // minimum is caller-owned and never reduced. Other call sites remain strict.
  const invalid = next.selected.map(item => ({item,issues:premiseCausalPlanIssues(item)}))
    .filter(entry => entry.issues.length > 0);
  if (!invalid.length) return next;
  const valid = next.selected.filter(item => premiseCausalPlanIssues(item).length === 0);
  if (valid.length < minimumSelectedCount)
    throw new Error('生成前因果索引有效候选不足：'+valid.length+'/'+minimumSelectedCount
      +'；'+invalid.map(({item,issues})=>String(item.premiseId)+': '+issues.join('、')).join('；'));
  return {...next,selected:valid};
}

export function premiseCausalCatalog(item: Record<string, unknown>, prefix: string) {
  return (Array.isArray(item.causalPlan) ? item.causalPlan : []).map((link, index) => ({
    ref: `${prefix}causalPlan[${index}]`, ...link,
  }));
}

/** Output shape only. The placeholder is deliberately not a plausible source ID:
 * the model must select actual addresses from the frozen numbered source pool. */
export function premiseCausalReferenceExample(){
 const placeholder=()=>({sourceRef:'<从本题材真实原池编号表复制>'});
 return [{action:placeholder(),conditions:[placeholder()],result:placeholder()}];
}
export const PREMISE_SOURCE_REFERENCE_DIRECTIVE='本次原池每句由服务器附带完整定位标记[真实ID:分节号:分句号]；单句sourceRef可直接复制完整方括号标记或其中的地址；多句连续区间用同ID、同分节的实际起止句号，只保留一次ID和分节号。仅引用确实出现在下方当前原池目录中的编号，禁止照抄模板占位地址或假设存在某个句号。历史兼容格式中的双端点只在两个端点严格同ID、同分节且原池确有该连续区间时由同一解析器接受；这只是传输容错，不是鼓励模型另造写法，更不得跨分节。不要自行猜测身份、编号或字段。优先仅返回原文中实际行动、条件与结果的sourceRef地址，field由服务器按同一固定映射确定，不重复推测字段名。确需分句内更短原文以分离行动与结果时，允许沿原有{field,quote}逐字引用，不能同时填写sourceRef和quote；field仍须使用服务器分节到字段映射中的实际字段。编号及方括号只属传输定位，服务器从未加编号的原池逐字取回连续原文并验证同一身份、分节、范围与字段。范围不得跨分节，不能引用其它题材或把结果断言当作行动、条件；所有原因果质量判断仍独立执行。';
