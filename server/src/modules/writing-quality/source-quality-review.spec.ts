import { describe, expect, it } from 'vitest';
import { remapOutlineSourceBoundaryTargets, SOURCE_QUALITY_AXES, sourceQualityReviewContract, validateSourceQualityReview, needsSourceBoundaryReview, validateSourceBoundaryReview, continuityAuditFromClaims, resolveSourceContextEvidence, validateOutlineSourceBoundaryReview, outlineResultClaimCatalog, outlineResultClaimPrompt, validateOutlineResultClaims, outlineSourceBoundaryCatalog, sourceBoundaryEvidenceContext, sourceEvidenceCatalog, reviewFixedCatalog, outlineNarrativeSourceCatalog, exclusiveClaimReviewMismatch } from './source-quality-review';
import { crossStagePromiseFindings, describeCrossStageReviewValidation } from '../../chain/cross-stage-review';
import { structuredTruncationError } from '../../chain/structured-truncation';
import { remapBodySourceBoundaryTargets, materializeContinuityNewInformationEvidence, continuityPriorEvidenceAnchors, applyContinuityCitationRepairs, bodySourceBoundaryCatalog, validateBodySourceBoundaryReview, reviewFixedSourceChecklist, validateOutlineSourceBoundaryPartialReview } from './source-quality-review';
import { SOURCE_QUALITY_POLICY } from '../../../shared/src/system-workflow-rules.registry';
import { ModuleStandardsService } from '../module-standards/module-standards.service';
import { standardDirectiveCache } from '../module-standards/standard-directive.cache';
const fixture = (body: string) => ({
  audit: { version: 1, checks: Object.fromEntries(SOURCE_QUALITY_AXES.map(axis => [axis, {status:'supported',evidence:body,reason:'已经核对本阶段实际动作与状态依据'}])) },
  goals: Object.fromEntries(['click','completion','sharing','immersion'].map(key => [key,{status:'supported',quote:body,reason:'人物实际选择影响局面并提供继续阅读理由'}])),
});
describe('source quality review evidence contract', () => {
  it('retains a prose risk target through wording changes and drops only a truly deleted claim',()=>{
    const old='开始核对。\n\n只有这一趟能让人进去。\n\n他收起记录。';const targets=bodySourceBoundaryCatalog(old);
    const changed='开始核对。\n\n她多核对了一项。\n\n确认条件齐备，可以执行。\n\n他收起记录。';
    const required=remapBodySourceBoundaryTargets(old,changed,targets);
    expect(required).toEqual(['B2','B3']);expect(bodySourceBoundaryCatalog(changed,required).map(row=>row.content)).toEqual(['她多核对了一项。','确认条件齐备，可以执行。']);
    expect(remapBodySourceBoundaryTargets(old,'开始核对。\n\n他收起记录。',targets)).toEqual([]);
    expect(bodySourceBoundaryCatalog('只有这一趟卡在期限终点前后。')).toHaveLength(1);
  });
  it('binds continuity citations to consecutive prior paragraphs without changing an actual conflict',()=>{
    const context=JSON.stringify({previousChapter:[{complete:true,content:'“你上了14楼。”保安说，“记录在，走不走。”\n\n晚上才扣款。\n\n他转身离开。'}]});
    const anchors=continuityPriorEvidenceAnchors(context);
    const checks=[{ref:'C1',status:'consistent',basisEvidence:'抄错了结尾。',reason:'核对实际上楼事件。'},{ref:'C2',status:'conflict',basisEvidence:'晚上才扣款。',reason:'正文把扣款说成下午。'}];
    const bound=applyContinuityCitationRepairs(checks,['C1'],{repairs:[{ref:'C1',basisAnchorIds:[anchors[0].id]}]},context);
    expect(bound[0]).toEqual({...checks[0],basisEvidence:anchors[0].text});expect(bound[1]).toEqual(checks[1]);
    for(const ids of [[],['prior:p99'],[anchors[0].id,anchors[2].id],[anchors[0].id,anchors[0].id]])expect(()=>applyContinuityCitationRepairs(checks,['C1'],{repairs:[{ref:'C1',basisAnchorIds:ids}]},context)).toThrow();
    expect(()=>applyContinuityCitationRepairs(checks,['C1'],{repairs:[{ref:'C2',basisAnchorIds:[anchors[1].id]}]},context)).toThrow();
    const disclosed=[{ref:'C1',status:'new_information',basisEvidence:'改写的引文',reason:'本章首次披露，不改写前章。'},checks[1]];
    const boundNew=materializeContinuityNewInformationEvidence(disclosed,'“上回托你办的事呢？”');
    expect(boundNew[0]).toEqual({...disclosed[0],basisEvidence:'“上回托你办的事呢？”'});expect(boundNew[1]).toEqual(checks[1]);
  });
  it('reviews synonymous exclusive prose claims individually and preserves a genuine missing condition',()=>{
    const body='她把记录放在桌上。\n\n只有这一趟能让人进入，又不留名字。\n\n他用钥匙把人反锁屋内。';
    const rows=bodySourceBoundaryCatalog(body);expect(rows.map(row=>row.content)).toEqual(['只有这一趟能让人进入，又不留名字。','他用钥匙把人反锁屋内。']);
    expect(bodySourceBoundaryCatalog('她只剩一个问题。\n\n他只有一只杯子。')).toEqual([]);
    const context=JSON.stringify({world:{rules:'各趟记录保留历史时段；正常钥匙开门不限制屋内人离开。'}});
    const checks=[{id:rows[0].id,status:'gap',basisRef:'S1',origin:'body',outlineEvidence:'',reason:'历史记录没有排除其它时段的实际进入。'},{id:rows[1].id,status:'gap',basisRef:'S1',origin:'body',outlineEvidence:'',reason:'正常钥匙没有限制屋内人员离开的机制。'}];
    const checked=validateBodySourceBoundaryReview({checks},rows,context,'');expect(checked.verified).toBe(true);expect(checked.findings).toHaveLength(2);
    expect(validateBodySourceBoundaryReview({checks:[checks[0]]},rows,context,'').verified).toBe(false);
    expect(validateBodySourceBoundaryReview({checks:[checks[0],checks[0]]},rows,context,'').verified).toBe(false);
    const upstream=validateBodySourceBoundaryReview({checks:[{...checks[0],origin:'chapter_plan',outlineEvidence:body},checks[1]]},rows,context,body);
    expect(upstream.sourceConflicts).toHaveLength(1);expect(upstream.findings).toHaveLength(1);
    const narrowed=validateBodySourceBoundaryReview({checks:[{...checks[0],status:'supported',reason:'这属于可追查的嫌疑方向，未排除其它时段。'},checks[1]]},rows,context,'');
    expect(narrowed.findings.join('')).toContain('评审结论与依据不一致');
  });
  it('collects only omitted source checks without accepting partial coverage or discarding a real gap', async () => {
    const rows=[{id:'a',content:'这个行动缺少许可。'},{id:'b',content:'另一个行动遵守许可。'}];
    const context=JSON.stringify({world:{rules:'许可只供当前持有人使用。'}});
    const first={checks:[{id:'a',status:'gap',basisRef:'S1',reason:'当前来源未授予所需的额外许可。'}]};
    expect(validateOutlineSourceBoundaryPartialReview(first,rows,context).verified).toBe(true);
    expect(validateOutlineSourceBoundaryReview(first,rows,context).verified).toBe(false);
    const calls:string[][]=[];
    const responses=await reviewFixedSourceChecklist(rows,async batch=>{
      calls.push(batch.map(item=>item.id));
      return calls.length===1?first:{checks:[{id:'b',status:'supported',basisRef:'S1',reason:'行动由当前持有人按既有许可执行。'}]};
    });
    expect(calls).toEqual([['a','b'],['b']]);
    const full=validateOutlineSourceBoundaryReview({checks:responses.flatMap(response=>response.checks)},rows,context);
    expect(full.verified).toBe(true);expect(full.findings).toHaveLength(1);
    await expect(reviewFixedSourceChecklist(rows,async()=>({checks:first.checks}))).rejects.toThrow('遗漏');
    expect(validateOutlineSourceBoundaryPartialReview({checks:[{...first.checks[0],id:'other'}]},rows,context).verified).toBe(false);
  });
  it('follows risk text and its replacement instead of attaching an old sentence index to an unrelated observation', () => {
    const previous=[{id:'c',content:'开始核对。锁定唯一时间窗口。看见两个时间戳不同。结尾保留。'}];
    const targets=outlineSourceBoundaryCatalog(previous);
    const shifted=[{id:'c',content:'开始核对。多做一次比对。锁定唯一时间窗口。看见两个时间戳不同。结尾保留。'}];
    const ids=remapOutlineSourceBoundaryTargets(previous,shifted,targets);
    expect(ids).toEqual(['c-B-content-2']);
    expect(outlineSourceBoundaryCatalog(shifted,ids).map(row=>row.content)).toEqual(['锁定唯一时间窗口']);
    const replaced=[{id:'c',content:'开始核对。取得可用资料。范围内只剩一段。看见两个时间戳不同。结尾保留。'}];
    const replacementIds=remapOutlineSourceBoundaryTargets(previous,replaced,targets);
    expect(replacementIds).toEqual(['c-B-content-1','c-B-content-2']);
    expect(outlineSourceBoundaryCatalog(replaced,replacementIds).map(row=>row.content)).toEqual(['取得可用资料','范围内只剩一段']);
    const deleted=[{id:'c',content:'开始核对。看见两个时间戳不同。结尾保留。'}];
    expect(remapOutlineSourceBoundaryTargets(previous,deleted,targets)).toEqual([]);
    expect(outlineSourceBoundaryCatalog([{id:'c',content:'新增机关把人反锁屋内。'}]).length).toBe(1);
  });
  it('blocks an exclusive success explained as suspicion across source, result and stage reviews', () => {
    expect(exclusiveClaimReviewMismatch('他算出唯一时间窗口。','所得是一段核验窗口，“唯一”被限定在当日配送授权开门记录范围内且由警方核验支撑，没有降成嫌疑。')).toContain('缩小');
    expect(exclusiveClaimReviewMismatch('他算出当日记录范围内唯一时间窗口。','“唯一”被限定在当日记录范围内。')).toBeNull();
    expect(exclusiveClaimReviewMismatch('他算出唯一时间窗口。','并未将唯一结果限定在记录范围，实际已排除其它时段。')).toBeNull();
    const claim='她已经锁定唯一通道。',reason='逐条比对只剩一条，属其能力可推的嫌疑方向，未声称排除其他途径。';
    const context=sourceBoundaryEvidenceContext(JSON.stringify({world:{rule:'已逐条核对全部通道，只剩东门。'}}));
    const rows=[{id:'c-B-content-0',content:claim}];
    const boundary=validateOutlineSourceBoundaryReview({checks:[{id:rows[0].id,status:'supported',basisRef:'S1',reason}]},rows,context);
    expect(boundary.verified).toBe(true);expect(boundary.findings.join('')).toContain('评审结论与依据不一致');
    const plans=[{id:'c',scenes:JSON.stringify({characterActions:[{character:'她',action:'逐条核对全部通道',result:claim}]})}];
    const ref=outlineResultClaimCatalog(plans)[0].ref;
    const result=validateOutlineResultClaims({checks:[{ref,status:'supported',basisRef:'S1',basisEvidence:'已逐条核对全部通道',reason}]},plans,context);
    expect(result.verified).toBe(true);expect(result.findings.join('')).toContain('评审结论与依据不一致');
    const candidate=JSON.stringify({chapters:[{id:'c',content:claim}]}),evidence=sourceEvidenceCatalog(candidate).find(row=>row.text===claim)!;
    const brief=JSON.stringify({confirmedStory:{scopeBreakdown:[{chapters:1,outcome:claim}]}});
    const stage={consistent:true,contradictions:[],unrelatedInventions:[],promiseChecks:[{ref:'P1',status:'preserved',candidateEvidenceRef:evidence.id,reason}]};
    expect(describeCrossStageReviewValidation(stage,brief,candidate)).toEqual([]);
    // Complete, cited negative evidence reaches upstream repair; it is not a
    // malformed response retry or a story PASS despite the model's label.
    expect(crossStagePromiseFindings(stage,candidate,brief).join('')).toContain('评审结论与依据不一致');
    for(const [text,explanation] of [['她只找到唯一的嫌疑方向。',reason],['她无法锁定唯一通道。',reason],[claim,'已排除其余通道，不属于嫌疑或猜测。'],[claim,'结论不是只有嫌疑，已逐条排除其它通道。']])
      expect(exclusiveClaimReviewMismatch(text,explanation)).toBeNull();
  });
  it('distinguishes a first chapter with no predecessor from a later chapter missing its required source', () => {
    const body='她把钥匙交给对方，转身离开。', f=fixture(body);
    (f.audit.checks as any).continuity={status:'not_applicable',evidence:'',reason:'全书第1章不存在前章，本章事实另行完整核对'};
    const first={context:JSON.stringify({meta:{chapterIndex:1},previousChapter:[],recentChapters:[]})};
    expect(validateSourceQualityReview(f.audit,f.goals,body,first).verified).toBe(true);
    const later={context:JSON.stringify({meta:{chapterIndex:2},previousChapter:[],recentChapters:[]})};
    expect(validateSourceQualityReview(f.audit,f.goals,body,later).verified).toBe(false);
    (f.audit.checks as any).continuity={status:'unknown',evidence:'',reason:'没有前章全文，尚不能完成必要跨章核对'};
    expect(validateSourceQualityReview(f.audit,f.goals,body,later).verified).toBe(false);
    expect(validateSourceQualityReview(f.audit,f.goals,body,first).verified).toBe(false);
    // No automatic conversion of unknown to a pass or suppression of in-chapter defects.
    (f.audit.checks as any).continuity={status:'not_applicable',evidence:'',reason:'全书第1章不存在前章，本章事实另行完整核对'};
    (f.audit.checks as any).agency={status:'conflict',evidence:body,basisSource:'context',basisEvidence:'钥匙仍由她持有。',reason:'交割状态与已确认来源同时声称不同归属'};
    const check=validateSourceQualityReview(f.audit,f.goals,body,{context:JSON.stringify({meta:{chapterIndex:1},fact:'钥匙仍由她持有。'})});
    expect(check.verified).toBe(true);expect(check.findings).toHaveLength(1);
  });
  it('requires prior character knowledge rather than omniscient world facts for a carried exclusive inference', () => {
    const context=sourceBoundaryEvidenceContext(JSON.stringify({world:{history:'幕后人物确实使用唯一的无人窗口。'},candidatePrerequisites:{currentNarratives:[{chapterId:'previous',segments:['主角只框出自己的一段，其他路径仍无法排除。']},{chapterId:'current',segments:['主角继续追查。']}]}}));
    const rows=[{id:'current-B-scenes.characterStates.0.stateBefore-0',content:'主角已经锁定唯一时间窗。'}];
    const catalog=sourceEvidenceCatalog(context),world=catalog.find(source=>source.path.endsWith('.history'))!,prior=catalog.find(source=>source.path.includes('.currentNarratives.0.segments.'))!;
    expect(validateOutlineSourceBoundaryReview({checks:[{id:rows[0].id,status:'supported',basisRef:world.id,reason:'幕后世界背景存在唯一窗口，所以主角已经锁定'}]},rows,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{id:rows[0].id,status:'gap',basisRef:prior.id,reason:'前章仍无法排除其他路径，没有取得排他性结论'}]},rows,context).verified).toBe(true);
    const knownContext=context.replace('主角只框出自己的一段，其他路径仍无法排除。','主角核对所有入口后排除了其他路径。');
    expect(validateOutlineSourceBoundaryReview({checks:[{id:rows[0].id,status:'supported',basisRef:prior.id,basisEvidence:'主角核对所有入口后排除了其他路径。',reason:'前章已核对所有入口并实际排除其他路径'}]},rows,knownContext).verified).toBe(true);
  });
  it('retains narrative choices and conflicting inline actions without stitching separate evidence', () => {
    const actions=[{character:'乙',action:'乙自行收拾现场没有追出。',result:'乙留在室内。'}];
    const content='甲把门带上。乙自行选择收拾现场。\n人物行动：'+JSON.stringify(actions[0])+'\n警员随后到场。';
    const rows=[{id:'c',content,scenes:JSON.stringify({characterActions:actions})}];
    const selected=outlineNarrativeSourceCatalog(rows);
    expect(selected[0].segments).toEqual(['甲把门带上。乙自行选择收拾现场。\n','\n警员随后到场。']);
    expect(rows[0].content).toBe(content);
    const context=sourceBoundaryEvidenceContext(JSON.stringify({narratives:selected}));
    expect(resolveSourceContextEvidence(context,'乙自行选择收拾现场。\n警员随后到场。').verified).toBe(false);
    const mismatched={...rows[0],content:content.replace('乙自行收拾现场没有追出。','乙被关住不能离开。')};
    expect(outlineNarrativeSourceCatalog([mismatched])[0].segments).toEqual([mismatched.content]);
  });
  it('cannot turn a future ending into a required mechanism or send its false gap back to repair', () => {
    const context=sourceBoundaryEvidenceContext(JSON.stringify({world:{rules:'普通关门不意味着屋内的人失去开门能力。',ending:'甲未来从外反锁，把乙困在室内，随后警方控制乙。'},candidatePrerequisites:{action:'甲救人离开屋内，乙自行处理痕迹未追出，警方到场控制乙。'}}));
    const sources=sourceEvidenceCatalog(context),ending=sources.find(source=>source.path.endsWith('.ending'))!,action=sources.find(source=>source.path.endsWith('.action'))!;
    const targets=[{id:'t',content:'甲救人后把门带上，乙自行处理痕迹未追出，警方到场控制乙。'}];
    const wrong={id:'t',status:'gap',basisRef:ending.id,reason:'结局要求反锁，所以必须补回反锁动作才能等待警方控制'};
    const rejected=validateOutlineSourceBoundaryReview({checks:[wrong]},targets,context);
    expect(rejected.verified).toBe(false);expect(rejected.findings).toEqual([]);
    expect(rejected.errors.join('；')).toContain('未来结局计划');
    expect(rejected.errors.join('；')).toContain('未来计划编号');
    expect(rejected.errors.join('；')).toContain(ending.id);
    for(const separator of [',','/'])expect(validateOutlineSourceBoundaryReview({checks:[{...wrong,status:'supported',basisRef:action.id+separator+ending.id}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...wrong,status:'supported',basisRef:action.id,reason:'对手自行选择留在室内，没有由关门剥夺他开门离开的能力'}]},targets,context).verified).toBe(true);
    expect(validateOutlineSourceBoundaryReview({checks:[{...wrong,status:'supported',basisRef:action.id,origin:'body',evidence:'模型恢复时错误附加的引文',outlineEvidence:'另一篇材料的引文',reason:'对手自行选择留在室内，没有由关门剥夺他开门离开的能力'}]},targets,context).verified).toBe(true);
    expect(validateSourceBoundaryReview({status:'gap',origin:'body',evidence:targets[0].content,basisEvidence:ending.text,reason:wrong.reason},targets[0].content,context,'').verified).toBe(false);
    const arcContext=sourceBoundaryEvidenceContext(JSON.stringify({existingCharacterResources:[{abilities:{description:'只持有普通钥匙。',growthArc:'结局把对手反锁在室内。'}}],candidatePrerequisites:{plannedCharacters:[{arc:'被反锁后只剩司法程序。'}],currentNarratives:[{segments:['对手主动留在室内处理痕迹，没有追出。']}]}}));
    for(const source of sourceEvidenceCatalog(arcContext).filter(source=>source.path.endsWith('.growthArc')||source.path.endsWith('.arc'))){
      for(const status of ['supported','gap'])expect(validateOutlineSourceBoundaryReview({checks:[{...wrong,status,basisRef:source.id}]},targets,arcContext).verified).toBe(false);
    }
    const narrative=sourceEvidenceCatalog(arcContext).find(source=>source.path.includes('.currentNarratives.'))!;
    expect(validateOutlineSourceBoundaryReview({checks:[{...wrong,status:'supported',basisRef:narrative.id,reason:'对手自行选择留下，没有由门锁剥夺其离开能力'}]},targets,arcContext).verified).toBe(true);
  });
  it('keeps original result coordinates and all judgments after a truncated result checklist splits', async () => {
    const rows=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'甲拨通电话开始交谈。',result:'电话接通，对话开始'},{action:'乙拨通电话开始交谈。',result:'电话接通，对话开始'}]})}];
    const context=sourceBoundaryEvidenceContext(JSON.stringify({chapters:rows})),catalog=outlineResultClaimCatalog(rows),sources=sourceEvidenceCatalog(context);
    const responses=await reviewFixedCatalog(catalog,async batch=>{
      if(batch.length>2)throw structuredTruncationError('实际截断',{maxTokens:32768});
      const refs=batch.map(item=>item.ref),prompt=outlineResultClaimPrompt(rows,context,refs);
      const fixed=JSON.parse(prompt.split('【固定关键结果清单】')[1].split('\n【完整当前章纲与来源编号】')[0]);
      expect(fixed.map((item:any)=>item.ref)).toEqual(refs);
      const response={checks:batch.map(item=>({ref:item.ref,status:item.ref==='a-A2-R1'?'gap':'supported',basisRef:sources.find(source=>source.text===item.action)!.id,basisEvidence:item.action,reason:'已逐项核对对应角色的真实行动与结果必要条件'}))};
      expect(validateOutlineResultClaims(response,rows,context,refs).verified).toBe(true);
      return response;
    });
    const merged={checks:responses.flatMap(response=>response.checks)};
    expect(merged.checks.map(item=>item.ref)).toEqual(catalog.map(item=>item.ref));
    expect(validateOutlineResultClaims(merged,rows,context)).toMatchObject({verified:true,findings:expect.arrayContaining([expect.stringContaining('a【关键结果】')])});
    expect(validateOutlineResultClaims({checks:merged.checks.slice(1)},rows,context).verified).toBe(false);
  });
  it('rejects a supported result proved by itself but preserves ordinary actions and a proved gap', () => {
    const rows=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'甲转动钥匙打开门。',result:'门打开了。'}]})}];
    const context=sourceBoundaryEvidenceContext(JSON.stringify({action:'甲转动钥匙打开门。',conclusion:'门打开了。',rule:'这把钥匙只能打开门，不会限制屋内的人离开。'}));
    const sources=sourceEvidenceCatalog(context),check={ref:'a-A1-R1',status:'supported',reason:'对应的普通开门行动直接产生开门结果'};
    const action=sources.find(row=>row.text==='甲转动钥匙打开门。')!,result=sources.find(row=>row.text==='门打开了。')!;
    expect(validateOutlineResultClaims({checks:[{...check,basisRef:result.id}]},rows,context).verified).toBe(false);
    expect(validateOutlineResultClaims({checks:[{...check,basisRef:result.id,basisEvidence:result.text}]},rows,context).verified).toBe(false);
    expect(validateOutlineResultClaims({checks:[{...check,basisRef:action.id,basisEvidence:action.text}]},rows,context).verified).toBe(true);
    const disputed=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'甲从外侧反锁。',result:'屋内的人不能离开。'}]})}];
    const rule=sources.find(row=>row.text.startsWith('这把钥匙'))!;
    expect(validateOutlineResultClaims({checks:[{...check,status:'gap',basisRef:rule.id,basisEvidence:rule.text,reason:'外侧转动钥匙没有提供限制内侧离开的机制'}]},disputed,context)).toMatchObject({verified:true,findings:expect.any(Array)});
    const confinement=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'甲在屋外转动机关锁。',result:'对手被反锁在屋内。'}]})}];
    const causalContext=sourceBoundaryEvidenceContext(JSON.stringify({world:{rules:'机关锁在外侧启动时，会阻止屋内人员开启出口。'},chapters:[{content:'甲在屋外启动门锁，把屋内的对手困住。'}]}));
    const causalSources=sourceEvidenceCatalog(causalContext),alias=causalSources.find(source=>source.path.includes('chapters'))!,mechanism=causalSources.find(source=>source.path.includes('rules'))!;
    expect(validateOutlineResultClaims({checks:[{...check,basisRef:alias.id,basisEvidence:alias.text}]},confinement,causalContext).verified).toBe(false);
    expect(validateOutlineResultClaims({checks:[{...check,basisRef:mechanism.id,basisEvidence:mechanism.text}]},confinement,causalContext).verified).toBe(true);
  });
  it('splits only a truncated checklist and preserves every item and a failed child', async () => {
    const seen:string[][]=[];
    const results=await reviewFixedCatalog(['a','b','c','d'],async items=>{
      seen.push(items);
      if(items.length>2)throw structuredTruncationError('实际截断',{maxTokens:32768});
      return items.map(id=>({id,status:id==='c'?'gap':'supported'}));
    });
    expect(seen).toEqual([['a','b','c','d'],['a','b'],['c','d']]);
    expect(results.flat()).toEqual([{id:'a',status:'supported'},{id:'b',status:'supported'},{id:'c',status:'gap'},{id:'d',status:'supported'}]);
    await expect(reviewFixedCatalog(['a','b'],async()=>{throw Error('来源证据未核实');})).rejects.toThrow('来源证据未核实');
    await expect(reviewFixedCatalog(['a','b'],async items=>{if(items.length>1)throw structuredTruncationError('实际截断',{maxTokens:32768});throw Error('子项仍未通过');})).rejects.toThrow('子项仍未通过');
  });
  it('binds source references to decoded actual fields and rejects unknown or contradictory references', () => {
    const source='凭当单授权进入，记录只覆盖该次进入，不排除其它权限。';
    const context=sourceBoundaryEvidenceContext(JSON.stringify({world:[{rules:JSON.stringify([{text:source}])}]}));
    const entry=sourceEvidenceCatalog(context).find(item=>item.text===source)!;
    expect(entry).toBeDefined();
    const targets=[{id:'r',content:'这是唯一进入路径。'}];
    const check={id:'r',status:'gap',basisRef:entry.id,reason:'单次进入记录不能排除其它主体的正常权限'};
    expect(validateOutlineSourceBoundaryReview({checks:[check]},targets,context)).toMatchObject({verified:true,findings:expect.arrayContaining([expect.stringContaining(source)])});
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:'S9999'}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisEvidence:'新编的器件性质'}]},targets,context).verified).toBe(false);
    const rows=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'本人进入',result:'其它人没有路径'}]})}];
    expect(validateOutlineResultClaims({checks:[{...check,ref:'a-A1-R1'}]},rows,context).verified).toBe(true);
    expect(validateOutlineResultClaims({checks:[{...check,ref:'a-A1-R1',basisRef:'S9999'}]},rows,context).verified).toBe(false);
  });
  it('retains multiple independently valid sources without accepting an unknown secondary source or stitched quotation', () => {
    const context=JSON.stringify({permission:'持卡人可进入。',record:'仅记录持卡人的这次进入。'});
    const catalog=sourceEvidenceCatalog(context),targets=[{id:'r',content:'所有人只有这一条路径。'}];
    const check={id:'r',status:'gap',basisRef:catalog.map(item=>item.id).join(','),reason:'进入许可和单次留档均不能排除其它人的独立权限'};
    const result=validateOutlineSourceBoundaryReview({checks:[check]},targets,context);
    expect(result.verified).toBe(true);
    expect(result.findings[0]).toContain('持卡人可进入。');
    expect(result.findings[0]).toContain('仅记录持卡人的这次进入。');
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog.map(item=>item.id).join('、')}]},targets,context).verified).toBe(true);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog.map(item=>item.id).join('/')}]},targets,context).verified).toBe(true);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog[0].id+'/S9999'}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog[0].id+'/'+catalog[0].id}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog[0].id+'、S9999'}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisRef:catalog[0].id+',S9999'}]},targets,context).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[{...check,basisEvidence:'持卡人可进入。仅记录持卡人的这次进入。'}]},targets,context).verified).toBe(false);
  });
  it('binds fixed review references to server-owned quotes while rejecting conflicting supplied quotes', () => {
    const source='个人许可只允许本人刷卡进入，不允许持续开门。';
    const targets=[{id:'r',content:'授权有效时门一直开。'}];
    const boundary={checks:[{id:'r',status:'gap',basisEvidence:source,reason:'个人许可没有授予持续敞开和其它人员通行的效果'}]};
    expect(validateOutlineSourceBoundaryReview(boundary,targets,source)).toMatchObject({verified:true,findings:expect.arrayContaining([expect.stringContaining('授权有效时门一直开')])});
    const rows=[{id:'a',scenes:JSON.stringify({characterActions:[{action:'本人刷卡进入。',result:'其它人也不用刷卡。'}]})}];
    const result={checks:[{ref:'a-A1-R1',status:'gap',basisEvidence:source,reason:'本人进入许可不能自动扩展为其它人的进入权限'}]};
    expect(validateOutlineResultClaims(result,rows,source)).toMatchObject({verified:true,findings:expect.arrayContaining([expect.stringContaining('其它人也不用刷卡')])});
    expect(validateOutlineResultClaims({checks:[{...result.checks[0],actionEvidence:'另一个人做的动作'}]},rows,source).verified).toBe(false);
    expect(validateOutlineSourceBoundaryReview({checks:[]},targets,source).verified).toBe(false);
  });
  it('requires separate proof for contradictory aliases in one chapter and retains corrected targets', () => {
    const activeLocks=[{id:'place',description:'他关上房门并反锁，对手在屋内求援。'},
      {id:'ordinary',description:'她回家反锁房门休息。'}];
    const lockCatalog=outlineSourceBoundaryCatalog(activeLocks);
    expect(lockCatalog.map(item=>item.chapterId)).toEqual(['place','ordinary']);
    expect(lockCatalog[0].content).toBe('他关上房门并反锁，对手在屋内求援');
    // Normal locking is selected for review, never rejected by the scanner.
    expect(needsSourceBoundaryReview('她回家反锁房门休息')).toBe(true);
    const rows=[{id:'chapter',content:'截图只有本人看得见。',scenes:JSON.stringify({conflict:'截图只有本人看得见，别人看不到。'})}];
    const catalog=outlineSourceBoundaryCatalog(rows);
    expect(catalog).toHaveLength(2);
    const context='正常截图保留当时文字，不授予图片隐藏能力。';
    const first={id:catalog[0].id,status:'conflict',origin:'chapter_plan',evidence:catalog[0].content,
      outlineEvidence:catalog[0].content,basisEvidence:context,reason:'来源没有授权截图对其它观看者隐藏文字'};
    expect(validateOutlineSourceBoundaryReview({checks:[first]},catalog,context).verified).toBe(false);
    const corrected=[{...rows[0],content:'截图正常保留当时文字。'}];
    expect(outlineSourceBoundaryCatalog(corrected,catalog.map(item=>item.id)).map(item=>item.id)).toEqual(catalog.map(item=>item.id));
  });
  it('verifies cited execution constraints without turning them into world events', () => {
    const body='截图只有本人看得见，别人看不到。',context=sourceBoundaryEvidenceContext(JSON.stringify({rules:'现代设备，没有超能力。'}));
    const row={status:'conflict',origin:'chapter_plan',evidence:body,outlineEvidence:body,
      basisEvidence:'已经显示的信息，正常截图、拍摄、复制与转发会保留当时内容；静态副本不会继续刷新倒计时。',reason:'已确认来源没有授权图片隐藏文字，正常复制应保留当时内容'};
    expect(validateSourceBoundaryReview(row,body,context,body)).toMatchObject({verified:true,sourceConflicts:expect.any(Array)});
    expect(JSON.parse(context).storySources).toEqual({rules:'现代设备，没有超能力。'});
    expect(validateSourceBoundaryReview({...row,basisEvidence:'凭空添加的图片隐身能力'},body,context,body).verified).toBe(false);
  });
  it('cannot let a correct entry operation replace proof of a separate exclusive conclusion', () => {
    const acquisition='逐项核对完整台账，将其它时段全部排除并记下比对结论。';
    const mechanism='台账逐项记载全时段的全部进出，不存在未登记路径。';
    const derived=[{id:'derived',scenes:JSON.stringify({characterActions:[{action:'继续调查，没有放弃',result:'已经掌握唯一时间窗'}]})}];
    const combined=JSON.stringify({world:{rules:mechanism},chapters:[{id:'derived',content:acquisition}]});
    const sources=sourceEvidenceCatalog(combined),actionSource=sources.find(source=>source.text===acquisition)!,conditionSource=sources.find(source=>source.text===mechanism)!;
    const evidence={ref:'derived-A1-R1',status:'supported',basisRef:actionSource.id,basisEvidence:acquisition,reason:'此前已经核对完整台账，本项继承该次取得的认知'};
    expect(validateOutlineResultClaims({checks:[evidence]},derived,combined).verified).toBe(false);
    const established={...evidence,mechanismBasisRef:conditionSource.id,mechanismEvidence:mechanism};
    expect(validateOutlineResultClaims({checks:[established]},derived,combined).verified).toBe(true);
    expect(validateOutlineResultClaims({checks:[{...established,mechanismBasisRef:actionSource.id,mechanismEvidence:acquisition}]},derived,combined).verified).toBe(false);
    expect(validateOutlineResultClaims({checks:[{...established,mechanismEvidence:'编造的完整台账机制'}]},derived,combined).verified).toBe(false);
    const rows=[{id:'a',scenes:JSON.stringify({characterActions:[
      {character:'甲',action:'本人刷卡进入屋内。',result:'门关闭后他留在室内。'},
      {character:'甲',action:'查看一段刷卡记录。',result:'推出这是唯一作案时间。'},
      {character:'甲',action:'反锁房门。',result:'对手被困住无法离开。'},
    ]})}];
    const catalog=outlineResultClaimCatalog(rows);
    expect(catalog.map(row=>row.ref)).toEqual(['a-A1-R1','a-A2-R1','a-A3-R1']);
    const context=JSON.stringify({rules:'一段记录只能证明对应进出，不能排除其它记录。'});
    const checked=validateOutlineResultClaims({checks:[{ref:'a-A2-R1',status:'gap',actionEvidence:'查看一段刷卡记录。',
      resultEvidence:'推出这是唯一作案时间',basisEvidence:'一段记录只能证明对应进出，不能排除其它记录。',reason:'单个记录没有排除其他住户和其它可用路径'}]},rows,context);
    expect(checked.verified).toBe(false);
    expect(checked.errors.some(error=>error.includes('a-A3-R1'))).toBe(true);
    expect(checked.findings.join('')).toContain('没有排除');
    const reworded=[{id:'a',scenes:JSON.stringify({characterActions:[{character:'甲',action:'查看记录',result:'得到一个嫌疑窗口'}]})}];
    expect(outlineResultClaimCatalog(reworded).map(row=>row.ref)).toEqual(['a-A1-R1']);
    expect(validateOutlineResultClaims({checks:[]},reworded,context).verified).toBe(false);
  });
  it('checks every risky outline and preserves a proved conflict when another item is missing', () => {
    const rows=[{id:'a',content:'许可一直生效，门一直开，其他人不用登记。'},{id:'b',content:'截图只有自己看得见。'}];
    const context=JSON.stringify({rules:'个人许可只供本人刷卡，设备随即关闭。'});
    const result=validateOutlineSourceBoundaryReview({checks:[{id:'a',status:'gap',origin:'chapter_plan',evidence:rows[0].content,
      outlineEvidence:rows[0].content,basisEvidence:'个人许可只供本人刷卡，设备随即关闭。',reason:'个人许可不能扩成持续开门和他人免登记权限'}]},rows,context);
    expect(result.verified).toBe(false);expect(result.findings).toHaveLength(1);expect(result.errors.join('；')).toContain('b');
  });
  it('decodes original multiline field quotes without stitching different fields', () => {
    const context=JSON.stringify({previousChapter:[{content:'他们走下楼。\n\n他在一楼相见。'}],rules:'每人各自刷卡。',history:'最后有人获救。'});
    expect(resolveSourceContextEvidence(context,'他们走下楼。\n\n他在一楼相见。').verified).toBe(true);
    expect(resolveSourceContextEvidence(context,'每人各自刷卡。最后有人获救。').verified).toBe(false);
  });
  it('requires real world evidence for carrier/permission changes and sends proved outline errors upstream', () => {
    const body='她把图片发出。他说图片里的字看不到。',context=JSON.stringify({rules:'只有她的登录账号能收到消息，不会改变其他人的感知。'}),outline='图片转发给别人后文字消失。';
    expect(needsSourceBoundaryReview(body)).toBe(true);
    const row={status:'conflict',evidence:body,basisEvidence:'只有她的登录账号能收到消息，不会改变其他人的感知。',reason:'登录限制不能使同一复制文件对不同观看者自动隐藏文字',origin:'body'};
    expect(validateSourceBoundaryReview(row,body,context,outline)).toMatchObject({verified:true,findings:[expect.stringContaining('登录限制')],sourceConflicts:[]});
    expect(validateSourceBoundaryReview({...row,basisEvidence:'不存在的屏幕能力'},body,context,outline).verified).toBe(false);
    expect(validateSourceBoundaryReview({...row,origin:'chapter_plan',outlineEvidence:outline},body,context,outline)).toMatchObject({verified:true,findings:[],sourceConflicts:[expect.stringContaining('章纲:')]});
    expect(validateSourceBoundaryReview({...row,origin:'chapter_plan',outlineEvidence:'章纲未这样写'},body,context,outline).verified).toBe(false);
    const fantasy='幻阵中的文件只有持有者能辨认文字，包括复制的图片。';
    expect(validateSourceBoundaryReview({...row,status:'supported',basisEvidence:fantasy,reason:'本世界明确授予图片隐藏效果，原文条件已满足'},body,JSON.stringify({rules:fantasy}),outline).verified).toBe(true);
  });
  it('aggregates actual independent claim results and still refuses missing members', () => {
    const body='昨天他在门外见到她。',prior='他们在院内见面。',context=JSON.stringify({previousChapter:[{content:prior,complete:true}]});
    const checks:any=[{ref:'C1',status:'conflict',basisEvidence:prior,reason:'本章回忆的门外与前章院内地点不同'}];
    expect(continuityAuditFromClaims(checks,body,context)).toMatchObject({status:'conflict',evidence:body,basisEvidence:prior});
    expect(continuityAuditFromClaims([],body,context).status).toBe('unknown');
  });
  it('requires an actual prior chapter premise for a cross chapter PASS, without quote-only fabrication', async () => {
    const body='她说昨天第一次见面在院内。', prior='昨日她在街口初次见到他。';
    const f=fixture(body), context=JSON.stringify({previousChapter:[{content:prior,complete:true}]});
    const {invalidSourceQualityCitations}=await import('./source-quality-review');
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
    expect(invalidSourceQualityCitations(f.audit as any,body,{context})).toEqual([]);
    (f.audit.checks as any).continuity={status:'conflict',evidence:body,basisSource:'context',basisEvidence:prior,reason:'首次相见地点与前章已经发生的地点不同',claimChecks:[{ref:'C1',status:'conflict',basisEvidence:prior,reason:'昨日地点与已发生的前章事实冲突'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context})).toMatchObject({verified:true,findings:expect.arrayContaining([expect.stringContaining('首次相见地点')])});
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:prior,reason:'已经逐项核对相同地点与前章实际经历',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:prior,reason:'逐项结果仍由实际模型核对地点语义'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(true);
    (f.audit.checks as any).continuity.basisEvidence=body;
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
  });
  it('cannot omit, duplicate or skip an explicit retrospective claim even with a valid overall quote', () => {
    const body='昨天他乘船来。\n昨夜她在门口第一次见到他。',prior='他乘船抵达。\n她在码头首次见到他。',f=fixture(body);
    const context=JSON.stringify({previousChapter:[{content:prior,complete:true}]}),row:any={status:'supported',evidence:'昨天他乘船来。',basisSource:'context',basisEvidence:'他乘船抵达。',reason:'一条正确的回忆不能证明所有回忆都一致',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:'他乘船抵达。',reason:'乘船抵达与当前回忆明确一致'}]};
    (f.audit.checks as any).continuity=row;
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
    row.claimChecks.push({...row.claimChecks[0]});
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
    row.claimChecks[1]={ref:'C2',status:'not_prior',basisEvidence:'',reason:'明确昨夜声称不能被跳过当本章新事'};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
    row.claimChecks[1]={ref:'C2',status:'conflict',basisEvidence:'她在码头首次见到他。',reason:'声称门口首次相见与前章码头首次相见冲突'};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context})).toMatchObject({verified:true,findings:[expect.stringContaining('前序声称·C2')]});
  });
  it('does not accept an excerpt as complete prior evidence or skip continuity', () => {
    const body='她走进院内。', f=fixture(body), context=JSON.stringify({previousChapter:[],recentChapters:[{content_tail:'中段省略'}]});
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:'中段省略',reason:'已经核对全部前章并保持各个状态一致'};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
    f.audit.checks.continuity.status='not_applicable';
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
  });
  it('allows genuinely new historical information and preserves a proved conflict while another claim is unknown', () => {
    const body='昨天矿井新增一条记录。\n昨夜她在城内初次见他。',prior='她在郊外初次见到他。',f=fixture(body),context=JSON.stringify({previousChapter:[{content:prior,complete:true}]});
    const row:any={status:'conflict',evidence:'昨夜她在城内初次见他。',basisSource:'context',basisEvidence:prior,reason:'初次相见的地点与前章已经发生的地点不同',claimChecks:[{ref:'C1',status:'new_information',basisEvidence:'昨天矿井新增一条记录。',reason:'本章新取得的矿井历史记录，前章未曾断言其不存在'},{ref:'C2',status:'conflict',basisEvidence:prior,reason:'本章回忆城内与前章郊外首次相见地点冲突'}]};
    (f.audit.checks as any).continuity=row;
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(true);
    row.claimChecks[0].status='unknown';
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context})).toMatchObject({verified:false,findings:expect.arrayContaining([expect.stringContaining('前序声称·C2')])});
    row.claimChecks.pop();
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).verified).toBe(false);
  });
  it('requires a positive retrospective quote to cover the stated room or floor', () => {
    const body='昨夜他在402室初次见到她。',prior='他初次在一楼大堂见到她。',f=fixture(body),context=JSON.stringify({previousChapter:[{content:prior,complete:true}]});
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:prior,reason:'只看见同一行为不能证明相同地点',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:prior,reason:'有初次见到的动作却没有相同位置依据'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).errors.join('')).toContain('房间或楼层');
  });
  it.each(['她把钥匙放在桌上，母亲伸手收好。','守卫接到城主命令后开门，学徒走了进去。','工程师递交修复记录，主管确认后恢复设备。'])('keeps complete normal reviews across settings: %s', body => {
    const f=fixture(body);expect(validateSourceQualityReview(f.audit,f.goals,body,{})).toMatchObject({verified:true,findings:[]});
  });
  it('requires every source axis and independent reader goals despite aggregate PASS or high scores', () => {
    const body='她拿回了钥匙。';const f=fixture(body);delete f.audit.checks.agency;
    expect(validateSourceQualityReview({...f.audit,pass:true,overallScore:99},f.goals,body,{}).verified).toBe(false);
    expect(validateSourceQualityReview(fixture(body).audit,undefined,body,{}).errors).toHaveLength(4);
  });
  it('routes a cited authority gap separately from its high rating', () => {
    const body='店员说退款已到账。';const f=fixture(body);
    f.audit.checks.agency={status:'gap',evidence:body,basisSource:'context',basisEvidence:'店员只能受理申请，无权审批退款。',reason:'店员受理申请不足以证明退款已经审批并到账'} as any;
    const result=validateSourceQualityReview(f.audit,f.goals,body,{context:'店员只能受理申请，无权审批退款。'});
    expect(result.verified).toBe(true);expect(result.findings).toHaveLength(1);expect(result.findings[0]).toContain('agency');
    f.audit.checks.agency.basisEvidence='没有提供的确认凭证';
    expect(validateSourceQualityReview(f.audit,f.goals,body,{}).verified).toBe(false);
  });
  it('rejects invented continuity evidence rather than converting it to a novel defect', () => {
    const body='她骑马来到村口。';const f=fixture(body);
    f.audit.checks.continuity={status:'conflict',evidence:'她坐在船里。',basisSource:'body',basisEvidence:body,reason:'两个实际载具不同且没有任何转场依据'} as any;
    const result=validateSourceQualityReview(f.audit,f.goals,body,{});expect(result.verified).toBe(false);expect(result.findings).toEqual([]);
  });
  it('retains honest weak and unknown reading potential without asserting a high commercial outcome', () => {
    const body='她关上了门。';const f=fixture(body);f.goals.sharing={status:'weak',quote:body,reason:'本章尚缺能引发复述或讨论的具体取舍'};
    f.goals.completion={status:'unknown',quote:'',reason:'只有当前第一章，尚未完成全篇正文'};
    const result=validateSourceQualityReview(f.audit,f.goals,body,{});expect(result.verified).toBe(true);expect(result.readerGoals?.sharing.status).toBe('weak');
  });
  it('does not turn missing professional premises into established plot contradictions', () => {
    const body='申请已经提交。';const f=fixture(body);f.audit.checks.professional={status:'unknown',evidence:body,reason:'缺少本次结果对应的决定权限与已生效依据'};
    const result=validateSourceQualityReview(f.audit,f.goals,body,{});expect(result.verified).toBe(false);expect(result.findings).toEqual([]);
  });
  it('delivers the single policy to generation, outline, review and repair without importing novel facts', () => {
    new ModuleStandardsService().onModuleInit();
    for(const scene of ['idea_generate','outline','writing','review','quality_refine']) expect(standardDirectiveCache.get(scene)).toContain(SOURCE_QUALITY_POLICY);
    const schema=sourceQualityReviewContract();for(const axis of SOURCE_QUALITY_AXES)expect(schema).toContain(axis+':');
    standardDirectiveCache.clear();
  });
});

it('locates six-axis citations without changing judgments or accepting the wrong source',async()=>{
  const {invalidSourceQualityCitations,applySourceQualityCitationRepairs}=await import('./source-quality-review');
  const body='她把回执递给主管。';const f=fixture(body);
  const audit=f.audit as any;
  audit.checks.progression={status:'conflict',evidence:'改述的引文无法定位',basisSource:'chapter_plan',basisEvidence:'另一个改述',reason:'必要事件缺失影响当前行动成立，仍须保留冲突判断'};
  const sources={chapter_plan:'主管必须先签回执。'};
  const targets=invalidSourceQualityCitations(audit,body,sources);
  expect(targets.map(t=>t.key)).toEqual(['source:progression:evidence','source:progression:basisEvidence']);
  const rows=[{key:targets[0].key,anchorId:'body:p1'},{key:targets[1].key,anchorId:'chapter_plan:p1'}];
  const repaired=applySourceQualityCitationRepairs(audit,targets,rows,body,sources);
  expect(repaired.checks.progression).toEqual({...audit.checks.progression,evidence:body,basisEvidence:sources.chapter_plan});
  expect(repaired.checks.voice).toBe(audit.checks.voice);
  expect(validateSourceQualityReview(repaired,f.goals,body,sources).findings).toHaveLength(1);
  expect(applySourceQualityCitationRepairs(audit,targets,[rows[0],{...rows[1],anchorId:'body:p1'}],body,sources)).toBe(audit);
  expect(applySourceQualityCitationRepairs(audit,targets,[rows[0],{...rows[1],anchorId:''}],body,sources)).toBe(audit);
});

 it('uses complete earlier prose for explicit recollections but not current state', () => {
    const older='“不要逞强。”她说。', latest='她已经离开城镇。';
    const context=JSON.stringify({previousChapter:[{complete:true,content:latest}],historicalChapters:[{complete:true,content:older}]});
    const body='“不要逞强，上回我就说过。”她说。';
    const f=fixture(body);
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:older,reason:'回溯原话有已保存早期章节完整依据',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:older,reason:'早期原话可核对明确的上回回忆'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).errors.filter(e=>e.includes('continuity')||e.includes('C1'))).toEqual([]);
    const current='昨天她留在城镇，如今仍在城镇。',g=fixture(current);
    (g.audit.checks as any).continuity={...f.audit.checks.continuity,evidence:current};
    expect(validateSourceQualityReview(g.audit,g.goals,current,{context}).errors).toContain('C1前序声称缺少实际前章对照依据');
    const incomplete=context.replace('"complete":true,"content":"“不要逞强。”她说。"','"complete":false,"content":"“不要逞强。”她说。"');
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context:incomplete}).verified).toBe(false);
  });

 it('does not interpret a material layer as a building floor',()=>{
    const body='昨天汤里结了一层油。',prior='他把昨天的汤放在桌上。',f=fixture(body);
    const context=JSON.stringify({previousChapter:[{complete:true,content:prior}]});
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:prior,reason:'已核对昨天留下的汤与当前回忆一致',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:prior,reason:'原文确有昨日留下汤而没有虚构楼层'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).errors.filter(e=>e.includes('楼层'))).toEqual([]);
  });

 it('can cite an older recorded statement without treating that record as the latest state',()=>{
    const prior='现在这条工单已关闭。',older='昨天发现一笔异常记录。',body='回执上面写着昨天发现一笔异常记录。',f=fixture(body);
    const context=JSON.stringify({previousChapter:[{complete:true,content:prior}],historicalChapters:[{complete:true,content:older}]});
    (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:older,reason:'本章引用先前回执原文而非声称当前工单状态',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:older,reason:'原话属于过去记录，可用早期完整正文定位'}]};
    expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).errors.filter(e=>e.includes('C1'))).toEqual([]);
  });

 it('uses earlier full prose for an explicitly dated call while keeping present state on the latest chapter',()=>{
  const older='他昨晚在一楼门厅接了电话。',prior='他如今已在医院。';
  const context=JSON.stringify({previousChapter:[{complete:true,content:prior}],historicalChapters:[{complete:true,content:older}]});
  const body='昨晚他在一楼门厅接了电话。',f=fixture(body);
  (f.audit.checks as any).continuity={status:'supported',evidence:body,basisSource:'context',basisEvidence:older,reason:'明确回指昨晚同一通话事件，来源为完整已保存历史',claimChecks:[{ref:'C1',status:'consistent',basisEvidence:older,reason:'同一旧通话的地点与行动均有完整历史依据'}]};
  expect(validateSourceQualityReview(f.audit,f.goals,body,{context}).errors.filter(e=>e.includes('C1'))).toEqual([]);
  const current='昨晚他在一楼门厅，如今仍在一楼门厅。',g=fixture(current);
  (g.audit.checks as any).continuity={...f.audit.checks.continuity,evidence:current};
  expect(validateSourceQualityReview(g.audit,g.goals,current,{context}).errors).toContain('C1前序声称缺少实际前章对照依据');
 });
