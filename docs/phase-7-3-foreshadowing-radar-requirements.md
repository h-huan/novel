# Phase 7.3 伏笔雷达与伏笔生命周期验收记录

## 1. 阶段目标

Phase 7.3 在小说连续性驾驶舱中接入伏笔雷达与伏笔生命周期，让作者围绕当前创作章节看到应埋设、加深、误导、回收、延期、检查或避免矛盾的真实伏笔任务。

本阶段只实现伏笔雷达，不进入 Phase 7.4 的世界观规则系统、时间线三线模型，也不进入 Phase 7.5 的写作前检查和写作后更新闭环。

## 2. 数据模型

新增迁移：

- `server/src/database/migrations/021_phase_7_3_foreshadowing_radar.ts`

新增表：

- `foreshadowing_threads`
- `foreshadowing_lifecycle_events`
- `foreshadowing_chapter_tasks`

兼容策略：

- 旧 `foreshadowings` 表继续只读展示。
- 不静默迁移旧数据。
- legacy 数据在驾驶舱中标记为 read-only。
- 新增手动或 AI 建议内容默认 `pending + unlocked`。
- locked 记录不允许被 `source=ai` 静默覆盖。

## 3. API

在现有 `continuity` 模块内扩展，不创建重复模块：

- `GET /projects/:projectId/continuity/foreshadowings?focusChapterId=xxx`
- `POST /projects/:projectId/continuity/foreshadowings`
- `PATCH /projects/:projectId/continuity/foreshadowings/:threadId`
- `POST /projects/:projectId/continuity/foreshadowings/:threadId/events`
- `POST /projects/:projectId/continuity/foreshadowing-tasks`
- `PATCH /projects/:projectId/continuity/foreshadowing-tasks/:taskId`

返回结构包含：

- `summary`
- `groups.focusTasks`
- `groups.recoveryDue`
- `groups.overdue`
- `groups.highRisk`
- `groups.pendingReview`
- `groups.fullBookThreads`
- `groups.volumeThreads`
- `groups.chapterThreads`
- `groups.recovered`
- `groups.allThreads`

## 4. 前端实现

升级文件：

- `desktop/src/renderer/pages/ContinuityCockpitPage.tsx`

实现内容：

- 伏笔 Tab 从空态入口升级为伏笔雷达。
- 当前章节焦点 Tab 使用真实 `focusTasks` 展示伏笔注意事项。
- 写作前提示词使用真实当前章伏笔任务。
- 总览 Tab 增加本章伏笔任务、临近回收、逾期伏笔、高风险伏笔统计。
- 伏笔 Tab 支持新增/编辑伏笔线程。
- 伏笔 Tab 支持新增生命周期事件。
- 伏笔 Tab 支持新增章节伏笔任务。
- 伏笔任务支持状态更新、审核状态更新、确认后锁定。
- legacy 伏笔只读展示，不提供编辑入口。

## 5. 当前边界

已实现：

- 伏笔线程数据结构。
- 生命周期事件数据结构。
- 当前章伏笔任务数据结构。
- 当前章焦点联动。
- 总览联动。
- pending/confirmed/ignored/conflict 审核状态。
- confirmed 后允许 locked。
- `source=ai` 不能覆盖 locked 伏笔线程或任务。

未实现，保留到后续阶段：

- 复杂图谱可视化。
- AI 自动从正文抽取伏笔链。
- 世界观规则系统联动。
- 时间线三线模型联动。
- 写作前强制检查。
- 写作后自动更新闭环。

## 6. 验收清单

1. `/project/:id/continuity` 可加载。
2. 伏笔 Tab 不再是 Phase 7.3 空态。
3. 伏笔 Tab 展示 summary 统计。
4. 伏笔 Tab 展示当前章节任务。
5. 伏笔 Tab 展示临近回收、逾期、高风险、待确认分组。
6. 可新增伏笔线程，新增后为 `pending + unlocked`。
7. 可编辑伏笔线程。
8. 只有 confirmed 伏笔线程可锁定。
9. 可新增生命周期事件，新增后为 pending。
10. 可新增章节伏笔任务，新增后为 `todo + pending + unlocked`。
11. 可更新章节伏笔任务状态。
12. 当前章节焦点 Tab 使用真实 `focusTasks`。
13. 写作前提示词使用真实 `focusTasks`。
14. 总览 Tab 展示伏笔雷达统计。
15. legacy `foreshadowings` 只读兼容，不伪装为新生命周期数据。
16. Phase 7.4/7.5 仍保持未实现入口。

## 7. 构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。
