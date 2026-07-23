# 小说平台持续修复计划

## 2026-07-23 章节生成收口

- [completed] Eliminate the legacy generic body-generation fallback. A body request now requires its selected chapter's confirmed detailed outline and always returns through the same quality gate.
- [completed] Make the chapter save endpoint the sole persistence owner after generation so snapshots and all derived-data synchronization cannot be bypassed.
- [completed] Repair the style-writing page as a paragraph rewriting tool instead of allowing it to call the chapter-generation endpoint without chapter context.

## 目标

依据已确认设计和《两百万字小说创作全流程指南》，以真实桌面端、接口和数据库结果验证长短篇持续创作流程；不使用假向量、不虚报完成，不固定卷章数量，章节目标保持 3200–4000 字。

## 当前阶段

1. [completed] 统一已确认故事上下文，阻止模块各自另起故事
2. [completed] 失败项目恢复、动态字数、可选组织/地点/伏笔与作者界面清理
3. [completed] 隔离失败生成的污染内容，完善时间线与恢复验收
4. [completed] 增加跨模块回归测试和真实桌面流程检查
5. [completed] 用本地中文 Embedding 完成失败恢复、RAG、激活、进入写作全流程
6. [completed] 打包自带 Node 22+、生产后端依赖与本地向量模型的独立桌面端并做冷启动验收

## 不可违背的约束

- 用户配置必须实际执行，不擅自降级或改写。
- 章节数、卷数按内容与目标字数动态规划；每章 3200–4000 字。
- 生成失败的内容不得作为权威事实进入后续创作。
- 组织、地点、伏笔按剧情需要允许为空。
- 缺少真实 Embedding 时明确阻断，不清空作者内容，不假装索引成功。

## 已知外部阻断

- 无。真实恢复、激活、模块接口、RAG、进入正文、桌面冷启动和最终安装包均已验收。

## 2026-07-18 最终验收

- [completed] 结构化 JSON 模式、动态 token、截断诊断和严格失败语义。
- [completed] 跨模块矛盾最小修订、白名单写入与二次一致性审查。
- [completed] 实际失败项目恢复：8 章 / 32000 字计划、全部创作资料、时间线和 RAG 同步激活。
- [completed] 324 项单元测试、10 项验收测试、4 项桌面测试、35 项端到端测试。
- [completed] 205,582,751 字节 Windows 安装包、独立运行时冷启动、健康检查与项目 CRUD。

## 错误记录

| 问题 | 结果 |
|---|---|
| 桌面端曾连接旧后端 | 已替换为最新编译后端 |
| 现实题材生成成末世设定 | 已增加统一创作简报和语义审核 |
| 长篇强制每章伏笔 | 已改为按剧情需要可为空 |
| Embedding 保存不验证 | 已改为真实验证成功后保存 |
| 模型嵌套 JSON 被正则截断 | 已改为字符串与括号层级感知的完整 JSON 提取，并加回归测试 |
| 逐章生成重复行动/改变人物关系 | 已增加全书章节职责、全部前文账本、逐章连续性审查与最多三轮修复 |
| 模型返回未转义换行/引号导致 JSON 失败 | 已增加标准 JSON 语法修复层，修复后仍须通过结构与连续性门禁 |
| 故事卡擅自新增人物关系 | 优先从已确认灵感确定性构建故事卡，不再允许模型改写基础事实 |
| 全书脉络暴露开发编号和 API 术语 | 已从最终桌面包移除并改为作者可理解的创作说明 |
