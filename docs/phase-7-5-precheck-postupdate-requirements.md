# Phase 7.5 写作前检查与写作后更新闭环验收记录

## 1. 阶段边界

Phase 7.5 只补齐小说连续性驾驶舱中的写作前检查和写作后更新闭环，不返工 Phase 7.1、7.2、7.3、7.4 已完成能力。

本阶段不修改既有迁移，不修改 `022` 迁移，不新增复杂外部依赖。

## 2. 写作前检查

新增 continuity API：

- `GET /projects/:projectId/continuity/precheck?focusChapterId=xxx`
- `POST /projects/:projectId/continuity/precheck/run`

检查来源包括当前章、章节大纲、人物状态、人物关系、伏笔任务、世界观规则、时间线事件、pending 待确认项和 locked 状态。

检查结果分为：

- blocker：不建议直接写正文。
- warning：可以写，但必须带着提醒写。
- pass：当前模块没有明显风险。
- suggestion：建议补齐的连续性项。

返回 summary 包含 riskLevel、score、blockCount、warningCount、passCount、pendingCount、canStartWriting。

## 3. 写作后更新

新增 continuity API：

- `GET /projects/:projectId/continuity/postupdate?focusChapterId=xxx`
- `POST /projects/:projectId/continuity/postupdate/run`
- `POST /projects/:projectId/continuity/postupdate/suggestions/:suggestionId/confirm`
- `POST /projects/:projectId/continuity/postupdate/suggestions/:suggestionId/ignore`
- `POST /projects/:projectId/continuity/postupdate/suggestions/:suggestionId/conflict`

写作后更新围绕当前章正文生成轻量规则建议，识别人物状态复核、人物关系复核、伏笔复核、世界观规则验证、时间线 / 因果链复核和 conflict 建议。

当前章无正文时不会假装成功，会生成 conflict 建议。当前章 locked 时不会自动更新，只生成 locked conflict。

## 4. locked / confirmed 保护

Phase 7.5 不直接覆盖 confirmed 或 locked 的正式设定。

写作前检查只读已有连续性数据。写作后更新只生成建议；确认操作也只写入 `state_items`，状态为 pending，不直接 confirmed。涉及 locked 的建议标记为 lockedConflict 或 conflict，由作者人工处理。

## 5. pending 写入原则

本阶段复用 `state_items` 承载写作后更新建议。

写入字段包括 target_type、target_id、title、summary、content、payload、status、authority、tags、impact_scope。payload 保存 evidence、riskLevel、sourceChapterId、focusChapterId、suggestionType、lockedConflict 等信息。

确认生成：status 为 pending。忽略建议：status 为 ignored。标记冲突：status 为 conflict。

## 6. UI 四层结构

写作前检查 Tab 已从空态入口升级为：

1. 顶部摘要区：风险等级、分数、阻塞项、警告项、通过项、是否建议开始写作。
2. 当前章检查结论区：明确给出是否可以开始写正文。
3. 结构化详情区：阻塞项、警告项、通过项、建议项。
4. 操作区：重新运行检查、复制检查结果、跳转当前章焦点和相关 Tab。

写作后更新 Tab 已从空态入口升级为：

1. 顶部摘要区：建议数、冲突数、locked 冲突数、pending 数、是否可安全生成待确认项。
2. 当前章正文状态区：标题、字数、是否有正文、是否 locked。
3. 结构化详情区：人物、关系、伏笔、世界观、时间线、冲突、忽略建议分组。
4. 操作区：运行分析、复制摘要、生成待确认项、忽略、标记冲突。

## 7. 迁移记录

本次未新增数据库迁移。

本次未修改既有迁移。

本次未修改 `022` 迁移。

## 8. 构建记录

本地构建命令需执行：

- `cd server && npm run typecheck`
- `cd server && npm run build`
- `cd desktop && npm run typecheck`
- `cd desktop && npm run build`

## 9. 后续优化

第一版写作后更新使用轻量关键词和连续性数据规则，不引入复杂 NLP。后续可在不破坏 pending / locked 保护的前提下接入更细粒度的模型分析。
