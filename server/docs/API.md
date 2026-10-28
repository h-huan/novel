# AI 小说写作平台 API

基础地址：`http://127.0.0.1:3100/api/v1`。桌面管理端固定使用 5173，服务端 API 固定使用 3100。

## 项目与创作宪法

### 灵感发现

```http
POST /api/v1/chain/idea-discover
Content-Type: application/json
```

服务只调用 `idea_generate` 当前模式所配置的具体模型。一次请求先广搜原池并锁定题材，执行独立来源/类别/流派/兑现及同构核对，再逐卡结构化并经完整质量 Gate 验收。未达用户请求数量时，在同批原池、已证缺陷和各阶段共享物理调用预算内处理可独立审核的局部修复或一次定向换选（不再生成可选备用换选组合，也不叠加其复核）；一批换选中若只有部分身份未通过，已被独立来源和同构审核完整覆盖且没有被举证为失败的其它身份可继续进入原有完整卡质量 Gate，未通过项仍隔离，不为保留项重复购买相同审核。无进展、可用候选不足或预算耗尽时如实标记缺额，不创建占位题材、不扩大原池、不切换模型/提供商/模式，也不把部分交付冒充完整成功。词面推进和差异代理分仅提示独立语义审核重点，不能据此直接淘汰；仍须逐卡通过真实差异、升级、因果、兑现和四项读者目标审核。来源审核逐字段返回状态与依据，通过项避免重复转录原文。具体判据、预算及流程以唯一执行标准和现行实现为准。

篇幅、平台、分类、基调、文风、流派、视角等创作要求以 `server/shared/src/执行标准.ts` 的唯一执行标准、Creative Constitution 和授权参数源为准；`QUALITY_EXECUTION.md` 仅为旧链接兼容，不承载独立规则。本 API 文档不复制第二套阈值或质量 Gate。

### 创建小说

```http
POST /api/v1/chain/create-project-async
Content-Type: application/json
```

该接口使用已通过验收并由用户选定的故事卡及当前创作宪法，先建立 `creating` 项目壳。短篇先审核并保存世界观，再据此生成章纲并进行逐章事实/行动审查及保存前整批事实复核；后续角色、组织、伏笔基于已验收来源补全，不再启动第二套世界观生成。长篇首次创建通过 `long-novel-init-foundation` 生成主线骨架与世界规则，再在创建流程中生成角色和首批详细章纲；后续细纲在写作推进中由 `rollout-outline` 增量补足，新增批次继承确认世界与前章纲并接受独立事实复核；同项目滚动补纲串行化，新批次独立审核后按事务原子写入，不自动覆盖已写正文。新有名人物、地点、组织及伏笔必须给出所在章纲的逐字事件来源，由模型提供新增实体目录，经审查后仅存入待确认状态项；作者通过现有状态确稿接口确认后，原有实体服务负责实际建档且复核数据库回写，拒绝或未确稿的提案所涉章节在正文模型调用前阻断，不能让未授权新实体绕过角色白名单。`long-novel-flexible-outline` 属于大纲页手动调用的独立 `POST /api/v1/chain/generate-outline` 候选生成入口，不是首次创建必经的第二条规划链。独立大纲只允许保存到没有既存大纲的项目；已有书纲、卷纲或章纲的项目应编辑原节点，长篇滚动补纲走现有增量入口，禁止将候选另存为第二棵正式大纲树。世界观主记录与正文必需的关联档案由同一次原子写入提交，任一写库失败会回滚本次世界观写入；已有世界观如缺少关联档案，在下一次付费规划调用前停止，不能把缺失资料当作完成。必需步骤失败会停止下游生成并保留原始失败证据。项目激活前仍需完整来源、跨模块事实一致性、阶段兑现及恢复检查通过；失败如实保留诊断而非标记 `active`。具体质量判据以唯一执行标准为准。

不存在通用 `POST /projects` 创建入口；`/projects` 只负责读取、更新既有项目和删除项目，避免再次形成第二条创建链。

### 长篇增量实体确稿

滚动章纲 `POST /api/v1/chain/rollout-outline` 在自动模式下只于细纲窗口不足时调用模型；大纲章节列表也可明确传入 `appendCount: 1 | 3 | 5 | 10`，沿用同一份卷级规划、已写正文、角色/组织/地点/伏笔来源及独立事实质量 Gate，严格新增指定数量，不使用自动20章目标，不覆盖已有章纲和正文。卷级章数不足、细纲中有缺口或正文超前时直接拒绝，不代替作者重规划整个小说。

请求只含 `projectId` 时维持原有自动滚动逻辑；`appendCount` 与 `lookahead` 不得同时传入。短篇在创建时已有全篇章纲，不使用长篇手动补纲。

返回的新实体先作为 `state_items` 中 `source_type=rollout_outline` 的 `pending` 候选，不等于已经更新人物卡、地图、势力或伏笔。

```http
GET  /api/v1/projects/:projectId/state/items?status=pending
POST /api/v1/projects/:projectId/state/items/:id/confirm
POST /api/v1/projects/:projectId/state/items/:id/reject
```

确认时必须重新验证提案与所属已保存章纲的逐字证据，并调用已存在的领域实体服务进行写入及数据库核验；任何失败均回滚，不把 `review_only` 标成新实体已建档。拒绝后需由作者先修订涉及章节的章纲，不能直接跳过实体授权生成正文。未确认的提案只是一条待审资料，永不充当已确认世界事实。

### 项目接口

```text
GET    /api/v1/projects
GET    /api/v1/projects/:id
GET    /api/v1/projects/:id/stats
PUT    /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

项目响应包含 `creativeConstitution`，它是所有创作模块的项目级可执行创作约束。

## 章节接口

```text
GET    /api/v1/projects/:projectId/chapters
GET    /api/v1/projects/:projectId/chapters/:id
POST   /api/v1/projects/:projectId/chapters
PUT    /api/v1/projects/:projectId/chapters/:id
DELETE /api/v1/projects/:projectId/chapters/:id
```

正文真实生成由 `ChainWritingController` 调用现行章节写作及质量闭环；固定 Prompt Chain 模板只用于长篇规划，不负责正文合成。是否成功仍以 `chapters.content` 实际落库及对应 Gate/质量报告为准。

## 模型配置

```text
GET    /api/v1/routing/keys
POST   /api/v1/routing/keys
DELETE /api/v1/routing/keys/:model
GET    /api/v1/routing/mode
POST   /api/v1/routing/mode
GET    /api/v1/routing/scenario-models
POST   /api/v1/routing/scenario-models
GET    /api/v1/routing/all-available-models
POST   /api/v1/routing/test
```

允许场景为 `idea_generate`、`outline`、`writing`、`polish`、`daily`；允许模式为 `economy`、`normal`、`premium`。旧配置格式只用于兼容迁移，运行时不应维护第二套路由标准。

## 质量闭环

```text
GET /api/v1/generation-metrics/cockpit?projectId=<id>
GET /api/v1/generation-metrics/runs?projectId=<id>&limit=50
GET /api/v1/generation-metrics/flow?projectId=<id>&days=30
GET /api/v1/generation-metrics/content-reports?projectId=<id>&stage=chapter&severity=blocking&status=open&page=1&pageSize=20
GET /api/v1/platform-analytics/overview?projectId=<id>&days=30
```

质量判断必须有证据。Blocking 问题停止交付；证据不足时返回未评估/证据不足，不允许空问题集合冒充通过。具体标准只见 `server/shared/src/执行标准.ts`。

## 当前执行规则只读视图

```text
GET /api/v1/module-standards
GET /api/v1/module-standards/status
GET /api/v1/module-standards/:key
```

该接口只展示唯一执行标准的当前代码投影，不提供“让模型重新归纳并改写 hard rules”的写入口。重要流程调整必须同步核对 `server/shared/src/执行标准.ts`、`README.md`、本 API 文档、相关用户指南、消费者及回归测试；具体开发维护顺序以 `DEVELOPMENT_GOVERNANCE.md` 为准。

## 健康检查

```text
GET /api/v1/health
GET /api/v1/health/full
GET /api/v1/health/rag
```

## RAG

RAG 是内部可选检索能力，不是正式事实源。缺少本地语义模型时相关同步可返回 `skipped`，不应改用未经配置的远程服务，也不应阻断正常项目数据保存。
