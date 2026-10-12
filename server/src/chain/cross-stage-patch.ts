import { chooseMinimumImpactRepair, type CanonRepairCandidate, type CanonSourceType } from '../modules/canon/canon-policy';
import { sourceBoundaryRiskKinds } from '../modules/writing-quality/source-quality-review';

/**
 * Cross-stage repair is a candidate transformation boundary, not a persistence API.
 * The caller must apply patches to an in-memory candidate, re-review that candidate,
 * and only then persist the exact reviewed values with optimistic old-value checks.
 */
export const CROSS_STAGE_PATCH_TABLE_MAP: Readonly<Record<string, string>> = Object.freeze({
  character: 'characters',
  organization: 'organizations',
  mapPoint: 'map_points',
  chapter: 'outlines',
  foreshadowing: 'foreshadowings',
});

export const CROSS_STAGE_MUTABLE_ENTITY_TYPES = Object.freeze(Object.keys(CROSS_STAGE_PATCH_TABLE_MAP));

interface RepairAnchor {
  id:string; entityType:string; entityId:string; field:string; value:string;
  path?:Array<string|number>; start?:number; end?:number;
}
/** Position ownership stays on the server; the model never transcribes old JSON. */
export function crossStageRepairAnchors(bundle:Record<string,any[]>,targetIds:readonly string[]):RepairAnchor[] {
  const anchors:RepairAnchor[]=[];
  const types:Record<string,string>={characters:'character',organizations:'organization',mapPoints:'mapPoint',chapters:'chapter',foreshadowings:'foreshadowing'};
  for(const [key,type] of Object.entries(types))for(const row of bundle[key]||[]){
    if(!targetIds.includes(row.id))continue;
    for(const [field,value] of Object.entries(row)){
      if(['id','project_id','chapterIndex','level','created_at','updated_at'].includes(field))continue;
      const add=(part:Omit<RepairAnchor,'id'|'entityType'|'entityId'|'field'>)=>anchors.push({id:'E'+(anchors.length+1),entityType:type,entityId:row.id,field,...part});
      if(typeof value==='number'){if(type==='foreshadowing'&&['buried_chapter_index','planned_recovery_chapter_index'].includes(field))add({value:String(value)});continue;}
      if(typeof value!=='string')continue;
      let parsed:any;try{parsed=JSON.parse(value);}catch{}
      if(parsed&&typeof parsed==='object'){
        const visit=(node:any,path:Array<string|number>)=>{
          if(typeof node==='string')add({value:node,path});
          else if(node&&typeof node==='object')for(const [child,item] of Object.entries(node))visit(item,[...path,Array.isArray(node)?Number(child):child]);
        };visit(parsed,[]);
      }else{
        let start=0;for(const part of value.split('\n')){add({value:part,start,end:start+part.length});start+=part.length+1;}
      }
    }
  }
  return anchors;
}
export function materializeCrossStageRepairEdits(value:any,anchors:RepairAnchor[],bundle:Record<string,any[]>) {
  if(!Array.isArray(value?.edits)||!value.edits.length||value.edits.length>64)throw Error('edits须包含1-64个已有位置编号修订');
  const seen=new Set<string>(),groups=new Map<string,Array<{anchor:RepairAnchor;replacement:string;reason:string}>>();
  for(const edit of value.edits){
    const anchor=anchors.find(item=>item.id===edit?.anchorId);
    if(!anchor||seen.has(anchor.id)||typeof edit.replacement!=='string'||!edit.replacement.trim())throw Error('修订编号无效、重复或新值为空：'+String(edit?.anchorId));
    seen.add(anchor.id);
    // Unchanged positions are harmless context, not mutations. Do not discard
    // actual dependent edits or spend another model call copying them again.
    if(edit.replacement===anchor.value)continue;
    const key=anchor.entityType+':'+anchor.entityId+':'+anchor.field;
    if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push({anchor,replacement:edit.replacement,reason:String(edit.reason||'必要条件修订')});
  }
  if(!groups.size)throw Error('候选没有实际变化，停止重复修订');
  const patches:any[]=[];
  for(const edits of groups.values()){
    const first=edits[0].anchor,row=Object.values(bundle).flat().find(item=>item.id===first.entityId),original=row?.[first.field];
    let replacement:string;
    if(edits.every(edit=>edit.anchor.path)){
      const parsed=JSON.parse(original);
      for(const {anchor,replacement:next} of edits){let parent=parsed;const path=anchor.path!;
        for(const key of path.slice(0,-1))parent=parent[key];const key=path.at(-1)!;
        if(parent[key]!==anchor.value)throw Error('修订位置原值已变化：'+anchor.id);parent[key]=next;
      }replacement=JSON.stringify(parsed);
    }else if(typeof original==='number')replacement=edits[0].replacement;
    else{
      replacement=original;
      for(const {anchor,replacement:next} of edits.sort((a,b)=>b.anchor.start!-a.anchor.start!)){
        if(original.slice(anchor.start,anchor.end)!==anchor.value)throw Error('修订位置原值已变化：'+anchor.id);
        replacement=replacement.slice(0,anchor.start)+next+replacement.slice(anchor.end);
      }
    }
    patches.push({entityType:first.entityType,entityId:first.entityId,field:first.field,match:String(original),replacement,reason:edits.map(edit=>edit.reason).join('；')});
  }
  const result={patches},errors=describeCrossStagePatchValidation(result,bundle);if(errors.length)throw Error(errors.join('；'));
  return result;
}
/** Send source values once; internal coordinates and repeated entity metadata stay local. */
export function crossStageRepairAnchorView(anchors:RepairAnchor[]) {
  const groups=new Map<string,{entityType:string;entityId:string;fields:Record<string,unknown[]>}>();
  for(const anchor of anchors){const key=anchor.entityType+':'+anchor.entityId;
    if(!groups.has(key))groups.set(key,{entityType:anchor.entityType,entityId:anchor.entityId,fields:{}});
    const group=groups.get(key)!;if(!group.fields[anchor.field])group.fields[anchor.field]=[];
    group.fields[anchor.field].push([anchor.id,anchor.path||[],anchor.value]);
  }return [...groups.values()];
}
/** Diagnose with source-unit IDs, edit with stable server-owned positions.
 * Selection never truncates a value or changes coordinates; full candidate
 * review still covers every field, including positions omitted here. */
export function crossStageRepairDiagnosticPositions(anchors:RepairAnchor[],targets:readonly {id:string;chapterId:string;content:string}[],findings:readonly string[]) {
  const cited=targets.filter(target=>findings.some(finding=>finding.includes(target.id)));
  const positions=cited.map(target=>{
    const path=target.id.slice((target.chapterId+'-B-').length).replace(/-\d+$/,'');
    const sameField=anchors.filter(anchor=>anchor.entityId===target.chapterId
      &&(anchor.path?[anchor.field,...anchor.path].join('.')===path:anchor.field===path));
    const exact=sameField.filter(anchor=>anchor.value.includes(target.content));
    return {sourceUnit:target.id,anchorIds:(exact.length?exact:sameField).map(anchor=>anchor.id),claim:target.content};
  });
  return positions;
}
export function crossStageRepairFocusedAnchors(anchors:RepairAnchor[],targets:readonly {id:string;chapterId:string;content:string}[],findings:readonly string[]) {
  const positions=crossStageRepairDiagnosticPositions(anchors,targets,findings);
  if(!positions.length||positions.some(position=>!position.anchorIds.length))return anchors;
  const ids=new Set(positions.flatMap(position=>position.anchorIds));
  const kinds=new Set(targets.filter(target=>positions.some(position=>position.sourceUnit===target.id)).flatMap(target=>sourceBoundaryRiskKinds(target.content)));
  const related=targets.filter(target=>sourceBoundaryRiskKinds(target.content).some(kind=>kinds.has(kind)));
  for(const position of crossStageRepairDiagnosticPositions(anchors,related,related.map(target=>target.id)))for(const id of position.anchorIds)ids.add(id);
  // All affected chapter action chains stay available for causal replacement,
  // not merely the faulty conclusion or one copied projection.
  return anchors.filter(anchor=>ids.has(anchor.id)||(anchor.entityType==='chapter'&&anchor.field==='content'));
}

/** Read-only current dependencies, including preceding proposals from this round.
 * Values are transmitted once; this view grants neither edit rights nor abilities. */
export function crossStageRepairDependencyView(bundle:Record<string,any[]>,targetIds:readonly string[],proposals:readonly any[]=[]) {
  const working=structuredClone(bundle);
  for(const patch of proposals){
    const row=Object.values(working).flat().find(item=>item.id===patch.entityId);
    if(!row||isImmutableWorldPatchTarget(patch.entityType))throw Error('依赖候选目标无效');
    const next=applyCrossStageFieldPatch(row[patch.field],patch.match,patch.replacement);
    if(next===null)throw Error('依赖候选不是当前字段版本');
    row[patch.field]=next;
  }
  const ids=Object.values(working).flat().map(row=>row.id).filter(id=>!targetIds.includes(id));
  const entities:Array<{ref:string;entityType:string;entityId:string}>=[],entityRefs=new Map<string,string>();
  const values=new Map<string,{text:string;references:Array<[string,string]>}>();
  for(const anchor of crossStageRepairAnchors(working,ids)){
    const key=anchor.entityType+':'+anchor.entityId;
    if(!entityRefs.has(key)){const ref='D'+(entities.length+1);entityRefs.set(key,ref);entities.push({ref,entityType:anchor.entityType,entityId:anchor.entityId});}
    if(!values.has(anchor.value))values.set(anchor.value,{text:anchor.value,references:[]});
    const references=values.get(anchor.value)!.references,ref=entityRefs.get(key)!;
    if(!references.some(item=>item[0]===ref&&item[1]===anchor.field))references.push([ref,anchor.field]);
  }
  return {entities,values:[...values.values()]};
}

/** A proposal view only. Validation and candidate review keep the full bundle;
 * repair calls need the cited neighborhoods rather than unrelated chapter text. */
export function crossStageRepairContext(bundle:Record<string,any[]>,findings:string[]) {
  const text=findings.join('\n'),quotes=[...text.matchAll(/[“"]([^”"\n]{8,500})[”"]/g)].map(match=>match[1]);
  const mutable=new Set(['characters','organizations','mapPoints','chapters','foreshadowings']);
  const referenced=new Set(Object.entries(bundle).filter(([key])=>mutable.has(key)).flatMap(([key,rows])=>rows.filter((row,index)=>
    text.includes(row.id)||text.includes(`${key}[${index}]`)).map(row=>row.id)));
  return Object.fromEntries(Object.entries(bundle).map(([key,rows])=>[key,!mutable.has(key)?rows:
    rows.filter(row=>!referenced.size||referenced.has(row.id)).map(row=>Object.fromEntries(Object.entries(row).map(([field,value])=>{
      if(typeof value!=='string'||['id','title','name'].includes(field))return [field,value];
      const spans=quotes.flatMap(quote=>{const at=value.indexOf(quote);return at<0?[]:[{start:Math.max(0,at-200),end:Math.min(value.length,at+quote.length+200)}];}).sort((a,b)=>a.start-b.start);
      const merged:Array<{start:number;end:number}>=[];
      for(const span of spans){const last=merged.at(-1);if(last&&span.start<=last.end)last.end=Math.max(last.end,span.end);else merged.push({...span});}
      return [field,merged.length?merged.map(span=>value.slice(span.start,span.end)).join('\n【另一处实际原文片段】\n'):value];
    }))) ]));
}

/** Keep findings that share a target together; separate independent targets.
 * Unknown references retain the original full request rather than dropping a finding.
 * All batches are proposals; the caller must review their combined full candidate. */
export function crossStageRepairRequests(bundle:Record<string,any[]>,findings:string[]) {
  const mutable=new Set(['characters','organizations','mapPoints','chapters','foreshadowings']);
  const entities=Object.entries(bundle).filter(([key])=>mutable.has(key)).flatMap(([key,rows])=>
    rows.map((row,index)=>({id:row.id,text:Object.values(row).filter(value=>typeof value==='string').join('\n'),reference:`${key}[${index}]`,namedReferences:[
      ...(typeof row.name==='string'&&row.name?[`${key}[${row.name}]`]:[]),
      ...(typeof row.chapterIndex==='number'?[`${key}[chapterIndex=${row.chapterIndex}]`]:[]),
    ]})));
  const groups:Array<{findings:string[];targetIds:string[]}>=[];
  for(const finding of findings){
    // Reviewers may cite UUID prefixes. Resolve only unambiguous complete tokens;
    // ambiguous or missing references keep the existing full-scope fallback.
    const tokens=finding.match(/\b[0-9a-f]{8}(?:-[0-9a-f-]+)?\b/gi)||[];
    const prefixIds=tokens.flatMap(token=>{
      const matches=entities.filter(entity=>typeof entity.id==='string'&&entity.id.toLowerCase().startsWith(token.toLowerCase()));
      return matches.length===1?[matches[0].id]:[];
    });
    const targetIds=entities.filter(entity=>finding.includes(entity.id)||finding.includes(entity.reference)||entity.namedReferences.some(ref=>finding.includes(ref))||prefixIds.includes(entity.id)).map(entity=>entity.id);
    // Opening knowledge is produced by the preceding chapter. Keeping that
    // producer read-only leaves only a downstream wording change available.
    // Include its plan, never a saved body or an immutable world mechanism.
    if(/characterStates\.\d+\.stateBefore|前序认知/.test(finding)){
      const directTargets=new Set(targetIds);
      for(const row of bundle.chapters||[]){
        if(!directTargets.has(row.id)||!Number.isInteger(row.chapterIndex)||row.chapterIndex<2)continue;
        const previous=(bundle.chapters||[]).filter(item=>item.chapterIndex===row.chapterIndex-1);
        if(previous.length===1&&!targetIds.includes(previous[0].id))targetIds.push(previous[0].id);
      }
    }
    // A source finding may cite only one projection. Exact shared stretches of
    // that actual claim identify its other mutable projections; a repair must
    // be allowed to change the plan, rather than merely restate its bad method
    // in the cited summary. Never route from the rule quotation or a short name.
    const claims=[...finding.matchAll(/\| (?:正文|行动|结果):\s*([\s\S]*?)(?=\s*\| (?:结果|来源|章纲):|$)/g)].map(match=>match[1]);
    if(claims.length&&targetIds.length){
      const spans=claims.flatMap(claim=>claim.length<24?(claim.length>=8?[claim]:[]):Array.from({length:claim.length-23},(_,index)=>claim.slice(index,index+24)))
        .filter(span=>span.trim().length===span.length&&!/[\r\n]/.test(span));
      for(const entity of entities)if(!targetIds.includes(entity.id)&&spans.some(span=>entity.text.includes(span)))targetIds.push(entity.id);
    }
    // Character profiles can repeat a planned result with different wording.
    // Join only named actors in the cited plan and the same mechanism family;
    // rule quotations alone never create this edge. The combined candidate
    // still goes through source, stage and persistence gates.
    const kinds=new Set(claims.flatMap(sourceBoundaryRiskKinds));
    if(kinds.size){
      // A book/volume summary can repeat a named chapter's result using
      // different words. Exact shared stretches cannot discover that edge.
      // Require both its explicit chapter title and the same risk family;
      // no world source or unrelated summary becomes a mutable target.
      const summaries=(bundle.chapters||[]).filter(row=>['book','volume'].includes(row.level));
      const hasRelatedRisk=(row:any)=>Object.values(row).some(value=>typeof value==='string'
        &&sourceBoundaryRiskKinds(value).some(kind=>kinds.has(kind)));
      for(const chapter of bundle.chapters||[]){
        if(!Number.isInteger(chapter.chapterIndex)||typeof chapter.title!=='string'||chapter.title.trim().length<2)continue;
        for(const summary of summaries){
          if(!Object.values(summary).some(value=>typeof value==='string'&&value.includes(chapter.title)))continue;
          if(targetIds.includes(chapter.id)&&!targetIds.includes(summary.id)&&hasRelatedRisk(summary))targetIds.push(summary.id);
          else if(targetIds.includes(summary.id)&&!targetIds.includes(chapter.id)&&hasRelatedRisk(chapter))targetIds.push(chapter.id);
        }
      }
      const plans=(bundle.chapters||[]).filter(row=>targetIds.includes(row.id));
      // A corrected producer may change the next chapter's carried knowledge.
      // Include a consumer only when its opening state repeats this risk family.
      for(const producer of plans){
        if(!Number.isInteger(producer.chapterIndex))continue;
        const next=(bundle.chapters||[]).find(row=>row.chapterIndex===producer.chapterIndex+1);
        if(!next||targetIds.includes(next.id))continue;
        let scenes:any=next.scenes;try{if(typeof scenes==='string')scenes=JSON.parse(scenes);}catch{continue;}
        if(Array.isArray(scenes?.characterStates)&&scenes.characterStates.some((state:any)=>typeof state.stateBefore==='string'
          &&sourceBoundaryRiskKinds(state.stateBefore).some(kind=>kinds.has(kind))))targetIds.push(next.id);
      }
      for(const character of bundle.characters||[]){
        if(typeof character.name!=='string'||character.name.length<2||targetIds.includes(character.id))continue;
        if(!plans.some(row=>Object.values(row).some(value=>typeof value==='string'&&value.includes(character.name))))continue;
        if(Object.values(character).some(value=>typeof value==='string'&&sourceBoundaryRiskKinds(value).some(kind=>kinds.has(kind))))targetIds.push(character.id);
      }
    }
    // Positions must always be derived from complete source fields. A finding
    // without an ID may broaden targets, but must never change their coordinates
    // by replacing the source with quoted neighborhoods.
    if(!targetIds.length)return [{findings:[...findings],targetIds:entities.map(entity=>entity.id),context:bundle,connected:false}];
    const related=groups.filter(group=>group.targetIds.some(id=>targetIds.includes(id)));
    const merged={findings:[finding,...related.flatMap(group=>group.findings)],targetIds:[...new Set([...targetIds,...related.flatMap(group=>group.targetIds)])]};
    for(const group of related)groups.splice(groups.indexOf(group),1);
    groups.push(merged);
  }
  // Each request is already limited to its connected targets. Keep every field
  // of those targets so equivalent statements and dependent beats are repaired
  // together; quoted neighborhoods alone omitted other contradictory clauses.
  return groups.map(group=>({...group,connected:true,context:Object.fromEntries(Object.entries(bundle).map(([key,rows])=>
    [key,mutable.has(key)?rows.filter(row=>group.targetIds.includes(row.id)):rows]))}));
}


export function isImmutableWorldPatchTarget(entityType: unknown): boolean {
  return entityType === 'world' || entityType === 'worldProfile';
}

export interface CrossStagePatchProposal {
  entityType: string;
  entityId: string;
  field: string;
  match: string;
  replacement: string;
  reason?: string;
  dependentCount?: number;
  /** Only explicitly declared mutually exclusive variants enter cost selection. */
  alternativeGroup?: string;
}

function repairSourceType(entityType: string): CanonSourceType | null {
  switch (entityType) {
    case 'character': return 'character';
    case 'chapter': return 'chapter_plan';
    case 'foreshadowing': return 'foreshadowing';
    // 组织和地点属于当前世界中的派生状态，不具备修改世界观本身的权限。
    case 'organization':
    case 'mapPoint': return 'state';
    default: return null;
  }
}

/**
 * 原因相同的跨实体修改仍是同一方案的必要依赖，一起保留。
 * 只有显式标记互斥备选组时才选择最小成本目标，其字段一起保留。
 */
export function selectMinimumImpactCrossStagePatches(
  proposals: readonly CrossStagePatchProposal[],
): CrossStagePatchProposal[] {
  const grouped = new Map<string, CrossStagePatchProposal[]>();
  for (const proposal of proposals) {
    if (isImmutableWorldPatchTarget(proposal.entityType)) continue;
    const sourceType = repairSourceType(proposal.entityType);
    if (!sourceType) continue;
    const reason = String(proposal.alternativeGroup || '').trim();
    const group = grouped.get(reason) || [];
    group.push(proposal);
    grouped.set(reason, group);
  }

  const selected: CrossStagePatchProposal[] = [];
  for (const [alternativeGroup,group] of grouped) {
    // Equal reasons are ordinary dependencies, not proof of alternatives.
    if(!alternativeGroup){selected.push(...group);continue;}
    const byTarget = new Map<string, { patches: CrossStagePatchProposal[]; candidate: CanonRepairCandidate }>();
    for (const proposal of group) {
      const sourceType = repairSourceType(proposal.entityType);
      if (!sourceType) continue;
      const key = `${proposal.entityType}:${proposal.entityId}`;
      const existing = byTarget.get(key);
      if (existing) {
        existing.patches.push(proposal);
        existing.candidate.changeUnits = existing.patches.length;
        existing.candidate.dependentCount = Math.max(
          Number(existing.candidate.dependentCount || 0),
          Math.max(0, Number(proposal.dependentCount || 0)),
        );
      } else {
        byTarget.set(key, {
          patches: [proposal],
          candidate: {
            sourceType,
            sourceId: proposal.entityId,
            temporalState: 'future_plan',
            dependentCount: Math.max(0, Number(proposal.dependentCount || 0)),
            changeUnits: 1,
          },
        });
      }
    }
    const targets = [...byTarget.values()];
    const decision = chooseMinimumImpactRepair(targets.map(item => item.candidate));
    if (!decision.target) continue;
    const winner = targets.find(item => item.candidate === decision.target);
    if (winner) selected.push(...winner.patches);
  }
  return selected;
}

/**
 * Pure candidate patcher. It never writes Canon.
 * - match must occur exactly once;
 * - JSON text that was valid before must remain valid after replacement;
 * - malformed/ambiguous patches are rejected with null.
 */
export function applyCrossStagePatch(original: string, match: string, replacement: string): string | null {
  if (typeof original !== 'string' || typeof match !== 'string' || typeof replacement !== 'string') return null;
  if (!match.length || original === replacement) return null;
  const first = original.indexOf(match);
  if (first < 0 || original.indexOf(match, first + match.length) >= 0) return null;
  const candidate = `${original.slice(0, first)}${replacement}${original.slice(first + match.length)}`;
  if (candidate === original) return null;

  const trimmed = original.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      JSON.parse(original);
    } catch {
      // 原字段本来就不是有效 JSON 时，不额外宣称 JSON 约束。
      return candidate;
    }
    try {
      JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  return candidate;
}

/** Remove only the exact server-owned directive; preserve fictional hierarchy facts. */
export function storyHierarchyForAudit(value: unknown, policy: string): string {
  return String(value ?? '').split(policy).join('').trim();
}

/** Remove a byte-identical duplicate, never summarize or discard unique confirmed facts. */
export function canonicalBriefForAudit(brief: string): string {
  const value = JSON.parse(brief);
  if (value?.confirmedStory && value?.projectCard?.confirmedStory
    && JSON.stringify(value.confirmedStory) === JSON.stringify(value.projectCard.confirmedStory)) {
    delete value.projectCard.confirmedStory;
  }
  return JSON.stringify(value);
}

export function applyCrossStageFieldPatch(original: string | number, match: string, replacement: string): string | number | null {
  if (typeof original === 'string') return applyCrossStagePatch(original, match, replacement);
  if (!Number.isSafeInteger(original) || match !== String(original) || !/^(0|[1-9]\d*)$/.test(replacement)) return null;
  const next = Number(replacement);
  return Number.isSafeInteger(next) && next !== original ? next : null;
}

const PATCH_BUNDLE_KEYS: Record<string, string> = {
  character: 'characters', organization: 'organizations', mapPoint: 'mapPoints', chapter: 'chapters', foreshadowing: 'foreshadowings',
};

export function describeCrossStagePatchValidation(value: any, bundle: Record<string, any[]>): string[] {
  if (!Array.isArray(value?.patches) || !value.patches.length || value.patches.length > 24) return ['patches必须包含1-24个补丁'];
  const issues: string[] = [];
  for (const [index,patch] of value.patches.entries()) {
    const target=`patches[${index}] ${String(patch?.entityType)}:${String(patch?.entityId)}.${String(patch?.field)}`;
    if (isImmutableWorldPatchTarget(String(patch?.entityType || ''))) {
      issues.push(`世界观 Canon 已冻结，禁止补丁目标 ${patch.entityType}.${String(patch.field || '')}；资料冗余须重新分类为建议，真实冲突只能修订允许的下层实体`);
      continue;
    }
    const rows = bundle[PATCH_BUNDLE_KEYS[patch?.entityType]];
    const row = rows?.find(item => item.id === patch?.entityId);
    const original = row?.[patch?.field];
    if (!row || !Object.hasOwn(row, patch?.field) || ['id', 'chapterIndex'].includes(patch.field)) {
      issues.push(`${target}：补丁目标必须是当前资料中的可修实体id和真实字段名，禁止世界观目标或中文内容标签`);
      continue;
    }
    if (typeof patch.match !== 'string' || typeof patch.replacement !== 'string' || !patch.replacement.trim()
      || (typeof original !== 'string' && typeof original !== 'number')
      || applyCrossStageFieldPatch(original, patch.match, patch.replacement) === null) {
      const matches=typeof original==='string'&&typeof patch.match==='string'&&patch.match.length
        ?original.split(patch.match).length-1:null;
      issues.push(`${target}：${matches===0?'match在该字段不存在，须逐字复制该字段实际原文，不得从另一字段或审查摘要拼句':matches!==null&&matches>1?`match在该字段出现${matches}次，须增加真实相邻原文使其唯一`:'补丁必须精确匹配唯一原文且保持JSON；数值字段使用完整旧值与新整数的字符串'}`);
    }
    if (typeof original === 'number' && (patch.entityType !== 'foreshadowing'
      || !['buried_chapter_index', 'planned_recovery_chapter_index'].includes(patch.field)
      || Number(patch.replacement) < 1 || Number(patch.replacement) > bundle.chapters.length)) {
      issues.push(`仅允许修订伏笔章节序号，使用从1开始的故事章节号（第一章=1），范围1-${bundle.chapters.length}；不得按数据库order减1或改为0`);
    }
  }
  return [...new Set(issues)];
}
