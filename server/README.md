# AI写作平台 — Server 后端服务

> **项目状态**: 全部完成 ✅ — 74 项 Phase 研发任务已完成 | [Desktop 客户端](../desktop/README.md) | [研发计划](../../AI写作平台研发计划.md)

## 项目简介

基于 NestJS 的全栈 AI 辅助写作平台后端服务。覆盖长篇/短篇小说创作全流程：项目管理 → 角色系统(24维状态) → 世界观设定(65条约束) → 大纲(多层+Goal弧线) → 正文写作(天龙8步法) → 伏笔管理(生命周期) → 精修质检(11种服务) → 多格式导出。

集成 Prompt Chain 编排引擎、RAG 向量知识库(ChromaDB)、多模型路由与成本优化、冲突优先级检测引擎、WebSocket 实时通信。

📖 **文档**: [API 参考](./docs/API.md) | [用户指南](./docs/user-guide.md) | Swagger UI: http://localhost:3100/api/docs

## 技术栈

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 22+ |
| 框架 | NestJS 10 + Fastify |
| 语言 | TypeScript 5 |
| 数据库 | node:sqlite (Node.js 22.5+ 内置，WAL 模式) |
| 向量库 | ChromaDB / In-Memory 降级 |
| 流式 | SSE / WebSocket (Socket.IO) |
| 测试 | Vitest + Playwright (E2E) |
| 文档 | Swagger/OpenAPI (自动生成) |
| 共享库 | `@novel/shared` (类型/枚举) |

## 目录结构

```
server/
├── src/
│   ├── main.ts                    # 入口 (端口 3100)
│   ├── app.module.ts              # 根模块 (导入20个子模块)
│   ├── modules/                   # 业务模块
│   │   ├── project/               # 项目管理 CRUD
│   │   ├── character/             # 角色系统
│   │   ├── outline/               # 大纲系统
│   │   ├── chapter/               # 章节管理
│   │   ├── foreshadowing/         # 伏笔管理
│   │   ├── world-setting/         # 世界观设定
│   │   ├── file-storage/          # 文件存储 (.md持久化)
│   │   ├── websocket/             # WebSocket通信 (写作/系统)
│   │   ├── refinement/            # 精修/质检/降AI/导出
│   │   ├── import-export/         # 导入导出引擎
│   │   ├── author-note/           # Author's Note系统
│   │   ├── conflict-engine/       # 冲突优先级检测
│   │   └── inspiration/           # 灵感管理 + 转为项目
│   ├── chain/                     # Prompt Chain 编排引擎
│   │   ├── chain-engine.service   # Chain执行引擎
│   │   ├── story-chain.service    # 天龙8步+三步骤Chain
│   │   ├── prompt-registry.service# 24个Prompt模板
│   │   └── writing-mode.service   # 写作模式切换
│   ├── routing/                   # 模型路由/多模型协作
│   │   ├── model-router.service   # 路由引擎
│   │   ├── multi-model-collab     # 写手/评审/策划协作
│   │   ├── streaming.service      # 流式输出
│   │   └── failover.service       # 熔断降级
│   ├── rag/                       # RAG知识库
│   │   ├── vector-index.service   # 向量索引 (ChromaDB)
│   │   ├── hybrid-search.service  # 混合检索
│   │   └── context-builder.service# 上下文构建
│   ├── state/                     # 24维状态引擎
│   ├── rtco/                      # 实时上下文管理
│   ├── material/                  # 素材库
│   └── database/                  # 数据库层 (10个Repository)
├── data/                           # 运行时数据与配置
│   ├── novel.db                    # SQLite 主数据库 (WAL)
│   ├── state.db                    # 状态引擎数据库
│   ├── chains/                     # Chain 定义 (YAML)
│   │   ├── short-story-stage1.yaml # 短篇题材生成Chain (5节点)
│   │   ├── short-story-stage2.yaml # 短篇大纲生成Chain (7节点)
│   │   └── tianlong-8step.yaml     # 天龙8步正文Chain (10节点)
│   ├── styles/                     # 风格配置
│   │   ├── builtin/                # 7种平台风格 (zhihu/fanqie/qidian/...)
│   │   └── templates/              # Handlebars 模板 (.hbs)
│   ├── sensitive-words/            # 敏感词检测
│   │   ├── policy.json             # 全局策略 (5类分级, 3种检测模式)
│   │   ├── builtin/words.json      # 内置词库
│   │   ├── platforms/              # 平台特定规则 (jinjiang/fanqie/qidian)
│   │   ├── user/                   # 用户自定义词库
│   │   ├── whitelist/              # 白名单
│   │   └── replacements/           # 替换规则
│   ├── copyright/known-ip.json     # 版权已知IP库
│   └── custom-spell-dictionary.json# 自定义拼写词典
├── docs/                           # 文档
│   ├── API.md                      # 完整 API 参考
│   └── user-guide.md               # 用户指南
└── e2e/                            # E2E 测试 (Playwright)
    ├── flows/                      # 核心流程测试 (4个)
    ├── specialized/                # 专项测试 (3个)
    ├── quality/                    # 质量/安全测试 (3个)
    └── performance/                # 性能测试 (1个)
```

## 快速开始

```bash
# 安装依赖
cd server
npm install

# 编译 TypeScript（含复制配置文件）
npm run build

# 开发运行
npm run start:dev
# 或: node dist/src/main.js  (生产模式)
```

> 注意：必须使用 `npm run build` 而非 `npx tsc`，因为构建脚本会自动复制 `route-config.json` 等运行时配置文件到 `dist` 目录。

# 仅类型检查 (不编译输出)
npm run typecheck

# 运行测试
npx vitest run

# 编译构建
npm run build

# 运行编译产物
npm run start:prod
```

## API 概览

服务默认运行在 `http://localhost:3100`，API 前缀为 `/api/v1`。

### 核心端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/project` | GET/POST | 项目管理 |
| `/api/v1/character` | GET/POST/PUT/DELETE | 角色管理 |
| `/api/v1/outline` | GET/POST/PUT/DELETE | 大纲管理 |
| `/api/v1/chapter` | GET/POST/PUT/DELETE | 章节管理 |
| `/api/v1/foreshadowing` | GET/POST/PUT/DELETE | 伏笔管理 |
| `/api/v1/chain/*` | POST | 写作Chain引擎 |
| `/api/v1/refinement/*` | POST | 精修/质检 |
| `/api/v1/import-export/*` | GET/POST | 导入导出 |
| `/api/v1/author-note/*` | GET/POST | Author's Note |
| `/api/v1/conflict/*` | GET/POST | 冲突检测 |
| `/api/v1/inspirations` | GET/POST/PUT/DELETE | 灵感管理 + 转为项目 |

### 写作Chain端点 (`/api/v1/chain/`)

| 端点 | 说明 |
|------|------|
| `POST /idea-generate` | 灵感生成 (素材→题材) |
| `POST /outline-generate` | 大纲生成 (题材→大纲) |
| `POST /generate` | 正文生成 (天龙8步法) |
| `POST /long-outline-generate` | 长篇大纲生成 |
| `POST /long-write` | 长篇正文生成 |
| `POST /continue` | 续写 |
| `POST /enhance-opening` | 开头强化 |
| `POST /enhance-reversal` | 反转强化 |
| `POST /adapt-platform` | 平台改写 |
| `POST /generate-title` | 标题生成 |
| `POST /quality-check` | 质检 |
| `POST /chapter-transition` | 章节衔接 |
| `POST /chapter-summary` | 前情提要 |
| `POST /hook-detect` | 钩子检测 |
| `POST /memory-health` | 记忆健康检查 |

## 测试

```bash
# 运行全部单元测试 (21个spec, 210+ 测试点)
npx vitest run

# 运行E2E测试 (需要先启动服务)
npx playwright test --config e2e/playwright.config.ts

# 运行特定模块
npx vitest run src/modules/refinement/
npx vitest run src/modules/import-export/

# 监视模式
npx vitest --watch
```

### 测试覆盖

| 类型 | 文件数 | 覆盖内容 |
|------|--------|---------|
| 单元测试 | 21个 | 全部业务模块 service 层 |
| E2E 流程 | 4个 | 项目CRUD / 写作流程 / 章节管理 / 导入导出 |
| E2E 专项 | 3个 | 锁定机制 / 导入导出详细 / 冲突优先级 |
| E2E 质量 | 3个 | AI质量回归 / RAG评测 / 内容安全 |
| E2E 性能 | 1个 | API性能基准 |

## 本地开发

```bash
cd server
npm install

# 编译 TypeScript
npx tsc

# 启动服务（默认端口 3100，被占用自动 +1）
node dist/src/main.js
```

支持环境变量：
- `PORT` — 基准端口（默认 3100），被占用自动递增尝试
- `PORT_MAX_ATTEMPTS` — 最多尝试次数（默认 10）
- `HOST` — 绑定地址（默认 127.0.0.1）
- `DATA_DIR` — 数据目录（默认 `./data`）
- `LLM_API_KEY` — AI 模型 API Key
- `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` / `CLAUDE_API_KEY` — 各模型独立 Key

## API 文档 (Swagger)

启动服务后访问交互式 API 文档：

```
http://localhost:3100/api/docs
```

支持 12 个 API 标签的全部端点在线测试，无需额外工具。

完整 API 参考见 [`docs/API.md`](./docs/API.md)。

## 数据配置说明

运行时配置存储在 `data/` 目录：

- **chains/*.yaml**: Prompt Chain 定义，可编辑后调用 `POST /chain/templates/reload` 热加载
- **styles/builtin/*.yaml**: 7 种平台风格配置，修改后影响 AI 生成风格
- **sensitive-words/**: 敏感词检测规则，支持内置词库 + 用户自定义 + 平台覆盖
- **copyright/known-ip.json**: 版权检测已知作品库
- **custom-spell-dictionary.json**: 自定义拼写词典

## 平台架构总览

```
novel-ai-platform/
├── server/                    # NestJS 后端 (147 .ts 文件)
│   ├── src/modules/           # 12 个业务模块
│   ├── src/chain/             # Prompt Chain 编排引擎
│   ├── src/routing/           # 多模型路由
│   ├── src/rag/               # RAG 向量知识库
│   ├── src/state/             # 24 维状态引擎
│   ├── data/                  # 运行时配置 (chains/styles/sensitive-words)
│   ├── docs/                  # 文档 (API + 用户指南 + 设计文档)
│   │   ├── API.md              # API 参考
│   │   ├── user-guide.md       # 用户指南
│   │   └── design/             # 架构设计文档 (4篇)
│   └── e2e/                   # Playwright E2E 测试 (11 个)
├── desktop/                   # Electron + React 客户端 (62 源文件)
│   ├── src/renderer/pages/    # 23 个页面
│   ├── src/renderer/components/ # 20 个组件
│   ├── src/renderer/stores/   # 10 个 Zustand Store
│   ├── e2e/                   # Playwright E2E 测试 (7 个)
│   └── src/__tests__/         # Vitest 单元测试
└── .github/workflows/ci.yml  # CI/CD 流水线
```

## 核心数据

| 指标 | 数值 |
|------|------|
| Server 源文件 | 147 .ts |
| 业务模块 | 13 个 |
| 核心引擎 | 7 个 (RAG/State/RTCO/Chain/Routing/Material/Database) |
| 精修服务 | 11 个 |
| 测试文件 | 32 个 (21 单元 + 11 E2E) |
| Chain 定义 | 3 个 YAML |
| 风格配置 | 7 个平台 YAML |

## 关联文档

| 文档 | 路径 |
|------|------|
| 研发计划 | [`../../AI写作平台研发计划.md`](../../AI写作平台研发计划.md) |
| Desktop 客户端 | [`../desktop/README.md`](../desktop/README.md) |
| API 参考 | [`./docs/API.md`](./docs/API.md) |
| 用户指南 | [`./docs/user-guide.md`](./docs/user-guide.md) |
| 设计文档 | [`./docs/design/`](./docs/design/) |
| Swagger UI | http://localhost:3100/api/docs |
