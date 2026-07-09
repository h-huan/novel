# Phase 7.4 世界观规则与时间线三线模型验收记录

## 1. 阶段目标

Phase 7.4 在小说连续性驾驶舱中接入世界观规则系统与时间线三线模型，让作者围绕当前创作章节看到应遵守的世界观规则、应检查的时间线事件、应避免的规则冲突和时间顺序矛盾。

本阶段只实现世界观规则与时间线三线模型，不进入 Phase 7.5 的写作前检查和写作后更新闭环。

## 2. 与 Phase 7.3 的边界

- Phase 7.3 完成伏笔雷达与伏笔生命周期。
- Phase 7.4 不修改 foreshadowing_threads、foreshadowing_lifecycle_events、foreshadowing_chapter_tasks。
- Phase 7.4 不破坏 Phase 7.3 的 derived task 只读规则。
- 世界观规则和时间线可以关联伏笔数据，但不能修改伏笔数据。

## 3. 与 Phase 7.5 的边界

- Phase 7.5 将接入写作前检查和写作后更新闭环。
- Phase 7.4 不实现检查闭环。
- Phase 7.5 空态入口保持不变。

## 4. 为什么世界观 Tab 不能做成后台规则表

世界观 Tab 是创作连续性控制台的一部分，不是后台管理页面。核心要求：
- 所有内容围绕 currentFocusChapter。
- 默认展示当前章最需要检查的规则。
- 不是展示全部字段的大表。
- 缺数据时显示真实空态，不编造。

## 5. 为什么时间线 Tab 不能做成普通列表

时间线 Tab 必须展示三线模型（客观故事时间线、叙事呈现顺序线、因果链/信息链），不是单纯的事件列表。核心要求：
- 三条线必须明确分组展示。
- 不允许混成一个普通列表。
- 当前章创作辅助区必须同时展示三条线的当前章注意事项。

## 6. currentFocusChapter 联动规则

### 世界观当前章识别规则

GET world-rules 围绕 currentFocusChapter 聚合，识别优先级：
1. world_rule_chapter_tasks.chapter_id = focusChapterId
2. world_rule_events.chapter_id = focusChapterId
3. first_established_chapter_id = focusChapterId
4. last_verified_chapter_id = focusChapterId
5. scope = chapter 且关联当前章
6. scope = volume 且 volume_index = 当前卷
7. related_character_ids 与当前章人物相交
8. related_relationship_ids 与当前章关系相交
9. related_foreshadowing_ids 与当前章伏笔相交
10. related_timeline_event_ids 与当前章时间线事件相交

### 时间线当前章识别规则

GET timeline 围绕 currentFocusChapter 聚合，识别优先级：
1. timeline_chapter_tasks.chapter_id = focusChapterId
2. timeline_three_line_events.chapter_id = focusChapterId
3. narrative_order 对应当前章节顺序
4. story_time_order 与当前章相邻
5. causality_links 的 source 或 target 命中当前章事件
6. participants_character_ids 与当前章人物相交
7. related_relationship_ids 与当前章关系相交
8. related_foreshadowing_ids 与当前章伏笔相交
9. related_world_rule_ids 与当前章规则相交
10. legacy timeline 数据命中当前章

## 7. 世界观规则数据模型

表名：world_rules

核心字段：
- id, project_id, title, rule_type, scope, volume_index
- content, explanation, limitation, contradiction_risk
- status, risk_level
- first_established_chapter_id, last_verified_chapter_id
- related_character_ids, related_relationship_ids, related_foreshadowing_ids, related_timeline_event_ids
- review_status, locked, source, confidence
- created_at, updated_at

rule_type 支持多题材：geography, era, society, law, profession, organization, technology, power_system, resource, culture, economy, family, custom

scope：full_book, volume, chapter, location, organization, character, relationship

status：planned, established, active, changed, violated, conflict, deprecated

## 8. 世界观规则事件模型

表名：world_rule_events

字段：id, project_id, rule_id, chapter_id, event_type, summary, evidence, impact, before_state_json, after_state_json, review_status, source, confidence, created_at, updated_at

event_type：established, used, verified, changed, violated, revealed, conflict, deprecated, other

review_status 默认 pending。

## 9. 世界观当前章任务模型

表名：world_rule_chapter_tasks

字段：id, project_id, rule_id, chapter_id, task_type, priority, instruction, reason, status, review_status, source, locked, created_at, updated_at

task_type：apply, check, reveal, avoid_contradiction, update_rule, verify

新增时强制 pending + todo + unlocked。

## 10. 时间线三线模型定义

### 第一线：客观故事时间线

含义：事件在小说世界中真实发生的顺序。

字段重点：storyTimeText, storyTimeOrder, location, participantsCharacterIds

### 第二线：叙事呈现顺序线

含义：读者在章节中看到事件的顺序，可以倒叙、插叙、补叙。

字段重点：chapterId, volumeIndex, chapterIndex, narrativeOrder, readerKnownState

### 第三线：因果链 / 信息链

含义：事件之间的原因、结果、条件、动机、误导、信息差。

字段重点：timeline_causality_links, causalityOrder, characterKnownState, readerKnownState

## 11. 时间线事件数据模型

表名：timeline_three_line_events

字段：id, project_id, legacy_timeline_event_id, title, summary, line_type, chapter_id, volume_index, chapter_index, story_time_text, story_time_order, narrative_order, causality_order, location, participants_character_ids, related_relationship_ids, related_foreshadowing_ids, related_world_rule_ids, reader_known_state, character_known_state, status, risk_level, risk_reason, review_status, locked, source, confidence, created_at, updated_at

line_type：story_time, narrative_order, causality

## 12. 因果链路数据模型

表名：timeline_causality_links

字段：id, project_id, source_event_id, target_event_id, link_type, summary, evidence, risk_level, risk_reason, review_status, locked, source, confidence, created_at, updated_at

link_type：cause, effect, condition, motivation, information, misdirection, contradiction, parallel, other

## 13. 时间线当前章任务模型

表名：timeline_chapter_tasks

字段：id, project_id, event_id, chapter_id, task_type, priority, instruction, reason, status, review_status, source, locked, created_at, updated_at

task_type：place_event, check_order, check_causality, reveal_information, avoid_time_conflict, sync_lines

## 14. 世界观 Tab UI 设计

### 第一层：顶部全貌摘要区

展示总规则数、当前章相关规则、当前章规则任务、全书规则、卷内规则、章节规则、待确认规则、冲突规则、高风险规则、locked 规则。

### 第二层：当前章节创作辅助区

展示本章必须遵守的规则、本章规则冲突提醒。缺数据时显示"暂无本章世界观规则数据"。

### 第三层：结构化详情区

分组：本章必须处理、当前章相关规则、活跃规则、冲突规则、高风险规则、待确认规则、全书规则、卷内规则、章节规则、最近变化规则、全部规则。

### 第四层：人工微调区（前置）

通过 API 支持 CRUD 操作，当前版本已实现只读展示和审核状态管理。

## 15. 时间线 Tab UI 设计

### 第一层：顶部全貌摘要区

展示总事件数、当前章相关事件、当前章时间线任务、客观故事时间事件、叙事呈现事件、因果链事件、因果链路数、时间冲突数、因果缺口数、待确认事件、高风险事件、locked 事件。

### 第二层：当前章节创作辅助区

展示客观故事时间、叙事呈现顺序、时间顺序冲突、因果缺口。缺数据时显示"暂无本章时间线数据"。

### 第三层：结构化详情区

分组：本章必须处理、当前章相关事件、客观故事时间线（第一线）、叙事呈现顺序线（第二线）、因果链/信息链（第三线）、时间冲突、因果缺口、高风险事件、待确认事件、legacy 时间线只读兼容、全部事件。

## 16. API 设计

### 世界观规则 API

- GET /projects/:projectId/continuity/world-rules?focusChapterId=xxx
- POST /projects/:projectId/continuity/world-rules
- PATCH /projects/:projectId/continuity/world-rules/:ruleId
- POST /projects/:projectId/continuity/world-rules/:ruleId/events
- POST /projects/:projectId/continuity/world-rule-tasks
- PATCH /projects/:projectId/continuity/world-rule-tasks/:taskId

### 时间线 API

- GET /projects/:projectId/continuity/timeline?focusChapterId=xxx
- POST /projects/:projectId/continuity/timeline-events
- PATCH /projects/:projectId/continuity/timeline-events/:eventId
- POST /projects/:projectId/continuity/timeline-links
- PATCH /projects/:projectId/continuity/timeline-links/:linkId
- POST /projects/:projectId/continuity/timeline-tasks
- PATCH /projects/:projectId/continuity/timeline-tasks/:taskId

## 17. 待确认机制

- 新增规则/事件/任务都强制 pending。
- pending 状态不可 locked。
- 只有 confirmed 才允许 locked。
- 审核状态由作者手动确认。

## 18. locked 机制

- locked 规则不能被 source=ai 覆盖。
- locked 规则修改需要 forceUnlock=true。
- source=ai 不允许 forceUnlock。
- derived task 不显示 locked 操作。

## 19. derived task 只读机制

- derived world task 只读展示。
- derived timeline task 只读展示。
- 不显示任务状态修改按钮。
- 不显示审核按钮。
- 不显示锁定按钮。
- 不触发 PATCH。

## 20. legacy 兼容策略

- 旧 timeline_events 表继续只读展示。
- 不静默迁移旧数据。
- legacy 数据在驾驶舱中标记为 read-only。
- 不提供 legacy 数据编辑入口。
- legacy 数据不伪装为完整结构化数据。

## 21. 当前章焦点 Tab 联动

- 世界观注意事项优先使用 world-rules API 的 focusTasks / focusRules。
- 时间线注意事项优先使用 timeline API 的 focusTasks / focusEvents。
- 无世界观数据时显示"暂无本章世界观规则数据"。
- 无时间线数据时显示"暂无本章时间线数据"。
- 不能编造规则和时间线事件。

## 22. 总览 Tab 联动

- 增加世界观规则数、世界观任务数、世界观冲突数、高风险世界观数。
- 增加时间线事件数、时间线任务数、时间冲突数、因果缺口数。
- 待确认设定数量包含 pending 世界观规则、世界观事件、世界观任务。
- 待确认设定数量包含 pending 时间线事件、因果链路、时间线任务。

## 23. 验收标准

1. `/project/:id/continuity` 正常加载。
2. 世界观 Tab 不再只是空态。
3. 世界观 Tab 有顶部摘要、当前章创作辅助、结构化详情。
4. 时间线 Tab 不再只是空态。
5. 时间线 Tab 明确展示客观故事时间线、叙事呈现顺序线、因果链/信息链。
6. 当前章焦点 Tab 接入真实世界观规则和时间线注意事项。
7. 写作前提示词包含真实世界观规则和时间线注意事项。
8. 总览 Tab 统计世界观规则风险和时间线风险。
9. legacy timeline 数据只读兼容。
10. Phase 7.5 仍是空态入口。
11. 构建通过。

## 24. 遗留项

- 因果链路的可视化展示未实现。
- 自动从正文抽取世界观规则未实现。
- 自动从正文抽取时间线事件未实现。
- AI 建议世界观规则未实现。
- AI 建议时间线事件未实现。
- 世界观规则与时间线的复杂冲突检测未实现。

## 25. 构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。

## 26. Phase 7.4 修正记录

### 26.1 Phase 7 状态展示修正

- Phase 7 展示中 7.4 从"待开发"修正为"本轮实现"。

### 26.2 当前章焦点 Tab 联动修正

- 当前章焦点 Tab 已传入 `focusWorldTasks`、`focusWorldRules`、`focusTimelineTasks`、`focusTimelineEvents`。
- 新增 `groupWorldTaskNotes` 和 `groupTimelineTaskNotes` 辅助函数。
- 世界观注意事项按 taskType 分组：本章必须遵守、本章需要检查、本章可能暴露、本章避免矛盾、本章规则需更新、本章需要验证。
- 时间线注意事项按 taskType 分组：当前章客观时间位置、叙事顺序检查、因果链检查、信息差/信息揭示、避免时间冲突、同步三线模型。
- 无数据时显示"暂无本章世界观规则数据 / 暂无本章时间线数据"。

### 26.3 写作前提示词联动修正

- 世界观注意事项使用真实 world-rules API 数据（有 focusWorldTasks 时优先使用 `groupWorldTaskNotes`）。
- 时间线注意事项使用真实 timeline API 数据（有 focusTimelineTasks 时优先使用 `groupTimelineTaskNotes`）。
- useMemo dependency array 已包含 Phase 7.4 数据依赖。

### 26.4 总览 Tab 统计修正

- 新增 10 项 Phase 7.4 统计卡片：当前章世界观规则、当前章世界观任务、世界观冲突、高风险世界观、当前章时间线事件、当前章时间线任务、时间冲突、因果缺口。
- 下一个创作动作新增世界观提醒和时间线提醒。

### 26.5 pendingConfirmations 修正

- pendingConfirmations 已包含 `continuityWorldRules.summary.pendingReviewCount`。
- pendingConfirmations 已包含 `continuityTimeline.summary.pendingReviewCount`。
- 后端 pendingReviewCount 已包含规则/事件/任务的 pending 数据。

### 26.6 世界观 Tab 人工微调区实现

- 新增 `saveWorldRule`、`patchWorldRule`、`saveWorldRuleEvent`、`saveWorldRuleTask`、`patchWorldRuleTask`。
- 新增 `defaultWorldRuleForm`、`defaultWorldRuleEventForm`、`defaultWorldRuleTaskForm`。
- 新增规则时强制 pending + unlocked。
- 编辑规则时支持 reviewStatus 修改和 confirmed 后锁定。
- 新增规则事件、新增当前章世界观任务。
- WorldRuleCard 审核按钮为真实 PATCH，不再显示 API 待接入。
- WorldRuleTaskCard 支持 persisted task 的 PATCH 操作。

### 26.7 时间线 Tab 人工微调区实现

- 新增 `saveTimelineEvent`、`patchTimelineEvent`、`saveTimelineLink`、`patchTimelineLink`、`saveTimelineTask`、`patchTimelineTask`。
- 新增 `defaultTimelineEventForm`、`defaultTimelineLinkForm`、`defaultTimelineTaskForm`。
- 新增事件时强制 pending + unlocked。
- 编辑事件时支持 reviewStatus 修改和 confirmed 后锁定。
- 新增因果链路、新增当前章时间线任务。
- TimelineEventCard 审核按钮为真实 PATCH，不再显示 API 待接入。
- TimelineTaskCard 支持 persisted task 的 PATCH 操作。

### 26.8 createWorldRule / createTimelineEvent 默认值修正

- createWorldRule 的 ruleType 和 scope 现在使用 `this.ensureEnum` 返回值，不再直接使用 `body.ruleType`/`body.scope`。
- createTimelineEvent 的 lineType、readerKnownState、characterKnownState 同样使用 `this.ensureEnum` 返回值。
- 新增时 status 固定 planned，review_status 固定 pending，locked 固定 0。

### 26.9 currentFocusChapter 识别规则补全

- 新增 `getFocusForeshadowingIds` 辅助方法，用于推导当前章相关伏笔 ID。
- 新增 `getFocusTimelineEventIds` 辅助方法，用于推导当前章相关时间线事件 ID。
- 新增 `getFocusWorldRuleIds` 辅助方法（仅用于 getTimeline 方向）。
- getWorldRules 的 focusRules 补充：relatedForeshadowingIds 相交、relatedTimelineEventIds 相交、有 derived task 的规则。
- buildDerivedWorldRuleTasks 补充：relatedForeshadowingIds 相交、relatedTimelineEventIds 相交的派生任务。
- getTimeline 的 focusEvents 补充：narrativeOrder 命中、storyTimeOrder 相邻、causalityLinks 命中、relatedForeshadowingIds 相交、relatedWorldRuleIds 相交、legacy 数据命中。
- buildDerivedTimelineTasks 补充：storyTimeOrder 相邻、relatedForeshadowingIds 相交、relatedWorldRuleIds 相交的派生任务。

### 26.10 legacy timeline 安全兼容

- allLegacyTimelines 增加 try/catch 保护，表不存在时安全返回空数组。
- allLegacyForeshadowings 同样增加 try/catch 保护。

## 27. Phase 7.4 修正构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。

## 28. Phase 7.4 收尾修正记录

### 28.1 后端变量顺序修正

- getWorldRules 中 focusTasks 初始化前被 focusRules 引用的问题已修复。
- 计算顺序改为：responseRules → persistedFocusTasks → derivedTasks → focusTasks → focusRules。

### 28.2 前端 input.input.xxx 运行时错误修复

- 世界观 Tab 中的 input.input.worldRuleForm.ruleId 已改为 input.worldRuleForm.ruleId。
- 时间线 Tab 中的 input.input.timelineEventForm.reviewStatus 已改为 input.timelineEventForm.reviewStatus。
- renderWorldTab 内自己计算 canLockWorldRule。
- renderTimelineTab 内自己计算 canLockTimelineEvent。

### 28.3 当前章焦点 Tab 联动修正

- renderFocus 调用已传入 relatedWorldTasks、relatedWorldRules、relatedTimelineTasks、relatedTimelineEvents、legacyTimelineEvents。
- 已清理 Phase 7.4 旧占位文案，空态表达为本章真实无额外处理项。

### 28.4 写作前提示词修正

- buildPreWritingPrompt 中世界观/时间线注意事项使用真实数据。

### 28.5 总览 Tab 统计补齐

- renderOverview 的 cards 已新增 8 项 Phase 7.4 统计。
- 下一个创作动作区域新增世界观提醒和时间线提醒。

### 28.6 pendingConfirmations 补齐

- 已加入 continuityWorldRules 和 continuityTimeline 的 pending 统计。

### 28.7 本章必须处理 fallback 修正

- 世界观 Tab 使用 worldMustHandleItems（优先 focusTasks → focusRules）。
- 时间线 Tab 使用 timelineMustHandleItems（优先 focusTasks → focusEvents）。

### 28.8 页面 subtitle 修正

- 已改为 7.5 只展示入口并包含世界观规则、时间线三线模型。

### 28.9 timeline focusEvents 因果链判断收窄

- 先计算 directFocusEventIds，再通过 causality links 扩展。
- 仅当 link 的一端在 directFocusEventIds 中时，另一端才加入 focusEvents。

### 28.10 renderFutureTab 清理

- 已移除 world/timeline 占位条目。

## 29. Phase 7.4 收尾构建记录

- server npm run typecheck: 本地执行通过。
- server npm run build: 本地执行通过。
- desktop npm run typecheck: 本地执行通过。
- desktop npm run build: 本地执行通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。

## 30. Phase 7.4 cockpit closeout 记录

- renderFocus 调用已传入真实世界观 / 时间线数据：relatedWorldTasks、relatedWorldRules、relatedTimelineTasks、relatedTimelineEvents，并保留 legacyTimelineEvents 兼容旧时间线数据。
- generatedPrompt useMemo dependency array 已补齐 focusWorldTasks、focusWorldRules、focusTimelineTasks、focusTimelineEvents。
- pendingConfirmations 已计入 continuityWorldRules.summary.pendingReviewCount 和 continuityTimeline.summary.pendingReviewCount。
- renderOverview 已展示 8 项 Phase 7.4 专项统计：当前章世界观规则、当前章世界观任务、世界观冲突、高风险世界观、当前章时间线事件、当前章时间线任务、时间冲突、因果缺口。
- 总览“下一个创作动作”已加入世界观 / 时间线提醒，优先显示冲突、时间冲突、因果缺口、高风险规则和当前章任务。
- renderTimelineTab JSX 中的补丁残留声明已清理，只保留函数顶部的 timelineFocusTasks、timelineFocusEvents、timelineMustHandleItems。
- 世界观 Tab 可编辑规则下拉由 allRules 内部过滤生成，不再依赖未传入的 input.editableWorldRules。
- 时间线 Tab 可编辑事件下拉由 allEvents 内部过滤生成，不再依赖未传入的 input.allEvents。
- Phase 7.5 未开始。
- 未新增数据库迁移。
- 未修改 022 迁移。
- 未开发写作前检查闭环。
- 未开发写作后更新闭环。
