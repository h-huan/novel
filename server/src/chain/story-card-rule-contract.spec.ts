import { describe, expect, it } from 'vitest';
import {
  chapterResponsibilityCriteriaText,
  chapterResponsibilityPlanningDirective,
  storyCardAuthorizationDirective,
} from '../../shared/src';

describe('story-card world-rule execution contract', () => {
  it('treats conjunctive triggers and exact counts as non-lossy contracts', () => {
    const criteria = chapterResponsibilityCriteriaText(['CR-2', 'CR-6']);
    const directive = storyCardAuthorizationDirective();

    for (const evidence of [
      '人数、数量、证据组合',
      'A+B+C',
      '两名/三份/第N次',
      '不得把未明写当作已满足',
      '程序要件不得在故事卡、章纲或正文压缩时省略',
    ]) {
      expect(criteria).toContain(evidence);
    }

    for (const evidence of [
      '故事卡不是世界规则的摘要',
      '全部前置条件',
      '程序效果',
      '证据效力',
      'A+B+C 不能改成 A',
      '只能写申请、调查、补证、等待',
      'fix 是强制合同',
    ]) {
      expect(directive).toContain(evidence);
    }
  });

  it('uses the same lossless contract before chapter planning', () => {
    const directive = chapterResponsibilityPlanningDirective();
    expect(directive).toContain('所有受世界规则约束的事件、程序与效果');
    expect(directive).toContain('人数/数量、证据组合');
    expect(directive).toContain('不得因章纲压缩而省略会改变是否生效的必要条件');
  });

  it('does not leak a previous story-specific mechanism into generic prompts', () => {
    const directive = storyCardAuthorizationDirective();
    for (const staleExample of ['站点强行牵引', '列车/车门/警报/调度', '被遗忘者']) {
      expect(directive).not.toContain(staleExample);
    }
  });
});
