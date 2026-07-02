# 写作流程 Bug 修复报告

## 修复日期
2026-06-27

## 主要问题修复

### 1. ✅ FailoverService 超时配置修复
**问题**：默认超时是 30 秒，可能导致超时叠加爆炸
**修复**：
- 文件：`server/src/routing/failover.service.ts`
- 修改：将默认超时从 `30_000` (30秒) 改为 `60_000` (60秒)
- 理由：与前端超时对齐，避免超时叠加

### 2. ✅ real-llm.service.ts 超时传递修复
**问题**：默认超时是 120 秒，太长
**修复**：
- 文件：`server/src/chain/real-llm.service.ts`
- 修改：
  - `generate()` 方法中的 `callTimeout` 默认值从 `120_000` 改为 `60_000`
  - `callOpenAICompatible()` 方法中的 `timeout` 默认值从 `120_000` 改为 `60_000`
  - `callClaude()` 方法中的 `timeoutMs` 默认值从 `120_000` 改为 `60_000`
- 理由：确保超时配置一致性，避免超时叠加

### 3. ✅ syncDraftAndPendingState 并行执行优化
**问题**：状态同步步骤串行执行，导致创作卡顿
**修复**：
- 文件：`desktop/src/renderer/pages/WritingPage.tsx`
- 修改：将步骤2（状态提取）和步骤3（归档）改为使用 `Promise.allSettled()` 并行执行
- 理由：减少等待时间，避免创作卡顿

### 4. ✅ 移除硬编码模型名称
**问题**：`chain.controller.ts` 中有大量硬编码的模型名称（如 `model: 'deepseek'`），这些参数实际上被 `real-llm.service.ts` 忽略（模型选择基于 scenario），但容易造成混淆
**修复**：
- 文件：`server/src/chain/chain.controller.ts`
- 修改：移除了多个 `realLLM.generate()` 调用中的硬编码 `model:` 参数
- 理由：确保模型路由引擎完全根据配置和场景来选择模型，遵循主公的要求"AI模型调用根据配置的模型和版本去调用"

## 剩余问题

### 其他文件中的硬编码模型名称
以下文件中仍有硬编码模型名称，但主要是测试文件或 fallback 配置：
- `chain.controller.spec.ts` - 测试文件
- `failover.service.ts` - fallback 链配置（可接受）
- `routing.controller.ts` - 环境配置示例
- `state-extraction.service.ts` - 可能需要进一步修复

### 建议
1. 考虑从 `LLMRequest` 接口中移除 `model` 字段，因为它不被使用
2. 继续清理其他文件中的硬编码模型名称
3. 添加集成测试以验证模型路由是否按配置工作

## 测试建议

修复后，建议进行以下测试：
1. **网络超时测试**：模拟慢速网络，验证超时配置是否生效
2. **创作卡顿测试**：生成大章节，观察状态同步是否平行执行
3. **模型路由测试**：配置不同的模型和场景，验证是否按配置选择模型
4. **端到端测试**：完整测试写作流程（生成 → 保存 → 状态同步 → 归档）

## 总结

本次修复主要解决了写作流程中的网络超时和创作卡顿问题，并确保 AI 模型调用根据配置而不是硬编码。主要修改集中在后端超时配置优化和前端并行执行改进。
