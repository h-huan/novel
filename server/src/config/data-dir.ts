/**
 * 数据目录解析 —— 全仓库唯一事实源（唯一一份，禁止再手写副本）。
 *
 * ⚠️ 防复发（历史事故，勿改回）：
 * 2026-09 之前，下面这 6 处各自手写了一遍数据目录解析，写法还不一致：
 *   - src/database/database.service.ts
 *   - src/state/state-persistence.service.ts
 *   - src/rag/vector-index.service.ts
 *   - src/routing/model-router.service.ts      ← 唯一用了 process.cwd 的别名 cwd()
 *   - src/modules/file-storage/file-storage.service.ts
 *   - src/modules/refinement/spell-check.service.ts
 * 旧写法统一是 `process.env.DATA_DIR || path.join(process.cwd(), 'data')`。
 * 实测后果：vitest 不加载 server/.env（.env 只在 main.ts 运行时入口被 dotenv 读取），
 * 于是测试进程里 DATA_DIR 未定义 → 六处全部回落到 `server/data`（.env 里已注明
 * 「默认 ./data 为残留坏库，勿用」的废弃目录）→ 每次跑测试都会在「已清理的旧目录」
 * 里重新长出文件。证据：server/data/custom-spell-dictionary.json 于 2026-09-23 08:16:36
 * 被重新写出（旧目录删除后再次出现）。
 * 因此：任何需要数据目录的代码一律调用本模块，不得再手写解析逻辑。
 *
 * 为什么锚定 server 根而不是 process.cwd()：
 * cwd 随启动方漂移（仓库根 / server / 各测试 runner 各不相同），会让不同模块
 * 指向不同目录 —— 这正是「同一次运行出现多份数据目录」的根因。
 * server 根 = 从本文件所在目录向上找到的第一个含 package.json 的目录。
 */

import * as fs from 'fs';
import * as path from 'path';

function findServerRoot(dir: string): string {
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.join(current, '..');
    if (parent === current) break; // 到达文件系统根
    current = parent;
  }
  return dir; // 找不到就退回原目录
}

// vitest 以 ESM 转换执行 TS，此时 __dirname 未声明；运行时（CJS 构建产物）有。
// typeof 对未声明标识符是安全的，两者都指向「本文件所在目录」。
const moduleDir = typeof __dirname === 'string' ? __dirname : process.cwd();

/** server 根目录（含 server/package.json 的目录）。纯路径推导，不读任何环境变量。 */
export const SERVER_ROOT = findServerRoot(moduleDir);

/**
 * 解析数据目录（唯一入口）。
 *   1. 设置了 DATA_DIR → 用它；相对路径按 SERVER_ROOT 解析（不按 cwd）。
 *   2. 未设置 → SERVER_ROOT/data。
 * 刻意不缓存：测试会改写 process.env.DATA_DIR，缓存会让改写失效。
 */
export function resolveDataDir(): string {
  const raw = process.env.DATA_DIR;
  if (raw && raw.trim() !== '') {
    return path.resolve(SERVER_ROOT, raw.trim());
  }
  return path.join(SERVER_ROOT, 'data');
}