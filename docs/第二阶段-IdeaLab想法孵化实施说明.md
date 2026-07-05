# 第二阶段：Idea Lab 想法孵化实施说明

> 基于《小说Agent平台终版需求文档》和《小说Agent平台第2步代码分析与第一阶段实施方案》
>
> 版本：V1.0 | 日期：2026-07-05

---

## 一、Idea Lab 目的

Idea Lab（想法孵化）是「从想法开始」创建作品的中间流程。

用户输入一句模糊想法后，不直接创建项目，而是先进入 Idea Lab，通过 AI 追问、用户补充、AI 完善、成熟度评分，把模糊想法打磨成可创建项目的成熟设定，确认后再创建项目。

**核心价值：** 减少垃圾项目，提高项目创建时的设定完整度。

---

## 二、API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/v1/idea-lab/drafts` | 创建想法草稿 |
| `GET` | `/api/v1/idea-lab/drafts` | 获取所有草稿 |
| `GET` | `/api/v1/idea-lab/drafts/:id` | 获取草稿详情 |
| `POST` | `/api/v1/idea-lab/drafts/:id/questions` | AI 生成追问问题 |
| `PUT` | `/api/v1/idea-lab/drafts/:id/answers` | 保存用户回答 |
| `POST` | `/api/v1/idea-lab/drafts/:id/refine` | AI 完善想法并评分 |
| `POST` | `/api/v1/idea-lab/drafts/:id/confirm` | 确认想法 |
| `POST` | `/api/v1/idea-lab/drafts/:id/convert-to-project` | 转换为项目 |

---

## 三、数据表

新增 `idea_drafts` 表：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | 草稿 ID |
| raw_idea | TEXT NOT NULL | 用户原始想法 |
| title | TEXT | 作品标题 |
| project_type | TEXT | 作品类型: short_story / long_novel |
| target_platform | TEXT | 目标平台 |
| target_words | INTEGER | 目标字数 |
| description | TEXT | 作品描述 |
| status | TEXT | 状态: draft / questioning / answered / refining / refined / confirmed / converted |
| questions_json | TEXT | AI 生成的问题列表 (JSON) |
| answers_json | TEXT | 用户回答列表 (JSON) |
| refined_idea_json | TEXT | AI 完善后的想法 (JSON) |
| maturity_score | INTEGER | 成熟度评分 0-100 |
| maturity_report_json | TEXT | 成熟度报告 (JSON) |
| confirmed_idea | TEXT | 用户确认的成熟想法文本 |
| converted_project_id | TEXT | 转换后的项目 ID |
| created_at | TEXT | 创建时间 |
| updated_at | TEXT | 更新时间 |

---

## 四、用户流程

### 从想法开始的完整流程

```
创建入口选择「从想法开始」
    → 选择作品类型（短篇/长篇）
    → 选择目标平台
    → 填写原始想法
    → 点击「开始孵化」
    → 创建 Idea Draft
    → 进入 IdeaLabPage
    → 点击「生成追问」
    → AI 生成追问问题
    → 用户填写回答
    → 点击「保存回答」
    → 点击「完善想法」
    → AI 完善想法并给出成熟度评分
    → 用户编辑确认想法文本
    → 点击「确认想法」
    → 设置作品标题
    → 点击「创建作品」
    → 项目创建成功
    → 进入项目 Dashboard
```

### 状态流转

```
draft → questioning → answered → refined → confirmed → converted
```

---

## 五、与第一阶段字段的关系

| 第一阶段字段 | 来源 | 在 Idea Lab 中的赋值 |
|---|---|---|
| `creationSource` | CreateProjectDto | 固定为 `idea` |
| `ideaStatus` | CreateProjectDto | 固定为 `converted` |
| `ideaSeed` | CreateProjectDto | `draft.raw_idea` |
| `confirmedIdea` | CreateProjectDto | `draft.confirmed_idea` |
| `type` | CreateProjectDto | `draft.project_type` |
| `targetPlatform` / `platformStyle` | CreateProjectDto | `draft.target_platform` |
| `currentWorkflowStage` | CreateProjectDto | 短篇 `topic`，长篇 `idea_or_inspiration` |

重要：`idea_drafts` 表是项目创建前的草稿表，不等同于 `projects` 表。项目创建后，通过 `converted_project_id` 关联。

---

## 六、AI 逻辑

### 生成追问

短篇关注：主角身份、发生地点、核心异常、核心冲突、情绪卖点、主要反转、结尾冲击。

长篇关注：主角长期目标、时代/地域背景、核心金手指、长线冲突、反派/阻力、势力组织、地图/成长空间、前 30 章抓人点。

### 完善想法

短篇输出：标题建议、一句话钩子、主角身份、发生地点、核心异常、核心冲突、情绪卖点、主要反转、平台适配。

长篇输出：标题建议、一句话钩子、主角设定、核心冲突、世界观种子、角色种子、势力种子、卖点、平台适配。

### 成熟度评分

维度：主角明确度、冲突明确度、卖点强度、平台匹配度、短篇钩子强度、长篇扩展性、世界观可拓展性、角色关系潜力。

总分 0-100。

---

## 七、兜底策略

| 场景 | 兜底方案 |
|------|---------|
| LLM 追问生成失败 | 返回模板问题（短篇 7 题 / 长篇 8 题），标记 `isFallback: true` |
| LLM 完善想法失败 | 基于用户原始想法和回答生成基础结构化结果，标记 `isFallback: true` |
| 前端显示 | 提示「当前使用本地兜底结果，可稍后重新生成」 |

---

## 八、前端页面结构

### IdeaLabPage

1. **顶部信息区**：作品类型、目标平台、当前状态、原始想法
2. **追问区**：AI 生成的问题列表，每个问题对应一个回答输入框
3. **完善版想法区**：标题建议、一句话钩子、主角设定、核心冲突、世界观种子等
4. **成熟度评分区**：总分、优势、缺失项、风险点
5. **确认想法区**：可编辑的确认想法文本
6. **底部操作区**：生成追问 / 保存回答 / 完善想法 / 确认想法 / 创建作品

### 交互规则

- 草稿状态 → 显示「生成追问」
- 有追问无完善 → 显示「保存回答」+「完善想法」
- 已完善 → 显示「确认想法」
- 已确认 → 显示「创建作品」
- 成熟度 < 70 时确认需要二次确认
- 创建作品成功后跳转项目 Dashboard

---

## 九、本阶段未做

| 功能 | 说明 |
|------|------|
| Workflow Guard | 留到第三阶段实现 |
| 状态确稿中心 | 留到第五阶段 |
| 长短篇流程硬约束 | 留到第四阶段 |
| 长篇周复盘 | 留到第六阶段 |
| 写作 Chain 改造 | 不在本阶段范围 |
| 灵感创建改造 | 灵感保持第一阶段逻辑，未做复杂改造 |
| Agent Runner | 不做完整 Agent 框架 |
| RAG 改造 | 不在本阶段范围 |
| Tab 页面重构 | 保留所有现有 Tab 页面 |

---

## 十、验收清单

- [x] 从想法开始不会立即创建项目
- [x] 从想法开始会进入 Idea Lab
- [x] Idea Lab 能保存原始想法
- [x] Idea Lab 能生成追问
- [x] 用户能填写并保存回答
- [x] Idea Lab 能完善想法
- [x] Idea Lab 能给出成熟度评分
- [x] 用户能确认想法
- [x] 确认后能创建项目
- [x] 创建出的项目 creationSource = idea
- [x] 创建出的项目 ideaSeed 有值
- [x] 创建出的项目 confirmedIdea 有值
- [x] 创建出的项目 ideaStatus = converted
- [x] 短篇/长篇类型能正确保存
- [x] 目标平台能正确保存
- [x] 非 idea 来源创建流程不受影响
- [x] 不实现 Workflow Guard
- [x] 不实现状态确稿中心
- [x] 不破坏已有项目列表、项目打开、项目删除
- [x] 前后端 build 通过

---

## 十一、下一阶段建议

下一阶段进入 **阶段 3：Workflow Guard 流程守卫**：

1. 新增 `WorkflowGuardService`，提供 getCurrentStage / getAllowedActions / getMissingAssets / assertCanGenerateOutline / assertCanGenerateChapter。
2. 短篇严格遵守：题材 → 大纲 → 正文。
3. 长篇严格遵守：设定 → 世界观 → 人物 → 总纲 → 分卷 → 章节 → 正文。
4. ProjectDashboard 增加创作流程助手面板，显示当前阶段、缺失资产、下一步建议。
5. 在 Chain 调用前检查 Workflow Guard。
