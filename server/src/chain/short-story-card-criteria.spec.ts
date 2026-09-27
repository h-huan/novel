import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE,
  chapterResponsibilityCriteriaText,
  storyCardAuthorizationDirective,
} from '../../shared/src';

/**
 * 短篇故事卡阶段此前失败在 chain.controller.ts「短篇故事卡与已确认题材冲突：能力触发违规…」：
 * 故事卡由本平台生成，却由本平台的审查器按判据判违规——生成侧没有判据、审查侧另有一份内联复述，
 * 产物必然反复撞墙（实测 5 次 LLM 调用 / 309 秒 / 0 产出）。本 spec 锁住「三处同源」这个前提。
 */
const CHAIN_CONTROLLER_CANDIDATES = [
  path.join(process.cwd(), 'src/chain/chain.controller.ts'),
  path.join(process.cwd(), 'server/src/chain/chain.controller.ts'),
];

function readChainController(): string {
  for (const candidate of CHAIN_CONTROLLER_CANDIDATES) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8');
  }
  throw new Error('chain.controller.ts not found in: ' + CHAIN_CONTROLLER_CANDIDATES.join(', '));
}

describe('短篇故事卡能力边界（判据唯一来源）', () => {
  it('能力边界编译引用唯一判据来源，且含 CR-4 以免把设定规定的重复误判为冲突', () => {
    const directive = storyCardAuthorizationDirective();
    for (const id of ['CR-1', 'CR-2', 'CR-4', 'CR-6']) {
      expect(directive).toContain(chapterResponsibilityCriteriaText([id]));
    }
    expect(directive).toContain(CHAPTER_RESPONSIBILITY_SCOPE_DISCIPLINE);
    expect(directive).toContain('逐字授权');
  });

  it('多判据渲染用换行分隔，不再挤成一行', () => {
    expect(chapterResponsibilityCriteriaText(['CR-1', 'CR-6']).split('\n')).toHaveLength(2);
  });

  it('生成 / 审查 / 修复三处共用同一份编译，且审查提示不再内联第二份复述', () => {
    const source = readChainController();
    expect(source.split('storyCardAuthorizationDirective()').length - 1).toBe(3);
    expect(source).not.toContain('并检查每个场景机制是否违反能力触发、次数、代价、证据效力或社会程序');
  });

  it('世界观 rules 规格要求规则自洽，禁止出现互斥设定', () => {
    const source = readChainController();
    expect(source).toContain('规则之间不得互相否定');
    expect(source).toContain('任何作用于他人的效果都必须写明该效果抵达他人的授权路径');
  });
});
