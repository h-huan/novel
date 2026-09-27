import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 运行时可加载性红线（2026-09-23 实际打断过一次后端启动）。
 *
 * server/src/** 会被 tsc 编译进 dist，并由 `node dist/src/main.js` 直接 require。
 * 对 @novel/shared 的【值导入】（import { X } / import { X, type Y } / re-export）
 * 会被原样编译成 require('@novel/shared')，而该包经 node_modules 软链指向
 * shared/src/index.ts（package.json 的 main 就是 .ts 本身）。
 * Node 24 的类型剥离明确拒绝处理 node_modules 下的 .ts：
 *   ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING → 后端启动即崩，日志只有这一行。
 *
 * 运行时代码只有一种正确写法：相对路径 '../../../shared/src'
 * （与 chapter.service.ts / creative-constitution.ts 一致）。
 * @novel/shared 只允许出现在 `import type` 里 —— tsc 会整个擦除，不产生 require。
 */
describe('运行时导入纪律：dist 里不得出现 require(@novel/shared)', () => {
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

  /** 返回该文件里所有【会产生 require】的 @novel/shared 导入语句 */
  function runtimeSharedImports(text: string): string[] {
    const hits: string[] = [];
    const re = /(?:^|\n)\s*(import|export|const\s+\w+\s*=\s*require)\b[^;]{0,300}?['"]@novel\/shared['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const stmt = m[0].trim();
      if (/^import\s+type\b/.test(stmt)) continue; // 整条 type-only，tsc 会擦除
      const braces = /^import\s*\{([\s\S]*?)\}/.exec(stmt);
      if (braces) {
        const names = braces[1].split(',').map(s => s.trim()).filter(Boolean);
        // 全部带 inline `type` 修饰 → 同样被擦除；只要有一个值绑定就会生成 require
        if (names.length > 0 && names.every(n => /^type\s/.test(n))) continue;
      }
      hits.push(stmt.split('\n')[0].slice(0, 120));
    }
    return hits;
  }

  it('server/src 下没有任何会产生 require(@novel/shared) 的导入', () => {
    const root = findSourceRoot();
    const files = collectRuntimeFiles(root);
    expect(files.length).toBeGreaterThan(50);
    const violations: string[] = [];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const stmt of runtimeSharedImports(text)) {
        violations.push(path.relative(process.cwd(), file) + ' :: ' + stmt);
      }
    }
    expect(violations).toEqual([]);
  });

  it('shared 会被编译进 dist，相对路径导入在产物里能落地', () => {
    const root = findSourceRoot();
    const repoRoot = path.dirname(root);
    const distShared = path.join(repoRoot, 'dist', 'shared', 'src', 'index.js');
    // 只在已经构建过时才断言产物存在，避免未构建环境下误报
    if (fs.existsSync(path.join(repoRoot, 'dist'))) {
      expect(fs.existsSync(distShared)).toBe(true);
    }
  });
});