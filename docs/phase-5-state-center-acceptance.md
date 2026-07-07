# Phase 5 状态确稿中心与角色成长状态引擎 — 验收文档

## 1. 环境启动

```bash
# 1. 启动后端
cd server
npm install
npm run start:dev

# 2. 启动前端（新终端）
cd desktop
npm install
npm run dev
```

后端运行在 http://localhost:3100，前端运行在 http://localhost:5173。

## 2. 构建检查

```bash
# 后端类型检查与构建
cd server
npm run typecheck          # 必须 0 错误
npm run build              # 必须 exit 0

# 前端类型检查与构建
cd desktop
npm run typecheck          # 必须 0 错误
npm run build              # 必须 exit 0
```

## 3. 验收测试

### 3.1 创建测试项目

1. 打开前端 http://localhost:5173
2. 创建新项目（长篇/短篇均可）
3. 记录 projectId（URL 中可见）

### 3.2 进入写作阶段

1. 创建角色、世界观、大纲
2. 进入写作页面

### 3.3 验证 /chain/generate 写入 state_items

1. 在写作页面调用"生成正文"（有 chapterId）
2. 验证 API 返回 `stateItemsCreated > 0`
3. 验证 `state_items` 表有新增记录
4. 验证 payload 中包含 `sourceMode: "generated_body"`

### 3.4 验证 /chain/continue 写入 state_items

1. 已有章节正文后，调用"续写"
2. 验证 API 返回 `stateItemsCreated > 0`
3. 验证 payload 中包含 `sourceMode: "continue_write"`

### 3.5 验证 /chain/long-write 写入 state_items

1. 长篇模式下调用"长篇写作"
2. 验证 API 返回 `stateItemsCreated > 0`
3. 验证 payload 中包含 `sourceMode: "long_write"`

### 3.6 无 chapterId 时写作接口不报错

1. 调用 generate/continue/long-write 不传 chapterId
2. 验证返回 `stateItemsCreated = 0`，无报错

### 3.7 手动修改未锁定正文触发状态提取

1. 在写作页面直接编辑正文内容
2. 保存后验证 `state_items` 写入 pending 状态
3. 状态来源为 `manual_edit_extract`

### 3.8 锁定正文不可自动修改

1. 将章节状态设为 locked
2. 尝试修改正文内容
3. 验证 `state_impact_items` 包含 `blocked_by_locked_chapter` 条目
4. 已锁定正文内容不被自动覆盖

### 3.9 人物 update 触发影响分析

1. 修改人物资料（姓名、身份等）
2. 验证 `state_impact_reports` 新增记录
3. 验证 `state_impact_items` 包含受影响条目

### 3.10 人物关系添加/删除触发影响分析

1. 调用 addRelationship 添加人物关系
2. 验证 `state_impact_reports` 新增记录，summary 包含"人物关系添加"
3. 调用 removeRelationship 删除人物关系
4. 验证 `state_impact_reports` 新增记录，summary 包含"人物关系删除"

### 3.11 世界观 update 触发影响分析

1. 修改世界观资料
2. 验证 `state_impact_reports` 新增记录
3. 短篇世界观 upsertSimpleSettings 也触发影响分析

### 3.12 世界观约束添加/删除触发影响分析

1. 调用 addConstraint 添加约束
2. 验证 `state_impact_reports` 新增，summary 包含"约束添加"
3. 调用 removeConstraint 删除约束
4. 验证 `state_impact_reports` 新增，summary 包含"约束删除"

### 3.13 大纲 update 触发影响分析

1. 修改大纲节点
2. 验证 `state_impact_reports` 新增记录
3. targetType 根据 level 正确判断（outline / volume / chapter_plan）

### 3.14 大纲结构变更触发影响分析

以下操作均需验证 `state_impact_reports` 新增记录，且 payload 中包含 operation 字段：

1. **delete** — 删除大纲节点，payload.operation = "remove"
2. **move** — 移动大纲节点，payload.operation = "move"
3. **reorder** — 重排序子节点，payload.operation = "reorder"
4. **split** — 拆分章节，payload.operation = "split"
5. **moveToVolume** — 移动到其他卷，payload.operation = "move_to_volume"

### 3.15 rejected/archived 不进入写作上下文

1. 在 StateCenterPage 将状态项标记为"驳回"或"归档"
2. 调用 `buildWritingStateContext`，该状态项不在返回结果中
3. authority 为 `excluded`

### 3.16 四层写作上下文

1. 调用 `buildWritingStateContext`
2. 确认返回四个分组：
   - **confirmed** — authority = hard_fact，标签"【已确稿状态｜必须遵守】"
   - **pending** — authority = soft_candidate，标签"【待确认状态｜可参考但不要写死】"
   - **conflict** — authority = warning，标签"【冲突提醒｜需要避免】"
   - **stale** — authority = warning，标签"【过期风险｜需要复核】"

### 3.17 角色成长时间线

1. 在 StateCenterPage 点击"角色成长"标签
2. 点击任意 character 类型状态项
3. 角色 ID 自动填充到输入框，自动加载成长事件
4. 验证显示：事件标题、摘要、章节、tags
5. 验证 `conflictWithPersona` 时显示提示文字
6. 验证 `needsTransition` 和 `needsReview` 显示对应提示
7. 验证 `evidenceEvent` 显示依据事件内容

### 3.18 已锁定正文不被自动修改

1. 将章节 is_locked = 1
2. 触发任意影响分析（修改人物/世界观/大纲）
3. 验证 `state_impact_items` 包含 `blocked_by_locked_chapter` 条目
4. 正文内容保持不变

## 4. 数据库 Schema 验证

### 4.1 state_items

```sql
SELECT id, project_id, source_type, source_id, source_chapter_id,
       target_type, target_id, target_label, state_key, title,
       summary, content, payload, status, authority, source, confidence,
       tags, impact_scope, summary_hash, created_by,
       confirmed_by, confirmed_at, rejected_by, rejected_at, archived_at,
       created_at, updated_at
FROM state_items
LIMIT 1;
```

### 4.2 state_impact_reports

```sql
SELECT id, project_id, source_state_item_id, source_type, summary,
       risk_level, status, created_by, payload, created_at, updated_at
FROM state_impact_reports
LIMIT 1;
```

### 4.3 state_impact_items

```sql
SELECT id, report_id, project_id, impact_type, target_type, target_id,
       target_label, summary, severity, status, action_hint, payload,
       applied_at, created_at, updated_at
FROM state_impact_items
LIMIT 1;
```

### 4.4 character_evolution_events

```sql
SELECT id, project_id, character_id, character_name, source_state_item_id,
       source_chapter_id, chapter_index, event_type, title, summary,
       before_state, after_state, delta, status, confirmed_at,
       created_at, updated_at
FROM character_evolution_events
LIMIT 1;
```

## 5. 状态权威级别对照

| status | authority | 写作上下文 |
|--------|-----------|-----------|
| confirmed | hard_fact | 进入·必须遵守 |
| pending | soft_candidate | 进入·可参考 |
| conflict | warning | 进入·需要避免 |
| stale | warning | 进入·需要复核 |
| rejected | excluded | 不进入 |
| archived | excluded | 不进入 |

## 6. 变更清单（Phase 5.3）

| # | 变更 | 文件 |
|---|------|------|
| 1 | character addRelationship 添加影响分析 | `character.service.ts` |
| 2 | character removeRelationship 添加影响分析 | `character.service.ts` |
| 3 | world-setting addConstraint 添加影响分析 | `world-setting.service.ts` |
| 4 | world-setting removeConstraint 添加影响分析 | `world-setting.service.ts` |
| 5 | outline remove 添加影响分析 | `outline.service.ts` |
| 6 | outline move 添加影响分析 | `outline.service.ts` |
| 7 | outline reorderChildren 添加影响分析 | `outline.service.ts` |
| 8 | outline split 添加影响分析 | `outline.service.ts` |
| 9 | outline moveToVolume 添加影响分析 | `outline.service.ts` |
| 10 | createFromArchive 添加 sourceMode 参数 | `state-item.service.ts` |
| 11 | runPostWriteArchive 传递 sourceMode | `chain.controller.ts` |
| 12 | 各写作端点标注 sourceMode | `chain.controller.ts` |
| 13 | create 去重增强：active 状态跳过，rejected/archived 允许重建 | `state-item.service.ts` |
| 14 | createCharacterEvolutionFromItem 写入 before_state/after_state | `state-item.service.ts` |
| 15 | StateCenterPage 增强：5列总览、角色成长事件详情、自动加载 | `StateCenterPage.tsx` |

## 7. 注意事项

- 所有影响分析失败不阻断主操作（try/catch 保护）
- SQLite 迁移（017）幂等，重复执行不报错
- 不要物理删除状态项（rejected/archived 保留标记）
- 已确稿（confirmed hard_fact）修改会触发关联 confirmed → stale 转换
- 已锁定章节自动同步被阻止，生成 blocked_by_locked_chapter 提示
