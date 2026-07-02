# AI写作平台 — Desktop 桌面客户端

> **项目状态**: 全部完成 ✅ — 74 项 Phase 研发任务已完成 | [Server 后端](../server/README.md) | [研发计划](../../AI写作平台研发计划.md)

## 项目简介

基于 Electron + React 的 AI 辅助写作桌面客户端。提供完整的项目管理、AI 写作、角色/世界观/大纲编辑、章节伏笔管理、精修质检等功能界面。配套后端服务为 `server/` 目录下的 NestJS 应用。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Electron 30+ |
| 前端 | React 18 + TypeScript |
| 路由 | React Router v6 |
| 状态管理 | Zustand |
| 编辑器 | Monaco Editor |
| 构建 | Vite + electron-builder |
| 测试 | Vitest + Playwright (E2E) |
| IPC | contextBridge + preload |

## 目录结构

```
desktop/
├── src/
│   ├── main/
│   │   ├── main.ts          # Electron 主进程 (661行)
│   │   └── preload.ts       # 预加载脚本 (IPC桥接)
│   └── renderer/
│       ├── main.tsx          # React 入口
│       ├── App.tsx           # 根组件
│       ├── router.tsx        # 路由配置 (22条路由)
│       ├── index.css         # 全局样式
│       ├── lib/
│       │   └── api.ts        # HTTP API 客户端
│       ├── stores/           # Zustand 状态管理 (10个Store)
│       │   ├── projectStore.ts
│       │   ├── chapterStore.ts
│       │   ├── characterStore.ts
│       │   ├── outlineStore.ts
│       │   ├── foreshadowingStore.ts
│       │   ├── worldStore.ts
│       │   ├── editorStore.ts
│       │   ├── appStore.ts
│       │   ├── materialStore.ts
│       │   └── inspirationStore.ts
│       ├── pages/            # 页面组件 (22个)
│       │   ├── ProjectListPage      # 项目列表 (首页)
│       │   ├── ProjectDetailPage    # 项目详情
│       │   ├── ProjectDashboard     # 项目概览仪表盘
│       │   ├── WritingPage          # 写作主界面
│       │   ├── CharacterPage        # 角色管理
│       │   ├── WorldPage            # 世界观编辑
│       │   ├── OutlinePage          # 大纲规划
│       │   ├── ForeshadowingPage    # 伏笔看板
│       │   ├── MaterialPage         # 素材库
│       │   ├── InspirationPage      # 灵感发现
│       │   ├── ConflictDashboard    # 冲突总览
│       │   ├── ImportExportPage     # 导入导出+预览
│       │   ├── RefinementPage       # 精修面板
│       │   ├── StyleWritingPage     # 多风格写作
│       │   ├── ImmersiveView        # 沉浸式创作视图
│       │   ├── VisualizationPage    # 关系图谱
│       │   ├── VersionHistoryPage   # 版本历史
│       │   ├── ToolsPage            # 综合工具
│       │   ├── PromptChainPage      # Chain管理
│       │   ├── NewsPage             # 热点新闻
│       │   ├── TitleCheckPage       # 标题版权检测
│       │   └── SettingsPage         # 系统设置 + BYOK
│       └── components/      # 可复用组件 (16个)
│           ├── layout/      # 布局组件
│           │   ├── AppLayout.tsx    # 根布局
│           │   ├── Header.tsx       # 顶栏
│           │   ├── Sidebar.tsx      # 侧栏导航
│           │   └── StatusBar.tsx    # 底栏状态
│           ├── editor/      # 编辑器相关
│           │   ├── MarkdownEditor.tsx   # Monaco编辑器
│           │   ├── MarkdownPreview.tsx  # 实时预览
│           │   ├── AiWritingPanel.tsx   # AI写作面板
│           │   ├── AuthorNotePanel.tsx  # Author's Note
│           │   ├── DialogueStylePanel.tsx# 对白风格
│           │   ├── DiffPanel.tsx        # 差异对比
│           │   └── DiffView.tsx         # diff视图
│           ├── chapter/     # 章节组件
│           │   ├── ChapterEditorShell.tsx # 章节编辑壳
│           │   └── ChapterStatusBadge.tsx # 状态徽标
│           └── common/      # 通用组件
│               ├── ConfirmDialog.tsx   # 确认弹窗
│               └── EmptyState.tsx      # 空状态引导
├── electron-builder.yml     # 打包配置
├── playwright.config.ts     # Playwright E2E 配置
├── vitest.config.ts         # Vitest 单元测试配置
├── e2e/                     # E2E 测试 (Playwright)
│   ├── helpers/             # 测试工具函数
│   ├── flows/               # 核心流程 (项目管理/写作/导入导出)
│   ├── specialized/         # 专项测试 (锁定/冲突)
│   └── performance/         # 渲染性能测试
├── src/__tests__/           # 单元测试 (Vitest)
├── package.json
└── tsconfig.json
```

## 系统要求

- **Node.js 22+**（必需，服务端使用 `node:sqlite`）
- OS: Windows 10+ / macOS 12+ / Linux (x64)
- RAM: ≥4GB（写作流畅），≥8GB（AI 生成）
- 存储: ≥500MB 应用空间 + 项目数据

## 快速开始

### 前置步骤：编译服务端

```bash
# 在 desktop 目录执行，编译后端 NestJS 服务
cd server
npm install
npx tsc
```

### 开发运行（热重载）

```bash
cd desktop
npm install

# 一键启动 Electron + 后端 + 热重载
npm run dev
```

启动后会自动：
1. 启动 Vite 开发服务器
2. 启动 Electron 窗口
3. 自动 fork 后端 NestJS 服务（使用系统 Node.js）

### 编译与打包

```bash
# 1. 编译服务端
cd server && npx tsc

# 2. 编译桌面端（类型检查 + Vite 打包）
cd desktop && npm run build

# 3. 打包为安装程序
npm run pack:win            # Windows NSIS 安装包
npm run pack:mac            # macOS DMG
npm run pack:linux          # Linux AppImage
npm run dist                # build + pack:win 一步完成
```

> `npm run build` = `tsc && vite build`（完整生产构建）
> `npx vite build` = 仅 Vite 打包（无类型检查，用于快速验证编译）

### 测试

```bash
# 运行单元测试
npm test                    # 等同于 vitest run
npm run test:watch          # 监视模式

# 运行 E2E 测试（需要后端服务运行）
npm run test:e2e            # 等同于 playwright test
npm run test:e2e:ui         # 可视化模式

# 运行全部测试
npm run test:all
```

### LLM API Key 配置

AI 生成功能需要配置 API Key。支持方式：

**方式一：环境变量（推荐）**
```bash
# 通用 Key（所有模型共用）
export LLM_API_KEY=sk-your-key

# 或分别指定不同模型
export DEEPSEEK_API_KEY=sk-xxx
export OPENAI_API_KEY=sk-xxx
export CLAUDE_API_KEY=sk-ant-xxx
```

**方式二：桌面端 Settings 页面 BYOK 界面**
运行时通过 UI 添加 API Key，临时生效。

> 不设 Key 时 Chain 引擎会报错提示，不会使用 mock 数据。

## 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 项目列表 | 首页，空状态引导 |
| `/project/:id` | 项目详情 | 项目基本信息 |
| `/project/:id/dashboard` | 概览仪表盘 | 4格核心数据+进度 |
| `/project/:id/writing` | 写作界面 | 编辑器+F1/F2/F3热键 |
| `/project/:id/characters` | 角色管理 | 角色卡+关系图谱 |
| `/project/:id/world` | 世界观编辑 | 65条约束体系 |
| `/project/:id/outline` | 大纲规划 | 多级大纲+Goal弧线 |
| `/project/:id/foreshadowing` | 伏笔看板 | 全生命周期管理 |
| `/project/:id/material` | 素材库 | 素材管理+市场 |
| `/project/:id/conflicts` | 冲突总览 | P0-P3四级检测 |
| `/project/:id/import-export` | 导入导出 | +导出预览 |
| `/project/:id/refinement` | 精修面板 | 降AI+质检 |
| `/project/:id/visualization` | 可视化 | 关系/时序/伏笔网 |
| `/project/:id/versions` | 版本历史 | 快照回退 |
| `/settings` | 系统设置 | BYOK+模型+偏好 |

## 热键

| 热键 | 功能 |
|------|------|
| F1 | 全自动写作模式 |
| F2 | 半自动写作模式 |
| F3 | 手动写作模式 |
| F11 | 沉浸式创作视图切换 |
| Esc | 退出沉浸视图 |

## 核心功能

- **AI 写作**: 灵感生成 → 大纲生成 → 正文生成 (天龙8步法)
- **项目管理**: 多项目并行，.md 文件持久化
- **角色系统**: 24维状态引擎，人设漂移检测
- **世界观**: 65条约束体系，时代检测
- **伏笔**: 全生命周期管理，过期预警
- **素材库**: 标签/风格向量化/混合检索
- **精修与质检**: 10个写作维度评分 + AI痕迹检测 + 降AI
- **导入导出**: Markdown/TXT/EPUB/HTML/PDF/DOCX
- **冲突检测**: 四级优先级 (P0锁定正文 > P1世界观 > P2设定 > P3未锁定正文)
- **多模型路由**: 写手/评审/策划 三级分工 + BYOK
- **导出预览**: 实时调整字体/行距/边距

## 系统要求

- OS: Windows 10+ / macOS 12+ / Linux (x64)
- RAM: ≥4GB (写作流畅), ≥8GB (AI生成)
- 存储: ≥500MB 应用空间 + 项目数据
- 后端: Node.js 22+ (本地运行)

## 测试

```bash
# 单元测试 (Vitest, 覆盖率目标 70%)
npm test

# E2E 测试 (Playwright, Chromium + Firefox)
npm run test:e2e

# 全部测试
npm run test:all
```

### 测试覆盖

| 类型 | 文件数 | 覆盖内容 |
|------|--------|---------|
| E2E 流程 | 3个 | 项目管理 / 写作流程 / 导入导出 |
| E2E 专项 | 2个 | 锁定机制 / 冲突检测 |
| E2E 性能 | 1个 | 首页加载<5s, 页面切换<3s |
| 单元测试 | 1个 | Zustand Store 结构验证 |

## 核心数据

| 指标 | 数值 |
|------|------|
| Desktop 源文件 | 62 .ts/.tsx |
| 页面 | 23 个 |
| 组件 | 20 个 |
| Zustand Store | 10 个 |
| Electron 主进程 | main.ts + preload.ts |
| 测试文件 | 8 个 (7 E2E + 1 单元) |

## 关联文档

| 文档 | 路径 |
|------|------|
| 研发计划 | [`../../AI写作平台研发计划.md`](../../AI写作平台研发计划.md) |
| Server 后端 | [`../server/README.md`](../server/README.md) |
| API 参考 | [`../server/docs/API.md`](../server/docs/API.md) |
| 用户指南 | [`../server/docs/user-guide.md`](../server/docs/user-guide.md) |
| 设计文档 | [`../server/docs/design/`](../server/docs/design/) |
