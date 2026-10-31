/** Model-proposed entities remain soft candidates until explicitly confirmed.
 * Their only fact source is the independently audited chapter-outline event text. */
export type RollingEntityType='character'|'organization'|'map_point'|'foreshadowing';
export type RollingEntityProposal={type:RollingEntityType;name:string;evidenceQuote:string;chapterNumber:number};
const types=new Set<RollingEntityType>(['character','organization','map_point','foreshadowing']);

export function validateRollingEntityProposals(
  payload:unknown, chapters:readonly any[], globalNumbers:readonly number[],
):RollingEntityProposal[]{
  if(!payload||typeof payload!=='object'||!Array.isArray((payload as any).newEntities))
    throw Error('长篇滚动章纲缺少newEntities新增实体目录，必须明确标记无新增实体');
  const seen=new Set<string>();
  return ((payload as any).newEntities as unknown[]).flatMap(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('滚动实体提案结构无效');
    const row=raw as Record<string,unknown>;
    const type=String(row.type||'') as RollingEntityType;
    const name=String(row.name||'').trim();
    const evidenceQuote=String(row.evidenceQuote||'').trim();
    const chapterNumber=Number(row.chapterNumber);
    const position=globalNumbers.indexOf(chapterNumber);
    if(!types.has(type)||name.length<2||evidenceQuote.length<8||position<0)
      throw Error('滚动实体提案类型、名称、逐字证据或所属全书章号无效');
    if(!evidenceQuote.includes(name)||!String(chapters[position]?.content||'').includes(evidenceQuote))
      throw Error('滚动实体提案必须逐字引用本批已审核的章节事件链，并且包含实体名称');
    const key=type+'\u0000'+name;
    if(seen.has(key))return [];
    seen.add(key);
    return [{type,name,evidenceQuote,chapterNumber}];
  });
}
