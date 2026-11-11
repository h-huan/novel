import { premiseUnmappedOutcomeClaims } from './premise-payoff-review';

/** Source-model STUB only. Tests here exercise routing, batching and category
 * isolation, not the semantic accuracy of an independent payoff reviewer.
 * Real source reviews must supply their own verdict and quoted source proof.
 * The adversarial outcome-coverage tests use actual claim receipts instead. */
export function independentOutcomeStubReceipts(
 selection:{selected:Record<string,any>[]},index:number,
) {
 const prefix='S'+(index+1)+'.';
 return premiseUnmappedOutcomeClaims(selection as any)
   .filter(item=>item.ref.startsWith(prefix))
   .map((_,ordinal)=>({ordinal:ordinal+1,status:'context_only' as const,
     reason:'此项为并发与协议测试的模拟审核结论，不代表生产模型已核实真实结果'}));
}
