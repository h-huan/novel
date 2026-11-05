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
 const sections=new Map(premiseSourceSections(seed).map(row=>[row.name,row.text]));
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

/** The same ordered source parser owns rendering, references and projection. */
export function premiseSourceSections(seed:Record<string,unknown>):Array<{section:number;name:string;text:string;clauses:string[]}> {
 const raw=String(seed.storyCore||''),matches=[...raw.matchAll(/【(处境触发|主动选择|必要条件|反转兑现|分类流派机制)】/g)];
 if(matches.length!==PREMISE_SOURCE_SECTIONS.length||raw.slice(0,matches[0]?.index||0).trim()
  ||matches.some((row,index)=>row[1]!==PREMISE_SOURCE_SECTIONS[index]))throw Error('原池分节必须完整、有序且唯一，不能猜测来源');
 return matches.map((row,index)=>{
  const text=raw.slice(row.index!+row[0].length,matches[index+1]?.index).trim();
  // Retain every code unit and punctuation. A range joins only contiguous clauses.
  const clauses=text.match(/[^，,。；;！？!?\n]+[，,。；;！？!?\n]*|[，,。；;！？!?\n]+/gu)||[];
  if(!text||clauses.join('')!==text)throw Error('原池分句未能无损定位');
  return {section:index+1,name:row[1],text,clauses};
 });
}

export function indexedPremiseSourcePool<T extends Record<string,unknown>>(pool:readonly T[]):T[] {
 return pool.map(seed=>{
  try{return {...seed,storyCore:premiseSourceSections(seed).map(row=>'【'+row.name+'｜分节'+row.section+'】'
   +row.clauses.map((text,index)=>'['+String(seed.premiseId)+':'+row.section+':'+(index+1)+']'+text).join('')).join('\n')};}
  catch{return {...seed};} // Legacy unsectioned material retains strict quote validation.
 });
}

/** A sourceRef is an address, never an inferred causal relationship. */
export function resolvePremiseSourceReference(seed:Record<string,unknown>,ref:unknown):string|undefined {
 if(typeof ref!=='string')return;
 // Canonical ID:section:start-end; legacy expanded endpoints resolve only
 // when their owner and section exactly match the first endpoint.
 const match=/^([^:]+):([1-5]):([1-9]\d*)(?:-(?:(?:([^:]+):)?([1-5]):)?([1-9]\d*))?$/.exec(ref);
 if(!match||match[1]!==String(seed.premiseId)
   ||match[4]!==undefined&&match[4]!==match[1]
   ||match[5]!==undefined&&match[5]!==match[2])return;
 try{const section=premiseSourceSections(seed)[Number(match[2])-1],start=Number(match[3]),end=Number(match[6]||match[3]);
  if(end<start||end>section.clauses.length)return;
  return section.clauses.slice(start-1,end).join('');
 }catch{return;}
}

/** Exact server projection proves provenance only. Causality/category/genre and
 * every later full-card Gate remain independent. No model-owned flags are trusted. */
export function exactPremiseSourceFields(candidate:Record<string,unknown>,seed:Record<string,unknown>|undefined):ReadonlySet<string> {
 if(!seed||candidate.premiseId!==seed.premiseId||candidate.storyCore!==seed.storyCore)return new Set();
 try{const expected=materializePremiseSourceBindings({premiseId:seed.premiseId,sourceBindings:SOURCE_BINDING_EXAMPLE},seed);
  return new Set(Object.keys(SOURCE_BINDING_EXAMPLE).filter(field=>candidate[field]===expected[field]));
 }catch{return new Set();}
}

/** Recover the canonical field for ONE explicitly numbered source span.
 * Several fixed fields may contain that same source section. These are
 * projections of one address, not competing evidence or a causal inference.
 * Changed/legacy fields cannot establish this exact projection proof. */
export function resolvePremiseSourceAnchor(candidate:Record<string,unknown>,ref:unknown):{field:string;quote:string}|undefined {
 const quote=resolvePremiseSourceReference(candidate,ref);
 if(!quote)return;
 // The codec above has already checked owner, section and contiguous bounds.
 const section=PREMISE_SOURCE_SECTIONS[Number(String(ref).split(':')[1])-1];
 const exact=exactPremiseSourceFields(candidate,candidate);
 const fields=(Object.keys(SOURCE_BINDING_EXAMPLE) as Array<keyof typeof SOURCE_BINDING_EXAMPLE>)
  .filter(field=>exact.has(field)&&(SOURCE_BINDING_EXAMPLE[field] as readonly string[]).includes(section)
    &&String(candidate[field]).includes(quote));
 const field=fields.find(field=>SOURCE_BINDING_EXAMPLE[field].length===1)||fields[0];
 return field?{field,quote}:undefined;
}

export function compactRepeatedPremiseText(row:Record<string,unknown>){
 const first=new Map<string,string>();
 return Object.fromEntries(Object.entries(row).map(([field,value])=>{
   if(typeof value!=='string')return [field,value];
   const previous=first.get(value),reference=previous?{sameTextAs:previous}:undefined;
   if(reference&&JSON.stringify(reference).length<JSON.stringify(value).length)return [field,reference];
   if(!previous)first.set(value,field);
   return [field,value];
 }));
}

export function projectedPremisePromptView(item:Record<string,unknown>){
 const view=compactRepeatedPremiseText(item);
 for(const field of exactPremiseSourceFields(item,item))view[field]={fromSourceSections:SOURCE_BINDING_EXAMPLE[field as keyof typeof SOURCE_BINDING_EXAMPLE]};
 return view;
}
