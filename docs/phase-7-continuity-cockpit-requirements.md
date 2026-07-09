# Phase 7 小说连续性驾驶舱需求说明

## 1. 阶段名称

Phase 7：小说连续性驾驶舱。

## 2. 阶段定位

Phase 7 不是后台管理系统，不是资料库，也不是提示词展示页。它是作者长篇创作时使用的连续性驾驶舱，帮助作者快速判断小说发展到哪里、当前要写哪一章、哪些设定不能写错、哪些风险需要先处理。

## 3. 与 Phase 6.9 的边界

Phase 6.9 已收口在写作质量、注意力检查、单 issue 闭环、issue 跳转上下文和大纲编辑补强。Phase 6.9 只预埋了角色密度、世界观规则、伏笔链和时间线三线模型的数据结构，不代表这些完整功能已经完成。

进入 Phase 7 的内容包括：完整人物关系网、伏笔生命周期、角色长篇状态演化、世界观规则系统、时间线三线模型、写作前检查、写作后更新。

## 4. 为什么不能做成后台管理页

后台管理页会把字段摊开，迫使作者在写作前整理资料。连续性驾驶舱必须围绕当前创作章节组织信息，让作者在 10 到 30 秒内知道当前章节该怎么写、不能写错什么、哪些缺口需要补全。

## 5. currentFocusChapter 设计

驾驶舱顶部必须有当前创作章节选择器。

- 可选择项目内任意章节。
- 默认优先选择最近未 locked 章节；无法判断时选择第一章。
- 选择后保存到本地视图状态，刷新后恢复。
- 已实现 Tab 必须围绕 currentFocusChapter 展示。

## 6. 总览 Tab 设计

总览 Tab 用于 10 秒内了解小说整体状态。

必须展示：当前卷/章、已写章节/总章节、已写字数/目标字数、待确认设定、伏笔风险、时间线风险、人物状态风险、世界观规则风险。

缺少正式数据时必须显示真实空态或“待接入”，不能生成占位文本。

## 7. 当前章节焦点 Tab 设计

当前章节焦点 Tab 用于 30 秒内回答：当前章该怎么写、不能写错什么。

必须展示：章节基础信息、本章目标、出场人物、人物状态注意事项、关系注意事项、伏笔注意事项、世界观注意事项、时间线注意事项、禁止写错事项，以及可复制的本章写作前提示词。

缺失信息必须标记“待补全”，不允许编造人物关系、伏笔或规则。

## 8. 其他 Tab 分期计划

- Phase 7.2：人物状态与人物关系网。
- Phase 7.3：伏笔雷达与伏笔生命周期。
- Phase 7.4：世界观规则与时间线三线模型。
- Phase 7.5：写作前检查与写作后更新闭环。

本轮这些 Tab 只展示入口和空态，不假装完成。

## 9. 四层 Tab UI 规范

每个 Tab 按四层组织：

1. 顶部全貌摘要区。
2. 当前章节创作辅助区。
3. 结构化详情区。
4. 人工微调区。

总览和当前章节焦点本轮按该规范落地；其他 Tab 保留空态入口。

## 10. 人工微调原则

本轮人工微调只保存到 localStorage 或视图状态，不写入正式设定库。已确认设定不允许被驾驶舱直接覆盖。后续 Phase 7.2 起再接入角色、关系、伏笔、世界观和时间线的正式写回。

## 11. AI 内容待确认原则

AI 生成的写作前提示词只能作为草稿，必须可人工修改，不能直接写入已确认设定，不能覆盖 locked 章节。

## 12. 数据来源

优先复用现有数据：

- `projects`
- `chapters`
- `outlines`
- `characters`
- `foreshadowings`
- `world_settings`
- `timeline_events`
- `state_items`
- `writing_quality_reports / issues`

## 13. API 设计

本轮可先由前端聚合现有 API，后续可新增：

`GET /projects/:projectId/continuity/overview?focusChapterId=xxx`

该 API 后续应返回 project、focusChapter、stats、recentChapters、currentFocus、phase7Tasks 等聚合数据。

## 14. 验收标准

1. 产品中能看到 Phase 7 任务展示。
2. Dashboard 或侧边栏能进入连续性驾驶舱。
3. 页面顶部有 currentFocusChapter 选择器。
4. 刷新后能恢复 currentFocusChapter。
5. 总览 Tab 展示小说全貌统计和风险摘要。
6. 当前章节焦点 Tab 围绕当前章节展示写作辅助信息。
7. 缺失数据使用真实空态，不使用提示词占位符。
8. 当前章节焦点 Tab 能生成可复制的写作前提示词。
9. 当前章节焦点 Tab 支持基础人工微调。
10. 其他 Tab 只显示分期入口和空态。

## 15. 遗留项

1. 完整人物关系网未完成。
2. 伏笔生命周期系统未完成。
3. 角色长篇状态演化未完成。
4. 世界观规则编辑器未完成。
5. 时间线三线模型编辑器未完成。
6. 写作前检查与写作后更新闭环未完成。

## 16. Phase 7.0 + 7.1 实现记录

- 基准提交 SHA：`9a44a9db8471c1f8be0d53a534beef31fe2e9af6`
- 实现范围：
  - Phase 7 任务展示
  - 连续性驾驶舱入口
  - `/project/:id/continuity` 路由
  - `currentFocusChapter` 当前创作章节选择器
  - 总览 Tab
  - 当前章焦点 Tab
  - 其他 Tab 空态入口
  - Phase 6.9 issue navigation fallback 收尾
- 本轮修正：
  - 风险统计 payload stringify 问题
  - 写作前提示词复制按钮
  - 无章节项目空态
  - 当前章焦点 Tab 创作可用性优化
  - 构建记录回填

## 17. 构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；仅保留既有 Vite CJS API、PromptChainPage 动静态导入和 chunk size 警告。

## 18. Phase 7.2 状态更新

Phase 7.2 已正式开始，负责人物状态与人物关系网第一版可用系统。人物 Tab 和关系网 Tab 从空态入口升级为围绕 `currentFocusChapter` 的人物连续性控制台。

Phase 7.3 已完成第一版伏笔雷达与伏笔生命周期接入，并完成修正收口。伏笔 Tab 从空态入口升级为可用雷达，并提供完整的中文创作视角 UI。

## 19. Phase 7.3 状态更新

Phase 7.3 已完成第一版伏笔雷达与伏笔生命周期接入，并完成修正收口。

第一版完成：

- 新增 `foreshadowing_threads`、`foreshadowing_lifecycle_events`、`foreshadowing_chapter_tasks`。
- 在现有 `continuity` 模块内新增伏笔雷达 API。
- 伏笔 Tab 从空态入口升级为可用雷达。
- 当前章节焦点 Tab 使用真实 `focusTasks` 展示伏笔注意事项。
- 总览 Tab 增加本章伏笔任务、临近回收、逾期伏笔、高风险伏笔统计。
- 旧 `foreshadowings` 表只读兼容，不静默迁移，不伪造生命周期。

修正收口：

- Phase 7 状态展示 7.3 从待开发修正为本轮实现。
- 当前章伏笔识别规则补全，覆盖 lifecycle event、planned/actual bury/recover、recovery window、related characters/relationships。
- 新增雷达推导（radar derived）任务，不写入数据库。
- 逾期判断改为基于章节顺序，不再只比较 chapterId。
- recoveryDue 判断支持回收窗口内和距离窗口 2 章。
- 伏笔 Tab 文案完整中文化。
- 伏笔 Tab 顶部摘要补齐 10 项指标。
- 结构化分组补齐本章必须处理、即将回收、逾期风险、高风险、待确认、全书、卷内、章节、已回收、全部伏笔、legacy 只读共 11 组。
- 当前章焦点 Tab 和写作前提示词伏笔段落中文任务类型。

收尾修正：

- derived task 改为只读提醒，不再显示状态、审核、锁定按钮，不再触发 PATCH。
- 本章必须处理分组修正空数组不 fallback 的问题。
- 伏笔相关保存提示和验证提示继续中文化。
- ChapterSelect 空选项 None 改为"不选择"。
- loadContinuity 错误文案统一为 Phase 7。
- Phase 7 阶段状态 7.2 改为"已完成"，7.3 改为"已完成"，样式同时高亮已完成和本轮实现。

Phase 7.4 已正式开始，负责世界观规则系统与时间线三线模型第一版可用系统。世界观 Tab 和时间线 Tab 从空态入口升级为围绕 currentFocusChapter 的世界观与时间线连续性控制台。

## 20. Phase 7.4 状态更新

Phase 7.4 已开始并完成第一版世界观规则与时间线三线模型接入。

本轮完成：

- 新增 `world_rules`、`world_rule_events`、`world_rule_chapter_tasks` 表。
- 新增 `timeline_three_line_events`、`timeline_causality_links`、`timeline_chapter_tasks` 表。
- 在现有 continuity 模块内新增世界观规则 API 和时间线三线模型 API。
- 世界观 Tab 从空态升级为可用控制台，包含顶部摘要、当前章创作辅助、结构化详情。
- 时间线 Tab 从空态升级为三线模型控制台，明确区分客观故事时间线、叙事呈现顺序线、因果链/信息链。
- 当前章焦点 Tab 接入真实世界观规则和时间线注意事项。
- 总览 Tab 增加世界观规则风险和时间线风险统计。
- 写作前提示词接入真实世界观规则和时间线注意事项。
- legacy timeline 数据只读兼容，不静默迁移。

修正收口：

- Phase 7 状态展示 7.4 从"待开发"修正为"本轮实现"。
- 当前章焦点 Tab 已真正接入 world-rules / timeline continuity 数据，使用 groupWorldTaskNotes / groupTimelineTaskNotes 按 taskType 分组。
- 写作前提示词接入真实世界观规则和时间线任务。
- 总览 Tab 补齐 10 项世界观 / 时间线专项统计。
- pendingConfirmations 包含世界观和时间线 pending 项。
- 世界观 Tab 补全人工微调区，支持规则、事件、任务的新增/编辑/审核/锁定。
- 时间线 Tab 补全人工微调区，支持事件、因果链路、任务的新增/编辑/审核/锁定。
- 世界观 / 时间线卡片移除 API 待接入假按钮，改为真实 PATCH。
- persisted task 支持 PATCH，derived task 继续只读。
- currentFocusChapter 识别规则补齐 relatedForeshadowingIds、relatedTimelineEventIds、relatedWorldRuleIds、causalityLinks、storyTimeOrder、legacy。
- createWorldRule / createTimelineEvent 默认值写入修正。
- legacy timeline 表不存在时安全返回空数组。

收尾修正（第二轮）：

- getWorldRules 中 focusTasks 初始化前引用问题已修复。
- 前端 input.input.xxx 运行时错误已修复。
- 当前章焦点 Tab 已传入真实 Phase 7.4 数据。
- 写作前提示词已接入真实世界观规则和时间线任务。
- 总览 Tab 补齐世界观/时间线统计和提醒。
- pendingConfirmations 已加入世界观和时间线 pending 项。
- 世界观/时间线"本章必须处理" fallback 已修正。
- subtitle 已改为 7.5 只展示入口。
- timeline focusEvents 因果链判断已收窄。

Phase 7.5 仍未开始，写作前检查与写作后更新闭环继续保持空态入口。
