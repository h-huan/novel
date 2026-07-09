# Phase 8.0 前置低 token 核心闭环验收

基线提交：`1f9cbb69b351e535a3f14b546ff071afad51d55a`

本轮只做低 token 验收，不新增功能，不修改迁移，不重构代码。

## 1. 总结论

- 是否建议进入 Phase 8：建议进入。
- 是否存在阻塞：否。
- 最大风险：RAG / 索引基础能力存在，但自动同步链路未完全确认；建议进入 Phase 8 前做专项实测。

## 2. 8 项核心闭环结果

| # | 验收项 | 结果 | 证据 | 是否阻塞 |
|---|---|---|---|---|
| 1 | 短篇无大纲阻止正文 | 通过 | `workflow-rules.ts` 的 `buildShortStoryGuard` 对 `generate_body` / `continue_body` 在无 outline 时给出阻止原因；`chain.controller.ts` 调用 `assertCanGenerateBody`。 | 否 |
| 2 | 短篇有大纲生成正文 | 通过 | guard 在有 outline 时允许进入 writing；`chain.controller.ts` 正文生成后返回 `stateItemsCreated` / `stateArchiveWarning`，并更新章节正文链路。 | 否 |
| 3 | 长篇无章节规划阻止正文 | 通过 | `buildLongNovelGuard` 在缺 world / character / outline / volume / chapter_plan 时阻止 `generate_body`，提示先完成规划。 | 否 |
| 4 | 长篇完整资料生成正文 | 通过 | `/chain/generate`、`/chain/long-write` 路径调用 `assertCanGenerateBody` 后执行正文生成，并通过 Chapter / archive 链路返回状态归档信息。 | 否 |
| 5 | 手动改正文生成 pending | 通过 | `ChapterService.update` 在 content 变化时调用 `StateItemService.createFromManualChapterEdit`；该服务生成 pending `state_items` 并返回 `stateSync`。 | 否 |
| 6 | confirmed 进入下一章上下文 | 通过 | `StateItemService.buildWritingStateContext` 查询 confirmed / pending / conflict / stale，排除 rejected / archived，并格式化为已确稿、待确认、冲突、过期分区。 | 否 |
| 7 | 大纲结构调整同步影响 | 通过 | `OutlineService.update/remove/split/insert/merge/move` 调用 `analyzeStateImpact` / `analyzeOperationImpact`；`syncAfterChapterChange` 同步 legacy foreshadowing 章节索引。 | 否 |
| 8 | precheck/postupdate 闭环 | 通过 | `ContinuityController` 暴露 precheck / postupdate / confirm；`ContinuityService.applyPostupdateSuggestion` 只写入 `state_items` pending / ignored / conflict，不覆盖正式设定。 | 否 |

## 3. docx 完整性

- 是否找到 docx：是，`D:\code\novel\两百万字小说创作全流程指南.docx`。
- 是否覆盖平台级长篇流程：部分覆盖；有世界观、人物、大纲、分卷、章节规划等传统创作流程。
- 是否覆盖短篇流程：未完整覆盖平台级短篇链路。
- 是否覆盖状态确稿：否，未覆盖 pending / confirmed / stale / conflict / rejected / archived。
- 是否覆盖人工微调同步：否，未覆盖正文、大纲、伏笔、世界观、时间线修改后的同步规则。
- 是否覆盖连续性驾驶舱：否，未覆盖 currentFocusChapter / precheck / postupdate。
- 是否覆盖 RAG / 索引：否。
- 结论：docx 可作为两百万字长篇基础创作指南，但不能作为当前平台完整使用手册。

## 4. RAG / 索引结论

- 基础能力：存在。`VectorIndexService` 提供 upsert / query / delete / count / indexChunks；`ContextBuilderService` 支持 P0 / P1 / P2 / P3 分层上下文。
- 自动同步链路：部分存在。`CharacterController` 和 `ChainController` 中可见显式 `indexChunks` 调用，但未完整确认正文 / 世界观 / 伏笔 / 时间线全量修改后的自动 reindex 链路。
- 风险：索引基础能力存在，但自动同步链路未完全确认，不作为 Phase 8 阻塞，建议进入 Phase 8 前专项验证。

## 5. 构建结果

- server typecheck：通过。
- server build：通过。
- desktop typecheck：通过。
- desktop build：通过；保留既有 Vite CJS API deprecated、PromptChainPage 动静态导入和 chunk size warning。

## 6. 不通过项

无阻塞项。

## 7. 最终判断

建议进入 Phase 8。
