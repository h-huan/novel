/**
 * 「白描/朴素」类文风宽松关键词的【唯一来源守卫】。
 *
 * 为什么要有这道守卫：这批关键词（白描 / 朴素 / 现实 / 日常 / 群像叙事）同时被
 * 硬线扫描器（阈值加长）与节奏画像（platform-benchmarks 的回报密度放宽）需要。
 * 历史上它在两处各写了一份正则字面量 —— 改一处必漏另一处，于是同一个文风
 * 在硬红线里放宽了、在节奏画像里没放宽（或反过来），用户选了「白描/朴素」却拿到两套互相矛盾的口径。
 *
 * 规则：server/src 的运行时代码里，任何【代码行】（注释不算）只要同时出现
 * 两个以上这批关键词、又带 `|`（即自己拼了一张 alternation 表），就是第二份副本。
 * 唯一允许的写法是从 shared 的 STYLE_PUNCTUATION_RELAX_KEYWORDS 派生。
 * 注释里为了记录历史教训而引用原字面量是允许的 —— 注释不参与执行。
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { STYLE_PUNCTUATION_RELAX_KEYWORDS } from '../../../shared/src';

function findSourceRoot(): string {
  const candidates = [path.join(process.cwd(), 'src'), path.join(process.cwd(), 'server', 'src')];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'modules'))) return c;
  }
  throw new Error('找不到 server/src（cwd=' + process.cwd() + '）');
}

function collectRuntimeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__mocks__' || entry.name === 'node_modules') continue;
      collectRuntimeFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉整行注释（`*` / `//` / `/*` 开头）后的“代码行”；注释里引用历史字面量是允许的。 */
function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

describe('文风宽松关键词唯一来源：不得在代码里再拼第二张 alternation 表', () => {
  it('server/src 运行时代码只有 shared 这一份来源', () => {
    const root = findSourceRoot();
    const keywords = [...STYLE_PUNCTUATION_RELAX_KEYWORDS];
    const offenders: string[] = [];

    for (const file of collectRuntimeFiles(root)) {
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || isCommentLine(trimmed)) return;
        if (!line.includes('|')) return;
        const hits = keywords.filter((keyword) => line.includes(keyword));
        if (hits.length >= 2) {
          offenders.push(`${path.relative(root, file)}:${index + 1} → ${trimmed.slice(0, 120)}`);
        }
      });
    }

    expect(
      offenders,
      '这些代码行自己拼了一张文风宽松关键词表（第二份副本）；请改为从 shared 的 STYLE_PUNCTUATION_RELAX_KEYWORDS 派生：\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
