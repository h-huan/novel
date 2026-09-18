# AI 小说写作平台

这是一个 Electron + React 桌面写作应用，后端使用 NestJS 和 SQLite。当前开发主线是小说质量闭环：所有生成内容继承同一份创作宪法，生成过程有可查询记录，质量判断必须有证据，阻断问题会停止交付或进入自动修复。

## 当前唯一执行规则

1. 每个项目只有一份 `Creative Constitution`。长短篇、目标平台、目标字数、分类、基调、写作风格、网文流派、POV、读者和章节字数范围都从这里读取。
2. `target_platform`、`platform_style`、`writing_style` 等数据库列只是创作宪法的同步投影，不能成为第二套配置来源。`settings` 不能保存重复创作字段。
3. 模型路由只有五个用户配置场景：灵感、大纲/架构、正文、精修/质检、日常。每种写作模式分别保存配置。
4. 某场景有配置时使用该模型；没有时使用当前模式配置的日常模型；两者都没有时停止并明确提示。模型、提供商和推理强度都不会自动降级。
5. 世界观、角色、大纲、正文和精修都会写入 `generation_runs`。一次实际模型调用对应一条运行记录；同一内容的质量复检更新当前质量报告，不会为每次回答创建新报告。
6. 所有自动诊断统一写入 `writing_quality_reports` 和 `writing_quality_issues`。缺材料或缺逐字证据时返回未评估/证据不足，禁止随机分数、示例伏笔、占位问题和默认高分。
7. Blocking 问题会阻断交付。可修复问题按 Issue → Repair → Recheck → Compare → Accept/Rollback 执行，只从被接受的真实修复沉淀经验。
8. RAG 是项目内部的可选语义检索能力。它优先使用随应用提供的本地模型；本地模型不可用时跳过语义索引，不要求用户填写 Embedding Key，也不阻断创建、写作或保存。

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
