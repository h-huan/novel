# AI 小说写作平台 API

基础地址：`http://127.0.0.1:3100/api/v1`。桌面管理端固定使用 5173，服务端 API 固定使用 3100。

## 项目与创作宪法

### 灵感发现

```http
POST /api/v1/chain/idea-discover
Content-Type: application/json
```

服务只调用 `idea_generate` 当前模式所配置的具体模型。一次请求先批量生成，缺项时最多使用同一模型补齐一次；不会切换模型、提供商或模式，也不会创建占位题材。

篇幅、平台、分类、基调、文风、流派和视角等创作要求以根目录 `QUALITY_EXECUTION.md` 为唯一规范说明；代码侧低层阈值从 shared/platform benchmark 等唯一常量来源读取，API 文档不复制第二套规则。

### 创建项目

```http
POST /api/v1/projects
Content-Type: application/json
```

项目创建必须形成完整 Creative Constitution。创作字段只允许从顶层写入；请求中的 `settings` 只保存操作设置，不允许塞入第二份创作事实。

`platformStyle` 等旧字段仅保留为兼容投影，运行时不作为第二事实源。

### 项目接口

```text
GET    /api/v1/projects
GET    /api/v1/projects/:id
GET    /api/v1/projects/:id/stats
POST   /api/v1/projects
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

正文真实生成走 Chain 写作入口；是否成功必须以 `chapters.content` 实际落库及对应 Gate/质量报告为准。

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

质量判断必须有证据。Blocking 问题停止交付；证据不足时返回未评估/证据不足，不允许空问题集合冒充通过。具体标准只见 `QUALITY_EXECUTION.md`。

## 当前执行规则只读视图

```text
GET /api/v1/module-standards
GET /api/v1/module-standards/status
GET /api/v1/module-standards/:key
```

该接口只展示当前代码侧可执行镜像。运行时不再提供“让模型重新归纳并改写 hard rules”的写接口。规范变更必须通过代码 + `QUALITY_EXECUTION.md` + 测试在同一提交中完成。

## 健康检查

```text
GET /api/v1/health
GET /api/v1/health/full
GET /api/v1/health/rag
```

## RAG

RAG 是内部可选检索能力，不是正式事实源。缺少本地语义模型时相关同步可返回 `skipped`，不应改用未经配置的远程服务，也不应阻断正常项目数据保存。
