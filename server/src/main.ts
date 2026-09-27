/**
 * NestJS 服务入口
 * 使用 Fastify 适配器，支持 WebSocket
 */

import { config } from 'dotenv';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

// ── 启动时加载 .env（不受 process.cwd() 影响） ──
// 从当前文件所在目录向上查找 server 根目录（含 package.json 的目录）
function findServerRoot(dir: string): string {
  let current = dir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.join(current, '..');
    if (parent === current) break; // 到达根目录
    current = parent;
  }
  return dir; // 找不到就返回原目录
}

const serverRoot = findServerRoot(__dirname);
const envPath = path.join(serverRoot, '.env');

if (fs.existsSync(envPath)) {
  const result = config({ path: envPath });
  if (result.error) {
    console.error(`[dotenv] ❌ 加载 .env 失败: ${(result.error as Error).message}`);
    console.error(`[dotenv] 尝试路径: ${envPath}`);
  }
  // 启动日志静默，仅记录错误
} else {
  // .env is optional; saved model configuration and process variables remain valid.
}

/**
 * 根据 LOG_LEVEL 环境变量映射 NestJS 日志级别
 * 可选值: error | warn | log | debug | verbose
 * 默认排除 verbose/TRACE 级别（过于冗余）
 */
/**
 * 启动前断言「运行的产物就是当前源码编译出来的」。
 *
 * 为什么必须有：后端以 node dist/src/main.js 单进程运行，源码改动不会自动生效。
 * 一旦有人绕过 restart.ps1（直接 npm run start:prod，或构建失败后重跑旧产物），
 * 端口、健康检查、单 listener 断言全都是绿的，但跑的是上一版代码 ——
 * 「明明改了却没生效 / 怎么会有旧程序 / 同一个问题反复出现」就是这么来的。
 * 这类静默陈旧无法从日志分辨，只能在启动时硬拦住。
 *
 * 判据：src 下最新的 .ts 修改时间 > dist 下最旧的 .js 修改时间 ⇒ 产物陈旧。
 * 用「最旧产物」而不是入口文件，是因为 tsc 逐个写出文件，只看入口会漏掉后写的模块。
 * 只在自己确实跑在 dist 下时检查（源码直跑、测试环境不做此断言）。
 */
function assertBuildIsFresh(): void {
  const distSegment = `${path.sep}dist${path.sep}`;
  if (!__filename.includes(distSegment)) return;
  const distRoot = path.join(serverRoot, 'dist');
  const srcRoot = path.join(serverRoot, 'src');
  if (!fs.existsSync(distRoot) || !fs.existsSync(srcRoot)) return;

  const walk = (root: string, ext: string): Array<{ file: string; mtimeMs: number }> => {
    const found: Array<{ file: string; mtimeMs: number }> = [];
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          stack.push(full);
        } else if (entry.name.endsWith(ext)) {
          found.push({ file: full, mtimeMs: fs.statSync(full).mtimeMs });
        }
      }
    }
    return found;
  };

  const sources = walk(srcRoot, '.ts');
  const artifacts = walk(distRoot, '.js');
  if (sources.length === 0 || artifacts.length === 0) return;

  const newestSource = sources.reduce((a, b) => (a.mtimeMs >= b.mtimeMs ? a : b));
  const oldestArtifact = artifacts.reduce((a, b) => (a.mtimeMs <= b.mtimeMs ? a : b));
  if (newestSource.mtimeMs <= oldestArtifact.mtimeMs) return;

  const rel = (p: string) => p.replace(serverRoot + path.sep, '').replace(/\\/g, '/');
  throw new Error(
    '后端拒绝启动：dist 产物早于源码，正在运行的是上一版代码（静默陈旧）。'
    + ` 更新的源码：${rel(newestSource.file)}（${new Date(newestSource.mtimeMs).toISOString()}）`
    + ` 最旧的产物：${rel(oldestArtifact.file)}（${new Date(oldestArtifact.mtimeMs).toISOString()}）。`
    + ' 修复：在仓库根执行 pwsh -File .\\restart.ps1，或先在 server 下执行 npm run build 再启动。',
  );
}

function getLogLevels(): Array<'log' | 'error' | 'warn' | 'debug' | 'verbose'> {
  const level = (process.env.LOG_LEVEL || 'log').toLowerCase();
  switch (level) {
    case 'error':
      return ['error'];
    case 'warn':
      return ['error', 'warn'];
    case 'log':
    case 'info':
      return ['error', 'warn', 'log'];
    case 'debug':
      return ['error', 'warn', 'log', 'debug'];
    case 'trace':
    case 'verbose':
      return ['error', 'warn', 'log', 'debug'];
    default:
      return ['error', 'warn', 'log', 'debug'];
  }
}

export async function bootstrap(options: { port?: number; host?: string } = {}): Promise<NestFastifyApplication> {
  const logLevels = getLogLevels();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: false,
      /*
        level: (() => {
          const level = (process.env.LOG_LEVEL || 'debug').toLowerCase();
          if (level === 'error') return 'error';
          if (level === 'warn') return 'warn';
          if (level === 'log' || level === 'info') return 'info';
          if (level === 'verbose' || level === 'trace') return 'debug';
          return 'debug'; // debug 级别
        })(),
      */
    }),
    {
      logger: logLevels,
    },
  );
  // 独立运行时使用系统信号关闭；桌面托管进程改走 Node IPC。Electron 的
  // Node 运行时在 Windows 上重新发送 SIGTERM 会抛 kill ENOSYS。
  if (process.env.NOVEL_MANAGED_SERVER !== '1') app.enableShutdownHooks();

  // CORS 配置 (本地开发)
  app.enableCors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'app://.'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // 全局前缀
  app.setGlobalPrefix('api/v1');

  // 显式注册 Socket.IO 适配器（NestJS + Fastify 下必须手动注册，
  // 否则 WebSocket 网关不会正确挂载，前端连接会报 "WebSocket is closed
  // before the connection is established"）
  app.useWebSocketAdapter(new IoAdapter(app));

  // Swagger / OpenAPI 文档配置
  const config = new DocumentBuilder()
    .setTitle('AI写作平台 API')
    .setDescription('AI写作平台后端服务 — 项目管理/角色/世界观/大纲/章节/伏笔/精修/导入导出/Chain编排')
    .setVersion('1.0.0')
    .addTag('project', '项目管理')
    .addTag('character', '角色系统')
    .addTag('outline', '大纲规划')
    .addTag('chapter', '章节管理')
    .addTag('world-setting', '世界观设定')
    .addTag('foreshadowing', '伏笔管理')
    .addTag('chain', '写作Chain引擎')
    .addTag('refinement', '精修与质检')
    .addTag('import-export', '导入导出')
    .addTag('author-note', "Author's Note")
    .addTag('conflict', '冲突检测')
    .addTag('inspiration', '灵感管理')
    .addTag('health', '健康检查')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // 服务端固定使用 3100。端口被占用时明确失败，避免前端和后端连接到不同实例。
  const port = options.port ?? parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? '3100', 10);
  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  try {
    await app.listen(port, host);
  } catch (err: any) {
    if (err?.code === 'EADDRINUSE') {
      throw new Error(`服务端口 ${port} 已被占用，请先关闭重复启动的服务。`);
    }
    throw err;
  }
  console.log(`[server] 服务已启动: http://${host}:${port}`);
  return app;
}

async function existingNovelServer(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = await response.json() as { status?: string };
    return body.status === 'ok';
  } catch {
    return false;
  }
}

if (require.main === module) {
  // 陈旧产物必须在占用端口之前就拦住：先起来再发现问题，只会留下一个
  // 「健康检查全绿但跑着上一版代码」的进程，用户从日志根本分辨不出来。
  try {
    assertBuildIsFresh();
  } catch (err) {
    console.error(`[server] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const cliPort = parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? '3100', 10);
  existingNovelServer(cliPort).then((running) => {
    if (running) {
      console.log(`[server] already running at http://127.0.0.1:${cliPort}; duplicate start skipped`);
      return null;
    }
    return bootstrap();
  }).then((app) => {
    if (!app) return;
    if (process.env.NOVEL_MANAGED_SERVER !== '1') return;

    let closing = false;
    const closeManagedServer = async () => {
      if (closing) return;
      closing = true;
      try {
        await app.close();
        if (process.connected) process.disconnect();
        process.exit(0);
      } catch (err) {
        console.error('[NestJS] Failed to close managed server:', err);
        process.exit(1);
      }
    };

    process.on('message', (message: unknown) => {
      if (message && typeof message === 'object' && (message as { type?: string }).type === 'shutdown') {
        void closeManagedServer();
      }
    });
    process.once('disconnect', () => { void closeManagedServer(); });
  }).catch((err) => {
    console.error('[NestJS] Failed to start server:', err);
    process.exit(1);
  });
}
