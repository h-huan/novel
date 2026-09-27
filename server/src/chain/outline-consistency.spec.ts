import { describe, it, expect } from 'vitest';
import {
  extractLocationTokens,
  detectExclusiveScope,
  scanOutlineConsistency,
  correctedOutlineOrdinalLabel,
  summarizeOutlineConsistency,
  buildOutlineConsistencyRepairInstruction,
  type OutlineConsistencyRow,
} from './outline-consistency';

describe('explicit outline chapter labels', () => {
  it('repairs only a wrong location heading and leaves all scene text intact', () => {
    const original = '第七章空间全部在待拆片区内外收束：顶层遗物间→拆迁指挥部→小院门口。';
    expect(correctedOutlineOrdinalLabel({ id: 'o2', order: 1, location_summary: original }))
      .toBe('第二章空间全部在待拆片区内外收束：顶层遗物间→拆迁指挥部→小院门口。');
    expect(correctedOutlineOrdinalLabel({ id: 'o2', order: 1, location_summary: '第二章空间：顶层遗物间。' })).toBeNull();
  });
});

/**
 * fixture 全部取自生产库 data-from-20260917/novel.db 的真实章节大纲原文
 * （33450fd6 = 《作者栏写着我的名字》3 章；c8ee4c9e = 短篇 6 章）。
 * 目的：把「Gate 反复判死」那次真实违约钉成回归测试，而不是用编造文本自证。
 */

const HOT_0 = [
  `员工休息室拆开无寄件人牛皮纸投稿，读到“冰锥自后颈刺入、无搏斗痕迹”的验伤段落`,
  `扉页手写“作者：阿遥”与下一页验伤描写同框对撞的一刻`,
  `店长办公室当面质问来源，被“直播预告已挂、六个人两小时后到”钉住`,
  `站到可擦写角色卡墙前，把细节来源收窄为三种可能，拿起马克笔`,
];
const LOC_0 = `回魂剧本杀店·员工休息室 → 回魂剧本杀店·店长办公室`;
const END_0 = `两小时倒计时启动，玩家即将到齐；她必须在开本前把“作者是我”这行字变成反制的牌，否则下一份指向命案的证据仍会写着她的名字——开局即抛出“署名嫁祸+限时自证”的双重悬念。`;
const HOOK_0 = `两小时倒计时已经开始，玩家马上到齐；她必须在开本前把“作者是我”这行字变成反制的牌——否则下一份指向命案的证据，还会写着她的名字。`;
const LOC_1 = `回魂剧本杀店·二层开本间（角色卡墙前） → 二层开本间（发卡与读卡时段） → 店长办公室（监控主机前）`;
const HOOK_1 = `开本铃响前一分钟，直播预约已经两千多。医生落座前先看了角色卡墙一眼——不是看桌面，不是看门，是看那六张他“不该认得”的卡。她把手背上那行110擦掉，重新写下：看他先动哪张卡。`;
const LOC_2 = `回魂剧本杀店·二层开本间（开本前最后两分钟） → 二层开本间牌桌（开本进行中） → 二层开本间（警方到场后）`;

const C8_LOC_0 = `青石村小二年级教室（兼办公室）→ 放学后的同一间教室 → 青石村小办公室（台灯、复印机、最下层抽屉、台历）。全章不出校门，空间越收越窄。`;
const C8_END_0 = `十五天倒计时在台历上落下第一笔：十二个孩子，名单上一个真家长都没有。她把复印件锁进最下层抽屉，钥匙揣走，第一个要去的地方已经想好了——小满家。钩子落在'她能不能进那扇门'和'那张被涂改的底栏是谁签的'两件事上。`;
const C8_HOOK_0 = `十五天，十二个孩子，名单上没有一个真家长。她把复印件锁进抽屉，第一个想去的地方已经想好了——小满家。`;
const C8_HOT_0 = [
  `台灯下逐页比对：铅笔尖在'家长'栏上一行行划过，称呼从叔叔换到姑姑、舅舅、姨妈，落款力道一寸没变——把'十二个孩子、两年、只有两种笔迹'直接摆到读者眼前。`,
  `小满那一秒的停顿被放大写：问'谁来接、叫什么名字'，孩子把书包带子往肩上一提，只丢下'我姨妈来接'，转身跑进放学队伍，问话断在半句里。`,
  `阿岩站在门口顺口补刀：'我姑姑也这么签的。'说完自己也愣住——他亲手替读者印证了称呼可换、笔迹不换。`,
  `最底层那一栏：修正液结成白壳、边缘半道撕痕、只露出一个偏旁的末端，起笔力道跟表上其他人都不同——她认不出是谁的字。`,
  `收束动作三连：复印件装信封、锁进最下层抽屉、台历上圈出十五天，全是能看见的手上活儿，不喊紧张。`,
  `章末自问一句：名单上这十二个'家长'，她一个真名都写不出来。`,
];
const C8_LOC_1 = `小满家院门口（村道尽头、铁皮院门、门缝与门栓）→ 小满家门外公共路面（水泥村道与岔口，拍背影与抄门牌处）→ 青石村小办公室（放学后的台灯下，拨号、复述、装信封、划台历）。`;
const C8_END_1 = `老贺那句话没说完——'你要是再往小满家跑，明天早上……'后半句留在忙音里，读者被吊住的不是威胁本身，而是明天早上会发生什么。她把四件材料装进同一个信封，在台历上又划掉一天：剩下十四天，她缺的不是勇气，是一个能一次推开十二扇门的合法名义。`;
const C8_HOOK_1 = `电话挂断时老贺那句话没说完：“你要是再往小满家跑，明天早上……”——后半句留在了忙音里。她把四件材料装进同一个信封，在台历上又划掉一天。剩下十四天，她需要一个学校这边说得过去的名义，一个能一次进十二家家门的名义。`;
const C8_HOT_1 = [
  `门缝对峙：门从里面插着，只拉开一掌宽，奶奶一只手插在门栓上答话——问到接送人姓名，回一句'我们都叫她姨妈'；问到户口本，回一句'本子不在我这儿'，门始终没开。`,
];

const P334: OutlineConsistencyRow[] = [
  { id: '33450fd6-o0', order: 0, title: '作者栏写着我的名字', location_summary: LOC_0, ending_setup: END_0, hot_scenes: JSON.stringify(HOT_0), scenes: JSON.stringify({ hook: HOOK_0 }) },
  { id: '33450fd6-o1', order: 1, title: '改本两小时', location_summary: LOC_1, scenes: JSON.stringify({ hook: HOOK_1 }) },
  { id: '33450fd6-o2', order: 2, title: '直播开本，真凶落座', location_summary: LOC_2 },
];

const C8: OutlineConsistencyRow[] = [
  { id: 'c8ee4c9e-o0', order: 0, title: '签到表上只有两种笔迹', location_summary: C8_LOC_0, ending_setup: C8_END_0, hot_scenes: JSON.stringify(C8_HOT_0), scenes: JSON.stringify({ hook: C8_HOOK_0 }) },
  { id: 'c8ee4c9e-o1', order: 1, title: '第一家访，门从里面锁了', location_summary: C8_LOC_1, ending_setup: C8_END_1, hot_scenes: JSON.stringify(C8_HOT_1), scenes: JSON.stringify({ hook: C8_HOOK_1 }) },
];

describe('outline-consistency · 地点词提取（误报防线）', () => {
  it('括号内的动作/道具备注不得被当成地点（装信封、划台历、拨号、复述）', () => {
    const tokens = extractLocationTokens(C8_LOC_1);
    expect(tokens).not.toContain('装信封');
    expect(tokens).not.toContain('划台历');
    expect(tokens).not.toContain('拨号');
    expect(tokens).not.toContain('复述');
  });

  it('括号内的地点样态子场景必须保留（否则会漏判越界）', () => {
    const tokens = extractLocationTokens(LOC_1);
    expect(tokens).toContain('角色卡墙前');
    expect(tokens).toContain('监控主机前');
    expect(tokens).not.toContain('发卡与读卡时段');
  });

  it('含描述性连接词的括号片段（的/与）不作地点', () => {
    const tokens = extractLocationTokens(C8_LOC_1);
    expect(tokens).not.toContain('放学后的台灯下');
    expect(tokens).not.toContain('水泥村道与岔口');
    expect(tokens).toContain('铁皮院门');
  });

  it('约束说明（全章不出X）不被当成地点', () => {
    const tokens = extractLocationTokens(C8_LOC_0);
    expect(tokens).not.toContain('全章不出校门');
    expect(tokens).not.toContain('空间越收越窄');
    expect(tokens).toContain('青石村小办公室');
  });
});

describe('outline-consistency · 排他范围识别', () => {
  it('识别「全章不出校门」为排他范围「校门」', () => {
    expect(detectExclusiveScope(C8_LOC_0)).toBe('校门');
  });

  it('只有「不越公共区域」这类不含出/离开的措辞不算排他范围（宁窄勿误报）', () => {
    expect(detectExclusiveScope(C8_LOC_1)).toBeNull();
  });

  it('没有范围声明时返回 null', () => {
    expect(detectExclusiveScope(LOC_0)).toBeNull();
    expect(detectExclusiveScope(null)).toBeNull();
  });
});

describe('outline-consistency · 真实大纲回归', () => {
  it('店内地点不误报：本章自身范围内的「店长办公室」不算越界', () => {
    const findings = scanOutlineConsistency(P334);
    expect(findings.map((f) => f.message).join('')).not.toContain('店长办公室');
  });

  it('提前消费下一章场景须命中：第1章 hot_scenes 站到第2章才有的「角色卡墙前」', () => {
    const findings = scanOutlineConsistency(P334);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: 'next_chapter_scene_preconsumed',
      outlineId: '33450fd6-o0',
      order: 0,
      field: 'hot_scenes',
      matchedPlace: '角色卡墙前',
      sourceOrder: 1,
    });
  });

  it('Gate 判死那次是真违约：声明「不出校门」却在章末落点与钩子抵达「小满家」', () => {
    const findings = scanOutlineConsistency(C8);
    expect(findings).toHaveLength(2);
    expect(findings.map((f) => f.field)).toEqual(['ending_setup', 'scenes.hook']);
    for (const finding of findings) {
      expect(finding).toMatchObject({
        rule: 'scope_exclusive_violation',
        outlineId: 'c8ee4c9e-o0',
        order: 0,
        matchedPlace: '小满家',
        scope: '校门',
      });
    }
  });

  it('未声明场景范围的章节不判定（不猜、不填默认值）', () => {
    const rows: OutlineConsistencyRow[] = [
      { id: 'x', order: 0, ending_setup: '收在小满家。', scenes: JSON.stringify({ hook: '小满家。' }) },
      { id: 'y', order: 1, location_summary: C8_LOC_1 },
    ];
    expect(scanOutlineConsistency(rows)).toEqual([]);
  });

  it('汇总与修复指令可用：指令只列需改字段并附本章原文范围', () => {
    const findings = scanOutlineConsistency(C8);
    const summary = summarizeOutlineConsistency(findings);
    expect(summary).toContain('小满家');
    expect(summarizeOutlineConsistency([])).toBe('');

    const instruction = buildOutlineConsistencyRepairInstruction(C8[0], findings);
    expect(instruction).toContain('第1章《签到表上只有两种笔迹》');
    expect(instruction).toContain('章末落点(ending_setup)');
    expect(instruction).toContain('章末钩子(scenes.hook)');
    expect(instruction).toContain(C8_LOC_0);
    expect(instruction).toContain('只输出 JSON');
  });
});
/**
 * bcfd17de《末班地铁的第十一站》· 2026-09-23 生产误报回归。
 * location_summary 与各章 loc 全部取自生产库 outlines.location_summary 原文；
 * 命中句取自当日后端日志 logs/backend.out.log 13:54:02 的 Gate 报错引文。
 * 当时的错判：第1章 loc 里那段没有句号，切出的片段「为后文保留第一次正面照面的落点」
 * 曾被逐字前缀收缩到「母亲的」，于是第1章 setback_scenes 里「母亲的护理费当场断掉」
 * 这条真实主线利害被判成「越界到养老院」，Gate 连改 2 轮，代价是模型删掉了这条利害。
 */
const BC_LOC_0 = `末班车驾驶室与第十节车厢（0:40—1:30 运行区间，驶过第十站前后）→ 1号线夜班交班室 → 车辆段车库门口。全章空间不越出地铁运营与车库范围，不提前进入养老院；母亲只通过电话声音出现，不登门、不露面，为后文保留第一次正面照面的落点。`;
const BC_SET_0 = [
  `交班室里他按下对讲机报备路线异常——按规程他不能向乘客透露未公开线路信息，报备就等于被停职，母亲的护理费当场断掉，他只能把这一站记在心里。`,
];
const BC_HOT_0 = [
  `他按下对讲机，只报「报站模块疑似异常」，刻意不念站名；调度回放监控、核对行车数据，全部正常。`,
];
const BC_END_0 = `用同一句播报回扣开篇，把「只有我看见」推进到「不止我看见」，给下一章留出继续阅读的明确理由。`;
const BC_LOC_1 = `末班车第十节车厢（0:40 驶过第十站之后）→ 1号线夜班交班室 → 末班车驾驶室与夜班交班室。全章仍不越出地铁线路与交班室两个空间；养老院只以电话形式出现，母亲不离开床位，不提前领取第 3 章的床前照面。`;
const BC_LOC_2 = `1号线夜班交班室与车队档案室 → 末班车第十节车厢，驶过第十站之后的槐荫路站台 → 安康养老院三层，母亲的床位边。三处空间依次收束，列车与站台的数据照常，站台只是他一个人下去的地方；养老院是本篇唯一一次正面落点，与第 1、2 章只以电话出现的母亲形成递进，不再向其他场所外溢。`;

const BC: OutlineConsistencyRow[] = [
  { id: 'bcfd17de-o0', order: 0, title: '末班车驶过第十站', location_summary: BC_LOC_0, ending_setup: BC_END_0, hot_scenes: JSON.stringify(BC_HOT_0), setback_scenes: JSON.stringify(BC_SET_0) },
  { id: 'bcfd17de-o1', order: 1, title: '越站的人先忘', location_summary: BC_LOC_1 },
  { id: 'bcfd17de-o2', order: 2, title: '第十一站，我下车', location_summary: BC_LOC_2 },
];

describe('outline-consistency · bcfd17de 生产误报回归（Gate 不许把主线利害当越界地点）', () => {
  it('从属从句残片不得进地点表：「母亲的床位边」只取中心语「床位边」', () => {
    const tokens = extractLocationTokens(BC_LOC_2);
    expect(tokens).not.toContain('母亲的床位边');
    expect(tokens).not.toContain('母亲的');
    expect(tokens).toContain('床位边');
  });

  it('行为约束不是地点：「不提前进入养老院」「不登门」「不露面」「不再向其他场所外溢」都不入表', () => {
    const tokens = extractLocationTokens(BC_LOC_0);
    expect(tokens).not.toContain('不提前进入养老院');
    expect(tokens).not.toContain('不登门');
    expect(tokens).not.toContain('不露面');
    expect(tokens).not.toContain('不再向其他场所外溢');
    expect(tokens).toContain('车辆段车库门口');
  });

  it('「母亲的护理费当场断掉」不得被判成越界到养老院（当日 Gate 误报原文）', () => {
    const findings = scanOutlineConsistency(BC);
    expect(findings.map((f) => f.message).join('\n')).not.toContain('母亲的');
    expect(findings.filter((f) => f.rule === 'scope_exclusive_violation')).toEqual([]);
  });

  it('第1章 loc 仍能识别排他范围「地铁运营与车库范围」，判据没被削弱', () => {
    expect(detectExclusiveScope(BC_LOC_0)).toBe('地铁运营与车库范围');
  });
});
