/** Insert inside the chapter; original prose and its ending stay byte-identical. */
export function applyChapterLengthInsertions(content: string, value: unknown): string {
  const insertions = (value as any)?.insertions;
  if (!Array.isArray(insertions) || !insertions.length || insertions.length > 12) throw new Error('篇幅补足必须返回1–12个章内插入补丁');
  const edits: Array<{position:number;text:string}> = [];
  const anchors = new Set<string>();
  for (const insertion of insertions) {
    const before = insertion?.before, text = insertion?.text;
    if (typeof before !== 'string' || !before.trim() || typeof text !== 'string' || !text.trim() || anchors.has(before))
      throw new Error('章内插入须提供唯一原文锚点与非空新增文本');
    const position = content.indexOf(before);
    if (position < 0 || content.indexOf(before,position+before.length)>=0) throw new Error('章内插入锚点缺失或重复');
    // Insert before an existing complete paragraph, never append past the ending.
    if (position !== 0 && !/\n\s*\n$/.test(content.slice(0,position))) throw new Error('篇幅补写只能插在既有段落之前');
    anchors.add(before);edits.push({position,text:text.trim()+'\n\n'});
  }
  let result=content;
  for(const edit of edits.sort((a,b)=>b.position-a.position)) result=result.slice(0,edit.position)+edit.text+result.slice(edit.position);
  return result;
}
