# 小说 Agent 平台第 2 步代码分析与第一阶段实施方案

版本：V1.0  
用途：给代码 AI / Codex / Cursor 读取，用于在正式改代码前完成需求理解、代码结构分析、文件清单、分阶段实施计划与第一阶段实施方案。  
执行原则：本文件只做分析与实施设计，不要求立即修改代码。  

---

## 0. 本阶段目标

本阶段对应“第 2 步：让代码 AI 先分析，不要改代码”。

目标不是让代码 AI 立即实现全部功能，而是先建立一致理解：

1. 明确本次不是完全重构。
2. 明确 Tab 工作台继续保留。
3. 明确 Agent 只是上层流程编排、智能建议、流程守卫和后台自动化。
4. 明确“短篇 / 长篇”是作品类型，不是创建来源。
5. 明确“灵感 / 想法 / 导入 / 空白”才是创建来源。
6. 明确第一阶段只做：项目字段 + 创建入口 UI + 项目创建 API + 旧项目兼容。
7. 暂时不做 Idea Lab、Workflow Guard、状态确稿中心、长篇周复盘和平台导出优化。

---

## 1. 需求理解

### 1.1 当前平台为什么不需要完全重构

当前平台已经具备较完整的写作工作台骨架：

- 前端已有项目列表、项目仪表盘、写作、角色、世界观、组织图、大纲、伏笔、时间线、素材、冲突、精修、状态、版本、工具等页面。
- 后端已有项目、角色、世界观、大纲、章节、伏笔、Chain、RAG、状态管理、组织、地图、时间线、精修、导入导出等模块。
- 当前问题不是“没有功能”，而是“创建入口、流程边界、状态事实、Agent 总控层没有统一收束”。

所以正确方案是增量改造：

```text
保留现有 Tab 工作台
+ 增加创建入口层级
+ 增加项目类型与创建来源字段
+ 增加后续 Idea Lab
+ 增加 Workflow Guard
+ 增加 ProjectDashboard 创作流程助手
+ 升级状态页为状态确稿中心
```

不应该推倒重写，也不应该把全部页面改成聊天式 Agent。

---

### 1.2 Tab 工作台和 Agent 总控层的关系

Tab 是结构化工作区，负责管理具体创作资产：

```text
项目
角色
世界观
组织图
地图
时间线
大纲
章节
伏笔
素材
状态
精修
导入导出
```

Agent 是上层流程编排和智能辅助，负责判断下一步、检查缺失、提示风险、自动调用已有功能。

正确关系：

```text
Tab 是工作台
Agent 是导演
Workflow Guard 是规则
状态库是记忆
RAG 是资料检索
Chain 是执行流水线
```

UI 上不建议直接叫“Agent”，建议显示为：

- 创作向导
- 流程助手
- AI 打磨
- AI 检查
- 状态确稿

内部代码可以叫 `agents/`、`workflow/`，但前端产品文案要避免技术化。

---

### 1.3 短篇 / 长篇与创建来源的区别

这是当前 UI 最容易混淆的点。

错误结构：

```text
短篇
长篇
从灵感创建
从想法孵化创建
手动创建
导入创建
```

问题：短篇和长篇是作品类型；灵感、想法、导入、空白才是创建来源。放在同一级会让用户不知道该先选“长篇”，还是“从灵感创建长篇”。

正确结构：

```text
第一层：创建来源
- 从灵感开始
- 从想法开始
- 导入已有资料
- 空白创建

第二层：作品类型
- 短篇
- 长篇

第三层：目标平台
- 知乎盐选
- 番茄
- 起点
- 抖音故事
- 小红书
- 自定义
```

---

### 1.4 四种创建来源的区别

| 创建来源 | 适用场景 | 后续流程 |
|---|---|---|
| 从灵感开始 | 用户没有明确故事，只想从热点、题材、脑洞、灵感卡中选方向 | 先选灵感，再选择短篇/长篇并创建 |
| 从想法开始 | 用户有一句模糊想法，需要 AI 追问和打磨 | 进入 Idea Lab，确认想法成熟后再创建 |
| 导入已有资料 | 用户已有大纲、角色、世界观、正文片段或 `.novel` 项目包 | 进入导入解析和项目转换 |
| 空白创建 | 用户想手动填写项目资料 | 直接创建空白项目 |

第一阶段只需要在 UI 和数据结构中支持这些来源；真正的 Idea Lab、导入解析、灵感转项目可以后续阶段逐步完善。

---

### 1.5 短篇流程和长篇流程边界

短篇流程只遵守“三步骤”：

```text
题材 → 大纲 → 正文
```

短篇不应该被强制要求：

- 详细世界观
- 组织地图
- 分卷大纲
- 长篇周复盘

长篇流程遵守完整长篇工业流程：

```text
想法/灵感
→ 基础设定
→ 世界观
→ 人物
→ 组织与地图
→ 全书大纲
→ 分卷大纲
→ 章节规划
→ 正文生成
→ 状态归档
→ 周复盘
```

长篇不能跳过世界观、人物和大纲直接写正文，否则后续状态管理会失效。

---

## 2. 当前代码结构分析

> 本节基于当前仓库已读取文件进行分析。正式执行前，代码 AI 仍需再次读取最新代码，避免文件已变化。

### 2.1 前端路由结构

当前 `desktop/src/renderer/router.tsx` 已经有完整页面路由，包括：

```text
/
project/:id/dashboard
project/:id/writing
project/:id/characters
project/:id/world
project/:id/organization-map
project/:id/outline
project/:id/foreshadowing
project/:id/timeline
project/:id/material
project/:id/conflicts
project/:id/import-export
project/:id/refinement
project/:id/style-writing
project/:id/state
project/:id/visualization
project/:id/versions
discover
prompt-chains
news
title-check
dictionary
help
```

结论：

1. Tab 工作台基础完整。
2. 不需要删除或替换现有页面。
3. 第一阶段主要改 `/` 项目列表页的新建项目入口。
4. 后续 Idea Lab 可以新增 `/idea-lab` 或集成到 `/discover`。

---

### 2.2 当前项目创建 UI

当前 `ProjectListPage.tsx` 内部已经有 `CreateDialog`，但它是传统表单：

```text
标题
类型
目标平台
目标字数（disabled）
创建项目
```

当前 `TYPE_OPTIONS` 包括：

```text
short_story
long_novel
script
```

当前 `PLATFORM_OPTIONS` 包括：

```text
generic
qidian
fanqie
zhihu
jinjiang
douyin
rules_horror
```

当前问题：

1. 创建入口没有“创建来源”。
2. 短篇 / 长篇和创建来源尚未分层。
3. “目标字数”输入框 disabled，不能真正设置。
4. 项目卡片只显示类型、状态、字数、更新时间。
5. 项目卡片未显示创建来源、当前阶段、目标平台。
6. 目前 `script` 仍作为项目类型存在，第一阶段要决定保留兼容但不在新需求主流程突出。

第一阶段改造点：

- 把 `CreateDialog` 改为三步式创建向导。
- 新增 `creationSource` 状态。
- 新增 `targetPlatform` / `targetWordCount`。
- 保留旧字段 `type` 与 `platformStyle` 兼容。
- 项目列表卡片显示作品类型、创建来源、当前阶段、目标平台。

---

### 2.3 当前项目 Store

当前 `projectStore.ts` 的 `ProjectCreateData` 只有：

```ts
interface ProjectCreateData {
  title: string;
  type: Project['type'];
  platformStyle?: string;
}
```

`createProject` 请求只发送：

```ts
{
  title,
  type,
  platformStyle
}
```

`mapServerProject` 只映射：

```text
id
title
type
status
description
wordCount
chapterCount
platforms
createdAt
updatedAt
```

当前问题：

1. 前端 Store 没有 `creationSource`。
2. 没有 `projectMode`。
3. 没有 `targetPlatform`。
4. 没有 `currentWorkflowStage`。
5. 没有 `ideaStatus`、`ideaSeed`、`confirmedIdea`。
6. 新字段需要在 shared 类型和 map 函数同步。

第一阶段改造点：

- 扩展 `ProjectCreateData`。
- 扩展 `mapServerProject`。
- 扩展 `Project` 类型或兼容已有 `@novel/shared` 类型。
- `createProject` 发送新增字段。
- 旧项目返回缺字段时使用默认值。

---

### 2.4 当前后端项目 API

当前 `ProjectController` 提供：

```text
POST /projects
GET /projects
GET /projects/stats
GET /projects/:id
GET /projects/:id/stats
PUT /projects/:id
DELETE /projects/:id
```

第一阶段不需要新增新的项目 API，只需要扩展 DTO、Service、Repository 和数据库字段。

---

### 2.5 当前 CreateProjectDto

当前 `CreateProjectDto` 字段包括：

```text
title
type
status
targetWords
description
writingMode
platformStyle
settings
writingStyle
```

当前 `type` 支持：

```text
short_story
long_novel
script
```

当前 `platformStyle` 支持：

```text
zhihu
fanqie
qidian
douyin
rules_horror
jinjiang
generic
```

第一阶段改造点：

新增：

```text
projectMode
creationSource
targetPlatform
targetWordCount
currentWorkflowStage
ideaStatus
ideaSeed
confirmedIdea
```

但注意已有字段中已经有 `type`、`targetWords`、`platformStyle`。

建议兼容策略：

| 新需求字段 | 当前字段 | 建议 |
|---|---|---|
| project_mode | type | 第一阶段可将 `project_mode` 与 `type` 同步，避免双字段冲突 |
| target_platform | platform_style | 第一阶段可将 `target_platform` 与 `platform_style` 同步 |
| target_word_count | target_words | 第一阶段优先复用 `target_words`，前端用 `targetWordCount` 映射到 `targetWords` |
| current_workflow_stage | 无 | 新增字段 |
| creation_source | 无 | 新增字段 |
| idea_status | 无 | 新增字段 |
| idea_seed | 无 | 新增字段 |
| confirmed_idea | 无 | 新增字段 |

为了减少破坏性，第一阶段推荐：

1. 数据库新增 `creation_source`、`current_workflow_stage`、`idea_status`、`idea_seed`、`confirmed_idea`。
2. 继续使用现有 `type` 表示作品类型。
3. 继续使用现有 `platform_style` 表示目标平台。
4. 继续使用现有 `target_words` 表示目标字数。
5. API 响应层可以额外输出别名：
   - `projectMode = row.type`
   - `targetPlatform = row.platform_style`
   - `targetWordCount = row.target_words`

这样既满足需求，又降低数据库变更风险。

---

### 2.6 当前 ProjectService

当前 `ProjectService.create()` 会写入：

```text
id
type
title
status
target_words
current_words
platform_style
description
writing_style
settings
created_at
updated_at
```

当前 `ProjectResponse` 返回：

```text
id
type
title
status
targetWords
currentWords
description
writingStyle
settings
createdAt
updatedAt
```

问题：

1. `ProjectResponse` 没有创建来源。
2. 没有当前工作流阶段。
3. 没有想法状态。
4. 没有 targetPlatform 别名。
5. 没有 projectMode 别名。

第一阶段改造点：

- 扩展 `ProjectResponse`。
- `create()` 接收并保存新字段。
- `update()` 允许更新新字段。
- `toResponse()` 返回新字段。
- 旧项目字段为空时返回默认值。

---

### 2.7 当前 ProjectRepository

当前 `ProjectRow` 包括：

```text
id
type
title
status
target_words
current_words
platform_style
description
writing_style
settings
created_at
updated_at
```

第一阶段需要补充：

```text
creation_source
current_workflow_stage
idea_status
idea_seed
confirmed_idea
```

如果不想在第一阶段增加 `project_mode`、`target_platform`、`target_word_count` 真实列，可以用响应层别名兼容。

---

### 2.8 当前数据库迁移机制

当前 `DatabaseService` 使用 Node.js 22 内置 `node:sqlite`，启动时执行迁移器 `Migrator.runMigrations()`。

迁移器会扫描：

```text
server/src/database/migrations
```

并加载符合规则的迁移文件：

```text
数字_名称.ts 或 数字_名称.js
```

第一阶段应新增一个迁移文件，例如：

```text
server/src/database/migrations/0XX_add_project_creation_fields.ts
```

注意：

1. 迁移文件必须具备 `up` 和 `down`。
2. `ALTER TABLE ... ADD COLUMN` 要安全执行。
3. SQLite 不支持简单删除列，down 可以保守处理或重建表，但第一阶段建议 down 保留注释，避免破坏数据。

---

### 2.9 当前 Chain 与写作能力

当前后端已有：

- `POST /chain/long-outline-generate`
- `POST /chain/long-write`
- `POST /chain/generate`
- `POST /chain/continue`
- 开头强化、反转强化、平台改写、标题生成、质检等能力。

当前 `StoryChainService` 已有天龙 8 步正文生成 Chain，包含：

```text
上下文装配
目标
诱因
行动
阻碍
误判
反转
代价
钩子
正文合成
章节质检
```

结论：

1. 第一阶段不需要动 Chain。
2. 后续第四阶段再根据项目类型控制短篇 / 长篇的写作入口。
3. 不要在第一阶段改 `story-chain.service.ts` 或写作生成逻辑。

---

### 2.10 当前状态管理能力

当前状态管理已经有较好的基础：

- 状态提取 API。
- 待确稿队列。
- 单条确认 / 驳回。
- 批量确认 / 驳回。
- 角色状态查询。
- 伏笔状态查询。
- 情节进展查询。
- 一致性检查。
- 状态版本历史。
- 字段锁定。

结论：

1. 状态方向正确。
2. 第一阶段不改状态管理。
3. 第五阶段再将状态页升级为“状态确稿中心”。

---

## 3. 需要修改或新增的文件清单

### 3.1 数据库与迁移

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `server/src/database/migrations/0XX_add_project_creation_fields.ts` | 新增 | 新增迁移 | 为项目增加创建来源、工作流阶段、想法状态字段 | 中 |
| `server/src/database/repositories/project.repository.ts` | 已有 | 修改 | 扩展 `ProjectRow` 类型，支持新列 | 中 |
| `server/src/database/database.service.ts` | 已有 | 通常不改 | 迁移机制已有 | 低 |
| `server/src/database/migrator.ts` | 已有 | 通常不改 | 已支持迁移 | 低 |

---

### 3.2 后端项目模型 / DTO / API

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `server/src/modules/project/dto/create-project.dto.ts` | 已有 | 修改 | 接收 creationSource、workflowStage、idea 字段 | 中 |
| `server/src/modules/project/dto/update-project.dto.ts` | 已有 | 修改 | 支持更新新增字段 | 中 |
| `server/src/modules/project/dto/query-project.dto.ts` | 已有 | 可选修改 | 后续可按 projectMode / creationSource 筛选 | 低 |
| `server/src/modules/project/project.service.ts` | 已有 | 修改 | 写入和返回新增字段 | 中 |
| `server/src/modules/project/project.controller.ts` | 已有 | 通常不改 | CRUD 路由不变 | 低 |
| `server/docs/API.md` | 已有 | 修改 | 更新项目字段说明 | 低 |

---

### 3.3 前端项目创建入口

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `desktop/src/renderer/pages/ProjectListPage.tsx` | 已有 | 重点修改 | 三步式创建入口；卡片展示新字段 | 高 |
| `desktop/src/renderer/stores/projectStore.ts` | 已有 | 修改 | 请求和映射新增字段 | 中 |
| `desktop/src/renderer/lib/api.ts` | 已有 | 通常不改 | HTTP 客户端可复用 | 低 |
| `server/shared` 或 `@novel/shared` 类型文件 | 已有 | 需要搜索并修改 | 扩展 Project 类型、枚举 | 中 |

---

### 3.4 Idea Lab 想法孵化

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `desktop/src/renderer/pages/IdeaLabPage.tsx` | 后续新增 | 第二阶段新增 | 想法孵化页面 | 中 |
| `server/src/modules/idea/*` | 后续新增 | 第二阶段新增 | 独立 Idea Lab 后端模块 | 中 |
| `server/src/chain/chain.controller.ts` | 已有 | 第二阶段可选修改 | 临时承载 idea-refine 接口 | 中 |
| `desktop/src/renderer/router.tsx` | 已有 | 第二阶段修改 | 增加 `/idea-lab` 路由 | 低 |

第一阶段不做。

---

### 3.5 Workflow Guard 流程守卫

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `server/src/workflows/workflow-guard.service.ts` | 后续新增 | 第三阶段新增 | 判断允许操作、下一步、缺失资产 | 中 |
| `server/src/workflows/workflows.module.ts` | 后续新增 | 第三阶段新增 | 注册流程模块 | 低 |
| `server/src/modules/project/project.controller.ts` | 已有 | 第三阶段修改 | 增加 `/projects/:id/workflow/status` | 中 |
| `desktop/src/renderer/pages/ProjectDashboard.tsx` | 已有 | 第三阶段修改 | 展示创作流程助手 | 中 |

第一阶段不做。

---

### 3.6 ProjectDashboard 创作流程助手

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `desktop/src/renderer/pages/ProjectDashboard.tsx` | 已有 | 第三阶段修改 | 增加流程助手面板 | 中 |
| `desktop/src/renderer/components/*` | 可选新增 | 第三阶段新增 | `WorkflowAssistantCard` | 低 |

第一阶段不做。

---

### 3.7 WritingPage 长短篇流程适配

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `desktop/src/renderer/pages/WritingPage.tsx` | 已有 | 第四阶段修改 | 根据 projectMode 展示短篇/长篇操作 | 高 |
| `server/src/chain/chain.controller.ts` | 已有 | 第四阶段修改 | 写作接口受 Workflow Guard 约束 | 高 |

第一阶段不做。

---

### 3.8 StatePage 状态确稿中心

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `desktop/src/renderer/pages/StatePage.tsx` | 已有 | 第五阶段修改 | 升级为状态确稿中心 | 中 |
| `server/src/state/*` | 已有 | 第五阶段优化 | 复用已有状态确认能力 | 中 |

第一阶段不做。

---

### 3.9 文档更新

| 文件 | 状态 | 操作 | 原因 | 风险 |
|---|---|---|---|---|
| `docs/小说Agent平台终版需求文档.md` | 应已新增 | 保留 | 主需求来源 | 低 |
| `README.md` | 已有 | 后续修改 | 简述新创建流程 | 低 |
| `server/docs/API.md` | 已有 | 第一阶段修改 | 补充项目字段 | 低 |

---

## 4. 六阶段实施计划

### 阶段 1：项目字段 + 创建入口 UI

目标：

1. 增加项目创建来源、当前工作流阶段、想法状态等字段。
2. 将项目创建 UI 改成三步式：
   - 从哪里开始？
   - 创作什么类型？
   - 目标平台？
3. 保证旧项目兼容。
4. 不动 Chain、不动状态页、不动 Workflow Guard。

后端改动：

- 新增数据库迁移。
- 修改 `CreateProjectDto`。
- 修改 `UpdateProjectDto`。
- 修改 `ProjectService`。
- 修改 `ProjectRepository`。
- 更新 `API.md`。

前端改动：

- 修改 `ProjectListPage.tsx` 的 `CreateDialog`。
- 修改 `projectStore.ts`。
- 修改 shared 类型。
- 项目卡片显示新标签。

测试方式：

- 创建空白短篇项目。
- 创建空白长篇项目。
- 从灵感创建短篇项目。
- 从想法创建长篇项目。
- 打开旧项目。
- 项目列表过滤正常。
- 前后端 build/typecheck 通过。

风险：

- shared 类型与前后端字段不同步。
- 数据库迁移对旧库执行失败。
- `type` 与 `projectMode` 双字段造成混乱。
- 现有 `script` 类型兼容问题。

---

### 阶段 2：Idea Lab 想法孵化

目标：

- 支持“从想法开始”。
- 用户输入一句话，AI 追问、补全、评分，确认后创建项目。

后端改动：

- 新增 idea 模块或先复用 chain controller。
- 增加 idea questions/refine/confirm/convert-to-project 接口。

前端改动：

- 新增 Idea Lab 页面或 Discovery 页内 Tab。
- 支持输入想法、回答问题、查看成熟度评分、确认创建项目。

数据兼容：

- 使用第一阶段已有的 `idea_status`、`idea_seed`、`confirmed_idea` 字段。
- 可以先不建单独 `idea_drafts` 表，后续再扩展。

风险：

- AI 输出结构不稳定。
- 界面容易变成聊天窗口，需要保持结构化表单。

---

### 阶段 3：Workflow Guard 流程守卫

目标：

- 返回当前项目阶段、下一步建议、缺失资产、允许操作、阻塞操作。
- ProjectDashboard 显示创作流程助手。

后端改动：

- 新增 `workflow-guard.service.ts`。
- 新增 `/projects/:id/workflow/status`。

前端改动：

- ProjectDashboard 增加流程助手卡片。
- 显示当前阶段、缺失资产、下一步、待确稿数量、风险提示。

风险：

- 守卫逻辑如果过严，会阻塞用户。
- 守卫逻辑如果过松，不能防止跑偏。

---

### 阶段 4：长短篇流程硬约束

目标：

- 短篇严格：题材 → 大纲 → 正文。
- 长篇严格：设定 → 世界观 → 人物 → 总纲 → 分卷 → 章节 → 正文。
- 写作页根据项目类型展示不同操作。

后端改动：

- 写作接口接入 Workflow Guard。
- Chain 调用前检查当前阶段。
- 短篇和长篇接口逐步分离。

前端改动：

- WritingPage 根据 `projectMode` 展示短篇/长篇操作。
- 不满足阶段时显示“缺什么”。

风险：

- 可能影响当前一键生成正文。
- 需要保留手动绕过能力或高级模式。

---

### 阶段 5：状态确稿中心

目标：

- 状态页改成状态确稿中心。
- 正文生成后自动提取状态。
- 用户确认后才写入正式事实。
- 下一章只读取 confirmed 状态。

后端改动：

- 复用现有 state confirmations。
- 补足世界观、组织、地图、时间线状态确稿能力。

前端改动：

- StatePage 重构为：
  - 待确认
  - 已确认
  - 已驳回
  - 角色状态
  - 世界观状态
  - 伏笔状态
  - 时间线状态
  - 组织地图状态
  - 字段锁定

风险：

- 状态抽取误判。
- 用户确认负担过重。
- 长篇状态数据量过大。

---

### 阶段 6：平台质检、周复盘、导出优化

目标：

- 平台终稿质检。
- 长篇周复盘。
- 多平台导出优化。

后端改动：

- 增加平台质检模板。
- 增加周复盘接口。
- 导出接口支持平台格式。

前端改动：

- 精修页增加平台终稿质检。
- 长篇 Dashboard 增加周复盘。
- 导出页增加平台格式配置。

风险：

- 平台规则需要长期维护。
- 过度自动化可能影响作者控制感。

---

## 5. 第一阶段详细改造方案

### 5.1 第一阶段范围

第一阶段只允许完成：

1. 增加项目字段。
2. 修改项目创建 UI。
3. 调整项目创建 API。
4. 旧项目兼容。
5. 项目列表显示作品类型、创建来源、当前阶段、目标平台。

第一阶段不允许做：

- Idea Lab。
- Workflow Guard。
- 状态确稿中心。
- 长篇周复盘。
- 多平台导出优化。
- 大规模修改写作页。
- 大规模修改 Chain。

---

### 5.2 字段设计建议

考虑当前已有字段，为降低风险，建议第一阶段采用“复用 + 别名”策略。

#### 真实数据库字段

新增真实字段：

```text
creation_source TEXT DEFAULT 'blank'
current_workflow_stage TEXT DEFAULT 'idea'
idea_status TEXT DEFAULT 'none'
idea_seed TEXT DEFAULT NULL
confirmed_idea TEXT DEFAULT NULL
```

继续复用已有字段：

```text
type               作为作品类型，等价 project_mode
platform_style     作为目标平台，等价 target_platform
target_words       作为目标字数，等价 target_word_count
```

#### API 响应字段

`ProjectResponse` 输出：

```ts
{
  id: string;
  type: string;
  projectMode: string;

  title: string;
  status: string;

  targetWords: number;
  targetWordCount: number;

  platformStyle: string;
  targetPlatform: string;

  creationSource: string;
  currentWorkflowStage: string;
  ideaStatus: string;
  ideaSeed?: string;
  confirmedIdea?: string;

  currentWords: number;
  description?: string;
  writingStyle?: any;
  settings: any;
  createdAt: string;
  updatedAt: string;
}
```

这样前端可以逐步迁移，不会一次性破坏旧逻辑。

---

### 5.3 数据库迁移方案

新增迁移文件：

```text
server/src/database/migrations/0XX_add_project_creation_fields.ts
```

迁移逻辑：

```ts
export function up(db) {
  safeAddColumn(db, 'projects', 'creation_source', "TEXT DEFAULT 'blank'");
  safeAddColumn(db, 'projects', 'current_workflow_stage', "TEXT DEFAULT 'idea'");
  safeAddColumn(db, 'projects', 'idea_status', "TEXT DEFAULT 'none'");
  safeAddColumn(db, 'projects', 'idea_seed', 'TEXT DEFAULT NULL');
  safeAddColumn(db, 'projects', 'confirmed_idea', 'TEXT DEFAULT NULL');
}
```

注意事项：

1. `ALTER TABLE ADD COLUMN` 如果重复执行会报错，需要先检查列是否存在。
2. 可以通过 `PRAGMA table_info(projects)` 判断列是否存在。
3. `down` 可以保守处理，不强删列，避免 SQLite 重建表带来风险。

---

### 5.4 后端 DTO 修改方案

`CreateProjectDto` 新增：

```ts
@IsOptional()
@IsIn(['inspiration', 'idea', 'import', 'blank'])
creationSource?: string = 'blank';

@IsOptional()
@IsString()
currentWorkflowStage?: string = 'idea';

@IsOptional()
@IsIn(['none', 'draft', 'refining', 'confirmed', 'converted'])
ideaStatus?: string = 'none';

@IsOptional()
@IsString()
ideaSeed?: string;

@IsOptional()
@IsString()
confirmedIdea?: string;

@IsOptional()
@IsIn(['short_story', 'long_novel'])
projectMode?: string;

@IsOptional()
@IsString()
targetPlatform?: string;

@IsOptional()
@IsNumber()
targetWordCount?: number;
```

兼容策略：

- 如果传 `projectMode`，优先写入 `type`。
- 如果传 `targetPlatform`，优先写入 `platformStyle/platform_style`。
- 如果传 `targetWordCount`，优先写入 `targetWords/target_words`。

---

### 5.5 ProjectService 修改方案

`create()` 中：

```ts
const projectType = dto.projectMode || dto.type || 'long_novel';
const platform = dto.targetPlatform || dto.platformStyle || 'generic';
const targetWords = dto.targetWordCount ?? dto.targetWords ?? 0;
```

写入 repo 时增加：

```ts
creation_source: dto.creationSource || 'blank',
current_workflow_stage: dto.currentWorkflowStage || this.getDefaultStage(projectType, dto.creationSource),
idea_status: dto.ideaStatus || 'none',
idea_seed: dto.ideaSeed || null,
confirmed_idea: dto.confirmedIdea || null,
```

默认阶段建议：

| projectType | creationSource | 默认阶段 |
|---|---|---|
| short_story | inspiration | topic |
| short_story | idea | topic |
| short_story | import | outline |
| short_story | blank | topic |
| long_novel | inspiration | foundation |
| long_novel | idea | idea_refining 或 foundation |
| long_novel | import | global_outline |
| long_novel | blank | foundation |

第一阶段可简化：

```text
short_story → topic
long_novel → foundation
```

---

### 5.6 ProjectRepository 修改方案

扩展 `ProjectRow`：

```ts
creation_source: string | null;
current_workflow_stage: string | null;
idea_status: string | null;
idea_seed: string | null;
confirmed_idea: string | null;
```

如果使用 `BaseRepository.insert`，确保新增字段在 insert data 中可以被正常写入。

---

### 5.7 前端 shared 类型修改方案

需要搜索 `@novel/shared` 的 Project 类型定义。

建议新增类型：

```ts
export type CreationSource = 'inspiration' | 'idea' | 'import' | 'blank';
export type TargetPlatform = 'zhihu' | 'fanqie' | 'qidian' | 'douyin' | 'xiaohongshu' | 'custom' | 'generic';
export type IdeaStatus = 'none' | 'draft' | 'refining' | 'confirmed' | 'converted';
```

`Project` 增加：

```ts
projectMode?: ProjectType;
creationSource?: CreationSource;
targetPlatform?: TargetPlatform;
targetWordCount?: number;
currentWorkflowStage?: string;
ideaStatus?: IdeaStatus;
ideaSeed?: string;
confirmedIdea?: string;
platformStyle?: string;
targetWords?: number;
```

为了兼容，保留旧字段：

```ts
type
platforms
wordCount
```

---

### 5.8 前端 ProjectStore 修改方案

`ProjectCreateData` 修改为：

```ts
interface ProjectCreateData {
  title: string;
  type: Project['type'];
  projectMode?: Project['type'];
  creationSource: 'inspiration' | 'idea' | 'import' | 'blank';
  platformStyle?: string;
  targetPlatform?: string;
  targetWords?: number;
  targetWordCount?: number;
  currentWorkflowStage?: string;
  ideaStatus?: string;
  ideaSeed?: string;
  confirmedIdea?: string;
}
```

`createProject` 发送：

```ts
{
  title,
  type: data.projectMode || data.type,
  projectMode: data.projectMode || data.type,
  creationSource: data.creationSource,
  platformStyle: data.targetPlatform || data.platformStyle || 'generic',
  targetPlatform: data.targetPlatform || data.platformStyle || 'generic',
  targetWords: data.targetWordCount ?? data.targetWords ?? 0,
  targetWordCount: data.targetWordCount ?? data.targetWords ?? 0,
  currentWorkflowStage: data.currentWorkflowStage,
  ideaStatus: data.ideaStatus || 'none',
  ideaSeed: data.ideaSeed,
  confirmedIdea: data.confirmedIdea,
}
```

`mapServerProject` 增加默认值：

```ts
projectMode: raw.projectMode || raw.type || ProjectType.LONG_NOVEL,
creationSource: raw.creationSource || 'blank',
targetPlatform: raw.targetPlatform || raw.platformStyle || 'generic',
targetWordCount: raw.targetWordCount ?? raw.targetWords ?? raw.target_words ?? 0,
currentWorkflowStage: raw.currentWorkflowStage || 'idea',
ideaStatus: raw.ideaStatus || 'none',
ideaSeed: raw.ideaSeed || '',
confirmedIdea: raw.confirmedIdea || '',
```

---

### 5.9 前端 CreateDialog 修改方案

当前 `CreateDialog` 是单页表单。建议第一阶段改为三步式，但不要过度复杂。

状态：

```ts
const [step, setStep] = useState<1 | 2 | 3>(1);
const [creationSource, setCreationSource] = useState<CreationSource>('blank');
const [projectMode, setProjectMode] = useState<ProjectType>('long_novel');
const [targetPlatform, setTargetPlatform] = useState('generic');
const [title, setTitle] = useState('');
const [targetWordCount, setTargetWordCount] = useState<number>(0);
```

步骤 1：你想从哪里开始？

卡片：

```text
从灵感开始
从想法开始
导入已有资料
空白创建
```

步骤 2：你要创作什么类型？

卡片：

```text
短篇
长篇
```

步骤 3：基础信息

字段：

```text
标题
目标平台
目标字数
```

按钮：

```text
上一步
创建作品
```

注意：

- 第一阶段从想法开始不跳 Idea Lab，只记录 `creationSource='idea'`。
- 第二阶段再点击“从想法开始”进入 Idea Lab。
- 第一阶段从导入已有资料也可以先创建空项目或提示后续实现；更稳的是允许创建但 `creationSource='import'`。
- 不要在 UI 上显示“Agent”。

---

### 5.10 项目卡片展示方案

在 `ProjectCard` 中新增标签：

```text
作品类型：短篇 / 长篇
来源：灵感 / 想法 / 导入 / 空白
阶段：题材 / 基础设定 / 世界观 / 写作中
平台：知乎 / 番茄 / 起点 / 抖音故事
```

最小实现：

```text
[长篇] [想法] [基础设定] [番茄]
```

不要卡片过度拥挤。可以只显示：

- 类型 badge
- 来源 tag
- 阶段 tag
- 平台小字

---

### 5.11 旧项目兼容方案

旧项目没有新增字段时：

```text
creationSource = 'blank'
currentWorkflowStage = 根据 type 推断：
  short_story → topic
  long_novel → foundation
  script → idea
ideaStatus = 'none'
ideaSeed = ''
confirmedIdea = ''
targetPlatform = platformStyle || 'generic'
targetWordCount = targetWords || 0
projectMode = type || 'long_novel'
```

禁止因为缺字段导致页面报错。

---

### 5.12 第一阶段测试清单

后端：

```bash
cd server
npm run typecheck
npm run build
npm test
```

前端：

```bash
cd desktop
npm run typecheck
npm run build
npm test
```

手动测试：

1. 旧项目列表能正常打开。
2. 新建短篇 + 从灵感开始。
3. 新建长篇 + 从想法开始。
4. 新建长篇 + 空白创建。
5. 新建短篇 + 导入已有资料。
6. 项目卡片显示新增信息。
7. 项目详情能打开。
8. 写作页能进入。
9. 控制台无明显报错。
10. 数据库迁移重复启动不报错。

---

## 6. 第一阶段完成后的输出要求

代码 AI 执行第一阶段后，必须输出：

1. 修改了哪些文件。
2. 新增了哪些数据库字段。
3. 旧项目如何兼容。
4. 新项目创建流程如何使用。
5. 是否保留了现有 Tab 页面。
6. 是否没有实现阶段外功能。
7. typecheck/build 结果。
8. 未解决问题。
9. 下一阶段建议。

---

## 7. 下一步给代码 AI 的执行提示词

在确认本分析文档后，再给代码 AI 发送：

```text
确认按《小说 Agent 平台第 2 步代码分析与第一阶段实施方案》执行。

现在只执行第一阶段：项目字段 + 创建入口 UI。

限制：

1. 不要完全重构。
2. 不要删除现有 Tab 页面。
3. 不要实现 Idea Lab。
4. 不要实现 Workflow Guard。
5. 不要改写 Chain。
6. 不要改状态确稿中心。
7. 不要破坏旧项目。

本阶段只完成：

1. 数据库新增：
   - creation_source
   - current_workflow_stage
   - idea_status
   - idea_seed
   - confirmed_idea

2. API 响应兼容输出：
   - projectMode
   - creationSource
   - targetPlatform
   - targetWordCount
   - currentWorkflowStage
   - ideaStatus
   - ideaSeed
   - confirmedIdea

3. 前端创建入口改成三步：
   - 从哪里开始
   - 创作什么类型
   - 目标平台和基础信息

4. 项目列表卡片展示：
   - 作品类型
   - 创建来源
   - 当前阶段
   - 目标平台

5. 旧项目兼容。

完成后运行前后端 typecheck/build，并输出修改总结。
```
