interface ChapterDb {
  prepare(sql: string): { get(...args: any[]): any; all(...args: any[]): any[] };
}

/** One source projection for creation review and the outline consumed by prose generation. */
const STORY_RECORD_METADATA = new Set(['id','project_id','level','parent_id','order','status','created_at',
  'updated_at','actual_words','volume_index','chapter_index','source_chapter_id','source_run_id',
  'locked','locked_at','author_confirmed','author_confirmed_at']);
export function storySourceFields(row: any): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row || {}).filter(([field]) => !STORY_RECORD_METADATA.has(field)));
}
export function chapterOutlineStorySource(row: any): Record<string, unknown> {
  return storySourceFields(row);
}

/** Expand sibling positions into a global story sequence, including multiple volumes. */
export function readOrderedChapterOutlines(db: ChapterDb, projectId: string): any[] {
  return db.prepare(`SELECT o.* FROM outlines o LEFT JOIN outlines p ON p.id=o.parent_id AND p.project_id=o.project_id
    WHERE o.project_id=? AND o.level='chapter'
    ORDER BY COALESCE(p."order",0), o."order", o.id`).all(projectId);
}

/** A persisted chapter binding is authoritative. No zero/one-origin guessing. */
export function findChapterOutline(db: ChapterDb, projectId: string, chapterIndex: number, chapterId?: string): any {
  if (!Number.isSafeInteger(chapterIndex) || chapterIndex < 1) return undefined;
  const linked = db.prepare(`SELECT o.* FROM chapters c JOIN outlines o ON o.id=c.outline_id AND o.project_id=c.project_id
    WHERE c.project_id=? AND ${chapterId ? 'c.id=?' : 'c.chapter_index=?'} AND o.level='chapter' LIMIT 1`)
    .get(projectId, chapterId || chapterIndex);
  if (linked) return linked;
  // A chapter row with an invalid outline_id must NOT silently borrow the
  // neighbouring chapter's plan merely because their sort positions match.
  // The positional fallback is only for the outline editor before any
  // chapter row with this number exists.
  if (chapterId) throw new Error('当前章节没有有效的章纲绑定，停止生成，禁止按排序猜测另一章');
  const existingChapter = db.prepare('SELECT id,outline_id FROM chapters WHERE project_id=? AND chapter_index=? LIMIT 1')
    .get(projectId, chapterIndex);
  if (existingChapter) throw new Error('第' + chapterIndex + '章的已有正文记录与章纲绑定失效，禁止按章节排序借用另一章章纲');
  return readOrderedChapterOutlines(db, projectId)[chapterIndex - 1];
}

/** Display/depth columns are projections of accepted events, never another story generator. */
export function projectOutlineDepthFields(row:any):Record<string,string>|null{
  let plan:any=row.scenes;try{if(typeof plan==='string')plan=JSON.parse(plan);}catch{return null;}
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||!Array.isArray(plan.scenes))return null;
  const type=String(row.chapter_function||plan.chapterFunction||plan.responsibilityContract?.function||'');
  if(!type)return null;
  const text=(v:unknown):string=>v==null?'':typeof v==='string'?v:JSON.stringify(v);
  const locations=[...new Set(plan.scenes.map((scene:any)=>typeof scene==='string'?scene:scene?.location||scene?.name||'').filter(Boolean))];
  const highlights=plan.highlights??plan.highlight??[];
  return {chapter_type:type,pov_ratio:text(plan.pov_ratio??plan.povRatio),
    hot_scenes:text(plan.hot_scenes??plan.hotScenes??highlights),setback_scenes:text(plan.setback_scenes??plan.setbackScenes),
    ending_setup:text(plan.hook),conflict_design:text(plan.conflicts??plan.conflict),
    system_hints:text(plan.system_hints??plan.systemHints),location_summary:locations.join(' → '),
    highlight_points:JSON.stringify(Array.isArray(highlights)?highlights:highlights?[highlights]:[])};
}
