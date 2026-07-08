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

## 8. Phase 7.3 修正记录

### 8.1 Phase 7 状态展示修正

- Phase 7 展示中 7.3 从"待开发"修正为"本轮实现"。
- 页面说明从"7.3-7.5 只展示入口，不假装完成"修正为"7.4-7.5 只展示入口，不假装完成"，并加入"伏笔雷达"描述。
- loading 文案从"正在刷新 Phase 7.2 人物连续性数据"统一为"正在刷新 Phase 7 连续性数据"。

### 8.2 当前章伏笔识别规则补全

新增 `buildDerivedForeshadowingTasks` 私有方法，根据真实数据推导当前章相关伏笔任务：

1. `planned_bury_chapter_id` 命中当前章 → taskType bury。
2. `actual_bury_chapter_id` 命中当前章 → taskType check。
3. lifecycle event chapter 命中当前章 → 根据 event_type 映射为 bury/deepen/misdirect/recover/check/avoid_contradiction。
4. `actual_recovery_chapter_id` 命中当前章 → taskType recover。
5. 当前章处于 recovery window → taskType recover。
6. `related_character_ids` 与当前章人物相交 → taskType check。
7. `related_relationship_ids` 与当前章关系相交 → taskType check。

要求：
- 不会将 derived task 写入数据库。
- derived task 的 id 前缀为 `radar-`。
- derived task 标记 `derived: true` 和 `source: 'radar_derived'`。
- 去重：persisted task 优先于 derived task。
- legacy 当前章命中仍可进入 focusTasks。

### 8.3 focusTasks + derived tasks 合并

`getForeshadowings` 返回的 `groups.focusTasks` 包含：
- `foreshadowing_chapter_tasks` 中 `chapter_id == focusChapter.id` 的任务。
- legacy 当前章命中任务。
- 雷达推导任务（不重复、不覆盖 persisted task）。

### 8.4 focusThreads 分组

新增 `groups.focusThreads`，包含：
- 有 persisted focus task 的 thread。
- 有 derived focus task 的 thread。
- 生命周期事件命中当前章的 thread。
- planned/actual bury/recover 命中当前章的 thread。
- recovery window 覆盖当前章的 thread。
- relatedCharacterIds / relatedRelationshipIds 命中当前章的 thread。

### 8.5 逾期判断修正

`isOverdue` 改为按章节顺序判断：
1. `thread.status === 'overdue'` → true。
2. legacy：`plannedRecoveryChapterIndex < currentChapterIndex` 且未 recovered → true。
3. 新表：必须有 `recoveryWindowEndChapterId`、无 `actualRecoveryChapterId`、当前章顺序 > 窗口结束顺序、status !== recovered → true。
4. 缺少章节顺序时返回 false，不误判。

不再使用 `thread.recoveryWindowEndChapterId !== focusChapter.id` 判断逾期。

### 8.6 recoveryDue 判断修正

`isRecoveryDue` 改为：
1. recovered → false。
2. status = recovery_due → true。
3. 当前章在 recovery window 内 → true。
4. 当前章距离 window start 或 end 不超过 2 章 → true。
5. legacy plannedRecoveryChapterIndex 与当前章距离 <= 2 且未 recovered → true。

### 8.7 伏笔 Tab 文案中文化

`renderForeshadowingTab`、`ForeshadowingThreadCard`、`ForeshadowingTaskCard` 中所有英文 UI 文案改为中文创作视角：

- Threads → 总伏笔数
- Focus tasks → 本章伏笔任务
- Recovery due → 即将回收
- Overdue → 逾期风险
- High risk → 高风险伏笔
- Pending review → 待确认伏笔
- Current Chapter Foreshadowing Tasks → 当前章伏笔雷达
- Radar Alerts → 伏笔风险提醒
- Foreshadowing Lifecycle → 伏笔生命周期
- Manual Edit Area → 人工微调区
- Full Book Threads → 全书伏笔
- Volume Threads → 卷内伏笔
- Chapter Threads → 章节伏笔
- Recovered Threads → 已回收伏笔
- Legacy Foreshadowings (Read Only) → 旧版伏笔，只读兼容
- 以及所有表单标签、按钮、提示文案。

### 8.8 伏笔 Tab 顶部摘要补齐

伏笔 Tab 顶部展示 10 项统计：
1. 总伏笔数（totalThreads）
2. 本章伏笔任务（focusTasks）
3. 全书伏笔（fullBookThreads）
4. 卷内伏笔（volumeThreads）
5. 章节伏笔（chapterThreads）
6. 待确认伏笔（pendingReviewCount）
7. 即将回收（recoveryDueCount）
8. 逾期风险（overdueCount）
9. 高风险伏笔（highRiskCount）
10. locked 伏笔（lockedCount）

### 8.9 结构化分组补齐

伏笔 Tab 结构化详情区包含 11 个分组：

1. 本章必须处理（focusTasks / focusThreads）
2. 即将回收（recoveryDue）
3. 逾期风险（overdue）
4. 高风险伏笔（highRisk）
5. 待确认伏笔（pendingReview）
6. 全书伏笔（fullBookThreads）
7. 卷内伏笔（volumeThreads）
8. 章节伏笔（chapterThreads）
9. 已回收伏笔（recovered）
10. 全部伏笔（allThreads 剔除 legacy）
11. 旧版伏笔，只读兼容（legacyThreads）

### 8.10 当前章焦点 Tab 联动

- 无伏笔任务时显示中文空态："暂无本章伏笔任务，Phase 7.3 可通过伏笔 Tab 手动补全。"
- 有 focusTasks 时按 taskType 分组显示中文类型：本章要埋设 / 本章要加深 / 本章要误导 / 本章要回收 / 本章要检查 / 本章避免矛盾 / 本章可延期。

### 8.11 写作前提示词联动

`buildPreWritingPrompt` 中伏笔注意事项段落使用中文任务类型（通过 `TASK_TYPE_LABELS` 映射）。

## 9. Phase 7.3 修正构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。
