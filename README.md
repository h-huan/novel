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

### 灵感生成失败时的逐阶段追踪

这是一条**只读的真实运行诊断**：先在应用内使用配置好的真实模型执行一次灵感发现（例如请求 5 张），随后在**仓库根目录**执行：

```powershell
node verify-local.mjs
```

如果 Server 使用非默认地址，可用 `node verify-local.mjs --base http://127.0.0.1:3100/api/v1` 显式指定；远端地址仅使用自己信任的测试服务，不要公开含小说素材的本地验收文件。**脚本不代替 UI 发起模型生成，也不会自动换题/补数/降低 Gate。**

查看 `verification/latest.md` 的“灵感生成详细诊断”，可顺序核对**请求数 → 题材池 → 已选胚子 → 完整卡结构化 → Gate 合格 → 批次交付 → 缺额**，并逐条查看：

- 前置筛选的淘汰理由（若审计提供）；
- 每个 premise ID 的结构化协议/模型调用失败；
- 终审每次尝试的阻断项、非阻断提醒、钩子/冲突/反转/概要证据；
- 定向修复是否运行、补丁数量及协议错误；
- 各项目最近最多 15 条失败生成记录（包含阶段、状态、模型、原始错误）；
- `--full` 失败时的单项测试退出码和 stdout/stderr 末尾日志。

多次测试灵感稳定性时，建议每次在应用内实际完成一轮生成后运行：

```powershell
node verify-local.mjs --archive
```

这样既更新 `verification/latest.json` / `latest.md`，也将**本次完整的 Guard 校验后结果**按时间另存到 `verification/runs/`，便于逐次对比真实模型的 5/5、4/5 等波动及失败证据。该目录已被 Git 忽略，可能含完整故事素材和详细错误日志，不应公开上传。未传 `--archive` 时仍只保留 latest；核心程序异常未产生新报告时也不准把旧 latest 当成新验证结果。

出现「灵感通过 5/5，但创建小说时大纲 Gate 阻断」时，先区分**模型已生成但审查未批准提交的候选章纲**与**数据库确认写入后丢失的数据**。新报告会把前者写成 `BLOCKED · 候选尚未通过框架 Gate`，不会伪装成写库成功后丢失。新版本框架关键行动审查失败时会在 `runtime.projects.short.failedRuns[*].frameworkGateEvidence`（或 `project` / `long`）记录结构化的缺失条件、审核错误及因果引用；`latest.md` 亦展示对应问题摘要。**旧版本生成记录没有保存此类原始审查锚点，无法事后补齐。** 如果仍缺来源证据，应通过日志和受保护的真实复测确认是否为合法规则冲突，不自动改写已确认故事/世界设定。

执行标准唯一权威为 System Workflow Rule Registry；报告要求服务端来源 `system_workflow_rule_registry` 与仓库 Registry 版本一致，不能按旧的 `code_seed` 行标识判断版本漂移。诊断报告如显示代码版本与服务端一致但 `source` 为旧值，才需核对实际部署版本。

`verification/latest.json` 的 `runtime.ideaDiscovery` 保留 Server 返回的原始审计和所有候选证据；`runtime.ideaDiscoveryAnalysis` 是按阶段整理的只读摘要。如果服务不可用、尚未运行过灵感生成，报告会明确写“无审计”，**不能把缺失证据当成 Gate 已通过或未通过**。只读诊断的“阶段信号”不等于已证明具体模型失效根因；仍需配合应用异常现场和真实 Server 日志做归因。

快速诊断模式**不要求短篇、长篇同时存在**；完整验收 `--full` 才要求二者满足第一章验收条件。脚本的入口、核心逻辑、Guard 与阶段诊断均在 CI 中执行语法或回归测试。

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
server/               NestJS API、生成链、质量闭环、SQLite、测试
QUALITY_EXECUTION.md  唯一执行标准
verify-local.mjs      本地验收报告生成器
```
