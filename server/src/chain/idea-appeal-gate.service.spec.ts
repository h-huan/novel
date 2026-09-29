import { describe, expect, it } from 'vitest';
import { IdeaAppealGateService } from './idea-appeal-gate.service';

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
    expect(assessment.issues.length).toBeGreaterThan(3);
    expect(assessment.readerExperienceProfile.evidence.lifeAnchor).toBe(false);
    expect(assessment.readerExperienceProfile.evidence.aspiration).toBe(false);
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

    expect(assessment.passed).toBe(false);
    expect(assessment.readerExperienceProfile.evidence.stackingRisk).toBe(true);
    expect(assessment.warnings.some((item) => item.includes('盲目叠加'))).toBe(true);
    expect(assessment.issues.some((item) => item.includes('人生利益'))).toBe(true);
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

    expect(assessment.passed).toBe(false);
    expect(assessment.signals.simpleMoralMechanismRisk).toBe(true);
    expect(assessment.signals.distinctivenessScore).toBeLessThan(6);
    expect(assessment.issues.some((item) => item.includes('单层寓言机制'))).toBe(true);
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