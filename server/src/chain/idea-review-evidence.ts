/** Evidence is selected from server-owned narrative fields, never generated or guessed. */
export interface IdeaEvidenceEntry { id: string; position: number; field: string; quote: string }
const fields = ['title','hook','description','setting','protagonist','coreConflict','mainReversal','ending','scopeBreakdown'] as const;
export function ideaReviewEvidenceCatalog(cards: readonly any[]): IdeaEvidenceEntry[] {
  const entries: IdeaEvidenceEntry[]=[];
  const visit=(value: unknown, position: number, field: string) => {
    if(typeof value==='string' && value.trim()) entries.push({id:'C'+position+'.'+field,position,field,quote:value});
    else if(Array.isArray(value)) value.forEach((part,index)=>visit(part,position,field+'['+index+']'));
    else if(value && typeof value==='object') Object.entries(value).forEach(([key,part])=>visit(part,position,field+'.'+key));
  };
  cards.forEach((card,index)=>fields.forEach(field=>visit(card?.[field],index+1,field)));
  return entries;
}
/** A bad supplied reference cannot fall back to a plausible-looking generated quote. */
export function resolveIdeaReviewEvidence(value: any, cards: readonly any[]): any {
  if(!Array.isArray(value?.reviews)) return value;
  const catalog=ideaReviewEvidenceCatalog(cards);
  const resolve=(row:any,ref:unknown,storyOnly=false) => {
    const entry=catalog.find(item=>item.id===ref && item.position===row.position);
    if(!entry || (storyOnly && !['hook','description','setting','ending','scopeBreakdown'].some(field=>entry.field===field || entry.field.startsWith(field+'.') || entry.field.startsWith(field+'[')))) return '';
    return entry.quote;
  };
  return {...value,reviews:value.reviews.map((row:any)=>{
    if(!row || typeof row!=='object') return row;
    const next={...row};
    for(const field of ['storyEvidence','payoffEvidence','platformEvidence']) {
      if(row[field+'Ref']!==undefined) next[field]=resolve(row,row[field+'Ref'],true);
    }
    if(row.readerGoals && typeof row.readerGoals==='object') {
      next.readerGoals={...row.readerGoals};
      for(const key of ['click','completion','sharing','immersion']) {
        const goal=row.readerGoals[key];
        if(goal && goal.evidenceRef!==undefined) next.readerGoals[key]={...goal,quote:resolve(row,goal.evidenceRef)};
        else if(goal?.status==='unknown' && goal.quote===undefined) next.readerGoals[key]={...goal,quote:''};
      }
    }
    return next;
  })};
}

export function ideaReviewEvidenceReferenceIssues(value: any, cards: readonly any[]): string[] {
  if(!Array.isArray(value?.reviews)) return [];
  const catalog=ideaReviewEvidenceCatalog(cards), issues:string[]=[];
  for(const row of value.reviews) {
    if(!row || typeof row!=='object') continue;
    const check=(ref:unknown,path:string,storyOnly=false)=>{
      if(ref===undefined) return;
      const entry=catalog.find(item=>item.id===ref && item.position===row.position);
      if(!entry || (storyOnly && !['hook','description','setting','ending','scopeBreakdown'].some(field=>entry.field===field || entry.field.startsWith(field+'.') || entry.field.startsWith(field+'['))))
        issues.push('第'+row.position+'张题材审查：'+path+'必须选择本卡实际故事字段的服务器证据编号');
    };
    for(const field of ['storyEvidence','payoffEvidence','platformEvidence']) check(row[field+'Ref'],field+'Ref',true);
    for(const key of ['click','completion','sharing','immersion']) check(row.readerGoals?.[key]?.evidenceRef,'readerGoals.'+key+'.evidenceRef');
  }
  return issues;
}
