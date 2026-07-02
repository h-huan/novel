# RAG 状态管理规范

> **文档版本**: v1.0  
> **创建日期**: 2025-01-XX  
> **作者**: 子衿  
> **目标**: 定义小说状态跟踪、自动提取、权限管理和上下文连贯性保证的完整规范

---

## 目录

1. [概述](#1-概述)
2. [需要跟踪的状态](#2-需要跟踪的状态)
3. [状态提取逻辑](#3-状态提取逻辑)
4. [修改权限规则](#4-修改权限规则)
5. [上下文连贯性保证](#5-上下文连贯性保证)
6. [状态仪表盘设计](#6-状态仪表盘设计)
7. [后端 API 设计](#7-后端-api-设计)
8. [前端组件设计](#8-前端组件设计)
9. [实施路线图](#9-实施路线图)

---

## 1. 概述

### 1.1 目标

为主公打造一个**小说状态仪表盘**，实现：

1. **一览无余**：所有关键状态在一个页面查看
2. **自动提取**：从正文中自动提取人物状态、伏笔状态、一致性等
3. **可手动修改**：除世界观和锁定章节外，所有状态都可手动调整
4. **上下文流畅**：RAG 检索时保证上下文连贯不脱节

### 1.2 核心原则

- **优先级**：世界观 > 锁定章节 > 其他状态
- **自动化**：尽量自动提取，减少手动输入
- **可控性**：自动提取的结果可手动覆盖
- **连贯性**：RAG 检索时保证上下文流畅

---

## 2. 需要跟踪的状态

### 2.1 状态分类

| 状态类别 | 状态项 | 是否可自动提取 | 是否可手动修改 | 优先级 |
|---------|-------|--------------|--------------|-------|
| **世界观** | 地理、历史、社会规则、力量体系、势力组织、特殊设定 | ❌ 不可 | ⚠️ 仅手动 | P0 |
| **锁定章节** | 标记为锁定的章节内容 | ❌ 不可 | ⚠️ 仅手动 | P0 |
| **人物状态** | 当前位置、心理状态、关系变化、能力变化、目标进展 | ✅ 可 | ✅ 可 | P1 |
| **伏笔状态** | 埋设状态、回收状态、活跃度 | ✅ 可 | ✅ 可 | P1 |
| **情节进展** | 当前冲突、解决进度、情绪曲线 | ✅ 可 | ✅ 可 | P1 |
| **一致性检查** | 人物一致性、设定一致性、时间线一致性 | ✅ 可 | ⚠️ 仅查看 | P2 |
| **写作进度** | 完成章节数、字数统计、写作速度 | ✅ 可 | ❌ 不可 | P2 |
| **质量指标** | 节奏评分、反转密度、情感波动 | ✅ 可 | ❌ 不可 | P3 |

### 2.2 详细状态定义

#### 2.2.1 人物状态 (Character State)

**数据模型**：

```typescript
interface CharacterState {
  characterId: string;
  projectId: string;
  
  // 基本信息（从人物档案同步）
  name: string;
  identity: string;
  baseTraits: string[]; // 基础性格标签
  
  // 动态状态（从正文提取 + 可手动修改）
  currentLocation?: string; // 当前位置
  currentMentalState?: string; // 当前心理状态（如：愤怒、悲伤、迷茫）
  currentGoals: string[]; // 当前目标（可能随情节变化）
  relationshipChanges: RelationshipChange[]; // 关系变化记录
  abilityChanges: AbilityChange[]; // 能力变化记录（如升级）
  items: ItemRecord[]; // 持有物品记录
  
  // 统计信息（自动计算）
  appearanceCount: number; // 出场次数
  lastAppearedChapter: number; // 最后出场章节
  importanceScore: number; // 重要度评分（0-10）
  
  // 提取元数据
  extractedFromChapters: number[]; // 从哪些章节提取
  lastExtractedAt: string; // 最后提取时间
  confidence: number; // 提取置信度（0-1）
  needsReview: boolean; // 是否需要人工审核
  
  // 手动覆盖标记
  manuallyModified: boolean; // 是否被手动修改过
  modifiedFields: string[]; // 被修改的字段列表
}
```

**提取示例**：

从章节正文提取：
```
正文片段：
"张三握紧拳头，眼中闪过一丝愤怒。他想起李四曾经的背叛，心中暗暗发誓要报仇。"
"张三离开了北京，前往上海寻找王五。"

提取结果：
- currentMentalState: "愤怒、复仇心"
- currentLocation: "上海"
- relationshipChanges: [
  { target: "李四", type: "敌对", reason: "曾经的背叛", chapter: 5 }
]
- currentGoals: ["向李四报仇", "寻找王五"]
```

#### 2.2.2 伏笔状态 (Foreshadowing State)

**数据模型**：

```typescript
interface ForeshadowingState {
  foreshadowingId: string;
  projectId: string;
  
  // 基本信息（从伏笔表同步）
  description: string;
  type: 'item' | 'dialogue' | 'event' | 'character';
  
  // 状态追踪
  status: 'planted' | 'active' | 'recovered' | 'abandoned';
  plantedChapter: number; // 埋设章节
  recoveredChapter?: number; // 回收章节
  recoveryMethod?: string; // 回收方式
  
  // 活跃度指标
  activeDays: number; // 已活跃章节数
  tensionContribution: number; // 对悬念的贡献度（0-10）
  
  // 关联性
  relatedCharacters: string[]; // 相关人物
  relatedChapters: number[]; // 相关章节
  
  // 提取元数据
  detectedAutomatically: boolean; // 是否自动检测
  lastMentionedChapter?: number; // 最后提及章节
  mentionCount: number; // 提及次数
}
```

#### 2.2.3 情节进展 (Plot Progress)

**数据模型**：

```typescript
interface PlotProgress {
  projectId: string;
  chapterIndex: number;
  
  // 当前冲突
  activeConflicts: Conflict[]; // 当前活跃的冲突
  resolvedConflicts: Conflict[]; // 已解决的冲突
  
  // 解决进度
  mainGoalProgress: number; // 主线目标完成度（0-100%）
  subGoalProgress: Record<string, number>; // 子目标完成度
  
  // 情绪曲线
  emotionalBeat: 'calm' | 'rising' | 'climax' | 'falling' | 'trough';
  emotionalIntensity: number; // 情绪强度（1-10）
  
  // 节奏评分
  pacingScore: number; // 节奏评分（0-10）
  turningPoints: string[]; // 本章转折点
}
```

#### 2.2.4 一致性检查 (Consistency Check)

**数据模型**：

```typescript
interface ConsistencyCheck {
  projectId: string;
  checkType: 'character' | 'world_setting' | 'timeline' | 'plot_logic';
  status: 'pass' | 'warning' | 'error';
  message: string;
  severity: 'low' | 'medium' | 'high';
  detectedAt: string;
  chapterIndex: number;
  details: {
    field: string;
    expected: string;
    actual: string;
    suggestion?: string;
  }[];
}
```

**检查示例**：

```
检查类型: character
状态: warning
消息: "人物设定不一致"
详情:
  - field: "张三.性格标签"
    expected: "勇敢、正直"
    actual: "本章表现出胆小"
    suggestion: "建议修改正文或更新人物设定"
```

#### 2.2.5 写作进度 (Writing Progress)

**数据模型**：

```typescript
interface WritingProgress {
  projectId: string;
  
  // 完成统计
  totalChapters: number;
  completedChapters: number;
  totalWords: number;
  targetWords: number;
  
  // 写作速度
  wordsPerDay: number; // 日均字数
  chaptersPerWeek: number; // 周均章节数
  estimatedCompletionDate?: string; // 预计完成日期
  
  // 时间统计
  writingStreak: number; // 连续写作天数
  lastWrittenAt?: string; // 最后写作时间
}
```

#### 2.2.6 质量指标 (Quality Metrics)

**数据模型**：

```typescript
interface QualityMetrics {
  projectId: string;
  chapterIndex: number;
  
  // 节奏评分
  pacingScore: number; // 节奏评分（0-10）
  dialogueRatio: number; // 对话占比（0-1）
  descriptionRatio: number; // 描写占比（0-1）
  actionRatio: number; // 动作占比（0-1）
  
  // 反转密度
  reversalDensity: number; // 反转密度（每10章反转数）
  hasReversal: boolean; // 本章是否有反转
  
  // 情感波动
  emotionalVolatility: number; // 情感波动度（0-10）
  moodCurve: number[]; // 情绪曲线（本章每段的情绪值）
  
  // 可读性
  averageSentenceLength: number; // 平均句长
  vocabularyRichness: number; // 词汇丰富度
  readabilityScore: number; // 可读性评分
}
```

---

## 3. 状态提取逻辑

### 3.1 提取触发时机

| 触发时机 | 说明 | 提取内容 |
|---------|------|---------|
| **章节保存后** | 用户保存章节时自动触发 | 人物状态、伏笔状态、情节进展 |
| **手动触发** | 用户点击"重新分析"按钮 | 所有状态 |
| **定时任务** | 每天凌晨 2:00 自动执行 | 一致性检查、质量指标 |
| **批量导入后** | 导入章节后触发 | 所有状态 |

### 3.2 提取 Prompt 设计

#### 3.2.1 人物状态提取 Prompt

```
你是一位专业的小说人物状态分析专家。请分析以下章节内容，提取所有出场人物的当前状态变化。

## 章节内容
{chapter_text}

## 已知人物档案
{character_profiles}

## 提取要求
1. 识别所有出场人物
2. 提取每个人的：
   - 当前位置（如果在文中提到）
   - 当前心理状态（情绪、想法）
   - 当前目标（如果有变化）
   - 与其他人物的关系变化
   - 能力或状态变化（如升级、受伤）
   - 获得或失去的物品
3. 只提取文中明确提到或强烈暗示的信息，不要臆测
4. 为每个提取项标注置信度（0-1）

## 输出格式（JSON）
{
  "characters": [
    {
      "name": "张三",
      "currentLocation": "上海",
      "currentMentalState": "愤怒、复仇心",
      "currentGoals": ["向李四报仇", "寻找王五"],
      "relationshipChanges": [
        {
          "target": "李四",
          "type": "敌对",
          "reason": "曾经的背叛",
          "confidence": 0.9
        }
      ],
      "abilityChanges": [],
      "items": [
        { "name": "玉佩", "action": "获得", "source": "王五赠送" }
      ],
      "confidence": 0.85
    }
  ]
}
```

#### 3.2.2 伏笔状态提取 Prompt

```
你是一位专业的小说伏笔分析专家。请分析以下章节内容，识别所有伏笔的埋设、提及或回收。

## 章节内容
{chapter_text}

## 已知伏笔列表
{foreshadowing_list}

## 提取要求
1. 识别新埋设的伏笔
2. 识别已埋设伏笔的提及
3. 识别伏笔的回收
4. 为每个伏笔标注：
   - 类型（物品/对话/事件/人物）
   - 描述
   - 置信度（0-1）
   - 相关人物

## 输出格式（JSON）
{
  "newForeshadowings": [
    {
      "description": "张三手中的玉佩突然发光",
      "type": "item",
      "relatedCharacters": ["张三"],
      "confidence": 0.8
    }
  ],
  "mentionedForeshadowings": [
    {
      "foreshadowingId": "fs-123",
      "mentionType": "提及",
      "confidence": 0.9
    }
  ],
  "recoveredForeshadowings": [
    {
      "foreshadowingId": "fs-456",
      "recoveryMethod": "张三用玉佩击败了敌人",
      "confidence": 0.95
    }
  ]
}
```

#### 3.2.3 情节进展提取 Prompt

```
你是一位专业的小说情节分析专家。请分析以下章节内容，提取情节进展信息。

## 章节内容
{chapter_text}

## 前文摘要
{previous_chapters_summary}

## 提取要求
1. 识别当前活跃的冲突
2. 识别已解决的冲突
3. 评估主线目标完成度
4. 识别本章的转折点
5. 评估情绪曲线位置

## 输出格式（JSON）
{
  "activeConflicts": [
    {
      "description": "张三与李四的对立",
      "status": "升级",
      "relatedCharacters": ["张三", "李四"]
    }
  ],
  "resolvedConflicts": [],
  "mainGoalProgress": 0.35,
  "turningPoints": ["张三发现李四的阴谋"],
  "emotionalBeat": "rising",
  "emotionalIntensity": 7
}
```

#### 3.2.4 一致性检查 Prompt

```
你是一位专业的小说一致性检查专家。请检查以下章节内容是否与已有设定一致。

## 章节内容
{chapter_text}

## 世界观设定
{world_setting}

## 人物档案
{character_profiles}

## 前文关键事件
{previous_key_events}

## 检查要求
1. 检查人物性格、能力、外貌是否与设定一致
2. 检查世界观规则是否被违反
3. 检查时间线是否合理
4. 检查情节逻辑是否连贯
5. 为每个检查项标注严重程度（low/medium/high）

## 输出格式（JSON）
{
  "checks": [
    {
      "type": "character",
      "status": "warning",
      "message": "人物设定不一致",
      "severity": "medium",
      "details": {
        "field": "张三.性格标签",
        "expected": "勇敢、正直",
        "actual": "本章表现出胆小",
        "suggestion": "建议修改正文或更新人物设定"
      }
    }
  ]
}
```

### 3.3 提取流程

```
章节保存
  ↓
触发提取任务（异步）
  ↓
分块处理（如果章节过长）
  ↓
调用 LLM 提取（使用上述 Prompt）
  ↓
解析 LLM 输出（JSON）
  ↓
与现有状态合并（如果手动修改过，保留手动值）
  ↓
更新数据库
  ↓
触发前端刷新（WebSocket/SSE）
```

### 3.4 提取优化策略

1. **增量提取**：只提取新增章节，不重复提取已有章节
2. **批量提取**：一次 LLM 调用提取多个状态，减少 API 调用
3. **缓存策略**：缓存 LLM 输出，避免重复计算
4. **置信度过滤**：只保留置信度 > 0.7 的提取结果
5. **人工审核**：置信度 < 0.8 的结果标记为"需要审核"

---

## 4. 修改权限规则

### 4.1 权限矩阵

| 状态类别 | 自动提取 | 手动修改 | 手动覆盖后是否继续自动提取 | 说明 |
|---------|---------|---------|------------------------|------|
| **世界观** | ❌ | ✅ | N/A | 仅手动编辑 |
| **锁定章节** | ❌ | ✅ | N/A | 仅手动编辑 |
| **人物状态** | ✅ | ✅ | ⚠️ 可选 | 默认继续提取，但可勾选"锁定此字段" |
| **伏笔状态** | ✅ | ✅ | ⚠️ 可选 | 同上 |
| **情节进展** | ✅ | ✅ | ⚠️ 可选 | 同上 |
| **一致性检查** | ✅ | ❌ | N/A | 仅查看和忽略 |
| **写作进度** | ✅ | ❌ | N/A | 自动计算 |
| **质量指标** | ✅ | ❌ | N/A | 自动计算 |

### 4.2 字段级锁定

为每个可手动修改的字段提供"锁定"选项：

```typescript
interface FieldLock {
  fieldPath: string; // 如 "characters.张三.currentLocation"
  locked: boolean; // 是否锁定
  lockedAt: string; // 锁定时间
  lockedBy: string; // 锁定操作者（user/ai）
}
```

**交互设计**：
- 每个可编辑字段右侧显示"锁定"图标（🔓/🔒）
- 点击图标切换锁定状态
- 锁定的字段不再被自动提取覆盖
- 悬浮提示："锁定后，AI 不会自动修改此字段"

### 4.3 版本历史

记录每次自动提取和手动修改：

```typescript
interface StateVersion {
  id: string;
  stateType: 'character' | 'foreshadowing' | 'plot';
  stateId: string;
  version: number;
  data: any; // 完整状态快照
  source: 'auto_extract' | 'manual_edit' | 'merge';
  createdAt: string;
  createdBy: string;
  changeLog: string; // 变更说明
}
```

**交互设计**：
- 每个状态卡片显示"历史"按钮
- 点击查看版本历史（时间轴展示）
- 支持"回滚到此版本"

---

## 5. 上下文连贯性保证

### 5.1 现有 ContextBuilder 分析

现有的 `ContextBuilderService` 已实现：
- 按 P0/P1/P2/P3 优先级编排上下文
- Token 预算管理
- 生成 LLM 可用的 system prompt + 上下文

**需要增强的部分**：
1. 动态状态注入：将提取的人物状态、伏笔状态注入上下文
2. 连贯性保证：避免 RAG 检索的上下文碎片化
3. 状态一致性：保证注入的状态与正文一致

### 5.2 增强方案

#### 5.2.1 动态状态注入

在现有的 P0 层（本章大纲）和 P1 层（相关设定与历史）之间，新增 **P0.5 层（动态状态）**：

```
P0  - 本章大纲·必循（不变）
P0.5 - 动态状态·参考（新增）
       - 人物当前状态
       - 伏笔当前状态
       - 情节进展
P1  - 相关设定与历史（不变）
P2  - 其他参考（不变）
```

**实现**：

```typescript
// 增强现有的 ContextBuildOptions
interface ContextBuildOptions {
  // ... 现有字段
  
  // 新增：动态状态
  includeDynamicState?: boolean; // 是否注入动态状态（默认 true）
  dynamicStateBudget?: number; // 动态状态 Token 预算（默认 1000）
}

// 增强 ContextBuilderService
buildContext(...) {
  // ... 现有逻辑
  
  // 新增：注入动态状态
  if (options.includeDynamicState !== false) {
    const dynamicState = await this.gatherDynamicState(options.chapterId);
    const p05Assembled = this.assembleContent([dynamicState], options.dynamicStateBudget || 1000);
    
    if (p05Assembled.length > 0) {
      sections.push('\n---');
      sections.push(this.sectionHeader('人物与伏笔状态·参考', 'P0.5'));
      sections.push(this.renderItems(p05Assembled));
    }
  }
  
  // ... 现有逻辑
}

// 收集动态状态
private async gatherDynamicState(chapterId: string): Promise<RetrievalResult> {
  // 1. 获取本章出场人物
  const activeCharacters = await this.getActiveCharacters(chapterId);
  
  // 2. 获取人物当前状态
  const characterStates = await this.getCharacterStates(activeCharacters);
  
  // 3. 获取活跃伏笔
  const activeForeshadowings = await this.getActiveForeshadowings(chapterId);
  
  // 4. 格式化为 RetrievalResult
  const text = this.formatDynamicState(characterStates, activeForeshadowings);
  
  return {
    chunkId: 'dynamic-state',
    text,
    score: 1.0,
    source: 'dense',
    priority: 'P0.5',
    docType: 'dynamic_state',
    payload: {},
  };
}
```

#### 5.2.2 连贯性保证策略

**问题**：RAG 检索的上下文可能碎片化，导致 LLM 生成不连贯。

**解决方案**：

1. **上下文窗口管理**
   - 保证 P0-P1 层内容连贯（按逻辑分组，不是简单拼接）
   - 每组内容用分隔符和标题明确标识

2. **状态摘要注入**
   - 在 P0.5 层注入"状态摘要"，而非原始状态
   - 摘要格式：`人物X目前在北京，心理状态是愤怒，目标是向Y报仇`

3. **前文摘要注入**
   - 在 P1 层注入"前文摘要"（最近 3-5 章的摘要）
   - 摘要由 LLM 生成，保证连贯性

4. **指代消解**
   - 在 P0.5 和 P1 层，将人称代词替换为具体人名
   - 如："他" → "张三（他）"

**实现**：

```typescript
// 增强 System Prompt
private buildSystemPrompt(options: ContextBuildOptions): string {
  const parts: string[] = [
    '你是一位专业的网络小说写作助手。',
    `当前写作阶段: ${this.getStageDescription(options.stage)}`,
    '',
    '请严格遵循以下规则：',
    '1. 优先遵循【本章大纲·必循】中的大纲规划',
    '2. 保持角色设定的一致性（性格、能力、人际关系）',
    '3. 遵守世界观规则，不引入违反设定的内容',
    '4. 如遇到需要回收的伏笔，请自然融入情节',
    '5. 注意与前文的衔接，保持情节连贯性',
    '',
    '【连贯性保证规则】',
    '6. 使用【人物与伏笔状态·参考】中的当前状态，不要忽略',
    '7. 参考【前文摘要】保持情节连贯，避免重复或矛盾',
    '8. 如果上下文中提到"X对Y有好感"，后续不要突然变成"X恨Y"',
  ];
  
  // ... 现有逻辑
}
```

#### 5.2.3 状态一致性检查

在注入动态状态前，检查状态与正文是否一致：

```typescript
// 检查状态一致性
private async validateStateConsistency(
  chapterId: string,
  characterStates: CharacterState[],
): Promise<ConsistencyCheck[]> {
  const checks: ConsistencyCheck[] = [];
  
  // 1. 检查人物状态是否与本章正文一致
  for (const state of characterStates) {
    const chapter = await this.getChapter(chapterId);
    const lastExtracted = state.extractedFromChapters.includes(chapter.index);
    
    if (!lastExtracted) {
      // 状态不是从本章提取的，可能过时
      checks.push({
        type: 'character',
        status: 'warning',
        message: `人物 ${state.name} 的状态可能不是最新的`,
        severity: 'medium',
        // ...
      });
    }
  }
  
  return checks;
}
```

### 5.3 与现有 ContextBuilder 的集成

**修改点**：

1. **ContextBuildOptions**：新增 `includeDynamicState` 和 `dynamicStateBudget`
2. **buildContext 方法**：新增 P0.5 层注入逻辑
3. **buildSystemPrompt 方法**：增强连贯性保证规则
4. **新增方法**：
   - `gatherDynamicState`：收集动态状态
   - `formatDynamicState`：格式化动态状态
   - `validateStateConsistency`：检查状态一致性

**兼容性**：
- 默认 `includeDynamicState = true`，保持向后兼容
- 如果 `includeDynamicState = false`，行为与现有版本完全一致

---

## 6. 状态仪表盘设计

### 6.1 布局设计

```
+------------------------------------------------------------------+
|  小说状态仪表盘 - {项目名称}                       [最后更新: xxx] |
+------------------------------------------------------------------+
| [世界观] | [锁定章节] | [人物状态] | [伏笔状态] | [情节进展] | ... |
+------------------------------------------------------------------+
|                                                                    |
|  [世界观卡片]  [锁定章节卡片]  [人物状态卡片]  [伏笔状态卡片]      |
|                                                                    |
|  [情节进展图表]  [一致性检查列表]  [写作进度条]  [质量指标雷达图]  |
|                                                                    |
+------------------------------------------------------------------+
```

### 6.2 卡片设计

#### 6.2.1 世界观卡片

```
+------------------------------+
| 世界观设置           [编辑] |
+------------------------------+
| 时代背景: 古代               |
| 核心地点: 北京、上海         |
| 社会规则: 封建制度...       |
| ...                          |
|                              |
| ⚠️ 不可自动修改              |
+------------------------------+
```

#### 6.2.2 人物状态卡片

```
+------------------------------+
| 人物状态           [重新分析] |
+------------------------------+
| 张三 ⚠️               [详情]|
|   位置: 上海 🔓              |
|   心理状态: 愤怒 🔓          |
|   目标: 向李四报仇 🔓        |
|   最后更新: 2小时前          |
|                              |
| 李四 ✅               [详情]|
|   ...                       |
+------------------------------+
```

**交互**：
- 点击 [详情] 展开完整状态
- 点击 🔓/🔒 切换字段锁定
- 点击 [重新分析] 手动触发提取

#### 6.2.3 伏笔状态卡片

```
+------------------------------+
| 伏笔状态           [重新分析] |
+------------------------------+
| 活跃伏笔: 3       已回收: 1 |
|                              |
| fs-001: 玉佩的秘密    🔓   |
|   状态: 活跃                 |
|   埋设: 第1章               |
|   最后提及: 第5章            |
|                              |
| fs-002: 李四的真实身份  🔒  |
|   ...                       |
+------------------------------+
```

### 6.3 图表设计

#### 6.3.1 情节进展图表

```
情绪曲线图：

强度
 10 |     *
  9 |   *   *
  8 | *       *
  7 |           *
  6 |             *
  5 |               *
  4 |                 *
  3 |                   *
  2 |                     *
  1 |                       *
  0 +--|--|--|--|--|--|--|--|--> 章节
     1  2  3  4  5  6  7  8  9
```

#### 6.3.2 质量指标雷达图

```
        节奏评分
            |
     反转密度-+-情感波动
            |
    可读性-+-词汇丰富度
```

---

## 7. 后端 API 设计

### 7.1 状态提取 API

```
POST /api/projects/:projectId/state/extract
Body: {
  "chapterIds": [1, 2, 3], // 可选，不传则提取所有未提取章节
  "stateTypes": ["character", "foreshadowing", "plot"], // 可选
  "force": false // 是否强制重新提取
}
Response: {
  "success": true,
  "extractedStates": [...]
}
```

### 7.2 状态查询 API

```
GET /api/projects/:projectId/state/character
Query: {
  "characterIds": ["xxx"], // 可选
  "includeHistory": false // 是否包含版本历史
}
Response: {
  "characters": [...]
}

GET /api/projects/:projectId/state/foreshadowing
GET /api/projects/:projectId/state/plot
GET /api/projects/:projectId/state/consistency
GET /api/projects/:projectId/state/progress
GET /api/projects/:projectId/state/quality
```

### 7.3 状态修改 API

```
PUT /api/projects/:projectId/state/character/:characterId
Body: {
  "currentLocation": "上海",
  "currentMentalState": "愤怒",
  "lockFields": ["currentLocation"] // 锁定这些字段
}
Response: {
  "success": true,
  "character": {...}
}
```

### 7.4 一致性检查 API

```
POST /api/projects/:projectId/state/consistency/check
Body: {
  "chapterIds": [1, 2, 3], // 可选
  "checkTypes": ["character", "world_setting"] // 可选
}
Response: {
  "checks": [...]
}
```

---

## 8. 前端组件设计

### 8.1 StateDashboard 组件

```typescript
// apps/frontend/src/pages/StateDashboard.tsx
<StateDashboard>
  <TabBar>
    <Tab>世界观</Tab>
    <Tab>人物状态</Tab>
    <Tab>伏笔状态</Tab>
    <Tab>情节进展</Tab>
    <Tab>一致性</Tab>
    <Tab>写作进度</Tab>
    <Tab>质量指标</Tab>
  </TabBar>
  
  <CardGrid>
    <WorldSettingCard />
    <CharacterStateCard />
    <ForeshadowingStateCard />
    <PlotProgressCard />
  </CardGrid>
  
  <ChartSection>
    <EmotionalCurveChart />
    <QualityRadarChart />
  </ChartSection>
</StateDashboard>
```

### 8.2 CharacterStateCard 组件

```typescript
// apps/frontend/src/components/CharacterStateCard.tsx
<CharacterStateCard>
  <CardHeader>
    <CharacterName />
    <WarningBadge /> // 如果需要审核
    <DetailButton />
  </CardHeader>
  
  <CardBody>
    <StateField>
      <Label>当前位置</Label>
      <Value>{character.currentLocation}</Value>
      <LockToggle locked={fieldLocks['currentLocation']} />
    </StateField>
    
    <StateField>
      <Label>心理状态</Label>
      <Value>{character.currentMentalState}</Value>
      <LockToggle locked={fieldLocks['currentMentalState']} />
    </StateField>
    
    // ...
  </CardBody>
  
  <CardFooter>
    <LastUpdatedTime />
    <ConfidenceBadge />
    <ReExtractButton />
  </CardFooter>
</CharacterStateCard>
```

---

## 9. 实施路线图

### 9.1 Phase 1: 基础状态提取（Week 1-2）

- [ ] 定义数据库模型（CharacterState, ForeshadowingState, ...）
- [ ] 实现状态提取 Service（调用 LLM）
- [ ] 实现提取 Prompt（人物、伏笔、情节）
- [ ] 实现提取触发逻辑（章节保存后、手动触发）

### 9.2 Phase 2: 修改权限管理（Week 3）

- [ ] 实现字段级锁定
- [ ] 实现版本历史
- [ ] 实现手动修改 API

### 9.3 Phase 3: 上下文连贯性（Week 4）

- [ ] 增强 ContextBuilderService（注入动态状态）
- [ ] 实现状态一致性检查
- [ ] 优化 System Prompt

### 9.4 Phase 4: 前端仪表盘（Week 5-6）

- [ ] 实现 StateDashboard 页面
- [ ] 实现各状态卡片组件
- [ ] 实现图表组件
- [ ] 实现手动修改交互

### 9.5 Phase 5: 优化与测试（Week 7-8）

- [ ] 优化提取 Prompt（提高准确率）
- [ ] 优化性能（缓存、批量处理）
- [ ] 测试各种边界情况
- [ ] 编写文档

---

## 10. 附录

### 10.1 参考资料

- 现有代码：
  - `server/src/rag/context-builder.service.ts`
  - `server/src/modules/character/`
  - `server/src/modules/foreshadowing/`

### 10.2 常见问题

**Q: 自动提取的准确率如何保证？**
A: 1) 优化 Prompt 设计；2) 置信度过滤；3) 人工审核机制；4) 版本历史支持回滚。

**Q: 手动修改后，自动提取会覆盖吗？**
A: 不会。手动修改的字段会被锁定，除非用户手动解锁。

**Q: 上下文连贯性如何保证？**
A: 1) 动态状态注入；2) 前文摘要注入；3) 指代消解；4) 一致性检查。

---

**文档结束**
