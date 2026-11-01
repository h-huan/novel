/** Lossless transport of already-authored pool facts; never a quality verdict. */
export const PREMISE_SOURCE_SECTIONS=['处境触发','主动选择','必要条件','反转兑现','分类流派机制'] as const;
export const SOURCE_BINDING_EXAMPLE={
 protagonistSituation:['处境触发'],openingEvent:['处境触发'],coreConflict:['处境触发'],
 activeChoice:['主动选择'],escalation:['必要条件','反转兑现'],reversalEffect:['反转兑现'],
 payoff:['反转兑现'],irreplaceableCarrier:['处境触发','分类流派机制'],secondOrderConsequence:['反转兑现'],
};
export function materializePremiseSourceBindings(value:any,seed:Record<string,unknown>|undefined):any{
 if(!value||typeof value!=='object'||Array.isArray(value)||value.sourceBindings===undefined)return value;
 if(!seed||String(value.premiseId)!==String(seed.premiseId))throw Error('原池分节引用须绑定真实同ID来源');
 const raw=String(seed.storyCore||''),sections=new Map<string,string>();
 const matches=[...raw.matchAll(/【(处境触发|主动选择|必要条件|反转兑现|分类流派机制)】/g)];
 if(matches.length!==PREMISE_SOURCE_SECTIONS.length||raw.slice(0,matches[0]?.index||0).trim()
  ||matches.some((row,index)=>row[1]!==PREMISE_SOURCE_SECTIONS[index]))throw Error('原池分节必须完整、有序且唯一，不能猜测来源');
 matches.forEach((row,index)=>sections.set(row[1],raw.slice(row.index!+row[0].length,matches[index+1]?.index).trim()));
 const bindings=value.sourceBindings;
 if(!bindings||typeof bindings!=='object'||Array.isArray(bindings))throw Error('sourceBindings须为逐字段原池分节引用');
 const fields=Object.keys(SOURCE_BINDING_EXAMPLE);
 if(Object.keys(bindings).some(field=>!fields.includes(field))||fields.some(field=>!(field in bindings)))throw Error('原池分节引用须覆盖全部事实字段，不能隐藏其它事实字段');
 if(fields.some(field=>field in value))throw Error('原池分节引用不能同时附带另一份改写故事');
 const result={...value};delete result.sourceBindings;
 for(const field of fields){
  const refs=bindings[field];
  if(!Array.isArray(refs)||!refs.length||refs.some((ref:any,index:number)=>!sections.has(ref)
   ||!sections.get(ref)||index>0&&PREMISE_SOURCE_SECTIONS.indexOf(ref)<=PREMISE_SOURCE_SECTIONS.indexOf(refs[index-1])))throw Error('原池分节引用未知、重复或顺序倒置：'+field);
  result[field]=refs.map((ref:string)=>sections.get(ref)).join('\n');
 }
 return result;
}

/** Selection compares immutable stories; projection is a deterministic transport.
 * Historical expanded/bound rows keep their original strict normalizer path.
 * This never builds a causal plan or grants a semantic quality verdict. */
export function projectPremiseSourceChoices(rows:any,pool:readonly Record<string,unknown>[]):any {
 if(!Array.isArray(rows))return rows;
 return rows.map(value=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||value.sourceBindings!==undefined
   ||Object.keys(SOURCE_BINDING_EXAMPLE).some(field=>field in value))return value;
  const allowed=['premiseId','storyCategoryId','readerQuestion','causalPlan'];
  if(Object.keys(value).some(key=>!allowed.includes(key)))throw Error('原池身份选优不能携带额外故事字段');
  const seed=pool.find(item=>item.premiseId===value.premiseId);
  const bound={...value,storyCategoryId:value.storyCategoryId??seed?.storyCategoryId,
   sourceBindings:structuredClone(SOURCE_BINDING_EXAMPLE)};
  materializePremiseSourceBindings(bound,seed); // Same-ID, complete ordered facts.
  return bound;
 });
}
