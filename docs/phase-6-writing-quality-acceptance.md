# Phase 6.1 写作质量诊断与精修闭环 — 验收文档

## 1. 第六阶段目标

建设"写作质量诊断、问题定位、局部精修、验收回写"的闭环能力：
- 正文质量诊断引擎
- 质量问题结构化存储
- 质量问题定位到章节/段落/句子
- 局部精修建议与执行
- 精修前后 diff
- 精修后复查
- 质量记录页面
- 写作页面展示质量问题

## 2. 第六阶段与第五阶段边界

| 职责 | 归属 |
|------|------|
| 事实/角色/世界观/时间线/伏笔等长期状态 | 第五阶段 状态确稿中心 |
| 钩子/节奏/对话/AI味/信息密度/爽点/情绪回报 | 第六阶段 质量诊断中心 |
| 状态确稿 | 第五阶段 state_items |
| 质量记录 | 第六阶段 writing_quality_issues |
| locked 章节修改 | 禁止 |
| unlocked 章节局部精修 | 允许（保留 diff） |

## 3. 数据库表说明

### writing_quality_reports
质量诊断报告表，记录每次诊断的总体结果。

### writing_quality_issues
具体质量问题表，每个问题包含：
- 问题类型（复用 WRITING_QUALITY_TAGS）
- 严重程度
- 证据文本
- 修复建议
- 段落/句子定位

### writing_revision_records
局部精修记录表，记录每次修改的 before/after/diff。

## 4. API 列表

| Method | Path | Description |
|--------|------|-------------|
| POST | `/projects/:projectId/writing-quality/analyze` | 诊断章节质量 |
| GET | `/projects/:projectId/writing-quality/reports` | 查询报告列表 |
| GET | `/projects/:projectId/writing-quality/reports/:reportId` | 获取报告详情 |
| POST | `/projects/:projectId/writing-quality/issues/:issueId/resolve` | 标记问题已解决 |
| POST | `/projects/:projectId/writing-quality/issues/:issueId/refine` | 生成精修建议 |
| POST | `/projects/:projectId/writing-quality/revisions/:revisionId/apply` | 应用精修 |
| POST | `/projects/:projectId/writing-quality/revisions/:revisionId/recheck` | 复查精修结果 |

## 5. 前端页面入口

- **独立页面**: `/project/:id/writing-quality` — WritingQualityPage
- **写作页入口**: AiWritingPanel 质检 Tab 中 "📊 写作质量诊断中心" 按钮

## 6. 手动验收流程

### 6.1 数据库验收
1. 启动 server: `cd server && npm run start:dev`
2. 检查 data/novel.db 是否包含新表: `writing_quality_reports`, `writing_quality_issues`, `writing_revision_records`
3. 迁移应幂等：重启 server 不报错、不重复建表

### 6.2 质量诊断验收
1. 打开项目，进入写作页
2. 在质检 Tab 点击 "📊 写作质量诊断中心"
3. 选择一个章节，点击 "诊断当前章节"
4. 验证生成 quality report 和 issues
5. 验证 issueType 和 tags 使用 WRITING_QUALITY_TAGS
6. 查看报告列表和问题详情

### 6.3 locked 章节验收
1. 将章节状态设为 locked
2. 对该 locked 章节进行质量诊断
3. 可生成建议，但不能 apply
4. 前端显示 LOCKED 标识

### 6.4 局部精修验收
1. 对 unlocked 章节的问题点击 "生成精修建议"
2. 验证生成 before_text / after_text / diff
3. 点击 "应用精修到章节"
4. 验证章节内容局部替换成功
5. 验证 writing_revision_records 写入记录

### 6.5 diff 验收
1. 生成精修建议后
2. 查看 Before/After 对比
3. 验证 diff 正确显示修改内容

### 6.6 复查验收
1. 应用精修后
2. 自动触发 recheck（或手动调用）
3. 验证复查结果 pass/warning/fail
4. 验证剩余问题计数

## 7. 构建命令

```bash
# Server
cd server
npm run typecheck
npm run build

# Desktop
cd desktop
npm run typecheck
npm run build
```

## 8. 已知限制

- LLM 调用依赖 API Key 配置（DEEPSEEK_API_KEY 或 LLM_API_KEY）
- 质量诊断结果取决于 LLM 输出质量
- 暂不支持批量诊断
- 暂不支持定时自动诊断
- 复查目前基于简单规则（LLM 可选）

## 9. 验收检查清单

- [x] server npm run typecheck 通过
- [x] server npm run build 通过
- [x] desktop npm run typecheck 通过
- [x] desktop npm run build 通过
- [x] 迁移 018 可执行且幂等
- [x] writing_quality_reports 表创建成功
- [x] writing_quality_issues 表创建成功
- [x] writing_revision_records 表创建成功
- [x] POST /writing-quality/analyze 可生成报告
- [x] analyze 结果写入 writing_quality_reports
- [x] analyze 结果写入 writing_quality_issues
- [x] issueType 和 tags 使用 WRITING_QUALITY_TAGS
- [x] GET reports 可查询报告列表
- [x] GET report detail 可查询 issues
- [x] resolve issue 可更新状态
- [x] refine issue 可生成局部精修建议
- [x] locked 章节 refine 只能 suggest，不能 apply
- [x] unlocked 章节 applyRevision 可局部替换正文
- [x] applyRevision 不做全文覆盖
- [x] applyRevision 写入 writing_revision_records
- [x] applyRevision 后可以 recheck
- [x] WritingQualityPage 可以查看报告和 issues
- [x] WritingQualityPage 可以触发精修建议
- [x] WritingQualityPage 可以展示 diff
- [x] 写作页面有质量诊断入口
- [x] 不破坏状态确稿中心
- [x] 不破坏角色成长事件
- [x] 不破坏 Workflow Guard
- [x] 不破坏正文生成/续写/long-write
