import { it, expect } from 'vitest';
import { isMissingStandardFinding, qualityIssue, qualityGate } from './quality-issue';
import { QualityInspectionService } from '../refinement/quality-inspection.service';
it('normalizes severity, anchors real evidence, and blocks independently of scores', () => {
  const issue = qualityIssue({ projectId: 'p', stage: 'world', ruleId: 'contradiction', source: 'gate',
    severity: 'CRITICAL', message: '冲突', quote: '太阳从西边升起', content: '清晨，太阳从西边升起。' });
  expect(issue.evidence).toMatchObject({ verified: true, start: 3 });
  expect(qualityGate([issue], true).passed).toBe(false);
  expect(qualityGate([issue], false).status).toBe('blocked');
  expect(qualityGate([{ ...issue, status: 'resolved' }], true).passed).toBe(true);
  expect(qualityGate([], false).passed).toBe(false);
});
it('does not fabricate evidence offsets or diagnostics', () => {
  const issue = qualityIssue({ projectId: 'p', stage: 'chapter', ruleId: 'warning', source: 'legacy', message: '缺信息' });
  expect(issue.evidence.start).toBeNull();
  expect(issue.evaluation).toBe('insufficient_evidence');
  const service = new QualityInspectionService();
  const text = '早上他走进房间。晚上他走出房间。';
  const result = service.inspect(text);
  expect(result.overallScore).toBeNull();
  expect(result.logicIssues).toEqual([]);
  expect(result.characterDrift).toEqual([]);
  expect(result.foreshadowingMisses).toEqual([]);
  expect(Object.values(result.dimensions).every(v => v === null)).toBe(true);
  expect(service.inspect(text)).toEqual(result);
});
it('keeps one wide criterion for "the standard itself is empty" but never flags ordinary prose issues', () => {
  const missingStandard = [
    '创作宪法未设置分类：属未执行标准，必须补齐后才能继续（不得用默认值或平台推荐替代）',
    '项目卡 creativeConstitution 中 category、pov、targetAudience 为空，而世界观档案与本章详细大纲明确为现实题材、第一人称限知；本条正文遵循高权威的详细大纲与世界观档案，不影响判定。',
    '创作宪法 category 为空，无法核对本章分类归属；修复动作：补全分类字段后重评 category 维度。',
    '创作宪法 pov 为空，无法核验第一人称临场感与视角一致性；修复动作：补全POV字段后重评 pov 维度。',
  ];
  const proseIssue = [
    '正文未出现「师兄吃下锅气菜后显出毒斑」这一必需事件，本章要求的事件缺失',
    '世界观档案写的是第三日才断供，与详细大纲的断供时间线互相矛盾',
    '第2、3段短距离重复同一句身体反应描写，措辞重复且句式重复',
    '对话占比不足，本章冲突未被兑现',
    '',
  ];
  for (const text of missingStandard) expect(isMissingStandardFinding(text)).toBe(true);
  for (const text of proseIssue) expect(isMissingStandardFinding(text)).toBe(false);
});
