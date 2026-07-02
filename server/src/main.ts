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
import { AppModule } from './app.module';
import { VectorIndexService } from './rag/vector-index.service';
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
  } else {
    console.log(`[dotenv] ✅ 加载 .env 成功: ${envPath}`);
    if (result.parsed) {
      console.log(`[dotenv] 注入变量: ${Object.keys(result.parsed).join(', ')}`);
    }
  }
} else {
  console.error(`[dotenv] ❌ .env 文件不存在: ${envPath}`);
}

console.log(`[dotenv] process.cwd() = ${process.cwd()}`);
console.log(`[dotenv] DEEPSEEK_API_KEY: ${process.env.DEEPSEEK_API_KEY ? '已设置(len=' + process.env.DEEPSEEK_API_KEY.length + ')' : '❌ 未设置'}`);
console.log(`[dotenv] DEEPSEEK_BASE_URL: ${process.env.DEEPSEEK_BASE_URL || '❌ 未设置'}`);

/**
 * 根据 LOG_LEVEL 环境变量映射 NestJS 日志级别
 * 可选值: error | warn | log | debug | verbose
 * 默认排除 verbose/TRACE 级别（过于冗余）
 */
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

async function bootstrap() {
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

  // CORS 配置 (本地开发)
  app.enableCors({
    origin: ['http://localhost:5173', 'app://.'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  // 全局前缀
  app.setGlobalPrefix('api/v1');

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

  // 启动服务 — 端口自动递增，避免 EADDRINUSE
  const basePort = parseInt(process.env.PORT ?? process.env.SERVER_PORT ?? '3100', 10);
  const host = process.env.HOST ?? '127.0.0.1';

  let port = basePort;
  const maxRetries = 10;
  let started = false;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await app.listen(port, host);
      started = true;
      break;
    } catch (err: any) {
      if (err.code === 'EADDRINUSE' && i < maxRetries - 1) {
        console.warn(`[NestJS] Port ${port} occupied, trying ${port + 1}...`);
        port++;
      } else {
        throw err;
      }
    }
  }

  if (!started) {
    console.error(`[NestJS] Failed to bind to any port from ${basePort} to ${basePort + maxRetries - 1}`);
    process.exit(1);
  }

  // 启动后检查 ChromaDB 状态
  try {
    const vectorIndex = app.get(VectorIndexService);
    const health = vectorIndex.getHealthStatus();
    if (health.available) {
      console.log(`[ChromaDB] 状态: 已连接 - ${health.detail}`);
    } else {
      console.warn(`[ChromaDB] 状态: 未连接 - ${health.detail}`);
      console.warn('[ChromaDB] 向量检索将使用内存存储运行，重启后数据会丢失');
    }
  } catch (err) {
    console.warn('[ChromaDB] 无法获取向量索引状态');
  }

  console.log(`[NestJS] Server running on http://${host}:${port}`);
  console.log(`[NestJS] API prefix: /api/v1`);
  // Desktop 主进程通过此标记提取实际端口
  console.log(`[PORT] ${port}`);

  // 将实际端口写入文件，供 Vite 代理自动发现
  // 使用 process.cwd() 确保文件始终写在 server/ 根目录下
  try {
    const portFile = path.resolve(process.cwd(), '.port');
    fs.writeFileSync(portFile, String(port), 'utf8');
    console.log(`[NestJS] Port written to .port: ${port}`);
  } catch (e) {
    console.warn('[NestJS] Failed to write .port file:', e);
  }
}

bootstrap().catch((err) => {
  console.error('[NestJS] Failed to start server:', err);
  process.exit(1);
});
