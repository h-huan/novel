/**
 * vitest 全局 setup —— 把测试进程的 DATA_DIR 钉到 os.tmpdir() 的临时目录。
 *
 * ⚠️ 防复发（历史事故，勿删勿改）：
 * 测试进程不加载 server/.env（.env 只在 main.ts 运行时入口被 dotenv 读取），
 * 因此测试里 DATA_DIR 为 undefined。历史上服务端 6 处各自用
 * `process.env.DATA_DIR || path.join(process.cwd(), 'data')` 回落，
 * 于是每跑一次测试就往仓库的 server/data（.env 里已注明"残留坏库，勿用"的目录）
 * 写出真实数据文件（custom-spell-dictionary.json / novel.db / vectors.db …），
 * 造成"刚清理掉的旧目录又长出来"。证据：2026-09-23 08:16:36 该目录被重新写出。
 *
 * 现在有两道防线：
 *   1. 数据目录唯一来源是 src/config/data-dir.ts（不再有 cwd 回落）。
 *   2. 本文件把 DATA_DIR 指到临时目录 —— setupFiles 早于任何 spec 的模块导入执行，
 *      所以所有服务实例（DatabaseService / SpellCheckService / ModelRouterService …）
 *      拿到的都是临时目录，永远写不进仓库。
 * 需要自己指定目录的 spec（如 routing/model-discipline.spec.ts 用 mkdtempSync）
 * 仍可在 beforeAll 里改写 process.env.DATA_DIR，resolveDataDir() 不缓存，会读到新值。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'novel-vitest-data-'));
process.env.DATA_DIR = dir;