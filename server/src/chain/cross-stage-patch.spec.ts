import { describe, expect, it } from 'vitest';
import {
  CROSS_STAGE_MUTABLE_ENTITY_TYPES,
  CROSS_STAGE_PATCH_TABLE_MAP,
  applyCrossStagePatch,
  isImmutableWorldPatchTarget,
  selectMinimumImpactCrossStagePatches,
  crossStageRepairContext,
  describeCrossStagePatchValidation,
  crossStageRepairRequests,
  crossStageRepairAnchors,
  crossStageRepairDependencyView,
  crossStageRepairFocusedAnchors,
  crossStageRepairDiagnosticPositions,
  materializeCrossStageRepairEdits,
} from './cross-stage-patch';

describe('cross-stage Canon mutation boundary', () => {
  it('includes the next opening knowledge that carries a failed producer claim without expanding to unrelated later chapters',()=>{
    const bundle={chapters:[{id:'producer',chapterIndex:2,content:'陈甲比较记录后锁定唯一时间窗口。'},
      {id:'consumer',chapterIndex:3,scenes:JSON.stringify({characterStates:[{character:'陈甲',stateBefore:'手里掐住唯一时间窗口。'}]})},
      {id:'later',chapterIndex:4,scenes:JSON.stringify({characterStates:[{character:'陈甲',stateBefore:'准备送单。'}]})}]};
    expect(new Set(crossStageRepairRequests(bundle,['producer-B-content-0：【来源边界】缺排他条件 | 正文: 陈甲比较记录后锁定唯一时间窗口。'])[0].targetIds)).toEqual(new Set(['producer','consumer']));
  });
  it('maps a diagnosed source unit to stable edit positions while retaining the full action chain and related projections',()=>{
    const bundle={chapters:[{id:'c',content:'实际行动链\n无关说明',scenes:JSON.stringify({hook:'比较记录后锁定唯一时间窗口。',notes:'无关的场景说明',state:'只剩唯一时间窗口。'})}]};
    const anchors=crossStageRepairAnchors(bundle,['c']);
    const targets=[{id:'c-B-scenes.hook-0',chapterId:'c',content:'比较记录后锁定唯一时间窗口。'},{id:'c-B-scenes.state-0',chapterId:'c',content:'只剩唯一时间窗口。'}];
    const findings=['c-B-scenes.hook-0：缺少排他条件'];
    const selected=crossStageRepairFocusedAnchors(anchors,targets,findings);
    expect(selected.map(a=>a.value)).toEqual(['实际行动链','无关说明','比较记录后锁定唯一时间窗口。','只剩唯一时间窗口。']);
    expect(selected.every(a=>anchors.includes(a))).toBe(true);
    expect(crossStageRepairDiagnosticPositions(anchors,targets,findings)[0].anchorIds).toEqual([anchors.find(a=>a.path?.[0]==='hook')!.id]);
    expect(crossStageRepairFocusedAnchors(anchors,[{id:'c-B-unknown-0',chapterId:'c',content:'无法定位'}],['c-B-unknown-0'])).toEqual(anchors);
  });
  it('includes a named actors differently worded mechanism projection without routing unrelated characters or rule examples', () => {
    const bundle={world:[{id:'world',rules:'规则示例：推出唯一通道'}],chapters:[{id:'c',content:'陈甲比较记录后锁定唯一时间窗口。',scenes:JSON.stringify({characterActions:[{character:'陈甲',action:'比较记录',result:'锁定唯一时间窗口'}]})}],characters:[
      {id:'a',name:'陈甲',profile_json:JSON.stringify({skills:['凭职业经验反推出楼里唯一的无记录窗口']})},
      {id:'b',name:'李乙',profile_json:JSON.stringify({skills:['反推出另一场事件的唯一时间窗口']})},
      {id:'d',name:'陈甲',profile_json:JSON.stringify({skills:['能复述自己看见的现场']})}]};
    const request=crossStageRepairRequests(bundle,['【阶段兑现 P1 c】缺少排除反例 | 正文: 陈甲比较记录后锁定唯一时间窗口'])[0];
    expect(new Set(request.targetIds)).toEqual(new Set(['c','a']));
    expect(crossStageRepairRequests(bundle,['c有普通事件缺口，规则示例为推出唯一通道'])[0].targetIds).toEqual(['c']);
    expect(bundle.characters[0].profile_json).toContain('无记录');
  });
  it('routes the same cited claim across mutable projections instead of freezing its source plan', () => {
    const claim='等待乙凭本人配送授权刷卡时闸机持续开启五十秒并允许其它人免刷卡进入';
    const bundle={world:[{id:'world',rules:claim}],chapters:[{id:'c',scenes:JSON.stringify({action:claim})},{id:'unrelated',content:'保持别的剧情'}],
      mapPoints:[{id:'m',description:'他先等在门外。'+claim+'。随后上楼。'}],foreshadowings:[{id:'f',content:claim}]};
    const request=crossStageRepairRequests(bundle,[`m-B-description-1：【来源边界】权限被扩大 | 正文: ${claim} | 来源: 许可只供本人刷卡`])[0];
    expect(new Set(request.targetIds)).toEqual(new Set(['m','c','f']));
    expect(request.targetIds).not.toContain('world');expect(request.targetIds).not.toContain('unrelated');
    expect(bundle.chapters[0].scenes).toContain(claim);
    const causalRequest=crossStageRepairRequests(bundle,[`c【关键结果】许可被扩大 | 行动: ${claim} | 结果: 其它人不必刷卡即可进入 | 来源: 许可只供本人刷卡`])[0];
    expect(new Set(causalRequest.targetIds)).toEqual(new Set(['m','c','f']));
    expect(causalRequest.targetIds).not.toContain('world');expect(causalRequest.targetIds).not.toContain('unrelated');
    const short={chapters:[{id:'c',content:'截图只有本人能看到'}],mapPoints:[{id:'m',description:'截图只有本人能看到'}]};
    expect(new Set(crossStageRepairRequests(short,['m-B-description-0：缺口 | 正文: 截图只有本人能看到 | 来源: 复制不改变像素内容'])[0].targetIds)).toEqual(new Set(['c','m']));
  });
  it('resolves named cross-stage dependencies and shares preceding proposals without mutating Canon', () => {
    const bundle={world:[{id:'world',rules:'个人授权不扩为他人权限'}],chapters:[{id:'c',chapterIndex:4,content:'由甲取得自己的许可'}],mapPoints:[
      {id:'m',name:'公馆',description:'由甲取得自己的许可'},{id:'other',name:'通道',description:'由乙许可进入'}]};
    const request=crossStageRepairRequests(bundle,['chapters[chapterIndex=4].content 与 mapPoints[公馆].description 互斥'])[0];
    expect(request.targetIds).toEqual(['c','m']);
    const proposals=[{entityType:'chapter',entityId:'c',field:'content',match:'由甲取得自己的许可',replacement:'由甲跟随乙进入'}];
    const view=crossStageRepairDependencyView(bundle,['other'],proposals);
    expect(view.values.some(value=>value.text==='由甲跟随乙进入')).toBe(true);
    expect(view.values.some(value=>value.text==='个人授权不扩为他人权限')).toBe(false);
    expect(bundle.chapters[0].content).toBe('由甲取得自己的许可');
    expect(()=>crossStageRepairDependencyView(bundle,['other'],[{...proposals[0],match:'不存在的旧值'}])).toThrow('不是当前字段版本');
  });
  it('retains actual dependent edits beside unchanged positions without accepting an unchanged candidate', () => {
    const bundle={chapters:[{id:'c',content:'保留这一句\n必须修订这一句'}]},anchors=crossStageRepairAnchors(bundle,['c']);
    const unchanged={anchorId:anchors[0].id,replacement:anchors[0].value};
    const result=materializeCrossStageRepairEdits({edits:[unchanged,{anchorId:anchors[1].id,replacement:'实际可行的行动'}]},anchors,bundle);
    expect(result.patches[0].replacement).toBe('保留这一句\n实际可行的行动');
    expect(()=>materializeCrossStageRepairEdits({edits:[unchanged]},anchors,bundle)).toThrow('没有实际变化');
    expect(()=>materializeCrossStageRepairEdits({edits:[unchanged,unchanged]},anchors,bundle)).toThrow('重复');
  });
  it('materializes exact positions without copying old JSON or altering repeated neighboring values', () => {
    const bundle={chapters:[{id:'c',content:'同一句\n同一句',scenes:JSON.stringify({actions:[{result:'同一句'},{result:'同一句'}],untouched:'保留'})}]};
    const anchors=crossStageRepairAnchors(bundle,['c']);
    const text=anchors.find(a=>a.field==='content'&&a.start===4)!;
    const leaf=anchors.find(a=>a.path?.join('.')==='actions.1.result')!;
    const result=materializeCrossStageRepairEdits({edits:[{anchorId:text.id,replacement:'新一句'},{anchorId:leaf.id,replacement:'他说："先走"。'}]},anchors,bundle);
    const scene=JSON.parse(result.patches.find(p=>p.field==='scenes').replacement);
    expect(scene).toEqual({actions:[{result:'同一句'},{result:'他说："先走"。'}],untouched:'保留'});
    expect(result.patches.find(p=>p.field==='content').replacement).toBe('同一句\n新一句');
    expect(bundle.chapters[0].content).toBe('同一句\n同一句');
    expect(()=>materializeCrossStageRepairEdits({edits:[{anchorId:'E999',replacement:'错误'}]},anchors,bundle)).toThrow('编号无效');
  });
  it('batches independent targets but keeps shared dependencies and unlocated findings together', () => {
    const bundle={chapters:[{id:'one',content:'第一章。'},{id:'two',content:'第二章。'},{id:'three',content:'第三章。'}]};
    expect(crossStageRepairRequests(bundle,['one有错误','two有错误'])).toHaveLength(2);
    const linked=crossStageRepairRequests(bundle,['one有错误','two与one衔接错误','three有错误']);
    expect(linked).toHaveLength(2);
    expect(linked.find(batch=>batch.targetIds.includes('one'))?.targetIds).toEqual(expect.arrayContaining(['one','two']));
    const unknown=crossStageRepairRequests(bundle,['one有错误','未定位的真实错误']);
    expect(unknown).toHaveLength(1);
    expect(unknown[0].findings).toContain('未定位的真实错误');
    expect(bundle.chapters).toHaveLength(3);
  });
  it('opens the actual previous knowledge producer for a stateBefore repair instead of forcing downstream dilution', () => {
    const bundle={world:[{id:'world',rules:'既有世界能力不变'}],chapters:[
      {id:'one',chapterIndex:1,content:'建立危机。'},
      {id:'two',chapterIndex:2,content:'人物在这里取得证据。'},
      {id:'three',chapterIndex:3,content:'开章接续认知。'},
      {id:'book',chapterIndex:null,content:'保留全书成果。'}]};
    const request=crossStageRepairRequests(bundle,['three-B-scenes.characterStates.0.stateBefore-0：前序认知缺少紧邻前章的取得依据'])[0];
    expect(request.targetIds).toEqual(expect.arrayContaining(['two','three']));
    expect(request.targetIds).not.toContain('one');expect(request.targetIds).not.toContain('world');
    expect(request.context.chapters.map(row=>row.id)).toEqual(['two','three']);
    expect(request.context.world).toEqual(bundle.world);
    expect(crossStageRepairRequests(bundle,['three：普通地点描述错误'])[0].targetIds).toEqual(['three']);
    const ambiguous={...bundle,chapters:[...bundle.chapters,{id:'other-two',chapterIndex:2,content:'不明确的重复章节'}]};
    expect(crossStageRepairRequests(ambiguous,['three-B-scenes.characterStates.0.stateBefore-0：前序认知不足'])[0].targetIds).toEqual(['three']);
  });
  it('links named book and volume projections even when the risky result uses different wording', () => {
    const bundle={world:[{id:'world',rules:'不可修改。'}],chapters:[
      {id:'one',chapterIndex:1,title:'雨夜取证',content:'主角推出唯一时间窗。'},
      {id:'other',chapterIndex:2,title:'另一阶段',content:'正常铺垫。'},
      {id:'book',level:'book',chapterIndex:null,content:'雨夜取证：只有这一段能进出的时间窗。'},
      {id:'volume',level:'volume',chapterIndex:null,content:'雨夜取证：锁定唯一进出窗口。'},
      {id:'unrelated',level:'book',chapterIndex:null,content:'其它故事：推出唯一时间窗。'}]};
    const forward=crossStageRepairRequests(bundle,['one：来源缺口 | 正文: 主角推出唯一时间窗。 | 来源: 普通通行规则'])[0];
    expect(forward.targetIds).toEqual(expect.arrayContaining(['one','book','volume']));
    expect(forward.targetIds).not.toContain('other');expect(forward.targetIds).not.toContain('unrelated');expect(forward.targetIds).not.toContain('world');
    const reverse=crossStageRepairRequests(bundle,['book：来源缺口 | 正文: 只有这一段能进出的时间窗。 | 来源: 普通通行规则'])[0];
    expect(reverse.targetIds).toContain('one');
  });
  it('resolves only unique UUID prefix references without expanding all repair targets', () => {
    const bundle={chapters:[{id:'401076df-391c-4619-b1a1-8e040e96f23e',content:'甲'},
      {id:'9f888f22-2e97-44fd-8595-b7b4437d6af2',content:'乙'}]};
    const batches=crossStageRepairRequests(bundle,['第二章 id=401076df 字段未同步','第四章 id=9f888f22 衔接缺失']);
    expect(batches).toHaveLength(2);
    expect(batches.map(batch=>batch.targetIds.length)).toEqual([1,1]);
    const ambiguous={chapters:[...bundle.chapters,{id:'401076df-0000-0000-0000-000000000000',content:'丙'}]};
    expect(crossStageRepairRequests(ambiguous,['id=401076df 有问题'])[0].targetIds).toHaveLength(3);
  });
  it('keeps complete field coordinates for an unlocated finding with quoted neighborhoods', () => {
    const prefix='保留前文。'.repeat(80),suffix='保留后文。'.repeat(80);
    const bundle={chapters:[{id:'c',content:prefix+'\n原先的风险描述\n'+suffix}]};
    const request=crossStageRepairRequests(bundle,['来源的“原先的风险描述”缺少必要条件'])[0];
    const anchors=crossStageRepairAnchors(request.context,request.targetIds);
    const anchor=anchors.find(item=>item.value==='原先的风险描述')!;
    const result=materializeCrossStageRepairEdits({edits:[{anchorId:anchor.id,replacement:'有据可行的行动'}]},anchors,bundle);
    expect(result.patches[0].replacement).toBe(prefix+'\n有据可行的行动\n'+suffix);
    expect(bundle.chapters[0].content).toBe(prefix+'\n原先的风险描述\n'+suffix);
  });
  it('identifies the actual failing patch and distinguishes absent text from ambiguous text', () => {
    const bundle={chapters:[{id:'a',content:'刷卡记录。刷卡记录。',scenes:'另一段真实场景。'}]};
    const issues=describeCrossStagePatchValidation({patches:[
      {entityType:'chapter',entityId:'a',field:'scenes',match:'刷卡记录。',replacement:'保留记录。'},
      {entityType:'chapter',entityId:'a',field:'content',match:'刷卡记录。',replacement:'保留记录。'},
    ]},bundle);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('patches[0] chapter:a.scenes');
    expect(issues[0]).toContain('不存在');
    expect(issues[1]).toContain('patches[1] chapter:a.content');
    expect(issues[1]).toContain('出现2次');
  });
  it('limits proposal input to cited neighborhoods while full-field matching preserves the untouched tail', () => {
    const original='正常铺垫。'.repeat(800)+'个人授权使整栋楼一直敞开。'+'保留后续计划。'.repeat(800);
    const bundle={world:[{id:'world',rules:'当单许可只供本人刷卡。'}],chapters:[{id:'a',content:original},{id:'b',content:'另一章正确计划。'}]};
    const view=crossStageRepairContext(bundle,['a：“个人授权使整栋楼一直敞开。”与本人刷卡规则冲突']);
    expect(view.world).toEqual(bundle.world);expect(view.chapters).toHaveLength(1);
    expect(view.chapters[0].content.length).toBeLessThan(600);
    expect(view.chapters[0].content).toContain('个人授权使整栋楼一直敞开。');
    const candidate=applyCrossStagePatch(original,'个人授权使整栋楼一直敞开。','本人刷卡后闸机关闭。');
    expect(candidate).toContain('保留后续计划。'.repeat(800));expect(bundle.chapters[0].content).toBe(original);
  });
  it('never exposes world canon as an automatic repair target', () => {
    expect(CROSS_STAGE_MUTABLE_ENTITY_TYPES).not.toContain('world');
    expect(CROSS_STAGE_MUTABLE_ENTITY_TYPES).not.toContain('worldProfile');
    expect(CROSS_STAGE_PATCH_TABLE_MAP.world).toBeUndefined();
    expect(CROSS_STAGE_PATCH_TABLE_MAP.worldProfile).toBeUndefined();
    expect(isImmutableWorldPatchTarget('world')).toBe(true);
    expect(isImmutableWorldPatchTarget('worldProfile')).toBe(true);
  });

  it('builds a pure candidate patch without mutating the original value', () => {
    const original = '核心内容：十四户。';
    expect(applyCrossStagePatch(original, '十四户', '十三户')).toBe('核心内容：十三户。');
    expect(original).toBe('核心内容：十四户。');
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '两小时')).toBe('["倒退两小时"]');
  });

  it('rejects missing, ambiguous, or JSON-breaking suggestions', () => {
    expect(applyCrossStagePatch('十四户、十四户', '十四户', '十三户')).toBeNull();
    expect(applyCrossStagePatch('十四户', '十三户', '十二户')).toBeNull();
    expect(applyCrossStagePatch('["倒退一小时"]', '一小时', '"两小时')).toBeNull();
  });

  it('retains required dependencies with equal reasons and selects only explicit alternatives', () => {
    const required=[
      {entityType:'chapter',entityId:'ch',field:'content',match:'旧路径',replacement:'新路径',reason:'同步处置路径'},
      {entityType:'mapPoint',entityId:'map',field:'description',match:'旧路径',replacement:'新路径',reason:'同步处置路径'},
      {entityType:'character',entityId:'char',field:'arc',match:'旧路径',replacement:'新路径',reason:'同步处置路径'},
    ];
    expect(selectMinimumImpactCrossStagePatches(required)).toEqual(required);
    const selected = selectMinimumImpactCrossStagePatches([
      { entityType: 'character', entityId: 'char-1', field: 'background', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 4 },
      { entityType: 'chapter', entityId: 'chapter-8', field: 'content', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 1 },
      { entityType: 'chapter', entityId: 'chapter-8', field: 'scenes', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 1 },
      { entityType: 'world', entityId: 'world-1', field: 'rules', match: '十四户', replacement: '十三户', reason: '户数冲突', dependentCount: 0 },
    ].map(item=>({...item,alternativeGroup:'明确互斥的数量修订位置'})));
    expect(selected).toHaveLength(2);
    expect(selected.every(item => item.entityType === 'chapter' && item.entityId === 'chapter-8')).toBe(true);
  });
});
