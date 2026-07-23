# 关键发现

## 2026-07-23 生成与保存旁路审计

- `/chain/generate` previously performed its own SQL chapter update and post-write archive after the Tianlong quality gate. This skipped the ChapterService snapshot and canonical derived-data synchronization path even though the renderer then saved again. The direct write/archive has been removed.
- A generic fallback remained below the outline-bound branch. It was logically unreachable in the normal UI flow but unsafe if future edits weakened the guard. It now fails closed with HTTP 409.
- The multi-style page was calling `/chain/generate` without a chapter ID or canonical outline. It is now explicitly a supplied-text rewrite tool using `/chain/style-mix`; empty input is rejected locally instead of being replaced by sample prose.

## 2026-07-20 编辑器与章节操作

- “小说家的牢笼”第 1 章实际为 `draft`，正文 1975 字；旧恢复提示仅因正文存在就错误标为作者亲改。
- 送审按钮此前调用了不接收 `status` 的更新接口，且章节 store 吞掉失败，造成按钮无反馈。
- Monaco 未加载时必须提供可用的本地编辑回退，不能无限显示加载中。

## 2026-07-20：DeepSeek 连接重置的可复现证据

- `api.deepseek.com` 可解析，TCP 443 可建立；但在服务端 Node 运行时执行匿名 HTTPS 请求会在 15 秒后返回 `ECONNRESET: socket hang up`。
- 这与 Nest 日志中的 `DeepSeek API error: Connection error` 一致，说明请求在收到 HTTP 响应前被传输链路重置。错误发生在所有需要 LLM 的步骤之前，因此会表现为灵感、组织地点、伏笔、章纲等模块“都反复失败”。
- 当前环境没有配置 `HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 或 `NO_PROXY`。项目支持用户配置的兼容 API `baseUrl`；不能为了绕过网络问题自动切换端点或模型。

- 项目《致命道歉单》确认题材是现实企业犯罪与家庭伦理，主角李明；旧生成结果却包含末世纪年、赎罪城邦、真菌纸和秘密教团，证明原生成链路发生语义漂移。
- 当前数据库中该项目有 8 个章节大纲和 8 个正文空壳，动态目标合计 28000 字，映射正确；但没有时间线，人物/大纲/伏笔向量索引均为 0。
- 当前文本模型 DeepSeek 可用；已安装并实测本地 bge-small-zh-v1.5 qint8，真实输出 512 维非零向量，不依赖远程 Embedding Key。
- 恢复接口会在清理数据前检查 Embedding，并在失败时恢复生成前快照；多次真实门禁失败后原有资料均被还原，项目保持 generation_failed。
- 组织、地点和伏笔不应作为固定非空激活门槛，否则会诱导模型编造。
- 最新桌面包已隐藏内部枚举、Prompt Chain、自动教程弹窗，并使用作者可理解的导航名称。
- 指南正文 191 段、9 个提示词表；平台化补全部分明确要求事实库、长短篇分流、人工修改影响报告、版本/锁定、四类索引与失败可见。文档前半的“8卷/400章/每章5000字”属于示例模板，平台不得固化；用户要求的实际章节范围为 3200–4000 字。
- 原 JSON 抢救逻辑用非贪婪正则处理嵌套对象，会把合法 scenes/relationships 截断；现已使用括号栈提取完整对象。
- 原逐章上下文只保留上一章 180 字，无法约束重复行动和后续任务提前；现保留全部已确认章纲账本，并把全书章节职责传给每章。
- 仅靠提示模型修复错误故事卡会继续复制被指出的错误；完整确认灵感应成为确定性事实源，模型只扩写、不重定义。
- 模型可能返回字段齐全但含未转义换行/引号的类 JSON；标准语法修复层可恢复数据，但必须与结构校验、事实审查同时使用，不能视作内容降级。
- 最终真实项目已证明时间线、人物、世界观、组织地点、伏笔和 RAG 能在同一生成事务后统一落库并通过激活；失败运行则恢复快照，不虚假统一。
- 桌面端最终冷启动进程确为 `win-unpacked/resources/server/node.exe`，不是系统 Node 或开发服务；本地向量模型在该运行时可用。
- 核心作者界面巡检发现并删除了全书脉络中的内部开发路线；最终包对首页、灵感、工作台及大纲/角色/世界观/地点势力/伏笔/时间线/全书脉络/内容变化/矛盾/写作均完成导航验收。
- DeepSeek 的 OpenAI 兼容接口支持 `response_format: { type: "json_object" }`；只做提示词约束不足以保证结构化结果，且必须显式识别长度截断。
- 本次真实失败并非只有 JSON：第一次恢复在伏笔阶段因固定 4096 token 截断；修复后最终门禁又发现专名与人物历史矛盾。可靠流程必须同时覆盖语法、结构、长度、跨模块事实与最终数据库门禁。
- 失败恢复必须先快照、再清理、生成、审查、索引、激活；任一步失败都恢复快照并标记 `generation_failed`，否则会产生“接口成功但资料不统一”的虚假状态。
- 跨模块一致性修订同样属于激活门禁。模型未给出合格 `patches` 时，调用包装器会返回 null；调用方必须显式阻止写入并报告结构化失败，不能继续访问 `null.patches`。章节等完整字段的最小修订也不能固定限制为 4096 输出 tokens。
- 章节送审的正确流程是同步摘要/RAG/伏笔/时间线，无未决冲突时允许锁定；未决连续性条目或 `needs_resync` 才阻止锁定。旧端到端断言把正常成功路径误判为失败，已改为验证送审同步、锁定保护和解锁修订。
