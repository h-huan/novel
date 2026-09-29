import { describe, expect, it } from 'vitest';
import { IdeaAppealGateService } from './idea-appeal-gate.service';

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
