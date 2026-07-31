# 世界观模块重建 + 布局自适应 + 文件整理（2026-07-31）

## 背景与目标

平台核心设定与世界观此前已合并为一个模块，现在统一改名为「世界观」。以《两百万字小说创作全流程指南.docx》为模块基准，《这个游戏太真实了》长篇内容为载体（不省略），并按不同小说可适当添加字段。同时重排模块页面布局、清理历史版本文件。角色状态（含草稿、标签区分、随剧情更新）功能**保留不动**。

## 一、世界观模块重建

### 1.1 术语改名：核心设定 → 世界观（全面）

替换范围（用户可见文字 + 代码注释 + 字符串）：
- 前端：[WorldPage.tsx](desktop/src/renderer/pages/WorldPage.tsx)、[WorldSimpleView.tsx](desktop/src/renderer/components/world/WorldSimpleView.tsx)、[LayoutKit.tsx](desktop/src/renderer/components/common/LayoutKit.tsx)、[OutlinePage.tsx](desktop/src/renderer/pages/OutlinePage.tsx) 中所有把「核心设定」当模块名使用的地方。
- 服务端：[world-setting.service.ts](server/src/modules/world-setting/world-setting.service.ts)（摘要标题「核心设定写作摘要」→「世界观写作摘要」）、[chain-template.service.ts](server/src/chain/chain-template.service.ts)（节点名「核心设定+世界观生成」→「世界观生成」）、[prompt-registry.service.ts](server/src/chain/prompt-registry.service.ts)（「模块一：核心设定」→「模块一：故事核心设定」）、[state-item.service.ts](server/src/state/state-item.service.ts)（「违背核心设定」→「违背世界观」）。

保留不改：
- 短篇《短故事三步骤》的「故事核心设定」区块（短篇大纲固定结构）。
- 迁移文件注释、数据库列名（world_system_profiles 已是 world）、接口路径（/world-settings）。
- 链上内部键名 `coreSetting`/`worldview`（语义不同：故事核心 vs 世界观；兼容已持久化数据，仅改术语层）。

### 1.2 字段结构：指南为主 + 真实小说为辅 + 按小说添加

新增 3 列（迁移 `047_world_profile_guide_fields`）：`economy_system`、`factions`、`custom_settings`(JSON)。

| 分组 | 字段 | 依据 |
|---|---|---|
| 作品地基 | synopsis 作品简介, basic_info 基本信息, scale_plan 全文规模, ending 结局设定 | 真实小说（附加） |
| 历史背景 | era 时代/时间线/历史背景 | 指南 |
| 世界地理 | locations 地点/大陆分布 | 指南 |
| 社会结构 | social_structure 阶级/政治/经济资源/宗教 | 指南 |
| 经济体系 ★ | economy_system 货币/贸易/产业 | 指南补齐 |
| 力量与科技体系 | tech_supernatural 力量/科技/超自然, system_mechanics 系统机制/金手指 | 指南+真实小说 |
| 文化特色 | atmosphere_tone 氛围基调, culture_customs 文化风俗/节日/禁忌, naming_rules 命名规则 | 指南 |
| 势力分布 ★ | factions 主要势力 | 指南补齐 |
| 核心规则 | rules 世界运行规则, hierarchy_rules 核心层级规则 | 真实小说（附加） |
| 补充与自定义 | supplementary 补充说明, custom_settings 自定义设定(键值) ★ | 按小说添加 |

同步更新：DTO、`WORLD_PROFILE_FIELDS`、world-setting.service、UI 分组、写作摘要、测试。

### 1.3 长篇内容承载 + 生成不截断

- 保存/加载：SQLite TEXT 无长度上限，textareas 不设 maxLength；验收：导入《这个游戏太真实了》01-核心设定.txt 后完整回读。
- 生成上下文：复核验收审查提示词的截断（storyContext 14000 / outlineContract 12000）是否漏掉关键世界规则；RAG 分层分块 + 写作摘要兜底。
- 世界规则写入写作摘要与正文上下文（现有 buildWritingSummary + context-injector，作为验收项）。

### 1.4 短篇大纲格式 + 爽点/热点

- 短篇大纲按《短故事三步骤》三阶段结构对齐（题材 → 故事核心设定/人物关系表/章节结构/递进反转表/伏笔回收表 → 天龙8步法正文）；大纲页短篇模式（shortStoryFlow）与之一致，缺环节补齐。
- 长短篇生成提示词强化：长篇补充「热点元素/读者偏好」，短篇题材生成强化「社会热点/爆点」。

## 二、模块页面布局自适应

扩展 [LayoutKit.tsx](desktop/src/renderer/components/common/LayoutKit.tsx)：
- `AutoTextarea`：内容自适应高度（`field-sizing: content` 或 ref+useLayoutEffect）。
- `ClampSidebar`：`clamp(220px, 22vw, 320px)` 响应式侧栏。
- `ModalBox`：`width: min(Npx, 95vw)` 保护。

应用到 6 个页面（替换固定宽度侧栏/网格、统一容器、内容驱动折叠）：
- 角色 CharacterPage（侧栏 300→clamp；heroInfoTruncated 320 上限调整）
- 时间线 TimelinePage（300→clamp）
- 组织/地点 OrganizationMapPage（260→clamp）
- 大纲 OutlinePage（treePanel/shortListPane 260→clamp；headerMessage 截断调整）
- 短篇世界观 WorldSimpleView（maxWidth 800→PageShell；7 维度双列→auto-fit）
- 长篇世界观 WorldPage（分组折叠 + 大字段全宽编辑）

## 三、文件与代码整理

### 3.1 删除（已确认）
| 文件 | 说明 |
|---|---|
| `~$万字小说创作全流程指南.docx` | Word 锁文件 |
| `/nul`、`server/nul` | Windows 残留 |
| `output/doc/` 两个指南备份 docx | 历史备份 |
| `tmp/docs/update_novel_guide.py` | 一次性脚本 |
| `server/projects/db15b585-…/chapters/vol-001-ch-001.md`、`vol-001-ch-002.md` | 旧 file-storage 产物（当前存于 server/data/projects） |
| `server/data/novel.db.c.db`、`.cc.db`、`.chk.db`、`.chk2.db`、`.t`、`vectors.db.t`、`state.db.t`、`novelai.db*` | DB 备份/临时副本 |
| `这个游戏太真实了/AAA/imports/01-核心设定.txt` | 根目录正本重复 |
| `docs/superpowers/specs/2026-07-16*`、`2026-07-17*`（3 个） | 历史设计规格 |
| `docs/phase-5/6/7/8-*.md`（8 个）+ `第X阶段-实施说明`（4 个）+ `第2步代码分析` | 历史 AI 文档（关键验收已固化为测试，git 可回溯） |

### 3.2 清理引用（保留源码）
- 删除死代码 [WorldTabView.tsx](desktop/src/renderer/components/world/WorldTabView.tsx)（918 行，无页面使用）+ 移除 WorldPage 未用 import。
- 已删除页面（StateCenterPage/StatePage/ContinuityCockpitPage）残留引用核对（已查无引用）。

### 3.3 保留（不动）
- `魂穿北洋，领众破局/` 整个文件夹。
- 数据库迁移 `server/src/database/migrations/0XX_*.ts`（47 个）全部保留，本次仅追加迁移 047。
- `这个游戏太真实了/01-09*.txt`、模板、插件使用指南。
- `.workbuddy/`、`.agents/`、`.codebuddy/`、`.novel-assistant/`、`.waqu-project/`、`data/material-vectors/`（外部工具状态）。
- `docs/` 保留：终版需求文档、RAG 状态管理规范、全局写作质量与状态规则；`server/docs/`、`progress.md`、`findings.md`、`task_plan.md`、`平台完整性审计报告.md`、`短故事三步骤.md`、指南 docx。

## 四、验收标准

1. 平台内不再出现把「核心设定」当模块名的用户可见文字（短篇「故事核心设定」除外）；类型检查与测试通过。
2. 世界观页出现经济体系/势力分布/自定义设定，保存后正确读写；旧数据不丢失（迁移幂等）。
3. 导入《这个游戏太真实了》01-核心设定.txt 内容完整回读；写作上下文含关键规则不省略。
4. 6 个页面在 800–1700px 窗口无横向溢出、侧栏自适应、textarea 随内容增高。
5. 删除清单全部执行且 `git status` 干净（除有意改动）；魂穿北洋与迁移文件原样保留。
6. 角色状态功能（草稿/标签/状态时间线）测试不受影响。

## 五、风险与回滚

- DB 备份删除后不可恢复 → 删除前先 `git` 之外再确认；本次删除的 DB 副本均为 07-28 前的历史副本，主库 novel.db 不受影响。
- 迁移 047 为纯 ADD COLUMN，幂等；执行失败可跳过不破坏旧数据。
- 布局改动纯样式，不触及数据；回归以桌面生产构建 + 现有测试为准。
