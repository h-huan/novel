/** Depth enrichment describes existing setups/payoffs; it cannot choose a new ending. */
export function foreshadowEnrichmentSources(foreshadowings: readonly any[], orderedChapters: readonly any[]) {
  const chapters = new Set<number>();
  const sources = foreshadowings.map(row => {
    for (const value of [row.buried_chapter_index,row.planned_recovery_chapter_index])
      if (Number.isInteger(value) && value > 0) chapters.add(value);
    return { id:row.id, content:row.content, buriedChapter:row.buried_chapter_index,
      recoveryChapter:row.planned_recovery_chapter_index, evidenceText:row.evidence_text,
      recoveryCondition:row.recovery_condition, payoffDescription:row.payoff_description };
  });
  return { foreshadowings:sources, chapterSources:orderedChapters.flatMap((row,index)=>{
    const chapterNumber=index+1;
    if (!chapters.has(chapterNumber)) return [];
    const raw = row.plan_json || row.scenes;
    let plan=raw;try { if (typeof raw==='string') plan=JSON.parse(raw); } catch { /* Preserve the original source. */ }
    return [{chapterNumber,id:row.id,title:row.title,content:row.content,plan}];
  }) };
}

/** Validate the existing enrichment output BEFORE saving it to Canon.
 * revealStage is a stage label, never a second narration of what happened:
 * a contradictory factual sentence there previously survived until the final
 * cross-module review and exhausted both allowed creation repairs. This checks
 * structure only; the original semantic Gate still verifies factual fidelity. */
export function foreshadowEnrichmentOutputIssues(value:unknown, originals:readonly {id:string}[]):string[]{
 const rows=(value as any)?.foreshadowings;
 if(!Array.isArray(rows))return ['伏笔深度输出缺少foreshadowings数组'];
 const expected=new Set(originals.map(row=>String(row.id)));
 const seen=new Set<string>(),issues:string[]=[];
 for(const row of rows){
  const id=String(row?.id||'');
  if(!expected.has(id)||seen.has(id)){issues.push('伏笔深度存在未知或重复id：'+id);continue;}
  seen.add(id);
  if(typeof row.emotional_impact!=='string'||!row.emotional_impact.trim())issues.push(id+' 缺少实际情感影响');
  if(!Array.isArray(row.layered_reveal)) {issues.push(id+' layered_reveal不是数组');continue;}
  for(const [index,layer] of row.layered_reveal.entries()){
   const stage=typeof layer?.revealStage==='string'?layer.revealStage.trim():'';
   const detail=typeof layer?.content==='string'?layer.content.trim():'';
   if(!stage||stage.length>40||/[，。！？；：\n\r]/u.test(stage))
    issues.push(id+' layered_reveal['+index+'].revealStage须为简短阶段标签，不能放入剧情事实或事件句');
   if(!detail)issues.push(id+' layered_reveal['+index+'].content缺少实际揭示内容');
  }
 }
 for(const id of expected)if(!seen.has(id))issues.push('缺少既有伏笔深度条目：'+id);
 return issues;
}
