# AI 写作平台 / Novel AI Platform

> 面向长篇、短篇小说创作的 AI 辅助写作平台。桌面客户端 + 后端服务一体化，覆盖灵感发现、项目创建、大纲规划、角色系统、世界观设定、章节写作、伏笔管理、状态维护、精修质检、导入导出等创作全流程。

## 项目简介

AI 写作平台是一个单用户桌面应用，将 AI 大语言模型能力深度融入小说创作工作流。平台通过 Prompt Chain 编排引擎实现长篇/短篇正文生成（严格按已绑定详细大纲单次 LLM 调用）、短篇三步骤题材生成，配合 24 维角色状态引擎、65 条世界观约束体系、全生命周期伏笔管理、多级冲突检测、11 种精修质检服务、统一 AI 物理指纹检测，为创作者提供从灵感到成稿的完整工具链。

- **桌面客户端** (`desktop/`)：Electron + React 桌面应用，提供完整编辑器、AI 写作面板、角色/世界观/大纲/伏笔管理界面
- **后端服务** (`server/`)：NestJS + Fastify 后端，集成 Prompt Chain 引擎、RAG 向量知识库、多模型路由、冲突检测引擎


---

## 0. 接手必读（换 AI 工具 / 新对话窗口 / 首次调用先看这里）

> 任何 AI 助手或新接手的开发者，在动手改代码前**必须先通读本文件 + `server/src/modules/module-standards/module-standards.seed.ts`（功能模块唯一执行标准）**，不需要用户再次提醒。规则的唯一执行依据是「功能模块标准库」，不是 `docs/` 下的零散文档（已归纳进标准库并删除）。

### 0.1 不可违反的铁律（历史上反复踩坑，逐条对照）

1. **各平台是各平台的风格，绝不通用一套**：番茄/七猫（强冲突、快节奏、直给爽点、短句短段）、起点（设定体系、成长长线、可慢热但必有回报）、知乎盐选（第一人称、真实感、生活化悬疑与反转、留白）、晋江（人物关系、情感细腻）、小红书（情绪共鸣、话题感）。题材、大纲、角色、世界观、标题、正文、润色每一层都按目标平台分化，长/短篇也要分别分化。
2. **模型配置即真名，不映射别名、不降级、不自由发挥**：设置里配的是什么模型版本，调用日志与请求就用什么名称；未命中配置要**明确报错**，严禁偷偷换默认模型/提供商。某场景缺模型配置时，在**创建项目之前（后端，非前端）**提醒并阻断，而不是降级兜底——这正是分场景 Tab 配置的意义。
3. **不允许"说一点改一点"，更不允许改 A 出 B 的雪崩**：改动要顺着调用链闭环排查同类问题；每次同时清理发现的历史/冗余/无用代码与废弃命名；废弃端点必须先把全部活跃调用方迁移到新体系再删除，不得留断链（旧质检端点即按此迁移到统一 writing-quality 体系后删除）。
4. **创作层级完整、顺序固定、流程守卫不跳层**：灵感发现 → 大纲（**书名/标题在此阶段同步产出**）→ 世界观 → 角色 → 组织/伏笔/时间线 → 正文 → 续写 → 润色。短篇不得跳过题材/大纲直接写正文，长篇不得跳过世界观/人物/分卷规划批量写正文。
5. **创建/生成成功即自动入库**：项目与章节生成成功后立即持久化到数据库，不允许停留在"未保存"状态。
6. **原创是硬要求**：类型母题（穿越/重生/系统等）公共可用，但具体设定、人物、情节组合与表达必须原创差异化；标题/主角名/核心金手指不得撞知名作品，后置相似度/撞名校验命中要给差异化改写建议。
7. **改动必须可验证、换窗口不复发**：每次改完跑后端 `cd server && npx tsc --noEmit` 与前端 `cd desktop && npx tsc --noEmit`；涉及数据库/生成链路要补内存库运行时断言；验证后删除临时脚本与临时编译目录。**不要自行启停后端服务**（重启由用户执行），不要自行新增"关闭端口/自动重启"之类用户没要求的动作。
8. **落地页是「创作工作台」，平台级后台动作必须对用户可见**：进入应用首先是工作台（`/`，WorkbenchPage），项目的搜索/筛选/管理独立在 `/projects`（ProjectListPage）；**数据驾驶舱（总览/每日变化/生成过程三视图＋平台总览↔单本/类型/平台/时间筛选＋人话现状洞察）直接内嵌在工作台，不再另设独立“数据看板”页或跳转卡**；最新执行标准/标准发展历程从顶部导航进入。**前端是双窗口：未进项目走引导窗口（launcherRouter + LauncherLayout，顶部全局导航在这里），进项目才开主窗口（router.tsx + AppLayout/Header）；改"进入平台首先看到什么/顶部全局导航"必须改引导窗口这套，只改主窗口 router/Header 不会生效。**启动自动迁移、执行标准自归纳、生成卡点与重试轮次等后台动作，必须在界面上可见（工作台「系统状态 / 生成健康度」卡 + `GET /platform-analytics/bootstrap`），不能只存在于日志里。旧的首页内联"平台控制台条 PlatformConsoleBar"、独立 PlatformAnalyticsPage 均已删除、能力由工作台接管，不得恢复或再把平台设置堆回项目列表首页。**界面文字最小 14px：字号令牌统一在 `desktop/src/renderer/styles/tokens.css`（--font-size-xs/sm=14px 起步），新页面一律用令牌、禁止内联写小于 14px 的可读文字；作品等长列表筛选用可输入搜索的 `components/common/SearchableSelect`，不要用只能滚动的原生下拉。**

### 0.2 规则放在哪（单一事实来源）

- **执行标准（唯一权威）**：`server/src/modules/module-standards/module-standards.seed.ts`（13 个功能模块基线）+ 数据库表 `module_standards`（当前生效），由 `RealLLMService` 在每次生成时统一注入，任何模型都按同一套最新标准执行。
- **历史版本（只回顾、不执行）**：`module_standard_versions` 表 / 前端「标准发展历程」页，与最新标准物理分表、分页。
- **改规则的正确方式**：直接改 `module-standards.seed.ts` 对应模块，并把文件顶部 `SEED_BASELINE_VERSION` +1；重启后服务会确定性地用新基线覆盖当前标准、旧版归档（`trigger=seed_upgrade`，不调用模型），即"改了标准代码、重启即生效且留历史"。不要把规则再写回 `docs/` 零散 md。
- **平台风格 / 受众 / 爆款基准（唯一事实源）**：`server/src/chain/platform-benchmarks.ts` 是 9 个平台（番茄/七猫/起点/知乎盐选/抖音/小红书/晋江/规则怪谈/通用）的唯一来源——一个平台对象同时承载节奏画像、受众画像（人群/年龄/性别/场景/耐心线）、长短篇分别的可量化文本基准（对话占比、平均/超长段落、开篇多少字进冲突、回报密度、章尾钩、章节字数）、分发阈值与原创红线。生成端经 `buildBenchmarkDirective` 注入全链路，且**架构层与正文层一律按本书长短篇精确取基准（不再用长短篇合并区间）、并全部贯穿故事卡三标签**：创建主流程的世界观、章节列表规划（含章数重规划）、详细章纲、角色、关系网、世界观整理、组织地点、伏笔，以及创建后的深度补全（世界/组织/地点/大纲/伏笔 profile），每个 prompt 都同时拼「三标签（基调 storyTone / 写作风格 writingStyle / 流派 webNovelGenre，取自 settings）」+「平台唯一源 `buildPlatformStyleDirective(platform, isShort?'short_story':'long_novel')`」；独立标题 `generate-title`、章节过渡 `chapter-transition`（紧衔接/跳跃/多线三种）与正文层首版/续写/开头增强/反转增强/逐段精修/流式正文/扩详细章纲/长篇滚动补纲，统一经 `resolvePlatformToneDirective(projectId)` 从库一次读出「平台+三标签+长短篇」注入；长篇专用 `generateConfiguredLongNovelPlan` 经 styleTags 入参拿到三标签、平台基准传 long_novel；平台改写 `adapt-platform` 也直接用唯一源（已删除只覆盖 5 平台的第三套手写 platformGuides，以及无模板引用且 key 过时的 handlebars `platformLabel` 死代码）。跨模块一致性审查/修订、状态抽取、摘要等**事实类**环节刻意不带风格指令。正文层首版/续写/流式等路径统一在 prompt 顶部经 `resolvePlatformToneDirective` 注入唯一源，平台定性风格红线统一由唯一源的 `styleMust` 字段承载（如番茄“爽点明面兑现、前三章主角不憋屈”、七猫“不靠重复打脸升级”、规则怪谈“规则可验证有代价、克制煽情”），通用写作契约 `buildNarrativeQualityContract` 不再重复拼平台段；看板/质检测 `measureAgainstTarget` 做"当前值 vs 平台基准"的确定性对照（不调 LLM）。历史上的 `novel-strategy.ts`、`novel-strategy.service.ts`（复制且未接线）、controller 内只覆盖 6 平台的多套定性文案、以及残留的手写 8 平台文案 `buildPlatformNarrativeOverride` 均已并入唯一源 `styleMust` 后删除（全仓无第二份平台画像、唯一源也不会在同一 prompt 被重复注入），**禁止再新增第二套平台数值或文案**；生成链在「大纲对齐验收」之后还会用 `measureAgainstTarget` 现算一遍：若对话占比/段落厚度/开篇或章尾钩没到该平台长短篇**优秀线**，自动进入最多 2 轮 `refineToPlatformBenchmark` 定向精修（指令由唯一源 `buildBenchmarkRefinePrompt` 产出，只提短板；**精修 prompt 必带上一版正文（唯一底本）+本章大纲契约+人物白名单+避坑经验，缺 previousContent 直接抛错，禁止在真空中重写**；精修与对齐修复结果先过零 LLM 的 `refineKeepsStory` 故事身份守护（篇幅缩水<85%、或上一版出现的本书人物在新稿零命中/丢失过半即判换故事，丢弃新稿、保留上一版，根治“精修把都市文整体覆盖成另一部乡村悬疑”事故），独立埋点 `step_key=body_benchmark_refine`）——这区别于只保"及格"的硬红线下限（如番茄对话红线 15%、优秀线 35%–65%），目的是让首版在 1–2 轮内收敛到 90+ 而不是"过了红线却只有 70 分"；看板「返工与效率」用"平均基准提升轮次/被精修章数"暴露这一环节。行业经验基线可被 module-standards 自归纳结论在调用层覆盖，不改死这里。
- **时间线按书统计必须 JOIN**：`timeline_events` 表本身没有 `project_id` 列（project_id 在父表 `timelines`），任何"按书查事件"都要 `JOIN timelines t ON t.id=timeline_events.timeline_id WHERE t.project_id=?`，禁止直查 `timeline_events.project_id`（历史上此处报错被 catch 吞掉，导致按书时间线恒为空）。

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
│   ├── vitest.config.mts           # 单元测试配置
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
│   │   │   └── conflict-engine/   # 冲突优先级检测
│   │   ├── chain/                 # Prompt Chain 编排引擎
│   │   │   ├── chain-engine.service    # Chain执行引擎（长篇主创建链 generateConfiguredLongNovelPlan）
│   │   │   └── prompt-registry.service # 24个Prompt模板
│   │   ├── routing/               # 模型路由（配置什么模型就原样用什么，不映射/不别名/不降级）
│   │   │   ├── model-router.service    # 路由引擎（五场景归并/缺配置阻断）
│   │   │   └── routing.controller      # 路由配置 HTTP 接口
│   │   ├── rag/                   # RAG向量知识库
│   │   │   └── vector-index.service    # 向量索引 (ChromaDB)
│   │   ├── state/                 # 24维状态引擎
│   │   ├── material/              # 素材库
│   │   └── database/              # 数据库层 (10个Repository)
│   ├── shared/                    # 共享类型与枚举 (@novel/shared)
│   ├── data/                      # 运行时数据与配置
│   │   ├── novel.db               # SQLite 主数据库 (WAL)
│   │   ├── state.db               # 状态引擎数据库
│   │   ├── chains/                # Chain 定义 (YAML)
│   │   │   ├── short-story-stage1.yaml  # 短篇题材生成Chain (5节点)
│   │   │   ├── short-story-stage2.yaml  # 短篇大纲生成Chain (7节点)
│   │   │   └── tianlong-8step.yaml      # 已废弃，正文改为单次LLM调用
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
基于 Prompt Chain 编排引擎，支持短篇三步骤（题材→大纲→正文）和长篇正文生成（严格按已绑定详细大纲单次 LLM 调用）。提供全自动 (F1)、半自动 (F2)、手动 (F3) 三种写作模式。

**三维度标签体系**：灵感发现与项目创建时，通过三个独立维度定位作品方向，生成正文时会根据标签严格注入对应写作规则：

| 维度 | 回答的问题 | 属于什么层面 | 可选值（数量） |
|------|-----------|-------------|---------------|
| **故事基调（storyTone）** | 读者读完是什么情绪？ | 情绪层（阅读体验） | 16种：热血、爽文、搞笑、悬疑、甜宠、虐恋、权谋、爆笑、烧脑、无敌、逆袭、刀人、治愈、女强、轻松、压抑 |
| **写作风格（writingStyle）** | 文字用什么手法写？ | 文字层（叙事手法） | 12种：白描/朴素、爽文、悬疑、情感、宏大叙事、群像叙事、第一人称、第三人称、倒叙、多线叙事、日记体、对话体 |
| **网文流派（webNovelGenre）** | 主角靠什么金手指/设定变强？ | 设定层（世界观） | 17种：系统流、重生、穿越、种田、无限流、无敌流、凡人流、扮猪吃虎、诸天流、退婚流、废材流、快穿、马甲流、科技流、幕后流、直播流、DND |

三者关系：全部是多对多，没有1对1绑定。一个流派可以用多种风格写（系统流可以是白描、爽文、悬疑），一种风格可以配多种基调（白描可以是甜宠、虐恋、悬疑）。建议每个维度选1-2个，选多了等于没选。

**去AI感三层防护**：Prompt层强制"白描优先"原则（动词名词为主、少形容词、情绪藏在事里），硬红线禁止形容词堆砌、刻意感官描写、拟人化比喻、套路化表达，并含确定性规则 50「X了，Y了」两字残句链（治“退了账，走了/两下，灭了”式强行断句加符号）、51 句末语气词密度过高、52 同一环境意象相邻反复（治过渡环境描写重复）、53 同字/同构短并列（治“带了A、带了B、带了C、带了D”式同动词排比：反向引用对齐并列起点，2字动词前缀3连/1字前缀4连即判，不误伤“苹果、香蕉、橘子”正常并列）、54 形象量词错配（治“那束蛋糕”——束只配花/光等成束细长物，并排除“约束/结束/束缚”成词）；规则 34 动作链排比已收紧为“动作动词领起、同一句内紧凑连续 ≥4 个、中间不被句末/引号/冒号隔断”才判（旧实现用“任意两字+逗号”近似动作词，会把正常叙述和人物对话大面积误伤，现已改为动作动词词表+同句约束，并补了正反回归用例）；全部硬红线已从控制器抽为零依赖共享纯函数 `server/src/chain/hardline-scanner.ts`，生成链与写作质量质检共用同一事实源（禁止各写一份）；质检层检测8项AI物理指纹（排比指纹分隔符已补顿号“、”，顿号型同构排比不再漏检）（排比句、形容词密度、段落均匀度、AI高频词、句长均匀度、对话占比、标点多样性、套路化表达）；降AI引擎提供65+条确定性替换规则。写法体系、平台适配与去 AI 感规则已收敛进功能模块标准库 body/review 模块（见 §0.2）。

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

**正文自动质检与问题同步（铁律，勿回退）**：
- AI 生成正文走 canonical 保存（前端 `WritingPage` PUT `/projects/:id/chapters`，载荷带 `source:'ai_generated'`）后，`ChapterService.update` 先把该章 `auto_quality_status` 置 `running`，再通过 `queueMicrotask` 异步触发一次 `WritingQualityService.analyzeChapterQuality`（七维问题 + 平台/基调/风格/流派标签契合分落库），无需作者手动送审；手动逐字编辑（`source!=='ai_generated'`）不触发，避免边打字边调 LLM。**自动质检不再静默失败、也不再假合格（勿回退）**：综合分≥90（`BODY_QUALITY_TARGET_SCORE`）且无高危未决问题才回写 `ok`，否则回写 `needs_rewrite`（未达标·待精修，message 记分数差距/高危数/待改数），仅调用异常回写 `failed`（记人类可读原因），三态写 `chapters.auto_quality_status/auto_quality_message/auto_quality_at`（列已含于 001 初始基线，并对老库幂等补齐；手动重跑 `rerunAutoQuality` 也严格采用后端同口径结论，前端不再无条件乐观置 ok）；前端章节编辑器头部有持久状态条（达标✅绿 / 未达标🟠橙 / 失败⚠️红+「重新质检」 / 进行中⏳蓝；「重新质检」仅在 failed（质检过程失败、没出分）时显示——needs_rewrite 是已成功出分但未达标，重跑只得相近分数、对正文无改善，此时只留「查看问题」进去逐条定向精修；项目左侧主导航另设「质量诊断」项（/project/:id/writing-quality），不必从编辑器绕入，达标与未达标也都提供「查看问题」直达本章 `/writing-quality?chapterId=` 明细，`chapterStore.rerunAutoQuality` 调 `POST /projects/:id/writing-quality/analyze`、不传正文由后端读库重跑），工作台 KPI 卡按已写正文章统计 ok/failed/running/未跑数量；质检 LLM 显式 `maxTokens=16000` 防输出截断、并带 `metrics.stepKey='quality_auto'`（看板归入「优化精修」，不污染日常桶与正文版数/一次成功率）。综合分在“物理指纹30%+LLM七维70%”融合后，再用共享 `detectForbiddenTells` 对跨平台真硬伤（作者跳出/残句链/语气词/环境重复/同构排比53/量词错配54/动作清单等，不含番茄等本就允许的短段排版类）做确定性扣分（单项 4–12 分、单章封顶 25），命中明细写入报告 payload.hardlinePenalty 与摘要，根治“LLM 给语言硬伤虚高 75 分”；**标签契合（平台/基调/风格/流派 tagFit）也实质计入综合分、不再只展示**——四维均值 ≥85 不扣，每低 1 分扣 1 分、单章封顶 15（明细写 payload.tagFitPenalty、摘要带扣分说明），低于容忍线还会确定性补一条 `label_fit` 待改问题（labels.ts 中文“平台/基调/风格/流派契合不足”，可像其它问题一样逐条定向精修），根治“选了番茄却写成盐选、标签不符照样给到 90+”。全链路容错，任何失败都不阻断正文保存，但一定对作者可见、可一键重跑。
- **重新质检先作废旧结论**：`supersedeChapterReports` 把同一章旧报告与其下仍 open（open/planned/refined/recheck_failed）的问题统一置 `superseded`（关闭态，写 status_history 留痕），作者已解决/忽略的终态不回改。因此看板只统计每章最新报告仍 open 的问题，**正文修改/重生成后问题数量同步增减，绝不只增不减、不跨版本累加虚高**。
- **正文字数全平台唯一口径**：汉字（含扩展 A 区）数 + 英文单词数，不含标点/阿拉伯数字/空白/Markdown 符号。前端唯一入口 `desktop/src/renderer/lib/wordCount.ts` 的 `countNarrativeWords`，与后端 `chain.controller` generatedNarrativeWordCount、`chapter.service.countWords`、`GenerationMetricsService.countWords` 逐字一致；禁止再用 `content.length` 或 `replace(/\s/g,'').length` 当正文字数（历史教训：同一章曾出现 3 个不同字数）。章节字数达标区间按长短篇分化（短篇 1500–8000、长篇 3200–4000，书级 `settings.chapterWordRange` 优先）。
- **生成埋点按书可追溯**：所有 LLM 调用经 `RealLLMService.recordStepMetric` 落 `generation_step_metrics`；架构层（灵感/大纲/世界观/角色/伏笔/组织/长篇规划）由 `chain.controller` 的 `projectMetricsContext`（AsyncLocalStorage）在编排入口绑定 projectId 并沿 await 链自动继承，`llmCallWithRetry` 埋点缺省 projectId 时统一兜底，保证按单本书筛选时各生成环节（耗时/返工/产出 vs 目标字数）不丢失。

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

前端是**双窗口、两套路由**（改"进入平台首先看到的页面"必须改引导窗口这套，而不是主窗口 Header）：

- **引导窗口（Launcher）**：`LauncherApp.tsx` + `launcherRouter.tsx`（MemoryRouter）+ `components/layout/LauncherLayout.tsx`（顶部全局导航：工作台/我的项目/灵感发现/执行标准；数据驾驶舱就在工作台内）。未进入具体项目时就是这个窗口，承载下表中所有**非 `/project/:id/*`** 的全局页面。
- **主创作窗口**：`App` + `router.tsx` + `AppLayout/Header/Sidebar`，打开具体项目时由 Electron 新开，承载全部 `/project/:id/*` 页面；其 `/` 也指向工作台作兜底。
- 下表"引导窗口"列的页面在两套 router 中都可到达；项目内页面只在主窗口。Electron 主进程通过 URL hash 向主窗口传递项目参数。

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 创作质量看板＝唯一数据驾驶舱（引导窗口落地页） | **进入平台首先看到**：紧凑标题行（含新建/灵感入口）、范围筛选条（作品可输入搜索）、6 个核心 KPI、**质量画像/每日变化/返工与效率三视图**；全部图表化（零依赖纯 SVG，组件 `components/common/charts.tsx`：雷达/环图/仪表环/双线趋势/排名条）——七维问题雷达、标签契合雷达、质量分/达标率/一次成功率仪表环、字数达标与平台/长短篇环图、问题新增vs解决双线趋势、返工分布与反复修改章节。**每张图可下钻并引导处理**：点七维维度展开「问题类型 → 具体章节/原文片段 → 去处理」，经 `openProject(pid,title,navigate,subPath)` 跳到该书 `/writing-quality?chapterId=`（矛盾跳 `/conflicts`）；标签契合列「最需加强章节」；返工视图含**正文首版一次到位率 / 平均补字轮次 / 平均对齐回炉次数 / 回炉原因（硬红线规则号转中文）**，把"少字要补几轮、为何反复重写"量化暴露。组件 `WorkbenchPage`，聚合 `PlatformAnalyticsService.overview` |
| `/projects` | 项目管理（引导窗口） | 项目搜索/筛选/新建/删除；从工作台进入，`/projects?new=1` 自动打开新建弹窗，组件 `ProjectListPage` |
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
| `/module-standards` | 最新执行标准 | 当前唯一生效标准，可手动重新归纳 |
| `/standards-history` | 标准发展历程 | 历史版本归档，仅回顾、不参与执行 |
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
| Author's Note API | `/author-note/*` | Author's Note 管理 |
| 平台自迭代 API | `/platform-analytics`、`/module-standards`、`/generation-metrics` | 工作台质量驾驶舱、执行标准自归纳、生成埋点（**后端接口保留，前端只由工作台 `/` 消费，无独立看板页**）；`GET /platform-analytics/overview?days=&projectId=&storyType=&platform=` 支持分层筛选，返回 filterOptions/kpis（质量口径）/qualityDimensions（七维写作问题）/currentIssues/consistency/tagFit（平台·基调·风格·流派契合分）/wordCompliance（对照每书目标字数区间）/revision（每章修订次数）/process（一次成功率与各环节返工，**正文按“章”聚合成一行：首版 body_first / 补字 body_length_retry / 对齐 body_alignment_repair / 基准 body_benchmark_refine 都是同一章正文的内部补轮，绝不拆成多个步骤；calls=章数、llmCalls=内部总版数、一次成功率=首版一次到位率、平均尝试=平均几版一章，非正文环节按 scenario 聚合；KPI 总一次成功率与本表、bodyConvergence 完全同口径（正文按章、非正文按环节发起单元加权），杜绝不同卡片 89%/38% 互相打架**，不以耗时为主）/chapterMatrix（逐章质量矩阵：每章字数/对话占比/平均段长/开篇钩/章尾钩/返工次数/**追读风险 retentionRisk（0 安全 / 1 注意 / 2 高风险，按“章尾钩/对话推进/文字墙/字数甜区/开篇钩”现算，附 retentionReasons 人话原因，对应平台读者留存信号）**/最新质检分，状态色标注、点行进入该章）。**埋点项目归属**：RealLLM 埋点 projectId 优先取 LLMRequest.metrics，缺失时由全局 AsyncLocalStorage（server/src/common/creation-context.ts + CreationContextMiddleware，从请求 params/query/body 提取 UUID 项目 id）兜底，因此大纲/世界观/角色/组织/伏笔等架构环节也自动归属到对应小说、单本看板能看到本书全部环节；创建前的灵感发现、无请求上下文的定时/跨书任务自然为平台级 null；`expectsProjectId` 判定“本该归属某本书”的场景（大纲/世界观/角色/组织/伏笔/正文/章摘要等），这类埋点若仍缺 projectId 会在后端日志 WARN 暴露（而不是静默堆积成无主记录）。历史遗留的“项目已创建、埋点却无主”的旧记录按脏数据清理，只保留创建前的灵感发现等合法平台级记录——不做按 scenario 盲删的启动迁移，因为平台级自归纳固定走 daily、与项目内 daily 同名，盲删会误删合法记录，源头已由 ALS 保证不再产生/benchmarkCompare（按「平台×长短篇」分组，把当前章节均值与该平台爆款基准线并排，附受众画像与不达标项的人话改进建议，确定性现算不调 LLM）/distributions（仅平台·长短篇）/trend（含问题新增/解决）。**口径真实**：质检问题只统计每章「最新一份报告」仍 open 的项（旧报告随重写失效，不累加虚高），章节区分有正文/空壳，矛盾按(章节,类型)只留最新未解决，无数据如实占位不伪造；中文字典、场景归并与质量维度归并的唯一事实源是 `server/src/modules/platform-analytics/labels.ts`（前端只显示其 label，不自造词典） |

### 写作Chain端点

| 端点 | 说明 |
|------|------|
| `POST /api/v1/chain/idea-generate` | 灵感生成 (素材→题材) |
| `POST /api/v1/chain/outline-generate` | 大纲生成 (题材→大纲) |
| `POST /api/v1/chain/generate` | 正文生成 (单次LLM调用，严格按大纲；生成前自动滚动补纲) |
| `POST /api/v1/chain/rollout-outline` | 长篇滚动补纲（正文前自动，亦可手动） |
| `POST /api/v1/chain/continue` | 续写 |
| `POST /api/v1/chain/enhance-opening` | 开头强化 |
| `POST /api/v1/chain/enhance-reversal` | 反转强化 |
| `POST /api/v1/chain/adapt-platform` | 平台改写 |
| `POST /api/v1/chain/generate-title` | 标题生成 |
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

# 单元测试 (Vitest；当前基线 33 个测试文件 / 294 个测试，acceptance 用例默认排除、需单独跑)
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
# 关键回归：src/renderer/workbench-routing.spec.tsx 用 jsdom 真实挂载引导窗口 LauncherRouter，
# 断言“进入首先是创作质量看板、质量画像/每日变化/返工与效率三视图、可搜索筛选、单本范围条可用、顶部 我的项目/工作台 能跳转、无独立数据看板入口，且 Hero/最近作品/系统状态行/创作进度漏斗/大类耗时不回归”。改动引导窗口路由/布局/落地页后必须跑。
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
| 最新执行标准 | 路由 `/module-standards`（源 `module-standards.seed.ts`） | 13 模块唯一执行标准 |
| 标准发展历程 | 路由 `/standards-history`（表 module_standard_versions） | 历史版本，只读回顾 |
| 工作台质量驾驶舱 | 路由 `/`（WorkbenchPage 内） | 质量画像/每日变化/返工与效率三视图；平台总览↔单本、长短篇、平台、时间窗筛选（SearchableSelect 可输入）；七维写作问题、标签契合分、字数达标、矛盾、返工轮次与一次成功率，全中文、无数据如实占位；后端聚合走 `/platform-analytics/overview`（只统计每章最新报告的未解决问题，不做虚假累计） |
| API 参考 | `server/docs/API.md` | 完整 API 端点文档 |
| 用户指南 | `server/docs/user-guide.md` | 功能使用指南 |
| 设计文档 | `server/docs/design/` | 架构设计文档 (4 篇) |
| Swagger UI | http://localhost:3100/api/docs | 交互式 API 文档（需启动后端） |


## 数据库迁移机制（单一初始基线 squash + 增量演进）

- **单一初始基线（已 squash，不再有几十个历史增量文件）**：历史上 001..053 的增量迁移已整体合并为唯一的 `001_initial.ts`——由现有库 `sqlite_master` 反向导出的最终结构（59 张业务表 + 全部索引，CREATE 一律带 IF NOT EXISTS，末尾对历史靠 ALTER 加的列做 PRAGMA 幂等补齐，并幂等 DROP api_keys / chain_execution_logs / data_directory / prompt_chain_definitions / inspirations 五张已被新流程取代、无代码读写的历史废弃表）。全新库启动只跑这一个迁移即建出完整结构。
- **老库自愈对齐、不丢数据**：`Migrator.alignSquashedBaseline` 启动时检测：若 `_migrations` 残留 id>1 的历史记录而磁盘迁移已收敛为 001，就对现库幂等执行一次 001（只补缺失的表/列/索引，绝不动业务数据），再把 `_migrations` 收敛为仅 id=1；已对齐库与全新库都不会重复执行（已用正式库副本演练：老库对齐、全新建库、二次幂等三条路径均无损通过）。
- **以后如何演进**：结构变更从 `002_xxx.ts` 起新增下一编号迁移，导出 `up(db)/down(db)`；**已在用户机器跑过的迁移不得再改写**；001 是冻结基线，不直接在其上改。
- **启动自动、增量、幂等**：`Migrator` 扫描 `migrations/`（匹配 `^\d+_.*\.(ts|js)# AI 写作平台 / Novel AI Platform

> 面向长篇、短篇小说创作的 AI 辅助写作平台。桌面客户端 + 后端服务一体化，覆盖灵感发现、项目创建、大纲规划、角色系统、世界观设定、章节写作、伏笔管理、状态维护、精修质检、导入导出等创作全流程。

## 项目简介

AI 写作平台是一个单用户桌面应用，将 AI 大语言模型能力深度融入小说创作工作流。平台通过 Prompt Chain 编排引擎实现长篇/短篇正文生成（严格按已绑定详细大纲单次 LLM 调用）、短篇三步骤题材生成，配合 24 维角色状态引擎、65 条世界观约束体系、全生命周期伏笔管理、多级冲突检测、11 种精修质检服务、统一 AI 物理指纹检测，为创作者提供从灵感到成稿的完整工具链。

- **桌面客户端** (`desktop/`)：Electron + React 桌面应用，提供完整编辑器、AI 写作面板、角色/世界观/大纲/伏笔管理界面
- **后端服务** (`server/`)：NestJS + Fastify 后端，集成 Prompt Chain 引擎、RAG 向量知识库、多模型路由、冲突检测引擎


---

## 0. 接手必读（换 AI 工具 / 新对话窗口 / 首次调用先看这里）

> 任何 AI 助手或新接手的开发者，在动手改代码前**必须先通读本文件 + `server/src/modules/module-standards/module-standards.seed.ts`（功能模块唯一执行标准）**，不需要用户再次提醒。规则的唯一执行依据是「功能模块标准库」，不是 `docs/` 下的零散文档（已归纳进标准库并删除）。

### 0.1 不可违反的铁律（历史上反复踩坑，逐条对照）

1. **各平台是各平台的风格，绝不通用一套**：番茄/七猫（强冲突、快节奏、直给爽点、短句短段）、起点（设定体系、成长长线、可慢热但必有回报）、知乎盐选（第一人称、真实感、生活化悬疑与反转、留白）、晋江（人物关系、情感细腻）、小红书（情绪共鸣、话题感）。题材、大纲、角色、世界观、标题、正文、润色每一层都按目标平台分化，长/短篇也要分别分化。
2. **模型配置即真名，不映射别名、不降级、不自由发挥**：设置里配的是什么模型版本，调用日志与请求就用什么名称；未命中配置要**明确报错**，严禁偷偷换默认模型/提供商。某场景缺模型配置时，在**创建项目之前（后端，非前端）**提醒并阻断，而不是降级兜底——这正是分场景 Tab 配置的意义。
3. **不允许"说一点改一点"，更不允许改 A 出 B 的雪崩**：改动要顺着调用链闭环排查同类问题；每次同时清理发现的历史/冗余/无用代码与废弃命名；废弃端点必须先把全部活跃调用方迁移到新体系再删除，不得留断链（旧质检端点即按此迁移到统一 writing-quality 体系后删除）。
4. **创作层级完整、顺序固定、流程守卫不跳层**：灵感发现 → 大纲（**书名/标题在此阶段同步产出**）→ 世界观 → 角色 → 组织/伏笔/时间线 → 正文 → 续写 → 润色。短篇不得跳过题材/大纲直接写正文，长篇不得跳过世界观/人物/分卷规划批量写正文。
5. **创建/生成成功即自动入库**：项目与章节生成成功后立即持久化到数据库，不允许停留在"未保存"状态。
6. **原创是硬要求**：类型母题（穿越/重生/系统等）公共可用，但具体设定、人物、情节组合与表达必须原创差异化；标题/主角名/核心金手指不得撞知名作品，后置相似度/撞名校验命中要给差异化改写建议。
7. **改动必须可验证、换窗口不复发**：每次改完跑后端 `cd server && npx tsc --noEmit` 与前端 `cd desktop && npx tsc --noEmit`；涉及数据库/生成链路要补内存库运行时断言；验证后删除临时脚本与临时编译目录。**不要自行启停后端服务**（重启由用户执行），不要自行新增"关闭端口/自动重启"之类用户没要求的动作。
8. **落地页是「创作工作台」，平台级后台动作必须对用户可见**：进入应用首先是工作台（`/`，WorkbenchPage），项目的搜索/筛选/管理独立在 `/projects`（ProjectListPage）；**数据驾驶舱（总览/每日变化/生成过程三视图＋平台总览↔单本/类型/平台/时间筛选＋人话现状洞察）直接内嵌在工作台，不再另设独立“数据看板”页或跳转卡**；最新执行标准/标准发展历程从顶部导航进入。**前端是双窗口：未进项目走引导窗口（launcherRouter + LauncherLayout，顶部全局导航在这里），进项目才开主窗口（router.tsx + AppLayout/Header）；改"进入平台首先看到什么/顶部全局导航"必须改引导窗口这套，只改主窗口 router/Header 不会生效。**启动自动迁移、执行标准自归纳、生成卡点与重试轮次等后台动作，必须在界面上可见（工作台「系统状态 / 生成健康度」卡 + `GET /platform-analytics/bootstrap`），不能只存在于日志里。旧的首页内联"平台控制台条 PlatformConsoleBar"、独立 PlatformAnalyticsPage 均已删除、能力由工作台接管，不得恢复或再把平台设置堆回项目列表首页。**界面文字最小 14px：字号令牌统一在 `desktop/src/renderer/styles/tokens.css`（--font-size-xs/sm=14px 起步），新页面一律用令牌、禁止内联写小于 14px 的可读文字；作品等长列表筛选用可输入搜索的 `components/common/SearchableSelect`，不要用只能滚动的原生下拉。**

### 0.2 规则放在哪（单一事实来源）

- **执行标准（唯一权威）**：`server/src/modules/module-standards/module-standards.seed.ts`（13 个功能模块基线）+ 数据库表 `module_standards`（当前生效），由 `RealLLMService` 在每次生成时统一注入，任何模型都按同一套最新标准执行。
- **历史版本（只回顾、不执行）**：`module_standard_versions` 表 / 前端「标准发展历程」页，与最新标准物理分表、分页。
- **改规则的正确方式**：直接改 `module-standards.seed.ts` 对应模块，并把文件顶部 `SEED_BASELINE_VERSION` +1；重启后服务会确定性地用新基线覆盖当前标准、旧版归档（`trigger=seed_upgrade`，不调用模型），即"改了标准代码、重启即生效且留历史"。不要把规则再写回 `docs/` 零散 md。
- **平台风格 / 受众 / 爆款基准（唯一事实源）**：`server/src/chain/platform-benchmarks.ts` 是 9 个平台（番茄/七猫/起点/知乎盐选/抖音/小红书/晋江/规则怪谈/通用）的唯一来源——一个平台对象同时承载节奏画像、受众画像（人群/年龄/性别/场景/耐心线）、长短篇分别的可量化文本基准（对话占比、平均/超长段落、开篇多少字进冲突、回报密度、章尾钩、章节字数）、分发阈值与原创红线。生成端经 `buildBenchmarkDirective` 注入全链路，且**架构层与正文层一律按本书长短篇精确取基准（不再用长短篇合并区间）、并全部贯穿故事卡三标签**：创建主流程的世界观、章节列表规划（含章数重规划）、详细章纲、角色、关系网、世界观整理、组织地点、伏笔，以及创建后的深度补全（世界/组织/地点/大纲/伏笔 profile），每个 prompt 都同时拼「三标签（基调 storyTone / 写作风格 writingStyle / 流派 webNovelGenre，取自 settings）」+「平台唯一源 `buildPlatformStyleDirective(platform, isShort?'short_story':'long_novel')`」；独立标题 `generate-title`、章节过渡 `chapter-transition`（紧衔接/跳跃/多线三种）与正文层首版/续写/开头增强/反转增强/逐段精修/流式正文/扩详细章纲/长篇滚动补纲，统一经 `resolvePlatformToneDirective(projectId)` 从库一次读出「平台+三标签+长短篇」注入；长篇专用 `generateConfiguredLongNovelPlan` 经 styleTags 入参拿到三标签、平台基准传 long_novel；平台改写 `adapt-platform` 也直接用唯一源（已删除只覆盖 5 平台的第三套手写 platformGuides，以及无模板引用且 key 过时的 handlebars `platformLabel` 死代码）。跨模块一致性审查/修订、状态抽取、摘要等**事实类**环节刻意不带风格指令。正文层首版/续写/流式等路径统一在 prompt 顶部经 `resolvePlatformToneDirective` 注入唯一源，平台定性风格红线统一由唯一源的 `styleMust` 字段承载（如番茄“爽点明面兑现、前三章主角不憋屈”、七猫“不靠重复打脸升级”、规则怪谈“规则可验证有代价、克制煽情”），通用写作契约 `buildNarrativeQualityContract` 不再重复拼平台段；看板/质检测 `measureAgainstTarget` 做"当前值 vs 平台基准"的确定性对照（不调 LLM）。历史上的 `novel-strategy.ts`、`novel-strategy.service.ts`（复制且未接线）、controller 内只覆盖 6 平台的多套定性文案、以及残留的手写 8 平台文案 `buildPlatformNarrativeOverride` 均已并入唯一源 `styleMust` 后删除（全仓无第二份平台画像、唯一源也不会在同一 prompt 被重复注入），**禁止再新增第二套平台数值或文案**；生成链在「大纲对齐验收」之后还会用 `measureAgainstTarget` 现算一遍：若对话占比/段落厚度/开篇或章尾钩没到该平台长短篇**优秀线**，自动进入最多 2 轮 `refineToPlatformBenchmark` 定向精修（指令由唯一源 `buildBenchmarkRefinePrompt` 产出，只提短板；**精修 prompt 必带上一版正文（唯一底本）+本章大纲契约+人物白名单+避坑经验，缺 previousContent 直接抛错，禁止在真空中重写**；精修与对齐修复结果先过零 LLM 的 `refineKeepsStory` 故事身份守护（篇幅缩水<85%、或上一版出现的本书人物在新稿零命中/丢失过半即判换故事，丢弃新稿、保留上一版，根治“精修把都市文整体覆盖成另一部乡村悬疑”事故），独立埋点 `step_key=body_benchmark_refine`）——这区别于只保"及格"的硬红线下限（如番茄对话红线 15%、优秀线 35%–65%），目的是让首版在 1–2 轮内收敛到 90+ 而不是"过了红线却只有 70 分"；看板「返工与效率」用"平均基准提升轮次/被精修章数"暴露这一环节。行业经验基线可被 module-standards 自归纳结论在调用层覆盖，不改死这里。
- **时间线按书统计必须 JOIN**：`timeline_events` 表本身没有 `project_id` 列（project_id 在父表 `timelines`），任何"按书查事件"都要 `JOIN timelines t ON t.id=timeline_events.timeline_id WHERE t.project_id=?`，禁止直查 `timeline_events.project_id`（历史上此处报错被 catch 吞掉，导致按书时间线恒为空）。

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
│   ├── vitest.config.mts           # 单元测试配置
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
│   │   │   └── conflict-engine/   # 冲突优先级检测
│   │   ├── chain/                 # Prompt Chain 编排引擎
│   │   │   ├── chain-engine.service    # Chain执行引擎（长篇主创建链 generateConfiguredLongNovelPlan）
│   │   │   └── prompt-registry.service # 24个Prompt模板
│   │   ├── routing/               # 模型路由（配置什么模型就原样用什么，不映射/不别名/不降级）
│   │   │   ├── model-router.service    # 路由引擎（五场景归并/缺配置阻断）
│   │   │   └── routing.controller      # 路由配置 HTTP 接口
│   │   ├── rag/                   # RAG向量知识库
│   │   │   └── vector-index.service    # 向量索引 (ChromaDB)
│   │   ├── state/                 # 24维状态引擎
│   │   ├── material/              # 素材库
│   │   └── database/              # 数据库层 (10个Repository)
│   ├── shared/                    # 共享类型与枚举 (@novel/shared)
│   ├── data/                      # 运行时数据与配置
│   │   ├── novel.db               # SQLite 主数据库 (WAL)
│   │   ├── state.db               # 状态引擎数据库
│   │   ├── chains/                # Chain 定义 (YAML)
│   │   │   ├── short-story-stage1.yaml  # 短篇题材生成Chain (5节点)
│   │   │   ├── short-story-stage2.yaml  # 短篇大纲生成Chain (7节点)
│   │   │   └── tianlong-8step.yaml      # 已废弃，正文改为单次LLM调用
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
基于 Prompt Chain 编排引擎，支持短篇三步骤（题材→大纲→正文）和长篇正文生成（严格按已绑定详细大纲单次 LLM 调用）。提供全自动 (F1)、半自动 (F2)、手动 (F3) 三种写作模式。

**三维度标签体系**：灵感发现与项目创建时，通过三个独立维度定位作品方向，生成正文时会根据标签严格注入对应写作规则：

| 维度 | 回答的问题 | 属于什么层面 | 可选值（数量） |
|------|-----------|-------------|---------------|
| **故事基调（storyTone）** | 读者读完是什么情绪？ | 情绪层（阅读体验） | 16种：热血、爽文、搞笑、悬疑、甜宠、虐恋、权谋、爆笑、烧脑、无敌、逆袭、刀人、治愈、女强、轻松、压抑 |
| **写作风格（writingStyle）** | 文字用什么手法写？ | 文字层（叙事手法） | 12种：白描/朴素、爽文、悬疑、情感、宏大叙事、群像叙事、第一人称、第三人称、倒叙、多线叙事、日记体、对话体 |
| **网文流派（webNovelGenre）** | 主角靠什么金手指/设定变强？ | 设定层（世界观） | 17种：系统流、重生、穿越、种田、无限流、无敌流、凡人流、扮猪吃虎、诸天流、退婚流、废材流、快穿、马甲流、科技流、幕后流、直播流、DND |

三者关系：全部是多对多，没有1对1绑定。一个流派可以用多种风格写（系统流可以是白描、爽文、悬疑），一种风格可以配多种基调（白描可以是甜宠、虐恋、悬疑）。建议每个维度选1-2个，选多了等于没选。

**去AI感三层防护**：Prompt层强制"白描优先"原则（动词名词为主、少形容词、情绪藏在事里），硬红线禁止形容词堆砌、刻意感官描写、拟人化比喻、套路化表达，并含确定性规则 50「X了，Y了」两字残句链（治“退了账，走了/两下，灭了”式强行断句加符号）、51 句末语气词密度过高、52 同一环境意象相邻反复（治过渡环境描写重复）、53 同字/同构短并列（治“带了A、带了B、带了C、带了D”式同动词排比：反向引用对齐并列起点，2字动词前缀3连/1字前缀4连即判，不误伤“苹果、香蕉、橘子”正常并列）、54 形象量词错配（治“那束蛋糕”——束只配花/光等成束细长物，并排除“约束/结束/束缚”成词）；规则 34 动作链排比已收紧为“动作动词领起、同一句内紧凑连续 ≥4 个、中间不被句末/引号/冒号隔断”才判（旧实现用“任意两字+逗号”近似动作词，会把正常叙述和人物对话大面积误伤，现已改为动作动词词表+同句约束，并补了正反回归用例）；全部硬红线已从控制器抽为零依赖共享纯函数 `server/src/chain/hardline-scanner.ts`，生成链与写作质量质检共用同一事实源（禁止各写一份）；质检层检测8项AI物理指纹（排比指纹分隔符已补顿号“、”，顿号型同构排比不再漏检）（排比句、形容词密度、段落均匀度、AI高频词、句长均匀度、对话占比、标点多样性、套路化表达）；降AI引擎提供65+条确定性替换规则。写法体系、平台适配与去 AI 感规则已收敛进功能模块标准库 body/review 模块（见 §0.2）。

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

**正文自动质检与问题同步（铁律，勿回退）**：
- AI 生成正文走 canonical 保存（前端 `WritingPage` PUT `/projects/:id/chapters`，载荷带 `source:'ai_generated'`）后，`ChapterService.update` 先把该章 `auto_quality_status` 置 `running`，再通过 `queueMicrotask` 异步触发一次 `WritingQualityService.analyzeChapterQuality`（七维问题 + 平台/基调/风格/流派标签契合分落库），无需作者手动送审；手动逐字编辑（`source!=='ai_generated'`）不触发，避免边打字边调 LLM。**自动质检不再静默失败、也不再假合格（勿回退）**：综合分≥90（`BODY_QUALITY_TARGET_SCORE`）且无高危未决问题才回写 `ok`，否则回写 `needs_rewrite`（未达标·待精修，message 记分数差距/高危数/待改数），仅调用异常回写 `failed`（记人类可读原因），三态写 `chapters.auto_quality_status/auto_quality_message/auto_quality_at`（列已含于 001 初始基线，并对老库幂等补齐；手动重跑 `rerunAutoQuality` 也严格采用后端同口径结论，前端不再无条件乐观置 ok）；前端章节编辑器头部有持久状态条（达标✅绿 / 未达标🟠橙 / 失败⚠️红+「重新质检」 / 进行中⏳蓝；「重新质检」仅在 failed（质检过程失败、没出分）时显示——needs_rewrite 是已成功出分但未达标，重跑只得相近分数、对正文无改善，此时只留「查看问题」进去逐条定向精修；项目左侧主导航另设「质量诊断」项（/project/:id/writing-quality），不必从编辑器绕入，达标与未达标也都提供「查看问题」直达本章 `/writing-quality?chapterId=` 明细，`chapterStore.rerunAutoQuality` 调 `POST /projects/:id/writing-quality/analyze`、不传正文由后端读库重跑），工作台 KPI 卡按已写正文章统计 ok/failed/running/未跑数量；质检 LLM 显式 `maxTokens=16000` 防输出截断、并带 `metrics.stepKey='quality_auto'`（看板归入「优化精修」，不污染日常桶与正文版数/一次成功率）。综合分在“物理指纹30%+LLM七维70%”融合后，再用共享 `detectForbiddenTells` 对跨平台真硬伤（作者跳出/残句链/语气词/环境重复/同构排比53/量词错配54/动作清单等，不含番茄等本就允许的短段排版类）做确定性扣分（单项 4–12 分、单章封顶 25），命中明细写入报告 payload.hardlinePenalty 与摘要，根治“LLM 给语言硬伤虚高 75 分”；**标签契合（平台/基调/风格/流派 tagFit）也实质计入综合分、不再只展示**——四维均值 ≥85 不扣，每低 1 分扣 1 分、单章封顶 15（明细写 payload.tagFitPenalty、摘要带扣分说明），低于容忍线还会确定性补一条 `label_fit` 待改问题（labels.ts 中文“平台/基调/风格/流派契合不足”，可像其它问题一样逐条定向精修），根治“选了番茄却写成盐选、标签不符照样给到 90+”。全链路容错，任何失败都不阻断正文保存，但一定对作者可见、可一键重跑。
- **重新质检先作废旧结论**：`supersedeChapterReports` 把同一章旧报告与其下仍 open（open/planned/refined/recheck_failed）的问题统一置 `superseded`（关闭态，写 status_history 留痕），作者已解决/忽略的终态不回改。因此看板只统计每章最新报告仍 open 的问题，**正文修改/重生成后问题数量同步增减，绝不只增不减、不跨版本累加虚高**。
- **正文字数全平台唯一口径**：汉字（含扩展 A 区）数 + 英文单词数，不含标点/阿拉伯数字/空白/Markdown 符号。前端唯一入口 `desktop/src/renderer/lib/wordCount.ts` 的 `countNarrativeWords`，与后端 `chain.controller` generatedNarrativeWordCount、`chapter.service.countWords`、`GenerationMetricsService.countWords` 逐字一致；禁止再用 `content.length` 或 `replace(/\s/g,'').length` 当正文字数（历史教训：同一章曾出现 3 个不同字数）。章节字数达标区间按长短篇分化（短篇 1500–8000、长篇 3200–4000，书级 `settings.chapterWordRange` 优先）。
- **生成埋点按书可追溯**：所有 LLM 调用经 `RealLLMService.recordStepMetric` 落 `generation_step_metrics`；架构层（灵感/大纲/世界观/角色/伏笔/组织/长篇规划）由 `chain.controller` 的 `projectMetricsContext`（AsyncLocalStorage）在编排入口绑定 projectId 并沿 await 链自动继承，`llmCallWithRetry` 埋点缺省 projectId 时统一兜底，保证按单本书筛选时各生成环节（耗时/返工/产出 vs 目标字数）不丢失。

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

前端是**双窗口、两套路由**（改"进入平台首先看到的页面"必须改引导窗口这套，而不是主窗口 Header）：

- **引导窗口（Launcher）**：`LauncherApp.tsx` + `launcherRouter.tsx`（MemoryRouter）+ `components/layout/LauncherLayout.tsx`（顶部全局导航：工作台/我的项目/灵感发现/执行标准；数据驾驶舱就在工作台内）。未进入具体项目时就是这个窗口，承载下表中所有**非 `/project/:id/*`** 的全局页面。
- **主创作窗口**：`App` + `router.tsx` + `AppLayout/Header/Sidebar`，打开具体项目时由 Electron 新开，承载全部 `/project/:id/*` 页面；其 `/` 也指向工作台作兜底。
- 下表"引导窗口"列的页面在两套 router 中都可到达；项目内页面只在主窗口。Electron 主进程通过 URL hash 向主窗口传递项目参数。

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 创作质量看板＝唯一数据驾驶舱（引导窗口落地页） | **进入平台首先看到**：紧凑标题行（含新建/灵感入口）、范围筛选条（作品可输入搜索）、6 个核心 KPI、**质量画像/每日变化/返工与效率三视图**；全部图表化（零依赖纯 SVG，组件 `components/common/charts.tsx`：雷达/环图/仪表环/双线趋势/排名条）——七维问题雷达、标签契合雷达、质量分/达标率/一次成功率仪表环、字数达标与平台/长短篇环图、问题新增vs解决双线趋势、返工分布与反复修改章节。**每张图可下钻并引导处理**：点七维维度展开「问题类型 → 具体章节/原文片段 → 去处理」，经 `openProject(pid,title,navigate,subPath)` 跳到该书 `/writing-quality?chapterId=`（矛盾跳 `/conflicts`）；标签契合列「最需加强章节」；返工视图含**正文首版一次到位率 / 平均补字轮次 / 平均对齐回炉次数 / 回炉原因（硬红线规则号转中文）**，把"少字要补几轮、为何反复重写"量化暴露。组件 `WorkbenchPage`，聚合 `PlatformAnalyticsService.overview` |
| `/projects` | 项目管理（引导窗口） | 项目搜索/筛选/新建/删除；从工作台进入，`/projects?new=1` 自动打开新建弹窗，组件 `ProjectListPage` |
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
| `/module-standards` | 最新执行标准 | 当前唯一生效标准，可手动重新归纳 |
| `/standards-history` | 标准发展历程 | 历史版本归档，仅回顾、不参与执行 |
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
| Author's Note API | `/author-note/*` | Author's Note 管理 |
| 平台自迭代 API | `/platform-analytics`、`/module-standards`、`/generation-metrics` | 工作台质量驾驶舱、执行标准自归纳、生成埋点（**后端接口保留，前端只由工作台 `/` 消费，无独立看板页**）；`GET /platform-analytics/overview?days=&projectId=&storyType=&platform=` 支持分层筛选，返回 filterOptions/kpis（质量口径）/qualityDimensions（七维写作问题）/currentIssues/consistency/tagFit（平台·基调·风格·流派契合分）/wordCompliance（对照每书目标字数区间）/revision（每章修订次数）/process（一次成功率与各环节返工，**正文按“章”聚合成一行：首版 body_first / 补字 body_length_retry / 对齐 body_alignment_repair / 基准 body_benchmark_refine 都是同一章正文的内部补轮，绝不拆成多个步骤；calls=章数、llmCalls=内部总版数、一次成功率=首版一次到位率、平均尝试=平均几版一章，非正文环节按 scenario 聚合；KPI 总一次成功率与本表、bodyConvergence 完全同口径（正文按章、非正文按环节发起单元加权），杜绝不同卡片 89%/38% 互相打架**，不以耗时为主）/chapterMatrix（逐章质量矩阵：每章字数/对话占比/平均段长/开篇钩/章尾钩/返工次数/**追读风险 retentionRisk（0 安全 / 1 注意 / 2 高风险，按“章尾钩/对话推进/文字墙/字数甜区/开篇钩”现算，附 retentionReasons 人话原因，对应平台读者留存信号）**/最新质检分，状态色标注、点行进入该章）。**埋点项目归属**：RealLLM 埋点 projectId 优先取 LLMRequest.metrics，缺失时由全局 AsyncLocalStorage（server/src/common/creation-context.ts + CreationContextMiddleware，从请求 params/query/body 提取 UUID 项目 id）兜底，因此大纲/世界观/角色/组织/伏笔等架构环节也自动归属到对应小说、单本看板能看到本书全部环节；创建前的灵感发现、无请求上下文的定时/跨书任务自然为平台级 null；`expectsProjectId` 判定“本该归属某本书”的场景（大纲/世界观/角色/组织/伏笔/正文/章摘要等），这类埋点若仍缺 projectId 会在后端日志 WARN 暴露（而不是静默堆积成无主记录）。历史遗留的“项目已创建、埋点却无主”的旧记录按脏数据清理，只保留创建前的灵感发现等合法平台级记录——不做按 scenario 盲删的启动迁移，因为平台级自归纳固定走 daily、与项目内 daily 同名，盲删会误删合法记录，源头已由 ALS 保证不再产生/benchmarkCompare（按「平台×长短篇」分组，把当前章节均值与该平台爆款基准线并排，附受众画像与不达标项的人话改进建议，确定性现算不调 LLM）/distributions（仅平台·长短篇）/trend（含问题新增/解决）。**口径真实**：质检问题只统计每章「最新一份报告」仍 open 的项（旧报告随重写失效，不累加虚高），章节区分有正文/空壳，矛盾按(章节,类型)只留最新未解决，无数据如实占位不伪造；中文字典、场景归并与质量维度归并的唯一事实源是 `server/src/modules/platform-analytics/labels.ts`（前端只显示其 label，不自造词典） |

### 写作Chain端点

| 端点 | 说明 |
|------|------|
| `POST /api/v1/chain/idea-generate` | 灵感生成 (素材→题材) |
| `POST /api/v1/chain/outline-generate` | 大纲生成 (题材→大纲) |
| `POST /api/v1/chain/generate` | 正文生成 (单次LLM调用，严格按大纲；生成前自动滚动补纲) |
| `POST /api/v1/chain/rollout-outline` | 长篇滚动补纲（正文前自动，亦可手动） |
| `POST /api/v1/chain/continue` | 续写 |
| `POST /api/v1/chain/enhance-opening` | 开头强化 |
| `POST /api/v1/chain/enhance-reversal` | 反转强化 |
| `POST /api/v1/chain/adapt-platform` | 平台改写 |
| `POST /api/v1/chain/generate-title` | 标题生成 |
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

# 单元测试 (Vitest；当前基线 33 个测试文件 / 294 个测试，acceptance 用例默认排除、需单独跑)
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
# 关键回归：src/renderer/workbench-routing.spec.tsx 用 jsdom 真实挂载引导窗口 LauncherRouter，
# 断言“进入首先是创作质量看板、质量画像/每日变化/返工与效率三视图、可搜索筛选、单本范围条可用、顶部 我的项目/工作台 能跳转、无独立数据看板入口，且 Hero/最近作品/系统状态行/创作进度漏斗/大类耗时不回归”。改动引导窗口路由/布局/落地页后必须跑。
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
| 最新执行标准 | 路由 `/module-standards`（源 `module-standards.seed.ts`） | 13 模块唯一执行标准 |
| 标准发展历程 | 路由 `/standards-history`（表 module_standard_versions） | 历史版本，只读回顾 |
| 工作台质量驾驶舱 | 路由 `/`（WorkbenchPage 内） | 质量画像/每日变化/返工与效率三视图；平台总览↔单本、长短篇、平台、时间窗筛选（SearchableSelect 可输入）；七维写作问题、标签契合分、字数达标、矛盾、返工轮次与一次成功率，全中文、无数据如实占位；后端聚合走 `/platform-analytics/overview`（只统计每章最新报告的未解决问题，不做虚假累计） |
| API 参考 | `server/docs/API.md` | 完整 API 端点文档 |
| 用户指南 | `server/docs/user-guide.md` | 功能使用指南 |
| 设计文档 | `server/docs/design/` | 架构设计文档 (4 篇) |
| Swagger UI | http://localhost:3100/api/docs | 交互式 API 文档（需启动后端） |


## 数据库迁移机制（单一初始基线 squash + 增量演进）

、排除 .d.ts/.spec），按编号升序只跑 `_migrations` 未记录的，成功后写表，重复启动不重跑。
- **迁移对用户可见**：启动自动执行、无需手动；记录在 `_migrations`，`GET /platform-analytics/bootstrap` 返回“已应用 N 个 / 最新编号 / 待执行数”供排查。

## 功能模块标准库与"变化驱动"自归纳（平台自迭代核心）

- **三张表**：`module_standards`（当前唯一权威标准）、`module_standard_versions`（每次变更前整体归档的历史版本，只读回顾、绝不参与执行）、`standard_summarization_runs`（归纳运行记录 running/done/failed/interrupted）。
- **归纳中断恢复（防止前端永久“正在自归纳…”转圈，勿回退）**：归纳是异步任务，若进程在 LLM 归纳途中被强杀/重启，`finally` 与 `finishRun` 都不会执行，库里会残留 `status='running'` 僵尸记录。双保险：①`onModuleInit` 启动即 `recoverInterruptedRuns()`，把所有遗留 running 统一置为 `interrupted`（旧标准仍生效、不影响生成）；②`status()` 顶部 running 列表只返回“数据库 running **且**本进程内存 `this.running` 也在跑”的交集，僵尸记录一律不上报。前端侧：看板/状态轮询请求失败（典型为后端重启窗口）时主动清掉残留 running，绝不保留上一次的“归纳中”。
- **只读查询前端自愈（防止后端重启窗口看板空白/全 0 假死，勿回退）**：`renderer/lib/api.ts` 的 `api.getWithRetry` 仅用于幂等 GET（看板 overview、执行标准、恢复诊断），对“连不上(status=0)/5xx/解析失败”按 0.8→1.6→3.2s 有限自动重试，4xx 真实错误立即抛、**POST 等写操作绝不重试**；`WorkbenchPage` 区分“加载中 / 加载失败（带重新加载）/ 真的无数据”三态，失败保留旧数据不清空，并在窗口重新可见/获得焦点时自动重拉，后端起来后无需手动刷新整页。
- **13 个功能模块**：灵感 inspiration、大纲 outline、世界观 worldbuilding、角色 character、组织 organization、伏笔 foreshadowing、时间线 timeline、正文 body、续写 continuation、润色 polish、标题 title、质检 review、原创 originality（横切）。
- **统一注入**：`RealLLMService.generate` 把当前标准拼进 system prompt（主调用与网络重试两处一致）；标准归纳是"维护标准"的元任务，`injectStandard:false` 防止递归。
- **变化驱动，而非固定 1–2 天**：某模块自上次归纳以来新增真实样本达到阈值、且出现实质变化（失败/截断率上升、首版到位率下降、字数缺口扩大、出现新卡点类型、沉淀新避坑经验）才判定为 dirty；后端启动后以及前端轮询 `status` 时会**自动归纳**，自动归纳带 10 分钟防抖冷却；代码基线升级（`SEED_BASELINE_VERSION`）则在重启时确定性同步，不等数据。
- **手动归纳默认禁用**：前端"立即重新归纳"按钮只有该模块 dirty 时才点亮并展示变化原因；后端在非 force 且模块非 dirty 时返回 `not_dirty`，不浪费模型调用。
- **模型纪律**：归纳固定走"日常场景 `daily`"所配置的模型版本，configured-only，不降级、不自由选模型；归纳失败保留旧版、只记一条 failed run，绝不影响正常创作。
- **前端在哪里看**：进入平台首先是「创作质量看板」（路由 `/`，`WorkbenchPage`），它就是**唯一的数据驾驶舱**，不再有独立数据看板页、Hero 大横幅、最近作品、底部系统状态行，也没有“看完整数据看板→”之类跳转：顶部提示“正在归纳 / 有 N 个模块待归纳”；**范围筛选条**（作品用可输入搜索的 `SearchableSelect`，支持平台总览↔单本、类型、平台、今天/7/14/30天，选单本时标题变为《书名》质量看板并可一键返回平台总览）。三视图全部围绕**真实写作质量**并用图表呈现（零依赖纯 SVG，`components/common/charts.tsx`，选型依据通用可视化最佳实践：雷达做多维画像 5–8 维固定同量纲、环图做占比、仪表环做单项分值、双线折线看趋势、横向条做短板排名）：①**质量画像**——质量总览三个仪表环（平均质量分/字数达标率/一次成功率）、**七大写作维度问题雷达**（开篇钩子/节奏/对话/AI痕迹/逻辑/细节/标点，含涉及章节与最重级）、**平台·基调·风格·流派四维标签契合雷达**（含最贴合/最需加强）、字数达标环图（对照每书目标区间，含偏短章平均缺口）、上下文/大纲矛盾、平台/长短篇构成环、具体问题排名条，并新增两张下钻：**对照平台基准**（按平台×长短篇把对话占比/段落厚度/开篇钩/章尾钩的当前值与该平台爆款基准线并排，附读者画像和人话差距）、**逐章质量明细表**（每章字数/对话/段长/双钩/返工/质检分，绿橙红标注、点行进该章）；②**每日变化**——默认“问题新增 vs 解决”双线趋势，可切 AI 生成/产出字数/新建章节；③**返工与效率**——一次成功率仪表环、平均返工/失败截断空白、章节修订次数与失败原因环图、反复修改≥3次章节排名、各环节生成情况表（**正文按章聚合成一行、补字/对齐/基准作为内部补轮子列，与上方“平均对齐回炉/正文平均成稿版数”同口径**，不以耗时为主），逐章表新增“追读风险”列（鼠标悬停看具体原因）。项目首页（/project/:id 看板）是**小说维度**：消费同一个 overview 的单本 scope（平台落地页是平台维度，两级同后端不同 scope），已删除“创作资料提醒说明句/时间线脉络/快捷操作”等说明性冗余，章节卡按“有正文即已写”统计（draft 也算已定稿前的已写章，不再显示“0 章写作中”）；章节编辑器为自动保存，已移除多余的手动“保存”按钮。数据来自 `/platform-analytics/overview`，机器 key 经后端 `labels.ts` 中文化并做质量维度归并，**只统计每章最新质检报告仍 open 的问题、区分空壳章节、无数据如实占位，绝不展示必然 100% 的创作进度漏斗或虚假累计值**。项目的搜索/筛选/管理独立在 `/projects`（`ProjectListPage`）；页面内不放与顶部导航重复的“←工作台/返回”按钮（LauncherLayout 全局导航：工作台/我的项目/灵感发现/执行标准）。`/module-standards` 最新执行标准（唯一参与执行，含发展历程入口）；`/standards-history` 标准发展历程（只读）。**界面可读文字最小 14px，字号一律走 `styles/tokens.css` 的 --font-size-* 令牌，不写教用户怎么用面板的自我说明句。**后端证据在上述表与 `generation_step_metrics` 埋点表。

## 长篇 / 短篇标准创作流程（作品类型 ≠ 创建来源）

- **创建来源**：灵感 / 想法 / 导入 / 空白；**作品类型**：短篇 / 长篇。两者是不同维度，新建时先选来源、再选类型、再选目标平台，不允许把"短篇/长篇"和"从灵感/从想法"做成同级重复入口。
- **长篇流程**：灵感/想法 → 基础设定 → 世界观 → 核心人物 → 组织与地图 → 全书分卷规划 → **前 20 章详细细纲** → 逐章正文 → 状态提取 → 作者确稿 → 下一章上下文构建（并**滚动补全后续细纲**）→ 周复盘 → 后期整体修改 → 发布维护。分层规划、分段执行、持续归档，**不一次性生成几十上百章细纲**：创建时世界观 / 贯穿全书角色 / 全书分卷高层规划一次到位，但只详细展开前 `LONG_DETAIL_OUTLINE_WINDOW=20` 章细纲，其余卷只保留高层规划；之后每次正文生成前（`/chain/generate`）自动调用 `rolloutDetailedOutlines` 做**滚动补纲**，结合最近 3 章已写正文 + 主要角色 + 活跃伏笔生成后续细纲，使详细章纲始终领先已写正文约 20 章（领先不足阈值 `LONG_OUTLINE_ROLLOUT_TRIGGER=5`），绝不重写/覆盖已有细纲与正文；大纲页对长篇提供「立即滚动补纲」按钮，亦可 `POST /chain/rollout-outline` 手动触发。世界观/人物/组织/时间线/伏笔先于大规模正文；每章状态变化必须经作者确稿才成为后续可引用事实。
- **架构层长短篇结构化验收（创建收尾的硬门槛，不产出半成品，且"规划即全量落地"而非"有 1 个就算过"）**：长篇 `generateConfiguredLongNovelPlan` 收尾做量化终检——世界观对象齐备、人物架构返回的**每一名**主要/常驻角色都完整（全部贯穿并落库）、地基规划**多少卷就全部落地**（每卷都有高层规划）、前 20 章细纲在窗口内**逐章齐备**且每章含标题/内容/目标字数、长篇必做势力组织与地理点位（地点入库前经 `MapPointService.dedupeRawMapPoints` 确定性归并：人物修饰/括号注释指向的同一物理地点只留一条、内部子场景降为 scene 并挂 parentName，不再平铺一堆重复点，prompt 同步禁止同义重复建点），任一不达标即抛错停止创建；短篇走故事卡五字段（coreConflict/protagonistDesire/turningPoint/reveal/ending）+ 事实审查与修复 + 章节节奏兜底（末章强制 climax/resolution、倒数第二章优先 conflict）+ 大纲合格率 **≥90%** 终检（"合格章" = 细纲正文 ≥200 字或 scenes 结构实质非空）。正文质量统一目标 90+：平台基准精修最多 2 轮把对话占比/段落/双钩收敛到该平台长短篇优秀线，自动质检综合分 ≥90 才记 high（`BODY_QUALITY_TARGET_SCORE`，等级由分数确定性推导，不采信 LLM 自报等级），未达 90 在章节状态条写明差距并引导精修。
- **改后矛盾检查与微同步（保持长篇上下文长期一致）**：正文保存后自动重算章/卷/书摘要与向量索引，并对本章做确定性矛盾复查（落 `consistency_checks`，前端矛盾页可见）；章节大纲的内容/标题/场景被修改后（`OutlineService.reconcileOutlineAfterChange`）自动：①标题同步到未锁定的绑定章节行；②若该章已有正文，用一致性规则复查“新大纲 vs 已写正文”；③给相邻下一章生成一条 soft 衔接待核对项（`state_items`，由作者确稿，系统不擅自改写其它章纲或正文）。
- **短篇流程**：灵感/想法 → 题材生成 → 第一人称完整大纲 → 正文 → 终稿质检 → 标题简介 → 平台改写 → 发布导出。核心是强钩子、第一人称代入、递进反转、伏笔回收与平台适配；不走长篇复杂世界观流程，状态记录粒度更小，创建时一次性出全纲、不需要滚动窗口。

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
6. **创建项目**：进入应用首先看到「创作质量看板」，点「＋ 新建项目」（进入 /projects 并自动打开新建弹窗）或「✨ 灵感发现」创建一个测试项目
7. **验证主流程**：依次测试角色创建、大纲生成、章节写作、Chain 执行、精修质检、导入导出
8. **打包发布**：确认主流程无误后，执行 `npm run build && npm run pack:win` 打包
