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
