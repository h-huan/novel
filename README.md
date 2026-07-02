# AI 写作平台 / Novel AI Platform

> 面向长篇、短篇小说创作的 AI 辅助写作平台。桌面客户端 + 后端服务一体化，覆盖灵感发现、项目创建、大纲规划、角色系统、世界观设定、章节写作、伏笔管理、状态维护、精修质检、导入导出等创作全流程。

## 项目简介

AI 写作平台是一个单用户桌面应用，将 AI 大语言模型能力深度融入小说创作工作流。平台通过 Prompt Chain 编排引擎实现"天龙8步法"正文生成、短篇三步骤题材生成，配合 24 维角色状态引擎、65 条世界观约束体系、全生命周期伏笔管理、多级冲突检测、11 种精修质检服务，为创作者提供从灵感到成稿的完整工具链。

- **桌面客户端** (`desktop/`)：Electron + React 桌面应用，提供完整编辑器、AI 写作面板、角色/世界观/大纲/伏笔管理界面
- **后端服务** (`server/`)：NestJS + Fastify 后端，集成 Prompt Chain 引擎、RAG 向量知识库、多模型路由、冲突检测引擎

## 总体架构

```
┌─────────────────────────────────────────────────┐
│                 桌面客户端 (desktop/)             │
│   Electron 主进程 + React 渲染进程 + Vite 开发    │
│                                                   │
│   ┌──────────┐  ┌──────────┐  ┌───────────────┐ │
│   │ 编辑器    │  │ AI写作面板 │  │ 10个Zustand   │ │
│   │ Monaco   │  │ F1/F2/F3  │  │ Store状态管理  │ │
│   └──────────┘  └──────────┘  └───────────────┘ │
└──────────────────────┬──────────────────────────┘
                       │ HTTP (REST + SSE)
                       ▼
┌─────────────────────────────────────────────────┐
│                 后端服务 (server/)               │
│        NestJS 10 + Fastify (端口 3100)           │
│                                                   │
│   ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ │
│   │ Chain   │ │ RAG    │ │ State  │ │Routing  │ │
│   │ 引擎    │ │ 向量库  │ │ 24维   │ │多模型   │ │
│   └─────────┘ └────────┘ └────────┘ └─────────┘ │
│   ┌─────────┐ ┌────────┐ ┌────────┐ ┌─────────┐ │
│   │精修质检  │ │导入导出 │ │冲突检测 │ │灵感管理  │ │
│   └─────────┘ └────────┘ └────────┘ └─────────┘ │
│                      │                            │
│         ┌────────────┼────────────┐              │
│         ▼            ▼            ▼              │
│   node:sqlite    ChromaDB    OpenAI SDK          │
│   (主数据库)     (向量检索)   (LLM调用)           │
└─────────────────────────────────────────────────┘
```

## 目录结构

```
novel-ai-platform/
├── desktop/                       # Electron + React 桌面客户端
│   ├── src/
│   │   ├── main/                  # Electron 主进程 (main.ts + preload.ts)
│   │   │   ├── main.ts            # 主进程入口 (661行)
│   │   │   └── preload.ts         # 预加载脚本 (IPC桥接)
│   │   └── renderer/             # React 渲染进程
│   │       ├── main.tsx           # React 入口
│   │       ├── App.tsx            # 根组件
│   │       ├── router.tsx         # 路由配置 (22条路由)
│   │       ├── index.css          # 全局样式
│   │       ├── lib/
│   │       │   └── api.ts         # HTTP API 客户端
│   │       ├── stores/            # 10个Zustand Store
│   │       │   ├── projectStore.ts
│   │       │   ├── chapterStore.ts
│   │       │   ├── characterStore.ts
│   │       │   ├── outlineStore.ts
│   │       │   ├── foreshadowingStore.ts
│   │       │   ├── worldStore.ts
│   │       │   ├── editorStore.ts
│   │       │   ├── appStore.ts
│   │       │   ├── materialStore.ts
│   │       │   └── inspirationStore.ts
│   │       ├── pages/             # 23 个页面组件
│   │       └── components/        # 20 个可复用组件
│   ├── e2e/                       # Playwright E2E 测试
│   ├── electron-builder.yml       # 打包配置
│   ├── vitest.config.ts           # 单元测试配置
│   ├── playwright.config.ts       # E2E 测试配置
│   └── package.json
├── server/                        # NestJS 后端服务
│   ├── src/
│   │   ├── main.ts                # 入口 (端口 3100)
│   │   ├── app.module.ts          # 根模块 (导入20个子模块)
│   │   ├── modules/               # 13 个业务模块
│   │   │   ├── project/           # 项目管理 CRUD
│   │   │   ├── character/         # 角色系统
│   │   │   ├── outline/           # 大纲系统
│   │   │   ├── chapter/           # 章节管理
│   │   │   ├── foreshadowing/     # 伏笔管理
│   │   │   ├── world-setting/     # 世界观设定
│   │   │   ├── file-storage/      # 文件存储 (.md持久化)
│   │   │   ├── websocket/         # WebSocket通信
│   │   │   ├── refinement/        # 精修/质检/降AI/导出
│   │   │   ├── import-export/     # 导入导出引擎
│   │   │   ├── author-note/       # Author's Note系统
│   │   │   ├── conflict-engine/   # 冲突优先级检测
│   │   │   └── inspiration/       # 灵感管理 + 转为项目
│   │   ├── chain/                 # Prompt Chain 编排引擎
│   │   │   ├── chain-engine.service    # Chain执行引擎
│   │   │   ├── story-chain.service     # 天龙8步+三步骤Chain
│   │   │   ├── prompt-registry.service # 24个Prompt模板
│   │   │   └── writing-mode.service    # 写作模式切换
│   │   ├── routing/               # 模型路由/多模型协作
│   │   │   ├── model-router.service    # 路由引擎
│   │   │   ├── multi-model-collab      # 写手/评审/策划协作
│   │   │   ├── streaming.service       # 流式输出
│   │   │   └── failover.service        # 熔断降级
│   │   ├── rag/                   # RAG向量知识库
│   │   │   ├── vector-index.service    # 向量索引 (ChromaDB)
│   │   │   ├── hybrid-search.service   # 混合检索
│   │   │   └── context-builder.service # 上下文构建
│   │   ├── state/                 # 24维状态引擎
│   │   ├── rtco/                  # 实时上下文管理
│   │   ├── material/              # 素材库
│   │   └── database/              # 数据库层 (10个Repository)
│   ├── shared/                    # 共享类型与枚举 (@novel/shared)
│   ├── data/                      # 运行时数据与配置
│   │   ├── novel.db               # SQLite 主数据库 (WAL)
│   │   ├── state.db               # 状态引擎数据库
│   │   ├── chains/                # Chain 定义 (YAML)
│   │   │   ├── short-story-stage1.yaml  # 短篇题材生成Chain (5节点)
│   │   │   ├── short-story-stage2.yaml  # 短篇大纲生成Chain (7节点)
│   │   │   └── tianlong-8step.yaml      # 天龙8步正文Chain (10节点)
│   │   ├── styles/                # 风格配置
│   │   │   ├── builtin/           # 7种平台风格 (zhihu/fanqie/qidian/...)
│   │   │   └── templates/         # Handlebars 模板 (.hbs)
│   │   ├── sensitive-words/       # 敏感词检测规则
│   │   │   ├── policy.json        # 全局策略 (5类分级, 3种检测模式)
│   │   │   ├── builtin/words.json # 内置词库
│   │   │   ├── platforms/         # 平台特定规则
│   │   │   ├── user/              # 用户自定义词库
│   │   │   ├── whitelist/         # 白名单
│   │   │   └── replacements/      # 替换规则
│   │   ├── copyright/known-ip.json      # 版权已知IP库
│   │   └── custom-spell-dictionary.json # 自定义拼写词典
│   ├── docs/                      # 文档
│   │   ├── API.md                 # 完整 API 参考
│   │   ├── user-guide.md          # 用户指南
│   │   └── design/                # 架构设计文档 (4篇)
│   ├── e2e/                       # Playwright E2E 测试
│   └── package.json
├── docs/                          # 项目级文档
├── .gitignore
├── .nvmrc                         # Node.js 版本 (22)
├── kill-by-port.js                # 端口清理工具
├── start-dev.js                   # 一键启动开发环境
├── start-all.js                   # 一键启动全部服务
├── start.bat / start-all.bat      # Windows 启动脚本
└── README.md                      # ← 本文件（项目总入口）
```

## 技术栈

### Desktop 桌面客户端

| 类别 | 技术 |
|------|------|
| 桌面框架 | Electron 32 |
| 前端框架 | React 18 |
| 语言 | TypeScript 5 |
| 路由 | React Router v6 |
| 状态管理 | Zustand (10个Store) |
| 代码编辑器 | Monaco Editor |
| 关系图谱 | ReactFlow |
| 构建工具 | Vite |
| 打包工具 | electron-builder |
| 单元测试 | Vitest |
| E2E 测试 | Playwright |
| IPC | contextBridge + preload |

### Server 后端服务

| 类别 | 技术 |
|------|------|
| 运行时 | Node.js 22+ |
| 框架 | NestJS 10 |
| HTTP 适配器 | Fastify |
| 语言 | TypeScript 5 |
| 数据库 | node:sqlite (Node.js 22 内置，WAL 模式) |
| 向量数据库 | ChromaDB / In-Memory 降级 |
| 实时通信 | SSE / WebSocket (Socket.IO) |
| API 文档 | Swagger / OpenAPI (自动生成) |
| LLM 调用 | OpenAI SDK (兼容 DeepSeek/Claude) |
| 模板引擎 | YAML + Handlebars |
| 测试 | Vitest + Playwright (E2E) |

## 系统要求

- **Node.js >= 22.0.0**（必需——后端使用 Node.js 22 内置的 `node:sqlite` 模块）
- **操作系统**：Windows 10+ / macOS 12+ / Linux (x64)
- **内存**：≥ 4GB（日常写作流畅），≥ 8GB（AI 生成时推荐）
- **存储**：≥ 500MB 应用空间 + 项目数据空间
- **网络**：AI 生成功能需要可访问 LLM API 的网络环境

## 快速开始

### 后端启动

```bash
cd server
npm install
npm run build
npm run start:dev
```

启动后控制台会输出：

```
[NestJS] Server running on http://127.0.0.1:3100
[NestJS] API prefix: /api/v1
```

关键信息：

| 项目 | 值 |
|------|------|
| 默认端口 | `3100` |
| API 前缀 | `/api/v1` |
| Swagger 地址 | http://localhost:3100/api/docs |
| 端口占用策略 | 自动递增 (3101, 3102, ... 最多尝试 10 次) |
| 绑定地址 | `127.0.0.1`（默认，可通过 `HOST` 环境变量修改） |

> 注意：必须使用 `npm run build` 而非 `npx tsc`，因为构建脚本会自动复制 `route-config.json` 等运行时配置文件到 `dist` 目录。

### 桌面端启动

```bash
cd desktop
npm install
npm run dev
```

`npm run dev` 会自动完成：

1. 启动 Vite 开发服务器 (端口 5173)
2. 启动 Electron 窗口
3. 自动 fork 后端 NestJS 服务（使用系统 Node.js）

桌面端通过 `lib/api.ts` 中的 API 客户端访问后端，默认地址 `http://localhost:3100/api/v1`。当后端端口因占用而递增时，桌面端会通过 IPC 从主进程获取实际端口并动态更新。

> 也可以使用根目录的 `node start-dev.js` 一键启动前后端。

## 构建与打包

### 后端构建

```bash
cd server
npm run build
npm run start:prod
```

> **重要**：必须使用 `npm run build` 而非 `npx tsc`。构建脚本会在 TypeScript 编译后自动复制 `route-config.json` 等运行时配置文件到 `dist` 目录，仅用 `tsc` 会缺失这些文件导致服务启动失败。

### 桌面端构建与打包

```bash
cd desktop

# 编译（类型检查 + Vite 打包）
npm run build

# 打包为各平台安装程序
npm run pack:win            # Windows NSIS 安装包
npm run pack:mac            # macOS DMG
npm run pack:linux          # Linux AppImage
npm run dist                # 等同于 build + pack:win 一步完成
```

- `npm run build` = `tsc && vite build`（完整生产构建）
- `npx vite build` = 仅 Vite 打包（无类型检查，用于快速验证编译）

## 环境变量

在 `server/` 目录下创建 `.env` 文件配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3100` | 后端基准端口，被占用时自动递增 |
| `PORT_MAX_ATTEMPTS` | `10` | 端口占用时最多尝试次数 |
| `HOST` | `127.0.0.1` | 绑定地址 |
| `DATA_DIR` | `./data` | 数据存储目录 |
| `LOG_LEVEL` | `log` | 日志级别 (error/warn/log/debug/verbose) |
| `LLM_API_KEY` | — | 通用 LLM API Key（所有模型共用） |
| `DEEPSEEK_API_KEY` | — | DeepSeek 模型独立 Key |
| `OPENAI_API_KEY` | — | OpenAI 模型独立 Key |
| `CLAUDE_API_KEY` | — | Claude 模型独立 Key |
| `DEEPSEEK_BASE_URL` | — | DeepSeek API 自定义地址 |

> **AI 生成功能必须配置模型 API Key**。未配置时 Chain 引擎会返回错误提示，不会使用 mock 数据。也可在桌面端 Settings 页面通过 BYOK 界面运行时配置。

## 核心功能模块

### 项目管理
多项目并行管理，每个项目包含独立的角色、世界观、大纲、章节、伏笔等数据。支持项目统计、创建/删除/更新。

### 小说创作系统
基于 Prompt Chain 编排引擎，支持短篇三步骤（题材→大纲→正文）和长篇天龙8步法。提供全自动 (F1)、半自动 (F2)、手动 (F3) 三种写作模式。

### 角色系统
24 维状态引擎跟踪角色属性变化，支持人设漂移检测、角色关系图谱、状态历史查询。

### 世界观系统
65 条约束体系覆盖地理、历史、政治、经济、文化等维度，支持时代一致性检测。

### 大纲系统
多级大纲（卷→章→节），支持树形结构、拖拽排序、Goal 弧线规划、AI 大纲生成。

### 章节系统
章节 CRUD、卷管理、锁定/解锁、版本历史、快照回退、审阅流程。

### 伏笔系统
全生命周期管理（待激活→激活→回收/取消），支持超期警告、伏笔遗漏检测。

### 状态管理
24 维角色状态引擎 + 实时上下文管理 (RTCO)，维护角色在章节间的状态连续性。

### RAG 向量知识库
基于 ChromaDB 的向量检索，支持混合检索（向量+关键词）、上下文构建、素材向量化。ChromaDB 不可用时自动降级为内存存储。

### 模型路由
多模型协作（写手/评审/策划三级分工），支持熔断降级、流式输出、Failover 机制。

### Prompt Chain
YAML 定义的 Chain 编排引擎，支持节点串联、变量传递、条件分支。内置 3 个 Chain 定义 + 24 个 Prompt 模板，支持热加载和自定义。

### 精修质检
11 种精修服务：AI 痕迹检测、降 AI 处理、逐句精修、全维度质检（10 个写作维度评分）、逻辑检测、人设漂移检测、伏笔遗漏检测、错别字检查、敏感词检测、版权检测、多格式导出。

### 导入导出
支持 Markdown / TXT / EPUB / HTML / PDF / DOCX 多格式导入导出，提供导出预览（可调字体/行距/边距）、增量导出、`.novel` 项目包导入导出。

### 时间线
时间线视图管理故事事件时序，辅助创作者把握叙事节奏。

### 组织关系图
ReactFlow 驱动的组织关系可视化，展示阵营、势力、角色间的层级与关联。

### 素材库
标签化管理、风格向量化、混合检索，支持素材市场。

### 灵感发现
灵感生成（素材→题材）+ 灵感转项目（自动创建角色/世界观/伏笔/大纲/组织/地图种子实体 + Chain 智能补全）。

## 前端页面路由

路由使用 HashRouter 定义，Electron 主进程通过 URL hash 传递项目参数。

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 项目列表 | 首页，空状态引导 |
| `/project/:id` | 项目详情 | 项目基本信息 |
| `/project/:id/dashboard` | 项目仪表盘 | 4格核心数据概览 + 创作流程 |
| `/project/:id/writing` | 写作界面 | Monaco 编辑器 + AI 写作面板 (F1/F2/F3) |
| `/project/:id/characters` | 角色管理 | 角色卡 + 关系图谱 + 状态历史 |
| `/project/:id/world` | 世界观编辑 | 65 条约束体系 |
| `/project/:id/organization-map` | 组织关系图 | 势力/组织可视化 |
| `/project/:id/outline` | 大纲规划 | 多级大纲 + Goal 弧线 |
| `/project/:id/foreshadowing` | 伏笔看板 | 全生命周期管理 |
| `/project/:id/timeline` | 时间线 | 事件时序管理 |
| `/project/:id/material` | 素材库 | 素材管理 + 混合检索 + 市场 |
| `/project/:id/conflicts` | 冲突总览 | P0-P3 四级检测 |
| `/project/:id/import-export` | 导入导出 | 多格式 + 导出预览 |
| `/project/:id/refinement` | 精修面板 | 降 AI + 质检 + 敏感词/版权检测 |
| `/project/:id/style-writing` | 多风格写作 | 风格切换创作 |
| `/project/:id/visualization` | 可视化 | 关系/时序/伏笔网络 |
| `/project/:id/versions` | 版本历史 | 快照回退 |
| `/discover` | 灵感发现 | 灵感生成 + 转项目向导 |
| `/prompt-chains` | Chain 管理 | 模板编辑与执行 |
| `/news` | 热点新闻 | 新闻素材获取 |
| `/title-check` | 标题版权检测 | 标题查重 |
| `/dictionary` | 字典 | 术语/人名词典 |
| `/help` | 帮助 | 使用指南 |
| `/settings` | 系统设置 | BYOK + 模型 + 偏好 |

## 桌面端热键

| 热键 | 功能 |
|------|------|
| F1 | 全自动写作模式 |
| F2 | 半自动写作模式 |
| F3 | 手动写作模式 |
| F11 | 沉浸式创作视图切换 |
| Esc | 退出沉浸视图 |

## API 概览

- **Base URL**：`http://localhost:3100/api/v1`
- **认证方式**：无需认证（当前为单用户桌面应用）
- **请求/响应格式**：JSON
- **交互式文档**：http://localhost:3100/api/docs (Swagger UI，支持12个API标签的全部端点在线测试)

### 核心 API 分组

| API 分组 | 路径前缀 | 主要功能 |
|----------|----------|----------|
| 项目 API | `/projects` | 项目 CRUD、统计 |
| 角色 API | `/projects/:id/characters` | 角色管理、关系、状态历史 |
| 世界观 API | `/projects/:id/world-settings` | 世界观设定 CRUD |
| 大纲 API | `/projects/:id/outlines` | 大纲树形管理、移动/重排 |
| 章节 API | `/projects/:id/chapters` | 章节 CRUD、锁定、版本 |
| 伏笔 API | `/projects/:id/foreshadowings` | 伏笔全生命周期 |
| Chain API | `/chain/*` | 灵感/大纲/正文生成、续写、质检 |
| 精修 API | `/refinement/*` | 降 AI、质检、敏感词、版权 |
| 导入导出 API | `/import-export/*` | 多格式导入导出 |
| 冲突检测 API | `/conflict/*` | 四级优先级冲突检测 |
| 灵感 API | `/inspirations` | 灵感管理 + 转为项目 |
| Author's Note API | `/author-note/*` | Author's Note 管理 |

### 写作Chain端点

| 端点 | 说明 |
|------|------|
| `POST /api/v1/chain/idea-generate` | 灵感生成 (素材→题材) |
| `POST /api/v1/chain/outline-generate` | 大纲生成 (题材→大纲) |
| `POST /api/v1/chain/generate` | 正文生成 (天龙8步法) |
| `POST /api/v1/chain/long-outline-generate` | 长篇大纲生成 |
| `POST /api/v1/chain/long-write` | 长篇正文生成 |
| `POST /api/v1/chain/continue` | 续写 |
| `POST /api/v1/chain/enhance-opening` | 开头强化 |
| `POST /api/v1/chain/enhance-reversal` | 反转强化 |
| `POST /api/v1/chain/adapt-platform` | 平台改写 |
| `POST /api/v1/chain/generate-title` | 标题生成 |
| `POST /api/v1/chain/quality-check` | 质检 |
| `POST /api/v1/chain/chapter-transition` | 章节衔接 |
| `POST /api/v1/chain/chapter-summary` | 前情提要 |
| `POST /api/v1/chain/hook-detect` | 钩子检测 |
| `POST /api/v1/chain/memory-health` | 记忆健康检查 |

## 数据配置说明

运行时配置存储在 `server/data/` 目录：

- **chains/\*.yaml**: Prompt Chain 定义，可编辑后调用 `POST /chain/templates/reload` 热加载
- **styles/builtin/\*.yaml**: 7 种平台风格配置，修改后影响 AI 生成风格
- **sensitive-words/**: 敏感词检测规则，支持内置词库 + 用户自定义 + 平台覆盖
- **copyright/known-ip.json**: 版权检测已知作品库
- **custom-spell-dictionary.json**: 自定义拼写词典

## 测试

### 后端测试

```bash
cd server

# 单元测试 (Vitest, 21 个 spec, 210+ 测试点)
npm test

# 运行特定模块测试
npx vitest run src/modules/refinement/
npx vitest run src/modules/import-export/

# E2E 测试 (Playwright, 需要先启动服务)
npm run test:e2e
```

后端测试覆盖：

| 类型 | 文件数 | 覆盖内容 |
|------|--------|---------|
| 单元测试 | 21个 | 全部业务模块 service 层 |
| E2E 流程 | 4个 | 项目CRUD / 写作流程 / 章节管理 / 导入导出 |
| E2E 专项 | 3个 | 锁定机制 / 导入导出详细 / 冲突优先级 |
| E2E 质量 | 3个 | AI质量回归 / RAG评测 / 内容安全 |
| E2E 性能 | 1个 | API性能基准 |

### 桌面端测试

```bash
cd desktop

# 单元测试 (Vitest)
npm test
npm run test:watch          # 监视模式

# E2E 测试 (Playwright, 需要后端服务运行)
npm run test:e2e
npm run test:e2e:ui         # 可视化模式

# 全部测试
npm run test:all
```

桌面端测试覆盖：

| 类型 | 文件数 | 覆盖内容 |
|------|--------|---------|
| E2E 流程 | 3个 | 项目管理 / 写作流程 / 导入导出 |
| E2E 专项 | 2个 | 锁定机制 / 冲突检测 |
| E2E 性能 | 1个 | 首页加载<5s, 页面切换<3s |
| 单元测试 | 1个 | Zustand Store 结构验证 |

## 核心数据统计

| 指标 | 数值 |
|------|------|
| Desktop 源文件 | 62 个 .ts/.tsx |
| Desktop 页面 | 23 个 |
| Desktop 组件 | 20 个 |
| Desktop Zustand Store | 10 个 |
| Server 源文件 | 147 个 .ts |
| Server 业务模块 | 13 个 |
| Server 核心引擎 | 7 个 (RAG/State/RTCO/Chain/Routing/Material/Database) |
| Server 精修服务 | 11 个 |
| Server 测试文件 | 32 个 (21 单元 + 11 E2E) |
| Server Chain 定义 | 3 个 YAML |
| Server 风格配置 | 7 个平台 YAML |

## 文档入口

| 文档 | 路径 | 说明 |
|------|------|------|
| 项目总入口 | `README.md` | 本文件 |
| API 参考 | `server/docs/API.md` | 完整 API 端点文档 |
| 用户指南 | `server/docs/user-guide.md` | 功能使用指南 |
| 设计文档 | `server/docs/design/` | 架构设计文档 (4 篇) |
| Swagger UI | http://localhost:3100/api/docs | 交互式 API 文档（需启动后端） |

## 开发约定

- **后端构建必须使用 `npm run build`**，不要只使用 `npx tsc`，因为构建脚本会复制运行时配置文件
- **不应提交的文件**：数据库 (`*.db`)、日志 (`*.log`)、运行时缓存 (`.port`)、`.env`、构建产物 (`dist/`, `dist-electron/`, `release/`)、`node_modules/`
- **当前为单用户桌面应用**，API 无需认证
- **如后续转为 Web 多用户部署**，需要补充：用户鉴权、权限控制、数据隔离、HTTPS、部署文档

## 推荐开发顺序

1. **安装 Node.js 22+**（确认 `node -v` 输出 >= 22.0.0）
2. **配置 `server/.env`**：至少设置一个 LLM API Key（如 `DEEPSEEK_API_KEY`）
3. **启动后端**：`cd server && npm install && npm run build && npm run start:dev`
4. **访问 Swagger 验证 API**：打开 http://localhost:3100/api/docs 确认服务正常
5. **启动桌面端**：`cd desktop && npm install && npm run dev`
6. **创建项目**：在桌面端首页创建一个测试项目
7. **验证主流程**：依次测试角色创建、大纲生成、章节写作、Chain 执行、精修质检、导入导出
8. **打包发布**：确认主流程无误后，执行 `npm run build && npm run pack:win` 打包
