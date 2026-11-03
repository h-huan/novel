# AI 小说写作平台 API

基础地址：`http://127.0.0.1:3100/api/v1`。桌面管理端固定使用 5173，服务端 API 固定使用 3100。

## 项目与创作宪法

### 灵感发现

```http
POST /api/v1/chain/idea-discover
Content-Type: application/json
```

`POST /chain/cancel-idea-discovery/:requestId` 按本次请求身份取消实际任务，合并请求仍由同一任务的取消机制处理。

服务只调用 `idea_generate` 当前模式配置的模型。生成前锁定平台、作者选择、分类和字典来源；未预选的创作维度在同次候选生成中确定并保存，选优、补位和完整卡继承其值。跨分类原池与缺额补位按每项锁定分类提供同源投稿标签候选，不将单一分类样本用于其它候选。初始池与必需选优共同遵守原调用上限。同批原池选优返回身份和因果原文引用，服务器将同ID分节内连续分句编号还原为原有field/quote并严格校验；范围越界、跨身份或不存在的原文仍拒绝，不改变故事事实。番茄短篇中有公开写作说明的分类由同一注册表提供说明、官方来源及日期，生成与审核同源消费；公开写作说明不作为当前投稿后台完整分类树、体量或收益证明。

前置审核仍分别判断来源继承、内部事实及因果、分类、全部流派和实质差异。服务器可逐字证明的固定分节投影生成完整来源凭证，模型只核对剩余新写或改写字段；这不代替任何语义质量判断，也不覆盖模型负面或未知记录。审核输入的fromSourceSections和sameTextAs仅为原文地址，实际事实与证据目录保持完整。sourceRef已唯一定位原池原文时，固定分节投影的多个字段别名可恢复为同一规范地址；改写、旧格式或无法证明的歧义不据此放行。完整卡在已预留逐卡终审额度时即时进入同一限流队列，只预留整体审核的短批仍合并终审。因果索引纠正与定向兑现复核只注入本步骤职责所需的执行规则，原因果质量要求及全部预算上限不变。候选、选优和前置审核同源接收作者已选维度的正式执行要求；前置已证明缺额且原预算足够时，同一补位波次可提前选优与来源准备，补位完整卡仍等待首轮身份核对。同构须比较作者共同条件之外的实际因果链，类型共性和单一代价不足以证明同构，真实同构仍拒绝。

完成自身全部前置审核且受原重选合同保护的题材立即接续成卡；实际完整卡仍过全部确定性及独立语义、来源继承和读者质量门，各批比较完整卡并携带此前登记的实际参照。来源组不强制相邻身份，按同一批量上限和已资助组数平衡实际工作量，再按不可变身份还原全部证据位置；固定原池同文终局字段的地址和明确拒绝理由的problem/reason/detail可本地归一，保留原事实及拒绝，不增加模型纠错调用。首轮与唯一缺额补位波次复用同一就绪调度，保留原审核拆分条件、尾批合并与每对交付卡的比较；只按本波失败释放其预算预留。合格卡不重做，足额后停止未交付冗余并等待在途调用退出；停止和未审项不计合格。仅原合同授权的标签、章节数量修订允许在共享预算内定向处理，真实故事缺陷仍拒绝。请求数量由本次输入决定，预算、重试和超时上限不增加；当前整次灵感发现的真实验收目标为10分钟内（≤600000毫秒）；完整独立质量审核、按请求数量足额交付及原调用预算均保持不变。真实总耗时以新运行记录为准。

篇幅、平台、分类、基调、文风、流派、视角等创作要求以 `server/shared/src/执行标准.ts` 的唯一执行标准、Creative Constitution 和授权参数源为准；`QUALITY_EXECUTION.md` 仅为旧链接兼容，不承载独立规则。本 API 文档不复制第二套阈值或质量 Gate。

### 创建小说

```http
POST /api/v1/chain/create-project-async
Content-Type: application/json
```

该接口使用已通过验收并由用户选定的故事卡及当前创作宪法，先建立 `creating` 项目壳。长短篇共用地基原样承接完整卡的结局及阶段规划；短篇先审核并保存世界观，再据此生成章纲并进行逐章事实/行动审查及保存前整批事实复核；同次事实首审提供原文字段中的时刻与时长定位，保留模糊读数而不推断事件身份，并沿原编号核对全部时间关系；已举证行动/结果冲突的单次补丁修复须使用当前章实际存在的审核目标路径，按既有字段合同修改与同步同源投影，不再用固定content路径的样例误导重试；后续角色、组织、伏笔基于已验收来源补全，不再启动第二套世界观生成。长篇首次创建通过 `long-novel-init-foundation` 生成主线骨架与世界规则，再在创建流程中生成角色和首批详细章纲；后续细纲在写作推进中由 `rollout-outline` 增量补足，新增批次继承确认世界与前章纲并接受独立事实复核；同项目滚动补纲串行化，新批次独立审核后按事务原子写入，不自动覆盖已写正文。新有名人物、地点、组织及伏笔必须给出所在章纲的逐字事件来源，由模型提供新增实体目录，经审查后仅存入待确认状态项；作者通过现有状态确稿接口确认后，原有实体服务负责实际建档且复核数据库回写，拒绝或未确稿的提案所涉章节在正文模型调用前阻断，不能让未授权新实体绕过角色白名单。`long-novel-flexible-outline` 属于大纲页手动调用的独立 `POST /api/v1/chain/generate-outline` 候选生成入口，不是首次创建必经的第二条规划链。独立大纲只允许保存到没有既存大纲的项目；已有书纲、卷纲或章纲的项目应编辑原节点，长篇滚动补纲走现有增量入口，禁止将候选另存为第二棵正式大纲树。世界观主记录与正文必需的关联档案由同一次原子写入提交，任一写库失败会回滚本次世界观写入；已有世界观如缺少关联档案，在下一次付费规划调用前停止，不能把缺失资料当作完成。必需步骤失败会停止下游生成并保留原始失败证据。行动审核对同条并列的各结果分别核对必要条件，不能只证明局部事件便放行整体评价；无依据评价仍阻断并交原有修订。项目激活前仍需完整来源、跨模块事实一致性、阶段兑现及恢复检查通过；失败如实保留诊断而非标记 `active`。跨模块审核回传的characters.2与characters[2]等索引在服务器精确绑定同一真实身份，并将relationships及profile_json中同一事实的重复字段放入同一修订候选；只在全量独立复查后原子保存，不以改写审查结论代替修复。恢复开始前检查同项目的创建任务和数据库未完成模型调用，仍有在途调用时拒绝清理；失败重建回滚后不得把原本已激活的项目改为失败状态，并写入原有失败账本。具体质量判据以唯一执行标准为准。

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
