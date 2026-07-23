# 修复进度

## 2026-07-23

- [completed] Closed a second body-save bypass in `/chain/generate`: Tianlong output no longer writes `chapters` or archives derived data directly. It returns verified prose with `requiresCanonicalSave`, and the chapter API remains responsible for snapshots plus summary/RAG/foreshadowing/timeline synchronization.
- [completed] Removed the generic-prompt body fallback from `/chain/generate`; invalid canonical context now fails with 409 rather than producing unrelated prose.
- [completed] Rewired the style-writing page from chapter generation to `/chain/style-mix`. It now requires supplied source text, performs a rewrite only, and never substitutes a sample story when input is empty.
- [completed] Current verification: server typecheck, all unit tests, acceptance tests and production build passed; desktop typecheck, 4/4 tests and production build passed. No live DeepSeek generation was claimed or performed.

## 2026-07-20

- [completed] 修复正文连续性实际链路：流式天龙正文此前错误地把上一章结尾固定为空、只传入旧章标题，且漏传角色/世界观/地点写作约束，导致正文可与确认故事割裂。现在从已保存正文建立连续章节账本，传入前文末段和已发生内容；中间任一前置章节缺正文或序号不连续时以 409 阻止跳章生成。非流式生成入口也使用同一账本且上下文构建失败时明确停止，不再吞错降级。短篇世界观初始改为只读，须点“编辑世界观”才可改动，保存后回到只读。

- [completed] 全流程回归审计：移除服务端启动脚本中会杀死 3100–3110 进程的旧逻辑；服务端不再在端口冲突时悄悄切换到 3101+，而是明确说明已有服务正在运行。桌面端保持只连接现有服务。删除未持久化的 `/chain/version/*` 内存版本接口及服务，文档改为真实正文版本接口。修复大纲移动节点测试对真实排序实现的覆盖，并修复新闻素材、对白风格工具吞掉请求失败或错误读取响应的问题。

- [completed] 修复作者核验入口：修改记录页不再要求输入章节 UUID，也不再调用内存版 `/chain/version/*` 接口；现在从项目章节列表选择目标，并读取 SQLite 中由正文保存、送审和锁定创建的真实快照。可阅读当前正文与任一历史正文，恢复前保留当前快照并回写后续同步结果。正文开头若声明的章节号与该正文当前归属不一致，会明确提示旧内容错位并提供修改记录入口，绝不自动篡改正文。
- [completed] 修复“内容变化确认”对作者暴露内部键的问题：`outline:missing_requirement:<uuid>` 等内部记录改为可读的核对事项；无原文证据时明确提示不能据此确稿，不再把 UUID 当作内容展示。具有来源章节的记录现在可直接打开当前正文与真实修改记录，供作者核验。

- [completed] Fixed AI body-generation feedback and handoff: the writing drawer now shows persistent validation, server-node progress, saving/syncing, success, and failure messages; it rejects empty generation results without changing the existing prose. Streamed generation now applies the same 3200–4000-word and dynamic-outline-target gate before returning success. The editor receives generated prose immediately, while the existing save-and-derived-data sync flow remains authoritative and reports persistence failures visibly. Desktop production build, desktop TypeScript, server TypeScript, and 32 focused chapter/chain tests passed.

- [completed] Writing is now read-only with respect to chapter structure: the writing page no longer creates chapters, volumes, or renames chapters. Outline management is the single source of truth. Inserting or splitting an outline chapter preserves the existing body by `outline_id`, renumbers the body to the new outline index, and shifts chapter-number references atomically. Acceptance coverage verifies that an authored chapter 3 becomes chapter 4 with its content unchanged.

- [completed] 修复首页与正文编辑链路：恢复诊断不再把任意已有正文标称为作者亲改；首页提供“查看已保留正文”入口。真实项目“小说家的牢笼”第 1 章确认是草稿且正文长度 1975 字（统计字数 1794），不是默认锁定。
- [completed] Monaco 在桌面运行时无法加载超过 2.5 秒会自动切换为本地正文编辑框，不再无限显示“编辑器加载中”。章节送审调用真实 `/review` 接口；锁定会先送审并由服务端连续性门禁决定；请求失败不再静默吞掉，而是反馈给作者。“生成下一章”会选择下一可写章节并打开写作面板。
- [completed] 桌面生产构建通过；构建产生的 `desktop/dist` 与 `desktop/dist-electron` 已作为已确认的生成物清理，未触及 Electron 配置、迁移、源码或测试。

- [completed] 修复正文生成生命周期：抽屉关闭/重开不再丢失同一章节的生成中状态；前端在请求开始（含流程守卫检查阶段）即按项目+章节占用任务，终态、传输错误和未返回完成事件都会释放占用并显示真实失败；服务端 `/chain/generate` 与 `/chain/stream-generate` 同样按项目+章节互斥，重复请求返回 409，避免写入竞争。

- 新增“日常模型”路由：当前写作模式下未在设置中单独指定的 AI 任务统一使用日常模型；指定任务模型优先。设置持久化在既有场景模型配置中，未设置时保留原有路由。
- 修复写作页误报动态目标字数：章节列表和分卷列表此前遗漏关联大纲的 `targetWords`，导致有正文的缓存章节不再请求详情而显示错误提示；现在返回真实大纲目标，不用固定值替代。
- 复现并定位 DeepSeek 请求的重复 `Connection error`：DNS 与 TCP 443 可达，但服务端 Node HTTPS 到 `api.deepseek.com/v1/models` 在 15 秒后收到 `ECONNRESET: socket hang up`；这不是组织/地点生成逻辑、模型名或本地 3100 端口造成的。
- 保持“仅用户配置模型”约束，为 OpenAI 兼容的普通与流式调用启用 SDK 同路由传输重试（2 次），外层仍保留流程级重试；不切换供应商、不伪造生成结果。失败日志新增不含密钥的底层错误码与 cause，供定位出口网络/TLS/代理重置。
- 服务端 TypeScript 检查通过；`real-llm.structured-output` 与 `chain.controller.helpers` 共 16 项测试通过。

## 2026-07-22

- [completed] 修复正文与详细大纲脱节的生成链：八步法第2至第8步和最终合成均携带同一份本章大纲及确认故事上下文；第9步补齐此前遗漏的目标、诱因、阻碍和误判，不再只用行动/反转/代价/钩子自行拼出另一段故事。最终合成与补写提示均把本章“不可偏离的创作合同”置于正文输入之前。
- [completed] 在普通生成、流式生成和长篇直写入口加入保存前的真实结构化大纲一致性审查。审查要求核心事件、冲突、人物行动、结尾钩子以及世界观/时间线均被正文实际兑现；模型审查失败、返回无效结构或连接失败时均返回明确错误且不写入正文。现有错位正文不会被自动覆盖。
- [completed] 服务端 TypeScript 检查通过；全量服务端单元测试 336/336 通过；新增一致性与质检门槛回归，覆盖通过、不符合大纲拒绝、审查模型不可用拒绝、仅有 pass 而缺少完整质检结论拒绝。未发现本次测试产生的可删除构建产物。
- [completed] 正文写入前质检扩展为六项明确结论：大纲兑现、前后连续、人物一致、世界观一致、时间线一致、叙事质量。任一结论缺失、为否、模型连接失败或结构化结果无效，均拒绝保存；角色/世界观/地点的高风险硬冲突也会在写入前阻止。流式面板收到通过事件后会明确显示质检范围和证据；不再把质检模型失败伪造成 70 分通过。服务端新增“仅 pass 但缺少六项结论也拒绝”的回归，链路辅助测试 16/16、服务端类型检查、桌面端类型检查与桌面测试 4/4 通过。

## 2026-07-17

- 修复动态目标字数、失败恢复、数据库迁移、桌面启动和接口错误。
- 建立统一创作简报和跨模块语义审核。
- 清理创作界面技术术语并重新打包。
- 服务端 313 项测试通过，桌面端构建和 Windows 打包通过。

## 2026-07-18

- 继续执行既有设计，不重复确认。
- 建立持久化计划文件。
- 恢复流程增加生成前快照与失败回滚；恢复失败不再清空旧资料。
- 作者手动修改并留存版本的创作资料会阻止自动清理。
- 修正 ProjectStatus 缺失 creating/generation_failed 导致的桌面编译失败。
- 服务端常规回归 315/315 通过；6 个真实 SQLite 验收文件、9 个场景全部通过。
- 修正 3 个验收测试误用简化 SQLite 假实现的问题，确保验收真正运行原生 SQLite。
- 桌面生产构建通过，下一步重启真实服务并验证接口、项目进入与重新打包。
- 最新后端真实启动成功，健康检查为 ok；写作模型可用，Embedding 明确不可用。
- 再次生成在缺少 Embedding 时返回 409，且恢复前后所有旧资料数量完全一致，没有先清空再失败。
- 首页、世界观、角色、大纲、伏笔、时间线接口均可读取；时间线真实为空。
- 桌面实测发现并修复大纲页直接显示原始 JSON 和 [object Object] 的问题。
- 修正诊断进程把桌面 API 端口临时写成 3101 的问题，最终构建确认读取 3100。
- Windows 安装包重新打包并用 win-unpacked 实际启动、进入项目和大纲页复验。
- 世界观页移除“补全/RAG”式技术说明，改为按本书需要填写、无关可留空。
- 全书脉络将本地临时内容改称“写作前临时备忘”，不再冒充会同步的人工微调。
- 创作工具将“风格向量/每日校验”等技术名改为“文风分析/创作资料检查”，并停止直接展示原始 JSON。
- 伏笔详情改为中文类型、风险等级和关联人数，不再向作者展示内部角色 ID。
- 首页与短篇世界观增加对象可读化，避免 JSON 或 [object Object] 泄漏到界面。
- 接入本地 bge-small-zh-v1.5 qint8：真实语义测试与打包运行时推理均输出 512 维有限非零向量。
- 修复所有生成文本写入 SQLite 前的标量边界，模型返回对象/数组时不再触发 `Provided value cannot be bound`。
- 修复嵌套 JSON 完整提取，新增 8 项链路辅助回归测试。
- 逐章规划增加全书职责分工、全部前文事实账本、逐章连续性审查和最多三轮修复。
- 角色生成兼容 `characters/items` 包装；伏笔改用稳定对象包装，仍严格要求真实章纲证据与回收结果。
- 构建独立桌面后端运行时：303 个生产依赖、内置 Node 22+、本地向量模型，共 431.6 MB；隔离端口启动和真实向量推理通过。
- 桌面主进程不再要求用户手动启动 server；会启动内置后端，并把数据库写入用户数据目录。
- Windows NSIS 安装包已生成；待最新后端恢复链路完成后重新打最终包并执行无外部服务冷启动。
- 真实恢复项目《致命道歉单》最终成功：8 章大纲与章节壳、10 个角色、1 套世界观、4 个组织、12 个地点、6 条伏笔、1 条时间线和 8 个事件均通过激活门禁。
- 8 章动态目标为 3350–3800 字，合计严格等于项目配置 28000 字，没有固定平均分配或改写配置。
- RAG 实际写入 24 个 512 维有限非零向量：人物 10、大纲 8、伏笔 6；本地模型与向量库健康检查均通过。
- 项目从 outline 正常推进到 writing，流程守卫允许正文生成与续写；项目、各资料模块、连续性、同步状态接口全部返回 200。
- 最终全量测试：服务端 320/320、验收 10/10、桌面 4/4，桌面类型检查通过。
- 修复模型常见未转义换行/引号等 JSON 语法错误；语法恢复后仍执行完整字段和事实连续性校验，不把残缺内容当成功。
- 已确认灵感包含完整冲突/反转/结局/阶段拆分时，故事卡直接从确认数据构建，避免模型新增父子、收养等关系。
- 最终桌面运行时包含 304 个生产依赖、内置 Node 与本地模型，共 432.2 MB；无开发服务时可自行启动后端。
- 最终 NSIS 安装包于 2026-07-18 15:32 重新生成；Playwright 实测首页、灵感配置首步、错误反馈、项目进入和 10 个核心创作模块。
- 删除全书脉络中的 7.0/7.1/“本轮实现”内部路线文字及“连续性 API”术语；最终包复验不存在这些文字且无横向溢出。
- 2026-07-18 最终修复：结构化调用启用模型 JSON 模式，识别 `finish_reason=length`，按场景与实际章节数传递动态 `maxTokens`；伏笔不再被 4096 token 截断。
- 实际失败项目《第七具尸体眨了眼》恢复成功：动态规划 8 章，目标字数合计 32000；6 个角色、1 套世界观、2 个组织、2 个地点、8 条伏笔、1 条时间线及 8 个事件全部通过激活门禁。
- 跨模块审查发现实验室专名与断臂年份矛盾后，不再虚假激活；新增白名单最小修订与二次严格审查，未通过仍回滚并保持 `generation_failed`。
- RAG 实际写入 22 个有效 512 维向量：角色 6、大纲 8、伏笔 8；无零向量、缺失模块或一致性问题。
- 最终回归：服务端 324/324、验收 10/10、桌面 4/4、端到端 35/35，桌面类型检查与生产构建通过。
- 修复创建末段一致性修订的空值访问：审查与二次审查均要求完整结构；修订未返回有效 `patches` 时保留 `generation_failed` 并返回明确诊断，不再读取 null.patches。修订输出预算按矛盾数量在 8192–16384 之间动态分配，避免完整字段被固定 4096 tokens 截断。
- 灵感发现的 DeepSeek 连接会偶发被远端关闭；已确认密钥鉴权、`/models` 与 `deepseek-v4-flash` 均有效。首次生成、同模型重试和结构修复均增加 1 秒间隔的同配置传输重试；所有重试失败仍返回真实连接错误，不生成降级题材。
- 最终 NSIS 安装包于 2026-07-18 17:09 生成，大小 205,582,751 字节；`win-unpacked` 冷启动后数据库和向量库均为 `ok`，项目创建/读取/删除流程通过，退出后内置服务同步关闭。
