# Phase 7.2 人物状态与人物关系网验收记录

## 1. 阶段目标

Phase 7.2 的目标是在小说连续性驾驶舱中建立“人物连续性控制台”第一版，让作者围绕当前创作章节快速确认人物状态、人物关系、待确认内容、冲突风险和不能写错的关系边界。

## 2. 与 Phase 7.1 的边界

Phase 7.1 已完成连续性驾驶舱入口、`currentFocusChapter`、总览 Tab、当前章焦点 Tab、复制提示词与无章节空态。Phase 7.2 只在此基础上接入人物状态与人物关系，不推翻 Phase 7.1 的入口和交互。

## 3. 与 Phase 7.3 的边界

Phase 7.3 的伏笔雷达与伏笔生命周期仍未开始。本轮不会开发伏笔生命周期页面，也不会把关系数据伪装成伏笔链路。

## 4. 为什么不能做成后台表格

人物状态和人物关系服务于写作现场，不是资料库维护。作者打开页面后要先看到当前章人物、当前状态、关系风险、隐藏关系和待确认项，而不是先被全部字段表格淹没。因此本轮使用摘要、卡片、分组和展开详情，复杂编辑放入人工微调区。

## 5. currentFocusChapter 联动规则

人物 Tab 按以下优先级识别当前章人物：
1. 章节正文中出现角色名。
2. 当前章对应大纲中出现角色名。
3. `character_state_snapshots.chapter_id = currentFocusChapter`。
4. `character_relationships.first_chapter_id/latest_chapter_id = currentFocusChapter`。
5. 没有真实命中时显示空态，不编造人物。

关系网 Tab 按以下优先级识别当前章关系：
1. 关系首次章节或最近变化章节等于当前章。
2. 关系变化事件章节等于当前章。
3. 当前章任意两名人物之间已有关系。
4. 没有真实命中时显示空态，不编造关系。

## 6. 人物状态数据模型

新增 `character_state_snapshots`，字段覆盖项目、人物、章节、卷序、状态类型、当前状态、证据、原因、行动影响、关系影响、目标影响、伏笔影响、后续变化、冲突风险、审核状态、来源、置信度、锁定和时间戳。

`review_status` 默认为 `pending`，可取 `draft / pending / confirmed / ignored / conflict / archived`。`locked = 1` 的 confirmed 状态不能被静默覆盖。

## 7. 人物关系数据模型

新增 `character_relationships` 与 `character_relationship_events`。关系表支持公开关系、隐藏关系、信任度、冲突度、情感倾向、利益绑定、首次章节、最近章节、当前阶段、读者已知状态、双方已知状态、变化摘要、关联伏笔、关联时间线、审核状态、锁定和来源。

关系事件表记录建立、加深、冲突、背叛、和解、揭示、隐藏、弱化、强化等变化事件。

## 8. 人物 Tab UI 设计

人物 Tab 由四层组成：
1. 顶部全貌摘要区：总人物数、当前章相关人物、待确认状态、状态冲突、最近变化、locked 状态。
2. 当前章节创作辅助区：当前章人物、目标、状态摘要、说话方式和缺失状态提示。
3. 结构化详情区：本章人物、主线人物、最近变化、待确认、风险人物、全部人物，以卡片和展开详情展示。
4. 人工微调区：新增或编辑人物状态快照，标记 pending/confirmed/ignored/conflict，支持锁定。

## 9. 关系网 Tab UI 设计

关系网 Tab 第一版不做复杂图谱，采用“关系驾驶舱 + 关系列表 + 展开详情”：
1. 顶部全貌摘要区：总关系数、当前章关系、隐藏关系、高冲突关系、待确认关系、最近变化关系。
2. 当前章节创作辅助区：当前章相关关系、最紧张关系、隐藏关系、读者已知但角色未知关系、不能写错的关系状态。
3. 结构化详情区：本章关系、高冲突、隐藏、信任变化、待确认、全部关系。
4. 人工微调区：新增/编辑关系，调整信任度、冲突度、公开/隐藏关系、已知状态、锁定关系，并新增关系变化事件。

## 10. API 设计

- `GET /projects/:projectId/continuity/characters?focusChapterId=xxx`
- `GET /projects/:projectId/continuity/relationships?focusChapterId=xxx`
- `POST /projects/:projectId/continuity/character-states`
- `PATCH /projects/:projectId/continuity/character-states/:stateId`
- `POST /projects/:projectId/continuity/relationships`
- `PATCH /projects/:projectId/continuity/relationships/:relationshipId`
- `POST /projects/:projectId/continuity/relationships/:relationshipId/events`

## 11. 待确认机制

所有新增人物状态、人物关系和关系变化事件默认进入 `pending`。AI 来源字段预留为 `source = ai`，人工新增为 `manual`，后续章节提取为 `chapter_extract`。

## 12. 锁定机制

人物状态 `locked = 1` 时，PATCH 必须显式 `forceUnlock=true` 才能修改。关系 `locked = 1` 时，阻止 `source = ai` 的自动覆盖；人工编辑仍保留明确操作入口。

## 13. 人工微调规则

人工微调写入 Phase 7.2 连续性表，保留来源、状态、更新时间；不会写入正式设定库，不会自动确认，不会自动 locked。

## 14. 验收标准

1. `/project/:id/continuity` 正常加载。
2. 人物 Tab 有摘要、当前章辅助、结构化详情、人工微调。
3. 人物 Tab 能显示当前章相关人物和人物状态快照。
4. 人物 Tab 能新增、编辑、确认、忽略、标冲突、锁定人物状态。
5. 关系网 Tab 有摘要、当前章辅助、结构化详情、人工微调。
6. 关系网 Tab 能新增、编辑、锁定人物关系，并新增关系变化事件。
7. 当前章焦点 Tab 使用真实人物状态与关系注意事项。
8. 总览 Tab 统计人物状态风险、当前章人物、当前章关系、高冲突关系、隐藏关系。
9. Phase 7.3-7.5 仍为空态入口。
10. 构建通过。

## 15. 遗留项

1. 未开发复杂关系图谱。
2. 未开发 AI 自动抽取人物状态和关系。
3. 未开发完整关系历史对比视图。
4. 未进入伏笔生命周期、世界观规则、时间线三线模型和写作后更新闭环。

## 16. 构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；仅保留既有 Vite CJS API、PromptChainPage 动静态导入和 chunk size 警告。

## 17. Phase 7.2 修正记录

- 新增人物状态强制 `pending + unlocked`，即使 POST body 传入 `reviewStatus=confirmed` 或 `locked=true` 也会忽略。
- 新增人物关系强制 `pending + unlocked`，即使 POST body 传入 `reviewStatus=confirmed` 或 `locked=true` 也会忽略。
- 新增关系变化事件强制 `pending`，不允许 POST 直接创建 confirmed 事件。
- `locked` 只允许在记录已确认为 `confirmed` 后设置。
- `source=ai` 不能覆盖 locked 人物状态或 locked 人物关系。
- 人物状态人工微调区补充 `goalImpact` 和 `foreshadowingImpact`。
- 前端新增模式和编辑模式已区分：新增模式固定 pending/unlocked，编辑模式才允许调整审核状态和锁定。
- 关系变化事件新增时不展示 reviewStatus 选择，明确进入待确认记录。

补充验收标准：

1. POST 创建状态不能直接 confirmed。
2. POST 创建关系不能直接 confirmed。
3. POST 创建事件不能直接 confirmed。
4. pending 状态不能 locked。
5. pending 关系不能 locked。
6. confirmed 后才能 locked。
7. AI 不能覆盖 locked。
8. 人物状态表单包含 `goalImpact` 和 `foreshadowingImpact`。

## 18. Phase 7.2 修正构建记录

- `server npm run typecheck`: 本地执行通过。
- `server npm run build`: 本地执行通过。
- `desktop npm run typecheck`: 本地执行通过。
- `desktop npm run build`: 本地执行通过；仅保留既有 Vite CJS API、PromptChainPage 动静态导入和 chunk size 警告。
