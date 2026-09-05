# 小说质量闭环实施与验收

基线：2026-09-06 重新读取 origin/main，提交 f8f965c。

## 已接入的行为

- 项目配置通过 Creative Constitution 统一解析、校验、修订和持久化。旧字段仅作兼容投影；显式冲突输入返回错误，推荐平台不能替代用户选择。
- QualityIssue 统一阶段、严重度、状态、规则和原文证据。缺少有效评审证据时维度为 null，缺失维度不能形成通过的总分。
- 生成运行记录保存创作宪法及上下文快照、模型、耗时、状态和关联 token 数据。失败、取消和质量阻断均留痕。
- 世界观、角色、大纲、正文、精修在已识别生成入口经过多维评审。正文片段在合并后接受最终 Gate；生成期间配置或前序上下文改变时阻断。
- 文体检测保留原有扫描器，新增跨段开头、已知人物台词、最近十二章长句重复证据；正文语义评审增加最近三章材料。
- 自动修复只接受唯一匹配的局部替换，至多八处、涉及原文不超过 30%。复检不完整、出现新严重问题或任一已评估维度退步时回滚。
- 仅将通过复检的修复经验写入既有 generation_lessons，并供同项目后续生成读取。
- 写作质量页增加驾驶舱，显示维度与证据、问题、生成卡点、评分趋势、修复前后文本和接受/回滚原因。
- QualityInspectionService 删除随机评分、示例角色问题和示例伏笔；独立诊断接口明确返回未评估及原因。

## 验收范围

- 服务端构建、桌面端 typecheck。
- 创作宪法、QualityIssue、多维评分、Gate、文体证据和局部修复单元测试。
- 真实 SQLite 迁移及生成成功、失败、取消、修复接受、回滚、配置变更阻断与学习验收。
- 6 个 HTTP E2E 用例：项目增删改查、创作宪法往返及冲突拒绝、无证据诊断。
- 1 个浏览器用例：实际驾驶舱组件显示未评估、阻断和回滚状态，无页面错误。

可复验命令：

```powershell
# server 目录
npm run build
npx vitest run src/modules/project/creative-constitution.spec.ts src/modules/project/project.service.spec.ts src/modules/writing-quality/stage-score.spec.ts src/modules/writing-quality/quality-issue.spec.ts src/modules/writing-quality/local-repair.spec.ts src/modules/writing-quality/style-fingerprint.spec.ts src/modules/refinement/quality-inspection.service.spec.ts src/chain/quality-gate.service.spec.ts src/chain/real-llm.structured-output.spec.ts src/modules/writing-quality/writing-quality.supersede.spec.ts
npx vitest run --config vitest.acceptance.config.ts src/acceptance/creative-constitution.acceptance.spec.ts src/acceptance/generation-runs.acceptance.spec.ts src/acceptance/quality-repair.acceptance.spec.ts src/state/consistency-check.service.acceptance.spec.ts src/chain/long-novel-configured-plan.acceptance.spec.ts
$env:E2E_PORT='33193'
npx playwright test --config=e2e/playwright.config.ts creative-constitution quality-evidence project-crud
# desktop 目录
npm run typecheck
npx playwright test --config=e2e/quality.playwright.config.ts
```

## 验收边界

当前环境未配置模型密钥。数据库验收用固定模型结果验证控制流程，浏览器验收用接口夹具展示状态；它们不能证明真实小说文风或平台适配已经达标。

文体检测输出风险及引用，不表示 AI 生成概率。跨章比较有明确窗口，不能声称覆盖全书。项目分数目前汇总四个必需阶段最近一次运行；驾驶舱展示最近 100 次生成与 100 条未解决问题。旧作品不会凭空生成历史分数，已有别名数据在读取边界解析、更新时归一化。

新增数据库迁移为 002—004。历史检测器保持兼容输出，本轮没有删除全部旧接口；新质量报告通过统一模型收拢。尚需配置真实模型后，使用不同平台、长短篇和风格的实际作品验收误报率、漏报率、修复效果和评审成本。
