# AI 小说写作平台 API

基础地址：`http://127.0.0.1:3100/api/v1`。桌面管理端固定使用 5173，服务端 API 固定使用 3100。

## 项目与创作宪法

### 灵感发现

```http
POST /api/v1/chain/idea-discover
Content-Type: application/json

{
  "storyType": "short_story",
  "platform": "fanqie",
  "targetWords": "20000",
  "storyCategory": "都市/现实",
  "toneTags": ["热血", "白描"],
  "count": 5
}
```

服务只调用 `idea_generate` 当前模式所配置的具体模型。一次请求先批量生成，缺项时最多使用同一模型补齐一次；不会切换模型、提供商或模式，也不会创建占位题材。相同配置仍在执行时复用同一任务。

篇幅口径只在执行标准一处定义（机器权威为 module-standards seed，见桌面端 `/module-standards`），短篇与长篇的目标总字数区间以那里为准，本文档不另写一套。返回题材必须同时给出 `storyType`、`targetPlatform`、`estimatedWords`、`plannedChapters` 与 `scopeBreakdown`，否则不能通过质量 Gate。

### 创建项目

```http
POST /api/v1/projects
Content-Type: application/json

{
  "title": "作品名",
  "type": "long_novel",
  "targetPlatform": "fanqie",
  "targetWords": 800000,
  "category": "都市",
  "storyTone": ["热血"],
  "writingStyle": ["白描", "快节奏"],
  "webNovelGenre": ["重生"],
  "pov": "第三人称限知",
  "targetAudience": "18-35岁网文读者",
  "chapterWordRange": { "min": 3200, "max": 4000 },
  "creationSource": "idea",
  "ideaSeed": "用户原始想法",
  "confirmedIdea": "已确认题材"
}
```

创作字段只允许从顶层写入。请求中的 `settings` 只能保存操作设置；包含 `targetPlatform`、`platform`、`recommendedPlatform`、`category`、`storyTone`、`writingStyle`、`webNovelGenre`、`pov`、`targetAudience` 或 `chapterWordRange` 会返回 400。

`platformStyle` 和 `projectMode` 已从写接口删除。数据库中的旧列仅作为创作宪法的同步投影。

### 项目接口

```text
GET    /api/v1/projects
GET    /api/v1/projects/:id
GET    /api/v1/projects/:id/stats
POST   /api/v1/projects
PUT    /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

项目响应包含 `creativeConstitution`，它是所有创作模块唯一可执行的创作约束。

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

场景配置使用唯一格式：

```json
{
  "mode": "normal",
  "scenes": {
    "idea_generate:normal": "deepseek-v4-flash",
    "outline:normal": "deepseek-v4-flash",
    "writing:normal": "deepseek-v4-flash",
    "polish:normal": "deepseek-v4-flash",
    "daily:normal": "deepseek-v4-flash"
  }
}
```

允许场景为 `idea_generate`、`outline`、`writing`、`polish`、`daily`；允许模式为 `economy`、`normal`、`premium`。旧的扁平或嵌套格式只在启动时迁移一次，运行时不再读取。

## 质量闭环

```text
GET /api/v1/generation-metrics/cockpit?projectId=<id>
GET /api/v1/generation-metrics/runs?projectId=<id>&limit=50
GET /api/v1/generation-metrics/flow?projectId=<id>&days=30
GET /api/v1/generation-metrics/content-reports?projectId=<id>&stage=chapter&severity=blocking&status=open&page=1&pageSize=20
GET /api/v1/platform-analytics/overview?projectId=<id>&days=30
```

`cockpit` 返回：

- 项目、世界观、角色、大纲和章节多维分数
- 当前统一 `QualityIssue`
- Gate 状态
- 修复前后比较
- 生成运行与趋势

一个实际模型调用对应一条 `generation_runs`。同一项目、阶段、来源和内容范围只有一份当前质量报告；复检会使旧问题变为 `superseded`，不会为每次回答创建独立报告。

质量问题严重度为 `blocking`、`high`、`medium`、`low`、`info`。问题证据包含原文、起止位置和是否验证。缺证据时评估状态为 `insufficient_evidence`。

## 当前执行标准

```text
GET  /api/v1/module-standards
GET  /api/v1/module-standards/status
GET  /api/v1/module-standards/:key
POST /api/v1/module-standards/:key/summarize
```

生成时只注入当前生效标准。标准注入不代表内容通过验收，最终结果仍需经过对应质量 Gate。

## RAG

RAG 是内部可选能力，没有用户侧 Embedding 配置接口。缺少本地语义模型时相关同步返回 `skipped`，不会改用远程服务或阻断创建、保存与正文生成。
