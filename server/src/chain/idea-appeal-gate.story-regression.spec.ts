import { describe, expect, it } from 'vitest';
import { IdeaAppealGateService } from './idea-appeal-gate.service';
import { bindStructuredIdeaCardToPremise } from './idea-discovery-contract';

const gate = new IdeaAppealGateService();

const realisticShort = {
  title: '被裁名单没有我的名字',
  hook: '工厂裁员名单贴出后，我的名字不在上面，工资卡却已经停了。经理限我三天签自愿离职，否则十年工龄清零。我当场拍下排班表和工资单，决定先查是谁把我的工号卖给外包公司。',
  description: '最初我只想保住十年工龄和女儿下学期的学费。第一天，我拿排班表去找同班组的人核对，发现三个“已离职”员工仍在夜班干活；随后经理用补偿金逼大家单独签字。我把工资单交给工友核账，却发现自己的工号已经被外包公司拿去报了另一个人的社保。最后我必须在拿补偿走人和带着工友公开证据之间选择，公开后厂里会停掉整条线，但也能把被吞掉的工龄和赔偿追回来。',
  protagonist: '36岁的装配工周岚，想保住十年工龄、女儿学费和继续工作的资格，弱点是过去总觉得忍一忍就能熬过去。',
  coreConflict: '周岚要在三天内证明自己没有自愿离职并保住工龄，经理则要用补偿和停线压力逼工人分别签字。',
  uniquePoint: '裁员名单里没有她，工资和社保记录却先一步把她“离职”了；现实记录之间的冲突就是第一章卖点。',
  mainReversal: '周岚发现公司不是临时裁员，而是把老员工工号转给外包公司套取用工指标；她从只想保住自己转为联合工友公开记录，即使会让整条生产线先停工。',
  noveltyProof: {
    familiarShell: '普通工厂裁员与劳动纠纷',
    uncommonCombination: '裁员名单、工资卡、工号和外包社保记录互相矛盾，绑定十年老员工与同班组工友',
    avoidedPatterns: '不靠超能力、重生或突然出现的神秘系统推进',
    irreplaceableWhy: '去掉工厂排班、工号和外包用工，主角无法用同一套现实记录证明“人在上班、身份却被离职”',
    secondOrderConsequence: '她公开记录后不仅影响自己的赔偿，还会让整条生产线停工、其他工友收入中断，原本支持她的人被迫重新站队',
    readerQuestion: '她能证明自己还在上班，却能不能在三天内证明自己没有“自愿离职”？',
  },
};

const previouslyFalseRejectedShort = {
  title: '末班车多出一站',
  hook: '我在养老院值夜班，失智的周爷爷画出公交线，图上多一站，次日就少一个老人。院长限我七天签事故免责书，不然开除并扣我妈手术费。我偷偷按线路推他出门，第一站停在我妈病房楼下。',
  description: '护工许朵在养老院欠薪三个月，母亲等钱手术。她发现周爷爷的公交图每多一站，次日就有一位老人无声离世；她若提前干预，母亲的手术排位就会往后掉一天。院长逼她签免责书，把死亡写成正常衰老。许朵选择推着周爷爷坐末班车，替每位老人补上最后遗憾：道歉、还钱、见孙女。七天里，母亲的排位从第一掉到第七。线路终点不是殡仪馆，而是院长办公室——周爷爷画的其实是养老院挪用护理费的路线图，末班车多出的一站，是院长私设的现金房。',
  protagonist: '许朵，28岁养老院护工，母亲等手术费；想保住工作救母，也想让老人有尊严，弱点是习惯把委屈咽下。',
  coreConflict: '许朵要借周爷爷的死亡预告给老人体面，但每干预一次母亲手术排位后退一天；院长要把每个死亡变成利润。',
  uniquePoint: '养老院夜班护工能看见“末班车”多一站，每帮老人补遗憾，母亲手术排位就后退一天。',
  mainReversal: '周爷爷多画的不是死亡预告，而是院长转移护理费的路线；最后一站是院长私设现金房，死亡预告其实是人为停药。',
  noveltyProof: {
    familiarShell: '养老院黑幕加临终关怀悬疑',
    uncommonCombination: '失智老人公交线路图预告死亡、母亲手术排位后退、护理费黑账，绑在夜班护工身份上',
    avoidedPatterns: '避开重生复仇、系统任务和单纯“发现秘密一路追查”',
    irreplaceableWhy: '去掉养老院夜班，公交线预告失去场景；去掉母亲手术费，她没必要签免责书；去掉周爷爷失智，线路图的不可解释性失效',
    secondOrderConsequence: '她救下的老人越多，家属越怀疑她提前知道死讯，院长顺势把事故推给她；她从被剥削护工变成被调查对象，必须主动公开',
    readerQuestion: '多出的那一站到底接走老人，还是接走院长的罪证？',
  },
};

describe('idea appeal gate story-evidence regressions', () => {
  it('accepts a strong realistic story premise without requiring a supernatural mechanism', () => {
    const assessment = gate.assess(realisticShort, 'short_story');

    expect(assessment.passed).toBe(true);
    expect(assessment.issues).toEqual([]);
    expect(assessment.signals.hookHasAnomaly).toBe(true);
    expect(assessment.signals.hookHasAgency).toBe(true);
    expect(assessment.signals.secondOrderConsequence).toBe(true);
    expect(assessment.signals.distinctivenessScore).toBeGreaterThanOrEqual(6);
  });

  it('does not reject an explicit story action merely because the verb is outside the old keyword list', () => {
    const assessment = gate.assess(previouslyFalseRejectedShort, 'short_story');

    expect(assessment.passed).toBe(true);
    expect(assessment.signals.hookHasAnomaly).toBe(true);
    expect(assessment.signals.hookHasAgency).toBe(true);
    expect(assessment.signals.reversalConsequential).toBe(true);
    expect(assessment.signals.secondOrderConsequence).toBe(true);
    expect(assessment.issues).not.toContain('核心钩子缺少一眼可识别的异常/信息差');
    expect(assessment.issues).not.toContain('核心钩子没有迫使主角采取具体行动');
  });
});

const latestDiagnosticGateCases = [
  {
    title: '一碗旧味掀翻尚食局',
    hook: '摆摊头一天，微服太子在她最便宜的汤饼里吃出宫中旧味，追问味道来处；她当众承认，请太子接连来摊上尝菜，用膳单把二十年前的漏账一道道摆上桌。',
    description: '她不肯替人顶下御膳贪墨的账，被赶出宫，在长安街口支起汤饼摊，只想站稳脚跟、把脏水洗净。摆摊首日太子吃出宫中旧味，她用一道道菜把当年膳单上的漏账摆上桌。尚食局先断原料，再买通街吏封摊，最后抬出她父亲的旧罪逼她认账；查到最后，她发现父亲确实动过手，是为了替一位宫人换下要命的毒膳。最终她必须在平反和保护那位宫人之间作出选择。',
    protagonist: '阿禾，御膳房掌勺出身的女厨，想靠自己的手艺在长安站住，把泼在身上的脏水洗净。',
    coreConflict: '她要翻出二十年御膳贪墨真相，尚食局掌事握着父亲旧罪，也能把以食谋逆扣在她和太子头上。',
    uniquePoint: '味道就是证据：每道菜都是二十年前膳单的一页，太子每吃一口就替她验证一次旧账。',
    mainReversal: '她原以为父亲是冤枉的，最后发现父亲确实动过手，是为了替宫人换掉毒膳；平反因此变成承认罪与义同体。',
    noveltyProof: { familiarShell: '古言甜宠与市井美食翻旧案', uncommonCombination: '被顶罪出宫的掌勺女厨与微服太子靠味道和膳单翻二十年前的御膳贪墨案', avoidedPatterns: '不靠系统、重生或发现秘密一路追查', irreplaceableWhy: '去掉做菜尝味，宫中旧味、膳单漏账和毒膳这条证据链立即断掉', secondOrderConsequence: '太子频繁出宫被御史追责，父亲旧案翻转又会暴露当年被救宫人的身份，她必须在平反和保人之间选择', readerQuestion: '这口宫中旧味是谁教她的，她和二十年前的御膳贪墨案到底是什么关系？' },
  },
  {
    title: '抄书娘子当众念假契',
    hook: '替雇主抄地契时，她对照出三个字被人改过，正是这张假契吞了邻居一家的田；雇主当晚就要把她卖出去，她当着一屋子人把地契一字一句念出来，从此每抄一份都留底本。',
    description: '她从小被当牛马使唤，不识字，只能替人抄书讨口饭，最想守住的是不再被人拿一张纸就夺走家的活路。她认出假契后当众念出改字，并开始给每份抄件留底。雇主毁她住处、买通证人，乡绅用官面施压；她靠底本串起被吞田的人家。最后她认出旧案里伪造地契的人正是把自己卖掉的生父，复仇对象从雇主扩大成整条假契吞田链。',
    protagonist: '阿绫，被卖作抄书娘子的穷女，想靠自己认得的字把家的活路守住。', coreConflict: '她要护住认字秘密和底本，雇主与乡绅则用她不识字、说不清的身份反咬她诬告。', uniquePoint: '她的武器不是身份而是认字，每一个被改过的字都能变成当庭证据。', mainReversal: '旧案里伪造地契的抄书人正是把她卖掉的生父，她认字的本事与自己的来处原来是一根线。',
    noveltyProof: { familiarShell: '古言小人物翻案与对簿公堂', uncommonCombination: '不识字却被卖去抄书的穷娘子，用逐字对照和每份留底建立证据库', avoidedPatterns: '不靠身份曝光或打斗，也不是发现秘密一路追查', irreplaceableWhy: '换成绣厨医，识文断字这个主动权和底本证据链都不存在', secondOrderConsequence: '被假契坑过的人纷纷来求她辨认，乡绅集中堵她，生父身份暴露又把养大她的人家卷入旧案', readerQuestion: '一个不识字的人怎么会认出地契改字，她又是被谁卖去抄书的？' },
  },
  {
    title: '甜汤铺开在仇家对面',
    hook: '她把甜汤铺开在仇家大宅正门对面，开张头一天，仇家老太太隔窗点了她一碗甜汤，点名要她亲自送进宅。她明知有去无回仍端碗进门，决定用这碗汤把仇家的私话一句句听出来。',
    description: '她家甜汤铺被仇家做局夺走，父母一个病死一个失踪，她带着一口锅和配方把铺子开到仇家正门对面。她一碗汤送一句话，仇家几房为争家产越咬越凶；对方先查菜谱，再查她身世，最后翻出父母旧事逼她闭嘴。她后来发现父亲不是被仇家直接害死，而是替仇家背下一桩放贷逼死人的账，真正的对手另有其人。',
    protagonist: '柳甜，甜汤铺孤女，想把铺子站住并查清父母是怎么没的。', coreConflict: '她要靠送汤进出仇家查父母之死，仇家则用商会、供货和官面处罚逼她关店。', uniquePoint: '铺子的位置就是机制：正对仇家大门，一碗汤进宅，一句话出铺。', mainReversal: '父亲并非被仇家直接害死，而是替仇家背下一桩放贷逼死人的账，复仇对象转向幕后同伙。',
    noveltyProof: { familiarShell: '古言市井夺产复仇与情报周旋', uncommonCombination: '甜汤铺正对仇家大门，用送汤入宅形成贴身情报通道', avoidedPatterns: '不写被夺家产后嫁入豪门，也不靠一路追查', irreplaceableWhy: '换成普通账房或绣坊，正面对峙和送汤入宅的信息通道都会消失', secondOrderConsequence: '她递的话帮助仇家某房争到家产后反被收作眼线，仇家散伙又让欠债仆役和邻里都来找她，她被迫从个人翻案变成替一群人讨债', readerQuestion: '仇家老太太为什么非要她亲自送甜汤进去，她父母到底被谁弄没的？' },
  },
  {
    title: '卖糖人的我被指成拐子',
    hook: '摊前丢了个官家小孩，丫鬟当街指认她是拐子，官差踹翻糖摊把她押走。她当众拆开糖人模具，按孩子画下的糖人样子连夜追凶，却发现被拐的孩子都长着同一张模子脸。',
    description: '她在街口卖糖人，无亲无势，只想凭手艺挣口安稳饭。孩子在摊前丢失后，她为了自证清白拆开糖人模具，照孩子留下的样子逐个找人。每找到一个被换过身份的孩子，宗族就有人堵口，官府里保她和压她的人同时亮牌。最后她发现自己也是当年被换出去的孩子，最初指认她的人正知道她的身世。',
    protagonist: '阿棠，街头卖糖人的孤女，想凭手艺挣安稳饭并洗掉拐子的嫌疑。', coreConflict: '她要自证清白并找回孩子，换嗣团伙与宗族官面则不断改口供、堵口并逼她认祖归宗。', uniquePoint: '糖人模具是一眼可见的身份对照工具，孩子只画得出糖人样子，她追的不是凶而是谁是谁。', mainReversal: '她发现自己也是被换出去的孩子，追拐子变成追自己的来处，目标转为掀开整套换嗣规则。',
    noveltyProof: { familiarShell: '古言悬疑与街头小人物自证清白', uncommonCombination: '街头糖人手艺、同一张模子脸的换嗣机制和主角自身被换的身世反噬', avoidedPatterns: '把拐卖写成宗族换嗣而非个人作案，不靠通用秘密追查', irreplaceableWhy: '换成绣抄书医术就没有人人可画的一眼识别载体，街头手艺身份也失去意义', secondOrderConsequence: '换嗣案一掀开，被换孩子、买孩子宗族和经办者都被牵动，亲生一家找上门逼她认祖归宗，与她替别人争的选择自由直接冲突', readerQuestion: '孩子怎么在她摊前丢的，为什么被换走的孩子都长着同一张模子脸？' },
  },
];

describe('latest diagnostic idea-gate regressions', () => {
  for (const idea of latestDiagnosticGateCases) {
    it(`does not false-reject ${idea.title}`, () => {
      const assessment = gate.assess(idea, 'short_story');
      expect(assessment.issues).toEqual([]);
      expect(assessment.passed).toBe(true);
      expect(assessment.signals.hookHasAgency).toBe(true);
      expect([assessment.signals.hookHasAnomaly, assessment.signals.hookHasPressure, assessment.signals.hookHasRelationship].filter(Boolean).length).toBeGreaterThanOrEqual(2);
    });
  }
});



describe('selected-premise semantic evidence survives wording variation', () => {
  it('does not require a new regex keyword every time the same selected story is phrased differently', () => {
    const rawCard = {
      title: '反诈室友让我继续打钱',
      hook: '对面发来的话术和反诈客服室友工作群里的样本一模一样。下月房租全靠这笔押金，她仍把钱打过去，把手机交给室友全程录屏，自己继续聊。',
      description: '她只想拿回押金续住房子。第一轮交钱后，对方立刻换了收款人；随后室友发现话术来自正在追踪的团伙。她继续装作上钩，把聊天和转账路径留作证据。最后她必须在马上止损和继续拖住对方之间选择，因为室友所在团队只差最后一条资金链就能锁定收款人。',
      protagonist: '租约快到期、想拿回押金继续住下去的普通上班族。',
      coreConflict: '她要保住下月住处和押金，同时配合室友拖住骗子，任何一步提前收手都会断掉资金证据。',
      uniquePoint: '诈骗话术和反诈客服室友工作群里的样本完全重合，而主角必须假装继续上钩。',
      mainReversal: '她以为室友只是在帮她止损，后来才知道室友追的正是同一团伙；两人的目标从救一笔押金改成保住房子同时锁住资金链。',
      noveltyProof: {
        familiarShell: '合租生活加反诈悬疑',
        uncommonCombination: '租房押金、反诈客服室友和实时诈骗话术样本绑定在同一场转账里',
        avoidedPatterns: '不靠超能力或身份曝光解决诈骗',
        irreplaceableWhy: '去掉合租与押金压力，主角没有继续冒险的现实代价；去掉反诈室友，实时话术比对和录屏证据链不成立',
        secondOrderConsequence: '她继续聊天会让骗子把目标扩展到同住地址，室友也必须在保护她与追完整资金链之间重新选择',
        readerQuestion: '这笔押金到底能不能拿回来，室友为什么要求她明知有风险还继续聊下去？',
      },
    };
    const unbound = gate.assess(rawCard, 'short_story');
    expect(unbound.signals.hookHasAnomaly).toBe(false);
    expect(unbound.signals.hookHasPressure).toBe(false);
    expect(unbound.signals.hookHasAgency).toBe(false);

    const bound = bindStructuredIdeaCardToPremise({
      premiseId: 'P-natural-wording',
      workingTitle: rawCard.title,
      storyCore: '租客发现押金骗局话术与反诈室友追踪样本重合，决定继续装作上钩留下证据。',
      protagonistSituation: '租约快到期，她需要拿回押金才能保住下月住处。',
      openingEvent: '诈骗方发来的整套话术与反诈客服室友工作群里的追踪样本重合。',
      coreConflict: '她要保住押金和住处，同时拖住骗子让室友补齐资金链，两项目标互相制造风险。',
      activeChoice: '她明知对面是骗子仍决定按原节奏继续聊，把手机交给室友录屏并保留转账路径。',
      escalation: '继续配合让诈骗方扩大目标范围，也让室友必须在立即止损和追完整资金链之间取舍。',
      reversalEffect: '室友并非临时帮忙，而是在追同一团伙，私人押金纠纷变成共同承担风险的取证行动。',
      payoff: '终局必须同时兑现押金去向、资金链证据和两人对风险边界的选择。',
      irreplaceableCarrier: '合租关系带来即时反诈协作，押金又提供不能简单退出的现实利益。',
      secondOrderConsequence: '骗子把目标扩展到同住地址后，室友的职业追查会反过来威胁两人的现实住处安全。',
      readerQuestion: '明知被骗为什么还继续聊，这次继续会让她拿回押金还是失去住处？',
      differentiation: '冲突来自租房现金流和反诈室友的实时协作，而不是发现秘密后一路调查。',
    }, [rawCard]);
    const assessment = gate.assess(bound, 'short_story');
    expect(assessment.signals.hookHasAnomaly).toBe(true);
    expect(assessment.signals.hookHasPressure).toBe(true);
    expect(assessment.signals.hookHasAgency).toBe(true);
    expect(assessment.issues).not.toContain('核心钩子没有迫使主角采取具体行动或明确选择');
    expect(assessment.issues.some((item) => item.includes('短篇首屏钩子信息过弱'))).toBe(false);
  });
});
