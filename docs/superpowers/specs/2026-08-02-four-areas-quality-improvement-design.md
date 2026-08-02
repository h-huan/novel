# 四区显示与生成质量改进设计（世界观 / 大纲 / 角色 / 地点势力）

- 日期：2026-08-02
- 范围：novel-ai-platform（Electron 桌面端 + NestJS 服务端 + SQLite）
- 状态：已批准

## 背景与目标

用户反馈四项问题，均属"程序流程"（前端展示 + 生成 prompt/落库逻辑），与模型能力无关：

1. 世界观页无"非详细/详细"分层，"社会与行业规则"与"地点/社会结构"等字段重复，整体拥挤。
2. 大纲缺少多个爽点、多个冲突、热血镜头；爽点允许跨章，但频率要足够。
3. 角色速览与人物设定档案大量重复且臃肿；基础信息/外貌/性格需列表化；二级标题与内容需样式区分；角色允许随剧情变化，需变动历史。
4. 地点与势力页太简单，看不出内容。

已确认设计决策：
- 世界观：短篇版 + 长篇版都改。
- 角色：速览 + 档案合并为一个视图。
- 变动历史：手动 + 自动结合。
- 世界观重复：生成侧 + 展示侧一起修。
- 大纲：本次含展示侧的"爽点节奏摘要"。
- 变动历史：新建 `character_profile_changes` 表。

## 总体方案

前端重写 4 个页面/组件；后端改生成 prompt、落库逻辑、新增变动历史接口。引入一个通用"列表化"渲染 helper（把多行/顿号文本拆为 bullet），供世界观、角色、地点复用。

## 区域一：世界观

### 短篇版 WorldSimpleView（desktop/src/renderer/components/world/WorldSimpleView.tsx）

- 结构改为「非详细速览」+「详细设定」两层：
  - 速览层：故事背景一句话 · 时代标签（chip）· 核心地点 chip 列表 · 核心规则 1-3 条 · 特殊设定（折叠区）。
  - 详细层：7 维度各自渲染为 bullet 列表（`splitToLines` 按 `、；，\n` 拆分），分区带标题与说明。
- 阅读/编辑双模式：阅读模式列表化；编辑模式保留现有 textarea 表单。
- 详细层"社会结构"不再拼接 economy/factions 文本（避免与"社会与行业规则"重复）。

### 长篇版 WorldProfileEditor（desktop/src/renderer/pages/WorldPage.tsx）

- 顶部加「作品速览」卡：synopsis / basic_info / scale_plan / ending 的摘要列表。
- 各 PROFILE_SECTION_GROUPS section 阅读时列表化（`splitToLines`），编辑时保留 textarea（AutoTextarea）。
- section 折叠交互保留。

### 生成侧（server/src/chain/chain.controller.ts 短篇 pipeline 世界观 prompt + 落库）

- 7 维度 prompt 增加**字段职责边界**说明：
  - `geography`：只写地理（大陆/区域/地点分布）；`locations` 只写核心地点名（简短数组）。
  - `social_rules`：只写行业规则、法律边界、社会行为规范（短句列表），不得含社会结构/地点。
  - `constraints.socialStructure`：只写阶级/政治/经济/信仰格局。
  - `constraints.powerSystem`：只写力量/科技/超自然体系。
  - `constraints.history`、`constraints.endingDirection` 各自独立。
- 修改落库 `mergeText` 逻辑：当前把 `wd.socialStructure` 同时塞进 `social_rules`，把 `wd.locations`/`wd.geography` 相互回填，导致展示重复。改为各字段独立写入，不做跨字段回填。
- 长篇世界观生成（world_system_profiles 对应模板）同样加字段边界约束，保证非详细字段（basic_info/synopsis）与 7 维度不重叠。

## 区域二：大纲（爽点 / 冲突 / 热血频率）

### 生成侧（server/src/chain/chain.controller.ts 短篇章纲 prompt）

- 章节规划阶段（`chapterResponsibilityPlan` / `chapterTitles`）保证**节奏非平均**：每 N 章至少 1 个功能章为 `conflict / explosion / climax / cliffhanger`（热血/高潮/爆发），不能全是 `paving`。
  - 现状发现：`normalizeOutlineChapterFunction` 已会把 `paving` 回落为短篇节奏数组（opening/exposition/conflict/climax...），但 DB 中章节却全部为 `paving`，说明**落库路径把模型原始函数值直接写入**，未走 normalize。本次必须同时修：生成端要求变化节奏 + 落库端统一 normalize 后再持久化。
- 每章 `chapterPrompt` 增强：
  - **爽点类型**：2-3 个爽点强制混合类型（打脸 / 逆袭 / 热血名场面 / 反转冲击 / 情感暴击 / 信息爆点），每章标注 1 个"高能记忆点"。
  - **跨章爽点弧**：在全书分工（chapterResponsibilityPlan）中新增卷级爽点弧列表（埋设章 → 蓄力章 → 爆发章），单章大纲只承接本弧的一段。
  - **频率兜底**：每章 ≥2 爽点、≥2 冲突；每 2-3 章 1 个反转/钩子；每卷 ≥2 个跨章弧。
  - **热血镜头**：在 conflicts/scenes 中明确要求含"高光/热血/燃"的动作或对峙场景（题材允许时）。
- 验证器 `assessChapter` 加严：highlights ≥ 2 且含类型标注；conflicts ≥ 2；hook 非空。

### 生成侧（长篇大纲模板，server/src/chain/prompt-registry.service.ts）

- `long-novel-outline-initial` / `long-novel-volume-planning` / `long-novel-chapter-summary` 增加：每卷"爽点弧清单"（跨章埋→蓄→爆）、"热血高潮章"定位、全书爽点密度要求。

### 展示侧（desktop/src/renderer/pages/OutlinePage.tsx）

- 卷骨架（treePanel 的 volumeBlock）增加"节奏/爽点摘要"：每章显示爽点数（从 highlights 解析）、功能章色块（已有 fnBadge）、跨章爽点弧标记（🔗 弧：埋X章→爆Y章）。

## 区域三：角色

### 合并视图（desktop/src/renderer/pages/CharacterPage.tsx）

- 删除"角色速览"与"人物设定档案"两个独立面板，合并为单一档案页：
  - 头卡：名字 / 身份 / 角色层级 / POV / 成长标签（chip，可点击看变动历史）。
  - 分区列表化：基本信息、外貌与性格、能力与背景、关系与目标、说话风格与弱点、补充说明。
  - 二级标题样式：主题色 + 左侧竖线 + 加粗（如 #e94560 系）；字段内容正文灰白；枚举/标签用彩色 chip。区分"标题层"与"内容层"，解决拥挤。
  - 「读者共鸣点」卡：展示 reader_empathy_point（悲惨/反转/热血/牺牲营销钩子）等已有字段；空则提示生成。
- 24 维状态、状态时间线、人际关系网络等面板保留（已各自独立，不与档案重复）。

### getWritingSummary 重构（server/src/modules/character/character.service.ts）

- 不再拼接 13 项冗长段落进 summary。改为：顶部生成"一句话人物 hook"（核心特质 + 矛盾 + 一句读者钩子），分区数据由 `sections` 提供，前端按分区渲染列表。彻底消除 summary 与档案重复。

### 变动历史（手动 + 自动）

- 新表 `character_profile_changes`：
  - 列：id, project_id, character_id, field_key, field_label, before_value, after_value, chapter_index, reason, source('auto'|'manual'), created_at, updated_at。
  - migration：`048_character_profile_changes.ts`（当前最新为 047，沿用序号递增）。
- 后端：
  - 自动记录：`updateProfile` / `updateCharacter` 保存时 diff before/after，对每个变化字段自动插入一条（chapter_index 取当前大纲最后一章号或留空，reason 留空，source='auto'）。
  - 手动记录：新增 API。
  - API：GET `/projects/:projectId/characters/:id/profile-changes`；POST（手动补录）；PUT（改 chapter_index/reason）；DELETE。
- 前端：
  - 字段值渲染为可点击标签，点击弹出"变动历史"面板：列表显示 第x章 · 微调内容(before→after) · 原因，支持增删改。
  - 字段旁「+记录变化」按钮触发手动补录。

### 角色生成 prompt 增强

- 短篇角色生成 prompt（chain.controller.ts 任务A）与长篇 `long-novel-character-settings`：
  - 强制"读者代入钩子"：悲惨经历 / 反转设定 / 热血高光 / 牺牲瞬间，至少覆盖 2 类，写入 `reader_empathy_point` 等字段。
  - 生成初始"成长标签"（如 隐忍→爆发、冷漠→守护），写入 tags 或 growth_stages_json。

## 区域四：地点势力

### MapDetailCard（desktop/src/renderer/components/world/MapDetailCard.tsx）

- 补全字段展示：climate / resources / significance / sensory_detail。
- 关联章节、关联角色：解析为名字（后端详情接口返回 name 映射，或前端用 characters/chapters store 查名），不再显示原始 ID。
- 统一为 app 暗色主题（当前用 tailwind 类但页面为内联暗色样式，需对齐）。

### OrgDetailCard（desktop/src/renderer/components/world/OrgDetailCard.tsx）

- 补全：leader / strength_level / territory / characteristics / signature_equipment / relationships_json。
- 上级/下属组织、关联地点解析为名字；暗色主题对齐。

### LocationKnowledgePanelV2（desktop/src/renderer/components/world/LocationKnowledgePanelV2.tsx）

- 重排为 app 暗色主题；profile sections 与 relations 用列表/表格展示（当前白底半成品）。

### 后端

- map-point / organization 详情接口：在返回中附加关联章节标题、关联角色名映射，供前端直接展示。

## 数据与接口变更汇总

| 变更 | 类型 |
|---|---|
| 新增表 `character_profile_changes` | migration |
| 新增 `/characters/:id/profile-changes` GET/POST/PUT/DELETE | API |
| map-point/org 详情返回关联名字映射 | API 增强 |
| 世界观落库 `mergeText` 职责边界 | 服务端逻辑 |
| 短篇章纲 prompt + assessChapter 加严 | 服务端 prompt |
| 长篇大纲模板爽点/热血/跨章弧 | 服务端 prompt |

## 实施顺序与验证

1. 通用列表渲染 helper（`splitToLines`）+ 暗色主题基础组件。
2. 区域一世界观（前端 + 生成侧）。
3. 区域三角色（合并视图 + 变动历史表/接口 + getWritingSummary 重构）。
4. 区域四地点势力（富展示 + 名字解析）。
5. 区域二大纲（生成 prompt + 节奏 + OutlinePage 摘要）。

验证：
- 构建：`desktop` renderer build 通过；`server` tsc 通过。
- 已有 acceptance spec（creation-pipeline / long-novel-configured-plan）不回归。
- 手测：打开一个已有 short_story 项目，核对 4 页面展示与交互。
