# AI 写作平台 · API 文档

## 概述

- **Base URL**: `http://localhost:3100/api/v1`
- **认证方式**: 无需认证（单用户桌面应用）
- **请求格式**: JSON
- **响应格式**: JSON

---

## 项目管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects` | 获取项目列表 |
| `GET` | `/projects/stats` | 获取全局统计 |
| `POST` | `/projects` | 创建新项目 |
| `GET` | `/projects/:id` | 获取项目详情 |
| `GET` | `/projects/:id/stats` | 获取项目统计 |
| `PUT` | `/projects/:id` | 更新项目信息 |
| `DELETE` | `/projects/:id` | 删除项目 |

### 创建项目

```http
POST /api/v1/projects
Content-Type: application/json

{
  "title": "我的新作品",
  "type": "long_novel",
  "creationSource": "idea",
  "targetPlatform": "fanqie",
  "platformStyle": "fanqie",
  "targetWords": 2000000,
  "currentWorkflowStage": "idea_or_inspiration",
  "ideaStatus": "draft",
  "ideaSeed": "用户的一句话想法",
  "confirmedIdea": "",
  "description": "作品简介"
}
```

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| title | string | 是 | — | 作品标题 |
| type | enum | 否 | `long_novel` | 作品类型：`short_story` / `long_novel` / `script` |
| creationSource | enum | 否 | `blank` | 创建来源：`inspiration` / `idea` / `import` / `blank` |
| targetPlatform | enum | 否 | `generic` | 目标平台：`zhihu` / `fanqie` / `qidian` / `douyin` / `xiaohongshu` / `custom` / `generic` |
| platformStyle | string | 否 | `generic` | 平台风格（与 targetPlatform 兼容） |
| targetWords | number | 否 | `0` | 目标字数 |
| currentWorkflowStage | string | 否 | 自动推导 | 当前创作阶段（短篇=`topic`，长篇=`idea_or_inspiration`） |
| ideaStatus | enum | 否 | `none` | 想法状态：`none` / `draft` / `refining` / `confirmed` / `converted` |
| ideaSeed | string | 否 | — | 用户原始想法 |
| confirmedIdea | string | 否 | — | 确认后的成熟想法 |
| description | string | 否 | — | 作品简介 |
| status | enum | 否 | `active` | 项目状态 |

**兼容：** 旧客户端只传 `title`、`type`、`platformStyle` 仍正常工作，缺字段用默认值。

### 项目列表/详情响应

新增字段（旧项目自动补默认值）：

| 字段 | 来源 | 默认值 |
|------|------|--------|
| creationSource | `creation_source` | `blank` |
| targetPlatform | `target_platform` ∥ `platform_style` | `generic` |
| currentWorkflowStage | `current_workflow_stage` | 短篇=`topic`，长篇=`idea_or_inspiration` |
| ideaStatus | `idea_status` | `none` |
| ideaSeed | `idea_seed` | `undefined` |
| confirmedIdea | `confirmed_idea` | `undefined` |

---

## 角色管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects/:projectId/characters` | 获取角色列表 |
| `POST` | `/projects/:projectId/characters` | 创建角色 |
| `GET` | `/projects/:projectId/characters/:id` | 获取角色详情 |
| `PUT` | `/projects/:projectId/characters/:id` | 更新角色信息 |
| `DELETE` | `/projects/:projectId/characters/:id` | 删除角色 |
| `POST` | `/projects/:projectId/characters/:id/relationships` | 添加角色关系 |
| `DELETE` | `/projects/:projectId/characters/:id/relationships/:targetId` | 删除角色关系 |
| `GET` | `/projects/:projectId/characters/:id/state` | 获取角色最新状态 |
| `GET` | `/projects/:projectId/characters/:id/state-history` | 获取角色状态历史 |

---

## 世界观管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects/:projectId/world-settings` | 获取世界观设定列表 |
| `POST` | `/projects/:projectId/world-settings` | 创建世界观设定 |
| `GET` | `/projects/:projectId/world-settings/:id` | 获取设定详情 |
| `PUT` | `/projects/:projectId/world-settings/:id` | 更新设定 |
| `DELETE` | `/projects/:projectId/world-settings/:id` | 删除设定 |

---

## 大纲管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects/:projectId/outlines` | 获取大纲列表 |
| `GET` | `/projects/:projectId/outlines/tree` | 获取大纲树形结构 |
| `POST` | `/projects/:projectId/outlines` | 创建大纲节点 |
| `GET` | `/projects/:projectId/outlines/:id` | 获取大纲节点详情 |
| `GET` | `/projects/:projectId/outlines/:id/children` | 获取子节点 |
| `PUT` | `/projects/:projectId/outlines/:id` | 更新大纲节点 |
| `DELETE` | `/projects/:projectId/outlines/:id` | 删除大纲节点 |
| `POST` | `/projects/:projectId/outlines/:id/move` | 移动大纲节点 |
| `POST` | `/projects/:projectId/outlines/:id/reorder` | 重排子节点 |

---

## 章节管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects/:projectId/chapters` | 获取章节列表 |
| `GET` | `/projects/:projectId/chapters/volumes` | 获取卷列表 |
| `POST` | `/projects/:projectId/chapters` | 创建章节 |
| `GET` | `/projects/:projectId/chapters/:id` | 获取章节详情 |
| `PUT` | `/projects/:projectId/chapters/:id` | 更新章节内容 |
| `DELETE` | `/projects/:projectId/chapters/:id` | 删除章节 |
| `POST` | `/projects/:projectId/chapters/:id/lock` | 锁定章节 |
| `POST` | `/projects/:projectId/chapters/:id/unlock` | 解锁章节 |
| `POST` | `/projects/:projectId/chapters/:id/review` | 提交审阅 |
| `GET` | `/projects/:projectId/chapters/:id/versions` | 获取版本历史 |
| `POST` | `/projects/:projectId/chapters/:id/versions/:version/restore` | 恢复指定版本 |

---

## 伏笔管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/projects/:projectId/foreshadowings` | 获取伏笔列表 |
| `GET` | `/projects/:projectId/foreshadowings/stats` | 获取伏笔统计 |
| `GET` | `/projects/:projectId/foreshadowings/warnings` | 获取超期警告 |
| `POST` | `/projects/:projectId/foreshadowings` | 创建伏笔 |
| `GET` | `/projects/:projectId/foreshadowings/:id` | 获取伏笔详情 |
| `PUT` | `/projects/:projectId/foreshadowings/:id` | 更新伏笔 |
| `DELETE` | `/projects/:projectId/foreshadowings/:id` | 删除伏笔 |
| `POST` | `/projects/:projectId/foreshadowings/:id/activate` | 激活伏笔 |
| `POST` | `/projects/:projectId/foreshadowings/:id/recover` | 回收伏笔 |
| `POST` | `/projects/:projectId/foreshadowings/:id/cancel` | 取消伏笔 |

---

## Prompt Chain（写作工作流）

完整端点列表请参考 `server/src/chain/chain.controller.ts`。

### 核心写作端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chain/idea-generate` | 灵感生成（3-5个故事题材） |
| `POST` | `/chain/outline-generate` | 大纲生成 |
| `POST` | `/chain/long-outline-generate` | 长篇大纲生成 |
| `POST` | `/chain/long-write` | 长篇正文生成 |
| `POST` | `/chain/generate` | 正文生成（天龙8步法） |
| `POST` | `/chain/continue` | 续写当前章节 |
| `POST` | `/chain/enhance-opening` | 开头强化 |
| `POST` | `/chain/enhance-reversal` | 反转强化 |
| `POST` | `/chain/adapt-platform` | 平台风格改写 |
| `POST` | `/chain/generate-title` | 标题/简介生成 |
| `POST` | `/chain/quality-check` | 质检评分 |
| `POST` | `/chain/stream-generate` | 流式生成（SSE） |
| `POST` | `/chain/multi-model-generate` | 多模型协作生成 |

### 模板管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/chain/templates` | 获取模板列表 |
| `GET` | `/chain/templates/:id` | 获取模板详情 |
| `POST` | `/chain/templates/save` | 保存模板 |
| `DELETE` | `/chain/templates/:id` | 删除模板 |
| `POST` | `/chain/templates/validate` | 验证模板结构 |
| `POST` | `/chain/templates/execute/:id` | 执行模板测试 |

### 版本管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chain/version/snapshot` | 创建版本快照 |
| `POST` | `/chain/version/history` | 获取版本历史 |
| `POST` | `/chain/version/restore` | 恢复版本 |
| `POST` | `/chain/version/diff` | 版本差异对比 |

### 写作上下文

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chain/writing-context` | 构建写作上下文 |
| `POST` | `/chain/post-write-archive` | 完稿信息回写 |
| `POST` | `/chain/chapter-transition` | 章节衔接 |
| `POST` | `/chain/previous-summary` | 前情提要生成 |

### 风格管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chain/style-detect` | 风格自动识别 |
| `POST` | `/chain/style-mix` | 风格混搭 |
| `POST` | `/chain/dialogue-style` | 对话风格分析 |
| `POST` | `/chain/style-vectorize` | 风格向量化存储 |

### 导入导出

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/chain/export-novel` | 导出 .novel 项目包 |
| `POST` | `/chain/import-novel` | 导入 .novel 项目包 |
| `POST` | `/chain/export-incremental` | 增量导出 |
| `POST` | `/chain/ai-deconstruct` | AI 智能拆解识别 |
| `POST` | `/chain/import-optimize` | 导入后优化 |
| `POST` | `/chain/import-doc` | DOCX/EPUB 导入 |

---

## 精修系统（Refinement）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/refinement/templates` | 获取精修模板列表 |
| `GET` | `/refinement/templates/categories` | 获取模板分类 |
| `POST` | `/refinement/templates/apply` | 应用精修模板 |
| `POST` | `/refinement/de-ai/detect` | AI 痕迹检测 |
| `POST` | `/refinement/de-ai/polish` | 降 AI 处理 |
| `GET` | `/refinement/describe/styles` | 获取 Describe 风格列表 |
| `POST` | `/refinement/describe/polish` | Describe 逐句精修 |
| `POST` | `/refinement/quality/inspect` | 全维度质检 |
| `POST` | `/refinement/quality/logic` | 逻辑检测 |
| `POST` | `/refinement/quality/character-drift` | 人设漂移检测 |
| `POST` | `/refinement/quality/foreshadowing` | 伏笔遗漏检测 |
| `POST` | `/refinement/spell-check/check` | 错别字检查 |
| `POST` | `/refinement/spell-check/auto-fix` | 自动修复 |
| `POST` | `/refinement/sensitive/check` | 敏感词检测 |
| `POST` | `/refinement/sensitive/process` | 敏感词处理 |
| `POST` | `/refinement/sensitive/ai-context` | AI 上下文判断 |
| `POST` | `/refinement/copyright/check` | 全量版权检测 |
| `POST` | `/refinement/copyright/check-title` | 标题版权检测 |
| `POST` | `/refinement/copyright/check-characters` | 角色名版权检测 |
| `POST` | `/refinement/export` | 多格式导出 |

---

## 导入导出（独立端点）

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/import-export/formats` | 获取支持的格式列表 |
| `POST` | `/import-export/import` | 从文件导入 |
| `POST` | `/import-export/import/text` | 从文本导入 |
| `POST` | `/import-export/export` | 导出 |
| `POST` | `/import-export/export/preview` | 导出预览 |
| `POST` | `/import-export/optimization-mark/:projectId` | 导入优化标记分析 |

---

## 系统状态

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/chain/memory-health` | 记忆健康度检查 |
| `GET` | `/health` | 服务健康检查 |

---

## 想法孵化（Idea Lab）

Idea Lab 提供「从想法开始」的完整孵化流程：用户输入一句模糊想法 → AI 追问 → 用户补充 → AI 完善 → 成熟度评分 → 确认想法 → 创建项目。

### 数据表

新增 `idea_drafts` 表用于存储孵化中的想法草稿，不等同于 `projects` 表。

### API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/idea-lab/drafts` | 创建想法草稿 |
| `GET` | `/idea-lab/drafts` | 获取所有草稿 |
| `GET` | `/idea-lab/drafts/:id` | 获取草稿详情 |
| `POST` | `/idea-lab/drafts/:id/questions` | AI 生成追问问题 |
| `PUT` | `/idea-lab/drafts/:id/answers` | 保存用户回答 |
| `POST` | `/idea-lab/drafts/:id/refine` | AI 完善想法并评分 |
| `POST` | `/idea-lab/drafts/:id/confirm` | 确认想法 |
| `POST` | `/idea-lab/drafts/:id/convert-to-project` | 转换为项目 |

### 创建想法草稿

```
POST /api/v1/idea-lab/drafts
Content-Type: application/json

{
  "rawIdea": "我想写一个县城青年靠旧账本发现家族秘密的故事",
  "projectType": "long_novel",
  "targetPlatform": "fanqie",
  "targetWords": 200000,
  "title": "",
  "description": ""
}
```

**响应：**
```json
{
  "id": "uuid",
  "rawIdea": "...",
  "projectType": "long_novel",
  "targetPlatform": "fanqie",
  "status": "draft",
  "questions": [],
  "answers": [],
  "refinedIdea": null,
  "maturityScore": 0,
  "maturityReport": null,
  "confirmedIdea": "",
  "convertedProjectId": null
}
```

### 生成追问

```
POST /api/v1/idea-lab/drafts/:id/questions
```

LLM 不可用时返回模板问题并标记 `isFallback: true`。

### 完善想法

```
POST /api/v1/idea-lab/drafts/:id/refine
```

LLM 不可用时返回基于模板的完善结果，标记 `isFallback: true`。

### 转换为项目

```
POST /api/v1/idea-lab/drafts/:id/convert-to-project
```

创建项目时复用 `ProjectService.create`，写入以下字段：
- `creationSource = "idea"`
- `ideaStatus = "converted"`
- `ideaSeed = 原始想法`
- `confirmedIdea = 确认后的成熟想法`
- `type = draft.projectType`
- `targetPlatform = draft.targetPlatform`
