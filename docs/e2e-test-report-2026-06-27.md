# 端到端测试报告 - 2026-06-27

## 修复摘要

### 1. ✅ 桌面端 Tab 切换问题修复
**问题**：切换到设置页面后，侧边栏消失，无法返回项目页面

**根源**：
- `AppLayout` 组件中，`isInProject` 判断为 `Boolean(currentProject) && location.pathname.startsWith('/project/')`
- 当 URL 为 `/settings` 时，`location.pathname` 不以 `/project/` 开头
- 导致侧边栏不显示，用户无法返回项目

**修复方案**：
- 修改 `AppLayout` 逻辑：只要 `currentProject` 存在，就显示侧边栏
- 修改文件：`desktop/src/renderer/components/layout/AppLayout.tsx`
- 将 `isInProject` 改为 `hasProject = Boolean(currentProject)`
- 侧边栏在有打开的项目时始终显示

**预期效果**：
- 用户切换到设置页面后，侧边栏仍然显示
- 可以点击侧边栏中的tab（首页、写作、大纲等）返回项目页面

---

### 2. ✅ 网络超时时间延长
**问题**：用户反馈 60 秒超时太短，动不动就显示网络超时

**修复内容**：
1. **前端 API 超时**：60秒 → 120秒（2分钟）
   - 文件：`desktop/src/renderer/lib/api.ts`
   - 修改：`timeoutMs: number = 60_000` → `timeoutMs: number = 120_000`

2. **后端 Failover 超时**：60秒 → 120秒
   - 文件：`server/src/routing/failover.service.ts`
   - 修改：`this.timeoutMs = ... || 60_000` → `this.timeoutMs = ... || 120_000`

3. **后端 RealLLM 超时**：60秒 → 120秒
   - 文件：`server/src/chain/real-llm.service.ts`
   - 修改：`const callTimeout = request.timeout || 60_000` → `const callTimeout = request.timeout || 120_000`

**预期效果**：
- 普通 API 请求超时时间延长到 2分钟
- SSE 流式请求超时时间保持 10分钟（600秒）
- 减少因网络波动或 AI 生成慢导致的超时错误

---

### 3. ✅ AI 模型调用配置修复
**问题**：`chain.controller.ts` 中有大量硬编码的模型名称（如 `model: 'deepseek'`），导致模型路由引擎无法根据配置动态选择模型

**修复内容**：
- 移除 `chain.controller.ts` 中所有硬编码的 `model: 'xxx'` 参数
- 让模型路由引擎完全根据配置和场景（`scenario`）来选择模型
- 遵循用户要求："AI模型调用根据配置的模型和版本去调用"

**预期效果**：
- 系统完全根据 `model-router.service.ts` 的配置来选择模型
- 支持用户自定义模型配置（通过 `route-config.json` 或环境变量）
- 不同场景（写作、质量检查、状态提取等）可以使用不同的模型

---

## 端到端测试步骤

### 测试环境准备
1. 启动后端服务：
   ```bash
   cd D:/code/novel/novel-ai-platform/server
   npm run start:dev
   ```

2. 启动桌面应用：
   ```bash
   cd D:/code/novel/novel-ai-platform/desktop
   npm run electron:dev
   ```

---

### 测试用例 1：Tab 切换功能
**目标**：验证切换到设置页面后，侧边栏不消失，且可以返回项目页面

**步骤**：
1. 打开桌面应用
2. 创建一个新项目（或打开已有项目）
3. 在项目内部，点击左侧侧边栏的"写作"tab
4. 点击 Header 中的"设置"按钮（齿轮图标）
5. **验证**：设置页面打开后，左侧侧边栏仍然显示
6. 点击侧边栏中的"首页"tab
7. **验证**：成功返回项目首页
8. 重复测试其他tab（大纲、角色、世界观等）

**预期结果**：✅ 侧边栏始终显示，tab 切换正常

---

### 测试用例 2：网络超时
**目标**：验证延长后的超时时间是否足够

**步骤**：
1. 打开一个项目
2. 进入"写作"页面
3. 生成一个较长章节（>2000字）
4. **观察**：是否会出现"网络超时"错误
5. 如果仍然超时，检查后端日志，确认超时时间是否为 120秒

**预期结果**：✅ 2分钟内完成的生成请求不再超时

---

### 测试用例 3：AI 模型调用配置
**目标**：验证模型调用完全根据配置，没有硬编码

**步骤**：
1. 修改 `server/src/routing/route-config.json`，将某个场景的模型改为其他模型
2. 重启后端服务
3. 触发该场景的 AI 调用（如写作生成）
4. 检查后端日志，确认使用了配置的模型

**预期结果**：✅ 模型调用完全根据配置文件，没有硬编码默认值

---

### 测试用例 4：创作卡顿修复验证
**目标**：验证 `syncDraftAndPendingState` 并行执行是否减少卡顿

**步骤**：
1. 打开一个项目
2. 生成一个章节
3. 保存章节
4. **观察**：状态同步（提取状态、归档）是否并行执行，不再卡顿

**预期结果**：✅ 状态同步并行执行，创作流程更流畅

---

## 已知问题和改进建议

### 1. 超时时间可能仍需调整
- 当前设置为 120秒（2分钟）
- 如果生成特别长的章节（>5000字），可能仍需更长时间
- **建议**：根据实际使用反馈，进一步调整超时时间或实现更好的进度反馈机制

### 2. 编译错误已修复
- `chain.controller.ts` 第 3801 行语法错误已修复
- `failover.service.ts` 第 251 行 `timeoutOverride` 未定义错误已修复
- 前端和后端代码均编译成功

---

## 总结
本次修复解决了 3 个主要问题：
1. ✅ 桌面端 Tab 切换问题（侧边栏消失）
2. ✅ 网络超时时间太短（60秒 → 120秒）
3. ✅ AI 模型调用硬编码（完全根据配置）

所有代码已编译通过，可以进行端到端测试。
