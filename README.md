# AI 小说写作平台

这是一个 Electron + React 桌面写作应用，后端使用 NestJS 和 SQLite。当前开发主线是小说质量闭环：所有生成内容继承同一份创作宪法，生成过程有可查询记录，质量判断必须有证据，阻断问题会停止交付或进入自动修复。

## 执行标准（唯一入口）

写作与质量规则只在执行标准一处维护与列举，本文件不再重复罗列条目。

**机器权威**：代码侧可执行标准在 `server/src/modules/module-standards/module-standards.seed.ts`（当前 `SEED_BASELINE_VERSION=18`），启动时由 ensureSeeded 确定性覆盖，全项目继承，桌面端 `/module-standards`「执行标准」页面展示的就是它。确定性扫描与验收分流见 `server/src/chain/hardline-scanner.ts`，首稿规则见 `server/src/chain/chain.controller.ts`，修复循环见 `server/src/chain/adaptive-repair.ts`，模型容错见 `server/src/chain/real-llm.service.ts`。

**全量说明**：可执行质量控制的全量说明在根目录 `QUALITY_EXECUTION.md`（英文，与代码和 seed 版本对应，是执行标准的完整英文镜像，另含项目不变量）；平台风格设计见 `server/docs/platform-style-system.md`。规则只沉淀在项目文件内，不维护外部文档副本。

修订顺序：seed（机器）→ `QUALITY_EXECUTION.md`（全量镜像）→ 桌面端 `/module-standards` 展示。

## 页面

- `/`：创作质量看板，展示真实作品、章节、问题、评分、趋势和修复数据。
- `/projects`：项目管理和新建项目。
- `/discover`：灵感发现。
- `/module-standards`：当前生效的执行标准。
- `/settings`：API Key、写作模式和五个模型场景配置。刷新模型时以提供商实时返回的 API 模型 ID 完整替换列表；内置模型仅在实时获取失败时兜底，不与实时结果合并。
- `/project/:id/dashboard`：单本作品质量看板。
- `/project/:id/world`、`characters`、`outline`、`writing`、`refinement`：创作全流程。
- `/project/:id/conflicts`、`writing-quality`：统一问题和质量查询。

看板的筛选、分页和下钻都调用真实接口。无数据时显示未评估或空状态，不用假按钮、假分数或静态样本填充。

## 本地开发

要求 Node.js 22 或更高版本。首次安装依赖：

```powershell
cd server
npm ci
cd desktop
npm ci
```

正常桌面开发只启动桌面端：

```powershell
cd desktop
node scripts/dev.js
```

管理端和服务端独立运行：管理端固定使用 5173，只检查服务端连接，不创建或关闭服务端进程；服务端固定使用 3100。需要同时使用时，分别在 `desktop` 和 `server` 目录启动。任一端口被占用都会明确失败，不会自动改用其他端口。

只有单独调试后端、不启动桌面端时，才在 `server` 目录运行 `npm run start:dev`。

## 验证

```powershell
cd server
npm run typecheck
npm test
npm run test:acceptance
npm run build
cd ..\desktop
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 数据与迁移

- 当前数据库基线只有 `server/src/database/migrations/001_initial.ts`。
- 启动时会把旧的一致性表和冲突表数据迁移到统一质量模型，然后删除旧表。
- 桌面应用把数据库和模型配置保存在 Electron 用户数据目录的 `server-data` 中。首次使用新目录时只迁移一次旧数据。
- `server/data` 只用于从源码直接运行后端；桌面端不会复用其他仓库目录的运行中服务。

## 目录

```text
desktop/   Electron 主进程、React 界面、前端测试
server/    NestJS API、生成链、质量闭环、SQLite、测试
```

API 细节见 `server/docs/API.md`，操作说明见 `server/docs/user-guide.md`。
