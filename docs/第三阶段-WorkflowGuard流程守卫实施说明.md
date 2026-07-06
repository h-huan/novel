# 第三阶段：Workflow Guard 流程守卫实施说明

> 版本：V1.0 | 日期：2026-07-06

---

## 一、第三阶段目标

新增 Workflow Guard（流程守卫），根据项目类型、当前阶段、已有资产判断用户下一步应该做什么，防止 AI 和用户越级创作，给前端 ProjectDashboard 增加「创作流程助手」面板。

本阶段是 **提示 + 判断 + 轻量阻断** 阶段，不做全局强制拦截。

---

## 二、Workflow Guard 的职责

1. **getGuard(projectId)** — 返回完整流程状态（当前阶段、建议、缺失、允许操作、不建议操作）
2. **checkAction(projectId, action)** — 检查某个操作是否允许
3. **advanceStage(projectId, targetStage, force?)** — 推进项目阶段
4. **collectProjectAssets(projectId)** — 收集项目资产（世界观、角色、大纲、章节等数量）
5. **inferCurrentStage(project, assets)** — 根据资产推断当前阶段

---

## 三、短篇流程规则

阶段枚举：`topic` → `outline` → `writing`

| 阶段 | 进入条件 | 允许操作 | 不建议操作 | 缺失资产 |
|------|---------|---------|-----------|---------|
| topic | 项目刚创建或有想法但无大纲 | 完善题材、生成题材建议、进入大纲 | 直接生成正文 | 大纲缺失、确认想法缺失 |
| outline | 已有题材/大纲初稿但无正文 | 编辑大纲、生成大纲、进入正文 | 跳过大纲生成正文 | 大纲缺失 |
| writing | 已有大纲 | 生成正文、续写、精修、质检 | 重新覆盖设定 | 正文缺失（推荐） |

---

## 四、长篇流程规则

阶段枚举：`idea_or_inspiration` → `world_setting` → `character` → `outline` → `volume` → `chapter` → `writing` → `state_archive` → `weekly_review`

| 阶段 | 允许操作 | 不建议操作 | 关键缺失 |
|------|---------|-----------|---------|
| idea_or_inspiration | 完善想法、进入世界观、进入角色 | 生成正文、生成章节规划 | 世界观、主角、总纲 |
| world_setting | 编辑世界观、进入角色、进入总纲 | 生成正文 | 世界观、主角 |
| character | 编辑角色、完善世界观、进入总纲 | 生成大纲（主角缺失时） | 主角、反派 |
| outline | 编辑总纲、生成总纲、进入分卷 | 直接生成章节 | 总纲 |
| volume | 编辑分卷、生成分卷、进入章节 | 直接大量生成章节 | 分卷 |
| chapter | 编辑章节规划、生成规划、进入写作 | 直接日更正文 | 章节规划 |
| writing | 写正文、续写、精修、查看状态 | 跳过状态归档 | 正文 |
| state_archive | 查看状态、返回写作 | 长期跳过归档 | — |
| weekly_review | 返回写作 | 持续日更不复盘 | — |

---

## 五、API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/projects/:projectId/workflow-guard` | 获取项目完整流程守卫状态 |
| `POST` | `/api/v1/projects/:projectId/workflow-guard/check` | 检查某个操作是否允许 |
| `POST` | `/api/v1/projects/:projectId/workflow-guard/advance` | 推进流程阶段 |

---

## 六、资产判断逻辑

Workflow Guard 通过调用各 Service 的 `findByProjectId` 获取真实数据：

| 资产 | 数据来源 | 判断方式 |
|------|---------|---------|
| 想法 | project.idea_seed / project.confirmed_idea | 字符串非空 |
| 世界观 | WorldSettingService.findByProjectId | count > 0 |
| 主角 | CharacterService.findByProjectId | isPovCharacter 或 role === 'protagonist' |
| 反派 | CharacterService.findByProjectId | role === 'villain' 或 'antagonist' |
| 总纲 | OutlineService.findByProjectId | level === 'book' |
| 分卷 | OutlineService.findByProjectId | level === 'volume' |
| 章节规划 | OutlineService.findByProjectId | level === 'chapter' |
| 正文 | ChapterService.findByProjectId | 有 content 或 wordCount |

每个资产查询独立 try/catch，单类失败不影响整体。

---

## 七、前端 UI

### 创作流程助手

在 ProjectDashboard 页面底部新增「创作流程助手」面板，显示：

1. **当前阶段** — 红色 badge 显示当前阶段名称
2. **下一步建议** — 文字建议
3. **流程进度** — 阶段节点地图（done / current / next / locked）
4. **已完成** — 已完成资产标签
5. **待完善** — 缺失资产列表（严重/推荐）
6. **允许操作** — 可点击按钮，跳转到对应页面
7. **暂不建议操作** — 显示原因
8. **刷新按钮** — 重新请求流程状态

### 路由映射

| 操作 | 跳转路由 |
|------|---------|
| 进入世界观 / 编辑世界观 | /project/:id/world |
| 进入角色 / 编辑角色 | /project/:id/characters |
| 进入大纲 / 编辑大纲 | /project/:id/outline |
| 进入正文 / 生成正文 | /project/:id/writing |
| 精修正文 | /project/:id/refinement |
| 查看状态 | /project/:id/state |

### 轻量阻断

- blockedActions 在面板中展示，不强制拦截所有按钮
- 用户仍可通过侧栏或直接 URL 访问各页面
- 深度流程硬约束留到第四阶段

---

## 八、项目结构

### 后端新增

| 文件 | 说明 |
|------|------|
| `server/src/modules/workflow-guard/types.ts` | 类型定义 |
| `server/src/modules/workflow-guard/workflow-rules.ts` | 短篇/长篇流程规则 |
| `server/src/modules/workflow-guard/workflow-guard.service.ts` | 流程守卫核心服务 |
| `server/src/modules/workflow-guard/workflow-guard.controller.ts` | REST API |
| `server/src/modules/workflow-guard/workflow-guard.module.ts` | NestJS 模块 |

### 前端新增

| 文件 | 说明 |
|------|------|
| `desktop/src/renderer/stores/workflowGuardStore.ts` | 流程守卫状态管理 |
| `desktop/src/renderer/components/workflow/WorkflowAssistantPanel.tsx` | 创作流程助手面板 |

### 前端修改

| 文件 | 说明 |
|------|------|
| `desktop/src/renderer/pages/ProjectDashboard.tsx` | 集成 WorkflowAssistantPanel |

---

## 九、本阶段未做内容

| 功能 | 说明 |
|------|------|
| 第四阶段长短篇深度流程硬约束 | 未对页面做全局强制拦截 |
| 状态确稿中心 | 不在本阶段范围 |
| WritingPage 主流程改造 | 未修改正文生成 |
| RAG 改造 | 不在本阶段范围 |
| Chain 重构 | 不在本阶段范围 |
| 用户系统 / 权限系统 | 不在本阶段范围 |
| 消息队列 | 不在本阶段范围 |

---

## 十、下一阶段建议

下一阶段进入 **阶段 4：长短篇流程硬约束**：

1. 在 WritingPage 和 Chain 调用前接入 Workflow Guard checkAction。
2. 短篇严格执行：没有题材不能生成大纲，没有大纲不能生成正文。
3. 长篇严格执行：没有设定不能生成世界观，没有世界观不能生成角色...
4. 对越级操作进行 UI 级和 API 级拦截。
5. 在 ProjectDashboard 快捷操作中显示被禁用的入口并给出原因。
