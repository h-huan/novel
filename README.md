# AI 小说写作平台

这是一个 Electron + React 桌面小说创作平台，后端使用 NestJS + SQLite。目标是支持短篇与长篇从灵感、架构、大纲、正文生成到质量检查、连续性维护和长期创作。

## 唯一执行标准

项目的开发纪律、小说生成规则、质量 Gate、修复原则、验收方式只在根目录 `QUALITY_EXECUTION.md` 维护。

README 不重复标准内容，也不维护标准版本号。代码中的扫描器、Creative Constitution、ChapterPlan、平台基准和模块 seed 都是该标准的可执行实现。

## 主要入口

- `/`：创作质量看板
- `/projects`：项目管理
- `/discover`：灵感发现与项目创建主入口
- `/module-standards`：当前运行规则只读视图
- `/project/:id/dashboard`：单本作品看板
- `/project/:id/world`：世界观
- `/project/:id/characters`：角色
- `/project/:id/outline`：大纲
- `/project/:id/writing`：正文写作
- `/project/:id/conflicts`：冲突/矛盾
- `/project/:id/writing-quality`：质量报告
- `/project/:id/refinement`：精修

API 文档：`server/docs/API.md`  
用户操作说明：`server/docs/user-guide.md`

## 本地开发

要求 Node.js 22 或更高版本。

首次安装：

```powershell
cd server
npm ci
cd ..\desktop
npm ci
```

正常桌面开发：

```powershell
cd desktop
node scripts/dev.js
```

服务端固定使用 `3100`，桌面开发前端固定使用 `5173`。端口被占用时应明确失败，不允许静默切换到其他端口。

只调试后端时：

```powershell
cd server
npm run start:dev
```

## 仓库验证

后端：

```powershell
cd server
npm run typecheck
npm test
npm run test:acceptance
npm run build
```

桌面端：

```powershell
cd desktop
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## 本地真实运行验收

### 什么时候运行

`verify-local.mjs` 既可以用于**运行中故障诊断**，也可以用于**最终完整验收**，不要求整本小说全部生成完成。

为了取得运行时项目、章节、生成记录和 Gate 数据，建议执行时保持 Server 正常运行（默认 `http://127.0.0.1:3100/api/v1`）。如果 Server 不可用，脚本仍会生成报告，但只把 `server_unavailable` 作为运行根因，并将题材诊断、执行标准、项目发现和项目检查标记为未执行；不会再把 `project_auto_discovery_failed`、`no_projects_found` 等下游结果误报成独立业务故障。

如果小说生成过程中已经报错，可以立即执行快速诊断，不需要等长短篇全部跑完：

```powershell
node verify-local.mjs
```

该命令不会要求短篇和长篇同时存在，也不会只查 `active` 项目。它会自动检查最近的项目（包括 `creating` / `generation_failed`），并在报告中显示项目状态、结构审计、最近 generation run 及其 `error`。灵感发现无论成功还是全部候选被淘汰，最近一批结果都会写入 `runtime.ideaDiscovery`，其中包含唯一前置 Gate 的候选证据、通过/淘汰数量与原因，因此即使尚未创建任何项目也能复盘题材阶段。若项目壳未落库，报告仍会标记 `no_projects_found`；此时应先查看 `runtime.ideaDiscovery`。只有灵感诊断本身也不可用时，才需要结合创建页错误信息和 Server 日志定位项目持久化之前的故障。

### 最终完整验收（默认推荐）

当应用里已经分别有一个真实短篇和一个真实长篇，并且两个项目均已激活、至少完成第一章真实生成后，在仓库根目录执行：

```powershell
node verify-local.mjs --full
```

这里不要求整本短篇或整部长篇写完；**第一章真实生成完成即可进入验收**。`--full` 会在运行时检查之外，再执行 Server/Desktop 的 typecheck、unit、acceptance 和 build，因此适合作为最终交付前的完整验收。

不需要手工查项目 ID。默认情况下，脚本会从已激活项目中自动选择最近更新的一个短篇和一个长篇，并把两本书同时写入同一份验收报告。

### 高级/精确指定

需要精确指定某两本书时可覆盖自动选择：

```powershell
node verify-local.mjs --short-project <短篇项目ID> --long-project <长篇项目ID> --full
```

单本兼容模式：

```powershell
node verify-local.mjs --project <项目ID>
```

如果最终验收还要运行 E2E：

```powershell
node verify-local.mjs --full --e2e
```

### 报错时怎么看

下面两个文件不是仓库预置文件，而是每次运行 `verify-local.mjs` 后在本地生成，并覆盖为最新结果：

```text
verification/latest.json
verification/latest.md
```

即使最终 verdict 为 FAIL，这两个文件仍会生成。终端命令返回非 0 只表示验收发现问题，不表示报告生成失败。优先查看 `verification/latest.md` 的“运行问题”；需要完整机器数据时查看 `verification/latest.json`。

快速诊断模式用于定位灵感发现、正在创建或创建失败的项目；最终 `--full` 模式则会把短篇和长篇同时写进同一份报告，并严格检查：项目已激活、项目类型正确、`confirmedStory` 已持久化、恢复审计中无缺失模块或一致性问题、章纲与正文映射有效、第一章正文非空、对应 chapter generation run 成功且 Gate 已通过。报告文件已加入 `.gitignore`，默认只保留最新一次。

## 数据与迁移

- 当前数据库基线位于 `server/src/database/migrations/001_initial.ts`。
- 桌面应用把数据库和模型配置保存在 Electron 用户数据目录的 `server-data`。
- `server/data` 仅用于源码直接运行后端。
- RAG/向量索引是可重建检索层，不是正式事实源。

## 目录

```text
desktop/              Electron 主进程、前端测试
desktop/              Electron 主进程、前端测试
server/               NestJS API、生成链、质量闭环、SQLite、测试
QUALITY_EXECUTION.md  唯一执行标准
verify-local.mjs      本地验收报告生成器
```
