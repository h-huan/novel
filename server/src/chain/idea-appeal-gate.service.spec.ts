import { describe, expect, it } from 'vitest';
import { IdeaAppealGateService } from './idea-appeal-gate.service';
import { bindStructuredIdeaCardToPremise } from './idea-discovery-contract';

const gate = new IdeaAppealGateService();

const strongShort = {
  title: '遗嘱写着我家的门牌号',
  hook: '父亲葬礼后，我在遗嘱里看见自家门牌号；每次回家母亲都会从全家记忆里消失一个小时。我只剩三天查清原因，否则她会彻底消失，我决定追查父亲留下的债务和那份遗嘱。',
  description: '最初我只想守住母亲和这个家，查清父亲为什么欠下巨债。第一天，我发现债主拿着一份不公平的房屋合同逼母亲搬走；随后我起诉并追查签字人，找到父亲当年替邻居担责的证据。第二次回家，母亲忘了我，却记得合同背后的老板。最后我必须在公开证据和保住母亲名声之间选择，并用父亲留下的录音揭开真相，让真正的责任人承担代价。',
  protagonist: '一个想守住母亲和家的普通上班族',
  uniquePoint: '每次回家母亲都会短暂忘记主角，这个异常逼迫主角重新理解父亲留下的债务与责任。',
  coreConflict: '主角必须在三天内查清房屋合同与债务真相，同时保护母亲不被债主和公司逼走。',
  mainReversal: '主角发现父亲并非单纯欠债，而是替邻居和同事承担了被公司转嫁的责任；这迫使主角从“替父还债”转为公开证据、起诉真正责任人，即使会损害父亲一直维护的体面。',
};

const strongLong = {
  title: '每周一，整层人的工号都会少一个',
  hook: '公司每周一都会从系统里抹掉一个工号，所有同事也会忘记那个人；主角发现下一个是养家多年的师傅，必须在晋升考核前查出规则，否则自己也会被抹掉。',
  description: '第一阶段，主角为了保住工作和房贷，只敢偷偷核对工资单和排班表，却发现被抹掉的人承担的业绩都被上司拿走。随后他和师傅的女儿合作追查，晋升机会却要求他签下保密协议。第二阶段，公司把员工家庭困难当作压价筹码，主角第一次公开反抗后失去奖金。直到他发现工号消失并非技术故障，而是管理层长期清理举报者的手段。最终真相迫使他在个人前途、同事安全和公开证据之间不断选择，旧同盟也因利益分裂。',
  protagonist: '背着房贷、想让家人过得更稳的普通职员',
  uniquePoint: '“工号消失”把职场权力、劳动成果和人的存在感绑定在一起，主线持续追问谁有权决定一个人是否被组织记住。',
  coreConflict: '主角既要保住家庭收入，又要保护被清理的同事并找到公司篡改记录的证据。',
  mainReversal: '主角发现一直帮助自己的直属领导也是规则的执行者，但领导同样被更高层以家人医疗资源控制；敌友关系被改写，主角必须从单纯举报领导转为争取内部证人并承担失去晋升和收入的代价。',
};

describe('IdeaAppealGateService', () => {
  it('rejects a filled-in card whose conflict is generic and has no life stakes', () => {
    const assessment = gate.assess({
      title: '命运之门',
      hook: '主角发现一个秘密。',
      description: '主角不断探索，后来知道事情另有隐情，最终结束。',
      uniquePoint: '一个神秘秘密',
      coreConflict: '主角面对困难',
      mainReversal: '原来事情不是看起来那样。',
    }, 'short_story');

    expect(assessment.passed).toBe(false);
    expect(assessment.issues.length).toBeGreaterThanOrEqual(2);
    expect(assessment.readerExperienceProfile.evidence.lifeAnchor).toBe(false);
    expect(assessment.readerExperienceProfile.evidence.aspiration).toBe(false);
    expect(assessment.warnings.some((item) => item.includes('生活利益锚点'))).toBe(true);
  });

  it('accepts a strong short card and configures concentrated payoffs instead of stacking every emotion', () => {
    const assessment = gate.assess(strongShort, 'short_story');

    expect(assessment.passed).toBe(true);
    expect(assessment.signals.distinctivenessScore).toBeGreaterThanOrEqual(6);
    expect(assessment.signals.simpleMoralMechanismRisk).toBe(false);
    expect(assessment.signals.forcedTradeoff).toBe(true);
    expect(assessment.signals.secondOrderConsequence).toBe(true);
    expect(assessment.signals.descriptionProgressions).toBeGreaterThanOrEqual(2);
    expect(assessment.signals.openingDeliversPromise).toBe(true);
    expect(assessment.signals.reversalConsequential).toBe(true);
    expect(assessment.signals.payoffPromise).toBe(true);
    expect(assessment.readerExperienceProfile.densityMode).toBe('短篇集中兑现');
    expect(assessment.readerExperienceProfile.pace).toBe('偏快但保留呼吸段');
    expect(assessment.readerExperienceProfile.evidence.lifeAnchor).toBe(true);
    expect(assessment.readerExperienceProfile.evidence.aspiration).toBe(true);
    expect(assessment.readerExperienceProfile.evidence.socialFriction).toBe(true);
    expect(assessment.readerExperienceProfile.principles.reversals).toContain('不追求反转数量');
    expect(assessment.readerExperienceProfile.principles.emotionalWave).toContain('不要求喜怒哀乐逐项打卡');
    expect(assessment.readerExperienceProfile.principles.restraint).toContain('不得按固定间隔盲目叠加');
  });

  it('accepts a long card and distributes heat, reversals, pain and suspense by stage', () => {
    const assessment = gate.assess(strongLong, 'long_novel');

    expect(assessment.passed).toBe(true);
    expect(assessment.signals.descriptionProgressions).toBeGreaterThanOrEqual(3);
    expect(assessment.readerExperienceProfile.densityMode).toBe('长篇分阶段波动');
    expect(assessment.readerExperienceProfile.evidence.lifeAnchor).toBe(true);
    expect(assessment.readerExperienceProfile.evidence.socialFriction).toBe(true);
    expect(assessment.readerExperienceProfile.evidence.sustainedSuspense).toBe(true);
    expect(assessment.readerExperienceProfile.principles.reversals).toContain('按卷/阶段分布');
    expect(assessment.readerExperienceProfile.principles.emotionalPain).toContain('两次高强度情感打击之间保留恢复');
    expect(assessment.readerExperienceProfile.principles.suspense).toContain('贯穿全书的核心悬念');
  });

  it('does not reward a card for blindly stacking reversal, pain and catharsis words', () => {
    const assessment = gate.assess({
      title: '九次反转之后',
      hook: '九次反转之后真相突然出现，我必须反击，否则死亡。',
      description: '第一反转，死亡；第二反转，背叛；第三反转，牺牲；随后真相翻盘，绝望反击，倒计时失去；最终再次反转、死亡、牺牲、背叛、真相、翻盘。',
      uniquePoint: '连续反转和翻盘',
      coreConflict: '不断反转',
      mainReversal: '最终反转导致目标改变。',
    }, 'short_story');

    expect(assessment.readerExperienceProfile.evidence.stackingRisk).toBe(true);
    expect(assessment.warnings.some((item) => item.includes('盲目叠加'))).toBe(true);
    expect(assessment.warnings.some((item) => item.includes('生活利益锚点'))).toBe(true);
  });

  it('rejects a keyword-complete but single-layer moral punishment premise as too generic', () => {
    const assessment = gate.assess({
      title: '说谎带货会消失',
      hook: '主播每次说谎带货都会从直播间消失十分钟；为了保住工作和工资，他必须在老板威胁下查清规则，否则会彻底消失，他决定反击并找出真相。',
      description: '最初他为了保住工作继续直播，随后发现平台规则会惩罚说谎者；第二次消失后他调查账号记录和合同，最后举报老板并揭开真相，保住工资并让公司承担代价。',
      protagonist: '想保住工资和工作的普通主播',
      uniquePoint: '说谎带货的人会直接消失，平台记录会留下异常。',
      coreConflict: '主角必须一边保住工作一边调查平台规则并反击老板。',
      mainReversal: '原来老板知道规则，因此主角决定举报公司并改变目标。',
    }, 'short_story');

    expect(assessment.signals.simpleMoralMechanismRisk).toBe(true);
    expect(assessment.signals.distinctivenessScore).toBeLessThan(6);
    expect(assessment.warnings.some((item) => item.includes('单层因果寓言风险'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('单层寓言机制'))).toBe(false);
  });

  it('blocks missing semantic evidence on a server-bound premise instead of counting surface keywords', () => {
    const premise = {
      premiseId: 'P-semantic', protagonistSituation: '主角必须处理会直接影响自己生活的现实处境',
      openingEvent: '一个具体事件迫使主角当天作出决定', coreConflict: '两个不能同时满足的现实目标发生冲突',
      activeChoice: '主角明确选择先处理其中一个目标并承担代价', escalation: '这个选择使冲突升级并影响另一段关系',
      reversalEffect: '', payoff: '', irreplaceableCarrier: '', secondOrderConsequence: '',
      readerQuestion: '主角的选择最终会改变谁的利益和关系？', differentiation: '',
    };
    const card = bindStructuredIdeaCardToPremise(premise, [{
      title: '当天必须作出的选择',
      hook: '这是一段足够长的自然钩子，主角已经作出明确选择，但文本不靠固定异常、压力、关系关键词凑数量。',
      description: '故事沿这个选择继续推进并产生新的关系后果。', protagonist: '有具体生活目标的主角',
      coreConflict: '两个现实目标不能同时满足。', uniquePoint: '冲突载体仍需要结构化证据证明不可替代。', mainReversal: '后来出现新信息。',
    }]);
    const assessment = gate.assess(card, 'short_story');
    expect(assessment.passed).toBe(false);
    expect(assessment.issues.some((item) => item.includes('反转效果'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('终局兑现承诺'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('题材身份仍不足'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('至少应形成'))).toBe(false);
  });

  it('accepts a distinctive story whose ending promise is expressed through the forced choice and its second-order consequence', () => {
    const assessment = gate.assess({
      title: '寄件人三年前就死了',
      hook: '靠校园跑腿榜第一免学费的沈遥，接到一件寄给自己的快递，寄件人写着她妈的名字——她妈三年前就没了；取件期限七天，取件码却握在跟她争榜首的江屿手里。',
      description: '沈遥靠校园跑腿榜第一免掉一整年学费。第七天驿站通知她有件超期快递，寄件人栏写着她妈的名字。她一边抢单一边顺着这批货往下查，随后发现旧事故与江屿家有关。榜首结算前一夜，她只能选一个：把江屿挤出榜外，还是先把快递的事告诉他。她选了榜，等他退学之后才知道，赔偿协议的受益人栏里写着她弟弟的名字。',
      protagonist: '20岁大学生，想保住榜首免学费、不让弟弟辍学。',
      coreConflict: '沈遥要拿到能救自己家的榜首奖金，而唯一能解开快递的人，正是被她挤出榜外的江屿。',
      uniquePoint: '榜单分数和快递取件期限形成两条同时逼近的倒计时。',
      mainReversal: '快递不是她妈寄的，而是旧事故的赔偿文书；她保住榜首后，江屿因此退学，原本的竞争关系变成她必须承担的债。',
      noveltyProof: {
        familiarShell: '校园竞争加身世真相',
        uncommonCombination: '跑腿平台分榜排名、快递超期销毁、一场旧事故的赔偿文书',
        avoidedPatterns: '主角不是追查真相，而是在压住真相抢奖金',
        irreplaceableWhy: '去掉跑腿榜单，二选一压力不存在；去掉快递期限，真相会自然翻开',
        secondOrderConsequence: '她保住榜首，江屿因学分和收入问题退学，而赔偿协议的受益人是她弟弟',
        readerQuestion: '取件码为什么会在江屿的手机上？',
      },
    }, 'short_story');

    expect(assessment.passed).toBe(true);
    expect(assessment.signals.distinctivenessScore).toBeGreaterThanOrEqual(8);
    expect(assessment.signals.payoffPromise).toBe(true);
    expect(assessment.signals.reversalConsequential).toBe(true);
    expect(assessment.signals.secondOrderConsequence).toBe(true);
  });

  it('recognizes real pressure and protagonist action without requiring fixed gate keywords', () => {
    const assessment = gate.assess({
      title: '备注栏里的交换',
      hook: '我是外卖骑手，母亲等钱手术。常点粥的男生在备注写“不要香菜”，我照做后，母亲疼痛减轻，他却忘记我是谁。高考前三十天，我发现所有备注都是他写给我的情书。',
      description: '第一次照做后母亲疼痛减轻，接着男生开始忘记她的名字和共同回忆。她继续配送，直到发现每条备注都在交换病痛与记忆。最后她决定送最后一单，却发现订单已经取消，必须在母亲的康复与让男生恢复记忆之间选择。',
      protagonist: '19岁外卖骑手，想治好母亲并重回校园。',
      coreConflict: '她按备注配送可减轻母亲病痛，却会让男生失去关于她的记忆；她必须在救母与留住他之间选择。',
      uniquePoint: '外卖备注不是口味要求，而是病痛与记忆的交换协议。',
      mainReversal: '男生并非普通顾客，他主动用自己的记忆承担她母亲的病痛；这让两人的关系从顾客与骑手改成互相承担代价的人。',
      noveltyProof: {
        familiarShell: '外卖骑手与校园暗恋',
        uncommonCombination: '外卖备注栏、病痛转移、记忆递减绑定在同一配送动作里',
        avoidedPatterns: '避开车祸失忆和系统任务',
        irreplaceableWhy: '去掉配送和备注栏，交换机制没有日常载体；去掉遗忘代价，选择不成立',
        secondOrderConsequence: '母亲康复后，男生的升学计划被遗忘打乱，双方家庭关系也因此改变',
        readerQuestion: '最后一单取消，是他忘了她，还是故意终止交换？',
      },
    }, 'short_story');

    expect(assessment.passed).toBe(true);
    expect(assessment.signals.hookHasPressure).toBe(true);
    expect(assessment.signals.hookHasAgency).toBe(true);
    expect(assessment.signals.hookHasRelationship).toBe(true);
  });

  it('does not make social critique a mandatory ingredient for every otherwise strong story', () => {
    const assessment = gate.assess({
      title: '最后一封信会忘掉我',
      hook: '我每寄出一封信，就会忘掉一件最重要的事；只剩三封时，我决定停笔，却收到朋友写来的回信：你忘掉的，我都替你记着。',
      description: '第一封信让我忘了回家的路，第二封让我忘了朋友的生日。接着我开始把每段记忆写进本子，试着阻止遗忘。直到第三封回信出现，我发现朋友正在替我承担每次遗忘留下的后果。最后我必须选择停止通信保住记忆，还是寄出最后一封信救回他。',
      protagonist: '想保住重要记忆和朋友关系的普通学生。',
      coreConflict: '每次寄信都能解决眼前的问题，却会失去一段重要记忆；主角必须决定是否继续。',
      uniquePoint: '通信动作与记忆递减绑定，信件既是解决问题的工具也是失去关系的代价。',
      mainReversal: '主角发现朋友一直在替自己记录并承担遗忘的后果，关系从被保护者变成必须反过来保护对方的人。',
      noveltyProof: {
        familiarShell: '青春友情加轻幻想',
        uncommonCombination: '纸质通信、记忆递减、朋友代为保存记忆',
        avoidedPatterns: '不靠系统任务或身份揭露',
        irreplaceableWhy: '去掉信件，记忆递减没有可重复动作；去掉朋友关系，最后选择没有情感重量',
        secondOrderConsequence: '主角停止寄信后，朋友失去继续替她保存记忆的机会，两人的关系被迫重新建立',
        readerQuestion: '朋友为什么记得所有主角已经忘掉的事情？',
      },
    }, 'short_story');

    expect(assessment.readerExperienceProfile.evidence.socialFriction).toBe(false);
    expect(assessment.warnings.some((item) => item.includes('不是所有故事的必选项'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('现实批判'))).toBe(false);
    expect(assessment.passed).toBe(true);
  });


  it('recognizes pressure and action in real short-card hooks instead of forcing a repair for ordinary Chinese phrasing', () => {
    const antiFraud = gate.assess({
      ...strongShort,
      hook: '被裁员后她靠夜间客服兼职和合租省钱，正准备把最后一笔“解冻保证金”转给网恋的海外工程师；转账确认前一秒，新室友江砚亮出反诈客服工牌，拦下她的手：那个说要娶她的人，正拿她的照片骗下一个人。她没哭，删掉对话框，答应假装继续转账当诱饵，唯一条件是别把她写成反诈案例。',
    }, 'short_story');
    expect(antiFraud.signals.hookHasPressure).toBe(true);
    expect(antiFraud.signals.hookHasAgency).toBe(true);
    expect(antiFraud.signals.hookHasRelationship).toBe(true);

    const sleepTester = gate.assess({
      ...strongShort,
      hook: '试睡师江晚为母亲的疗养费接下高薪私单，刚铺好床，失眠三年的总裁就睡着。他递来三十天同住合约，她签字时加一条：谁动手脚，就报警，不许用钱封口。',
    }, 'short_story');
    expect(sleepTester.signals.hookHasPressure).toBe(true);
    expect(sleepTester.signals.hookHasAgency).toBe(true);
    expect(sleepTester.signals.hookHasRelationship).toBe(true);

    const cake = gate.assess({
      ...strongShort,
      hook: '母亲的手术费压在月底租约上，她半夜回店堵住偷吃报废蛋糕的男人，发现对方是刚收购商场、要她搬走的控糖总裁。她当场提出试吃抵租：他尝新品，她换租约延期。',
    }, 'short_story');
    expect(cake.signals.hookHasPressure).toBe(true);
    expect(cake.signals.hookHasAgency).toBe(true);
    expect(cake.signals.hookHasRelationship).toBe(true);

    const moderator = gate.assess({
      ...strongShort,
      hook: '她给千万粉情感主播当反黑客服，误登他账号，发现置顶私密小号只关注她一人。当夜他被曝“骗粉”，两小时内她得选：删记录保饭碗，还是替他挖出造谣源头。',
    }, 'short_story');
    expect(moderator.signals.hookHasAnomaly).toBe(true);
    expect(moderator.signals.hookHasPressure).toBe(true);
    expect(moderator.signals.hookHasAgency).toBe(true);
  });

  it('ranks higher distinctiveness ahead of lower distinctiveness after both candidates have passed', () => {
    const baseline = gate.assess(strongShort, 'short_story');
    expect(baseline.passed).toBe(true);
    const low = { ...baseline, signals: { ...baseline.signals, distinctivenessScore: 6 } };
    const high = { ...baseline, signals: { ...baseline.signals, distinctivenessScore: 9 } };
    const originalAssess = gate.assess.bind(gate);
    gate.assess = ((idea: any, storyType: 'short_story' | 'long_novel') => {
      if (idea?.title === '较弱合格题材') return low;
      if (idea?.title === '更强合格题材') return high;
      return originalAssess(idea, storyType);
    }) as typeof gate.assess;
    try {
      const selection = gate.select([{ title: '较弱合格题材' }, { title: '更强合格题材' }], 'short_story', 2);
      expect(selection.accepted).toHaveLength(2);
      expect(selection.accepted.map((item) => item.title)).toEqual(['更强合格题材', '较弱合格题材']);
    } finally {
      gate.assess = originalAssess;
    }
  });

  it('recognizes a concrete promise anchor inside the selling point instead of only its first four characters', () => {
    const assessment = gate.assess({
      ...strongShort,
      uniquePoint: '真正不可替换的机制来自每次回家触发的母亲遗忘，以及遗嘱和债务之间的连锁关系。',
      coreConflict: '两难来自房屋合同和债务证据：主角既要在三天内查清责任，也要保护母亲不被逼走。',
      mainReversal: '责任被公司转嫁给父亲，迫使主角改变目标并公开证据，即使会损害父亲一直维护的体面。',
    }, 'short_story');

    expect(assessment.signals.openingDeliversPromise).toBe(true);
    expect(assessment.passed).toBe(true);
  });

  it('enriches only accepted ideas with the profile that will travel with selectedIdea', () => {
    const selection = gate.select([
      strongShort,
      {
        title: '命运之门', hook: '一个秘密。', description: '发生一些事。', uniquePoint: '秘密', coreConflict: '困难', mainReversal: '有隐情。',
      },
    ], 'short_story', 5);

    expect(selection.accepted).toHaveLength(1);
    expect(selection.accepted[0]).not.toBe(strongShort);
    expect(selection.accepted[0].ideaAppealGate).toEqual(expect.objectContaining({
      passed: true,
      distinctivenessScore: expect.any(Number),
    }));
    expect(selection.accepted[0].readerExperienceProfile).toEqual(
      expect.objectContaining({ version: 1, storyType: 'short_story', densityMode: '短篇集中兑现' }),
    );
  });
});
