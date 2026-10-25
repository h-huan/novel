/** Evidence is selected from server-owned narrative fields, never generated or guessed. */
export interface IdeaEvidenceEntry { id: string; position: number; field: string; quote: string }

/** The production JSON example includes every required evidence family. */
export function ideaReviewResponseExample(cards: readonly {title:string}[] = []) {
  const template = { reviews: [{ position: 1, title: '实际标题', titleCompelling: true, openingCompelling: true,
    distinctFromBatch: true, storyCoherent: true, payoffCredible: true, platformFit: true,
    storyEvidenceRef: 'C1.description', payoffEvidenceRef: 'C1.ending', platformEvidenceRef: 'C1.hook',
    qualityReason: '根据实际设定、选择、因果与平台判据解释判断', readerQuestion: '由实际标题和开篇引发的具体追问',
    payoffBridge: { status: 'supported', actionEvidenceRef: 'C1.description', resultEvidenceRef: 'C1.ending',
      conditionEvidenceRef: 'C1.setting', reason: '必须按实际卡说明行动造成结果的必要条件；缺失则gap并拒绝兑现' },
    readerGoals: Object.fromEntries(['click','completion','sharing','immersion'].map(key=>[key,
      { status: 'supported', evidenceRef: 'C1.description', reason: '依据本卡实际机制说明支持、薄弱或未知的具体理由' }])), issues: [],
  }] };
  if (!cards.length) return template;
  return { reviews: cards.map((card,index) => {
    const row=structuredClone(template.reviews[0]);
    const position=index+1;
    const bind=(ref:string)=>ref.replace(/^C1\./,'C'+position+'.');
    row.position=position;
    row.title=card.title;
    row.storyEvidenceRef=bind(row.storyEvidenceRef);
    row.payoffEvidenceRef=bind(row.payoffEvidenceRef);
    row.platformEvidenceRef=bind(row.platformEvidenceRef);
    row.payoffBridge.actionEvidenceRef=bind(row.payoffBridge.actionEvidenceRef);
    row.payoffBridge.resultEvidenceRef=bind(row.payoffBridge.resultEvidenceRef);
    row.payoffBridge.conditionEvidenceRef=bind(row.payoffBridge.conditionEvidenceRef);
    for (const goal of Object.values(row.readerGoals)) goal.evidenceRef=bind(goal.evidenceRef);
    return row;
  }) };
}
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
    if (row.payoffBridge && typeof row.payoffBridge === 'object') {
      next.payoffBridge = { ...row.payoffBridge };
      for (const field of ['actionEvidence', 'resultEvidence', 'conditionEvidence'])
        next.payoffBridge[field] = resolve(row, row.payoffBridge[field + 'Ref']);
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

/** A claimed resolution is not its own mechanism. Missing conditions remain a valid GAP. */
export function ideaPayoffBridgeIssues(value: any, cards: readonly any[]): string[] {
  if (!Array.isArray(value?.reviews)) return [];
  const catalog = ideaReviewEvidenceCatalog(cards);
  const issues: string[] = [];
  for (const row of value.reviews) {
    const bridge = row?.payoffBridge;
    const prefix = `第${row?.position ?? '?'}张题材审查：payoffBridge`;
    if (!bridge || !['supported', 'gap'].includes(bridge.status)
      || typeof bridge.reason !== 'string' || bridge.reason.trim().length < 8) {
      issues.push(prefix + '须返回行动、结果、成立条件及supported或gap结论');
      continue;
    }
    const own = (ref: unknown) => catalog.find(entry => entry.position === row.position && entry.id === ref);
    const action = own(bridge.actionEvidenceRef), result = own(bridge.resultEvidenceRef);
    const condition = own(bridge.conditionEvidenceRef);
    const narrative = (entry: IdeaEvidenceEntry | undefined) => entry && entry.field !== 'title';
    if (!narrative(action)) issues.push(prefix + '.actionEvidenceRef须引用本卡实际行动');
    if (!result || !(result.field === 'ending' || /^scopeBreakdown\[\d+\]\.outcome$/.test(result.field)))
      issues.push(prefix + '.resultEvidenceRef须引用本卡结局或阶段兑现结果');
    if (bridge.status === 'supported' && (!narrative(condition) || condition?.field === 'ending'
      || condition?.id === result?.id || condition?.quote === result?.quote))
      issues.push(prefix + '.conditionEvidenceRef须引用结果断言之外的既有成立条件，不能用结局自证');
    if (bridge.status === 'gap' && bridge.conditionEvidenceRef !== undefined && !narrative(condition))
      issues.push(prefix + '.conditionEvidenceRef不能引用其它卡或虚构字段');
    if (row.payoffCredible !== (bridge.status === 'supported'))
      issues.push(prefix + '结论须与payoffCredible一致，缺少必要条件时必须拒绝兑现');
  }
  return issues;
}
