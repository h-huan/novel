# AI写作平台 · Prompt Chain 架构与模板方案

> 版本：v1.0 | 日期：2026 | 作者：文若（提示词工程师）
> 基于：短故事三步骤.md（原始模板）+ AI写作平台研发计划.md第十二章（Chain工程方案）

---

## 目录

1. [Prompt Chain 架构总览](#1-prompt-chain-架构总览)
2. [核心 Prompt 模板库设计](#2-核心-prompt-模板库设计)
3. [短篇三阶段 Chain 完整定义](#3-短篇三阶段-chain-完整定义)
4. [长篇每日工作流 Chain 设计](#4-长篇每日工作流-chain-设计)
5. [多风格引擎的 Prompt 差异化方案](#5-多风格引擎的-prompt-差异化方案)
6. [质量门（Quality Gate）设计](#6-质量门quality-gate设计)
7. [模型适配策略](#7-模型适配策略)
8. [Author's Note 注入机制](#8-authors-note-注入机制)
9. [附录：完整 Prompt 模板清单](#9-附录完整-prompt-模板清单)

---

## 1. Prompt Chain 架构总览

### 1.1 三层架构

整个 Prompt Chain 系统采用 **定义层 → 引擎层 → 集成层** 三层架构，每一层职责分明、松耦合、可独立测试。

```
┌──────────────────────────────────────────────────────────────────┐
│                      定义层 (Definition Layer)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Chain 定义文件│  │ Prompt 模板库│  │ 写作方法论模板库       │ │
│  │ (YAML/JSON)  │  │ (Handlebars) │  │ (三步骤/天龙8步/长篇)  │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  职责：WHAT —— 定义"做什么"和"怎么写"                              │
├──────────────────────────────────────────────────────────────────┤
│                      引擎层 (Engine Layer)                         │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Chain 编排器 (Orchestrator)                                  │ │
│  │  ├─ 节点调度器：按序 / 条件分支 / 并行 / 循环                 │ │
│  │  ├─ 变量注入器：上下文装配 + 模板渲染                          │ │
│  │  ├─ 质量门控制器：通过 / 重试(带反馈) / 降级 / 停止           │ │
│  │  └─ 模型路由器：按节点策略分配最优模型                         │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  职责：HOW —— 控制"怎么执行"和"怎么保证质量"                        │
├──────────────────────────────────────────────────────────────────┤
│                      集成层 (Integration Layer)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ RAG 检索注入 │  │ 24维状态注入 │  │ 伏笔/角色/世界观校验   │ │
│  │ (RTCO分级)   │  │ (角色快照)   │  │ (一致性约束)           │ │
│  └──────────────┘  └──────────────┘  └────────────────────────┘ │
│  职责：CONTEXT —— 提供"需要知道什么"和"必须遵守什么"                │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Chain 类型与执行模式

| Chain 类型 | 适用场景 | 节点数 | 特点 |
|-----------|---------|--------|------|
| **顺序链** | 短篇三阶段、大纲生成 | 5~10 | 严格按序执行，前置输出 → 后置输入 |
| **条件分支链** | 质检→重试/通过、章节功能路由 | 5~15 | 根据中间结果动态选择路径 |
| **并行链** | 多角色视角同时生成 | 3~8 | 独立节点并行执行，最后汇总 |
| **循环链** | 精修迭代、降AI味循环 | 3~5 | 重复执行直到质量门通过 |
| **混合链** | 长篇每日工作流 | 10~20 | 组合上述所有模式 |

### 1.3 核心数据结构

```typescript
// Prompt Chain 定义
interface PromptChain {
  id: string;                    // 唯一标识，如 "short-story-stage1"
  name: string;                  // 人类可读名称
  version: string;               // 语义版本 (major.minor.patch)
  description: string;
  nodes: ChainNode[];            // 有序节点列表
  variables: VariableDef[];      // 全局变量定义
  config: ChainConfig;           // 全局配置（超时/重试/日志）
}

// 链节点
interface ChainNode {
  id: string;                    // 如 "node_1_material_parse"
  name: string;                  // 如 "素材解析"
  type: 'prompt' | 'condition' | 'parallel' | 'loop' | 'transform';
  promptTemplateId?: string;     // 指向模板库的模板ID
  modelPreference: ModelSpec;    // 模型偏好
  ragConfig?: RagConfig;         // RAG检索配置
  inputMapping: Record<string, string>;   // 变量路径 → 节点输入
  outputMapping: Record<string, string>;  // 节点输出 → 上下文路径
  qualityGate?: QualityGate;     // 质量门配置
  branches?: Branch[];           // 条件分支
  nextOnSuccess?: string[];      // 成功后的下一个节点ID
  nextOnFailure?: string;        // 失败后的降级节点ID
  timeout: number;               // 超时秒数
  retryCount: number;            // 最大重试次数
  authorsNoteEnabled: boolean;   // 是否注入 Author's Note
}
```

### 1.4 Chain 编排引擎核心流程

```
开始执行 Chain
  │
  ├─ 1. 加载 Chain 定义（YAML → 结构化对象）
  │    └─ Schema 校验 → 变量预检 → 模板预编译
  │
  ├─ 2. 解析用户输入变量
  │    └─ user_input + chain_config + 默认值 → resolved_variables
  │
  ├─ 3. 创建执行上下文 (ExecutionContext)
  │    └─ 上下文对象 = 变量 + 节点输出缓存 + 重试计数 + 时间戳
  │
  ├─ 4. 逐节点执行循环
  │    ├─ 4.1 输入映射：从上下文提取本节点所需变量
  │    ├─ 4.2 RAG检索：如果配置了 ragConfig，注入检索结果
  │    ├─ 4.3 状态注入：从24维引擎获取角色/世界观最新状态
  │    ├─ 4.4 Author's Note注入：如果 enabled，注入临时规则
  │    ├─ 4.5 模板渲染：Handlebars.compile(template)(variables)
  │    ├─ 4.6 LLM调用：通过模型路由器发送请求
  │    ├─ 4.7 质量门检查：
  │    │    ├─ 通过 → 输出映射 → 继续下一个节点
  │    │    ├─ 重试 → 带失败反馈重新执行（最多 retryCount 次）
  │    │    ├─ 降级 → 执行 nextOnFailure 节点
  │    │    └─ 停止 → 返回部分结果 + 错误信息
  │    └─ 4.8 条件分支：如果 type='condition'，评估 branches
  │
  └─ 5. 返回 ChainResult（最终输出 + 执行日志 + 质量报告）
```

---

## 2. 核心 Prompt 模板库设计

### 2.1 模板分类体系

模板库采用 **三维分类法**：阶段 × 类型 × 模型，共管理 50+ 套 Handlebars 模板。

```
templates/
├── short-story/                    # 短篇（12个模板）
│   ├── stage1/                     # 阶段一：题材生成
│   │   ├── material-parse.hbs      # 素材解析
│   │   ├── style-analysis.hbs      # 平台风格分析
│   │   ├── idea-generation.hbs     # 脑洞发散
│   │   ├── idea-filter.hbs         # 题材筛选
│   │   └── theme-report.hbs        # 题材报告
│   ├── stage2/                     # 阶段二：大纲生成
│   │   ├── core-setting.hbs        # 核心设定构建
│   │   ├── character-web.hbs       # 人物关系网
│   │   ├── chapter-structure.hbs   # 章节结构规划
│   │   ├── reversal-table.hbs      # 递进反转表
│   │   ├── foreshadow-table.hbs    # 伏笔回收表
│   │   ├── chapter-detail.hbs      # 章节细化
│   │   ├── consistency-check.hbs   # 大纲一致性校验
│   │   └── outline-report.hbs      # 大纲报告
│   └── stage3/                     # 阶段三：正文生成（复用天龙8步）
│
├── tianlong-8step/                 # 天龙8步（10个模板）
│   ├── context-assembly.hbs        # 上下文装配
│   ├── step1-goal.hbs              # 目标设定
│   ├── step2-trigger.hbs           # 诱因设计
│   ├── step3-action.hbs            # 行动描写
│   ├── step4-obstacle.hbs          # 阻碍设置
│   ├── step5-misjudge.hbs          # 误判设定
│   ├── step6-reversal.hbs          # 反转描写
│   ├── step7-cost.hbs              # 代价交付
│   ├── step8-hook.hbs              # 钩子设计
│   └── chapter-qa.hbs              # 章节质检
│
├── long-novel/                     # 长篇（6个模板）
│   ├── book-skeleton.hbs           # 全书骨架
│   ├── volume-plan.hbs             # 分卷规划
│   ├── chapter-split.hbs           # 章节拆分
│   ├── foreshadow-network.hbs      # 伏笔网络
│   ├── long-consistency.hbs        # 长篇一致性检查
│   └── daily-gen-context.hbs       # 每日生成上下文
│
├── styles/                         # 多风格专属（7个模板）
│   ├── mass/                       # 群像
│   │   ├── action.hbs
│   │   └── dialogue.hbs
│   ├── system/                     # 系统
│   │   └── system-panel.hbs
│   ├── historical/                 # 历史
│   │   └── era-check.hbs
│   ├── war-resistance/             # 抗战
│   │   └── equipment-check.hbs
│   └── suspense/                   # 悬疑
│       └── clue-layout.hbs
│
├── attachments/                    # 外挂模块（6个模板）
│   ├── opening-boost.hbs           # 开头强化
│   ├── reversal-boost.hbs          # 反转强化
│   ├── platform-rewrite.hbs       # 平台改写
│   ├── title-synopsis.hbs          # 标题简介
│   ├── final-qa.hbs                # 终稿质检
│   └── copyright-check.hbs         # 版权检测
│
├── sensitive-words/                # 敏感词（3个模板）
│   ├── detection.hbs               # 检测
│   ├── replacement.hbs             # 替换建议
│   └── audit-report.hbs            # 过审报告
│
├── shared/                         # 共享组件
│   ├── partials/                   # 可复用片段
│   │   ├── character-card.hbs      # 角色卡注入
│   │   ├── world-constraint.hbs    # 世界观约束注入
│   │   ├── prev-chapter-hook.hbs   # 前章钩子注入
│   │   └── authors-note.hbs        # Author's Note 注入
│   └── helpers.js                  # 自定义 Handlebars Helper
```

### 2.2 变量注入规范

模板使用 **双花括号语法** `{{variable_path}}`，支持五类变量来源：

| 来源 | 前缀 | 示例 | 说明 |
|------|------|------|------|
| **用户输入** | `user_input.` | `{{user_input.material}}` | 用户在UI中填写的原始数据 |
| **链输出** | `chain_output.` | `{{chain_output.node_3.raw_ideas}}` | 前序节点的结构化输出 |
| **RAG检索** | `rag_result.` | `{{rag_result.foreshadowing.0.content}}` | RAG检索到的上下文 |
| **24维状态** | `state_engine.` | `{{state_engine.character.陆川.health}}` | 角色最新状态快照 |
| **常量/配置** | `constant.` | `{{constant.platform.tomato}}` | 系统级/项目级配置常量 |

**自定义 Handlebars Helper：**

```javascript
// helpers.js —— 模板引擎扩展函数
module.exports = {
  // JSON格式化
  json: (obj, indent = 2) => JSON.stringify(obj, null, indent),

  // 文本截断
  truncate: (str, len) => str && str.length > len ? str.slice(0, len) + '…' : str,

  // 中文字数统计
  wordCount: (str) => (str || '').replace(/\s/g, '').length,

  // 平台风格映射
  platformLabel: (key) => ({
    zhihu: '知乎盐选', tomato: '番茄短篇',
    qidian: '起点脑洞', douyin: '抖音故事',
    rule_horror: '规则怪谈'
  }[key] || key),

  // Author's Note 格式化
  formatAuthorsNotes: (notes) => {
    if (!notes || notes.length === 0) return '';
    return notes.map((n, i) =>
      `${i + 1}. [${n.scope}${n.type}] ${n.content}`
    ).join('\n');
  },

  // 上一章结尾提取
  prevChapterHook: (text) => {
    if (!text) return '无（这是第一章）';
    const lines = text.split('\n').filter(l => l.trim());
    return lines.slice(-3).join('\n');
  },

  // 出场角色列表格式化
  characterRoster: (chars) => {
    if (!chars || chars.length === 0) return '无特殊角色';
    return chars.map(c =>
      `【${c.name}】${c.identity} | 状态:${c.status} | 动机:${c.motivation}`
    ).join('\n');
  },

  // 质量门失败原因摘要
  failureSummary: (failures) => {
    if (!failures || failures.length === 0) return '';
    return failures.map(f => `- ${f.criterion}: ${f.reason}（得分:${f.score}）`).join('\n');
  },
};
```

### 2.3 版本管理

```typescript
// 模板版本管理
interface TemplateVersion {
  templateId: string;          // 如 "tianlong-step6-reversal"
  version: string;             // 语义版本 "1.2.0"
  changelog: string[];         // 变更记录
  modelTestResults: {          // 各模型测试结果
    [modelId: string]: {
      avgScore: number;        // 平均质量评分
      sampleCount: number;     // 测试样本数
      lastTestedAt: Date;
    }
  };
  activeSince: Date;           // 生效时间
  deprecatedAt?: Date;         // 废弃时间（软删除）
}

// 版本升级规则：
// - Patch (1.0.x)：措辞微调、示例更新 → 无需A/B测试
// - Minor (1.x.0)：新增约束、调整输出格式 → 需A/B测试（3样本/模型）
// - Major (x.0.0)：重写Prompt逻辑 → 需A/B测试（10样本/模型）+ 人工评审
```

**模板变更审计日志：**

```
prompt-version-history/
├── tianlong-step6-reversal/
│   ├── v1.0.0.yaml    # 初始版本（基于短故事三步骤.md原始模板）
│   ├── v1.1.0.yaml    # 增加"反转强度自查"要求
│   └── v1.2.0.yaml    # 适配DeepSeek模型，增加JSON输出格式约束
```

### 2.4 模板编写规范

每条模板必须包含以下结构区块：

```handlebars
{{!-- 模板ID: tianlong-step6-reversal --}}
{{!-- 版本: 1.2.0 --}}
{{!-- 适配模型: Claude, GPT-4, DeepSeek --}}
{{!-- 预期输出: JSON { reversal_type, reversal_text, reactions } --}}

# 系统指令
你是【角色身份】，你的任务是【具体任务】。

## 当前上下文
【从 RAG / 状态引擎 / 前序节点 注入的结构化信息】

## 执行要求
1.【硬约束 —— 必须遵守的规则】
2.【软约束 —— 建议遵守的风格要求】
3.【输出格式 —— JSON Schema 或 Markdown 模板】

## 质量和约束
- 禁止：【负面清单】
- 确保：【正面保证】

## 输出
严格按照以下格式输出：
【具体格式模板】
```

---

## 3. 短篇三阶段 Chain 完整定义

### 3.1 阶段一：题材生成 Chain

**Chain ID**: `short-story-stage1` | **节点数**: 5 | **预期耗时**: 60~90s

```
[Input] 用户素材（可选）+ 平台风格 + 关键词
   │
   ▼
Node 1: 素材解析 (material-parse)
  类型: prompt | 模型: 通用型(DeepSeek) | Temperature: 0.5
  └─ 解析用户输入，提取核心元素
  └─ 输出: parsed_elements { 核心主题, 可用元素[], 情感基调, 潜在冲突[] }
  └─ 若无素材（user_material 为空），跳过此节点，直接进入 Node 3
   │
   ▼
Node 2: 平台风格分析 (style-analysis)
  类型: prompt | 模型: 通用型 | RAG: 检索平台爆款特征
  └─ 分析选定平台的内容调性、用户画像、成败要素
  └─ 输出: style_profile { 用户画像, 成功要素[], 禁忌[], 字数区间 }
   │
   ▼
Node 3: 脑洞发散 (idea-generation)
  类型: prompt | 模型: 创意型(Claude/GPT-4) | Temperature: 0.9
  └─ 基于素材+平台特征，发散 5~8 个不完整故事脑洞
  └─ 输出: raw_ideas[] { 标题, 一句话钩子, 核心冲突, 反转方向 }
  └─ 无素材模式：基于社会热点自动生成
   │
   ▼
Node 4: 题材筛选排序 (idea-filter)
  类型: prompt | 模型: 强推理型 | Temperature: 0.6
  └─ 从脑洞中筛选 3~5 个最佳题材，按爆款潜力排序
  └─ 输出: filtered_ideas[] { 编号, 标题, 钩子, 身份, 场景, 冲突, 反转, 人气潜力, 相似案例, 创作难度 }
   │
   ▼
Node 5: 题材报告生成 (theme-report)
  类型: prompt | 模型: 通用型 | Temperature: 0.4
  └─ 生成最终可读的题材推荐报告（Markdown）
  └─ 质量门: 检查每个题材是否包含完整的 钩子/身份/场景/冲突/反转/平台适配/爆点判断
```

**关键保留：** Node 3 的 Prompt 必须保留原始"短故事三步骤.md"阶段一的核心约束——

```
1. 所有故事必须适合第一人称"我"来讲述
2. 开局必须有强钩子
3. 题材要有猎奇感、压迫感、现实感和反转感
4. 不要写玄而又玄的空泛设定，必须能落到具体中国生活场景
5. 如果参考新闻热点，只提炼社会议题和情绪冲突，不直接影射现实个人
6. 不要直接写正文
7. 输出后，请让我从中选择一个题材进入第二阶段
```

### 3.2 阶段二：大纲生成 Chain

**Chain ID**: `short-story-stage2` | **节点数**: 8 | **预期耗时**: 120~180s

```
[Input] 选定题材(来自阶段一) + 平台风格 + 目标字数
   │
   ▼
Node 1: 核心设定构建 (core-setting)
  类型: prompt | 模型: 强推理型(Claude) | Temperature: 0.5
  └─ 构建故事核心设定
  └─ 输出: core_settings {
      标题, 一句话高概念, 主角"我"的身份, 最初困境,
      最想要什么, 最害怕什么, 反派或阻碍力量, 故事发生地,
      核心异常事件, 最终情绪落点
    }
  └─ 保留原始模板的10字段结构
   │
   ▼
Node 2: 人物关系网 (character-web)
  类型: prompt | 模型: 强推理型 | Temperature: 0.5
  └─ 构建所有核心角色及关系网络
  └─ 输出: characters[] {
      人物名, 表面身份, 真实目的, 与"我"的关系,
      想要什么, 隐瞒了什么, 在第几次反转中起作用, 最终结局
    }
  └─ 保留原始模板的8维度/人结构
   │
   ▼
Node 3: 章节结构规划 (chapter-structure)
  类型: prompt | 模型: 强推理型 | Temperature: 0.5
  └─ 规划9段式章节结构
  └─ 输出: chapter_structure {
      开篇钩子, 异常降临, 试探与误判, 危机升级,
      第一次大反转, 真相逼近, 高潮对峙, 终局反转, 尾声余味
    }
  └─ 每章包含：发生了什么/冲突/伏笔/小钩子
   │
   ▼
Node 4: 递进反转表 (reversal-table)
  类型: prompt | 模型: 创意型(Claude) | Temperature: 0.8
  └─ 规划至少3次递进式反转
  └─ 输出: reversal_table[] {
      反转位置, 表面真相, 实际真相, 前文伏笔,
      揭露方式, 对主角的打击, 对读者的冲击, 是否会改变前文重读理解
    }
  └─ 保留原始模板的8维度/反转结构
   │
   ▼
Node 5: 伏笔回收表 (foreshadow-table)
  类型: prompt | 模型: 强推理型 | Temperature: 0.5
  └─ 规划至少8个伏笔
  └─ 输出: foreshadow_table[] {
      伏笔内容, 出现位置, 当时读者会如何理解,
      后文如何回收, 回收后的冲击效果
    }
  └─ 保留原始模板的5维度/伏笔结构
   │
   ▼
Node 6: 章节细化 (chapter-detail)
  类型: prompt | 模型: 强推理型 | Temperature: 0.5
  └─ 将每章大纲细化为可执行方案
  └─ 输出: detailed_outline[] {
      核心内容, 场景[], 出场角色[], 冲突设计, 爽点设置,
      伏笔设置[], 伏笔回收[], 结尾钩子, 目标字数
    }
  └─ 质量门: 每章必须有冲突+结尾钩子+信息增量
   │
   ▼
Node 7: 大纲一致性校验 (consistency-check)
  类型: prompt | 模型: 强推理型(Claude) | Temperature: 0.2
  └─ 全面检查逻辑一致性
  └─ 输出: consistency_report { 通过, 冲突列表[], 遗漏项[], 修改建议[] }
  └─ 质量门: 不通过则返回 Node 3 修正
  └─ 关键检查：反转是否有前文伏笔支撑？伏笔是否都有回收位置？
   │
   ▼
Node 8: 大纲报告生成 (outline-report)
  类型: prompt | 模型: 通用型 | Temperature: 0.4
  └─ 生成可读大纲文档（Markdown格式，含全部5部分）
  └─ 质量门: 最终格式完整性检查
```

**关键保留：** 阶段二的原始约束——

```
1. 故事必须发生在中国
2. 叙事视角必须是第一人称"我"
3. 主角不能是纯旁观者，必须主动试探、调查、反击或破局
4. 大纲必须有递进式反转，不能只在结尾反转一次
5. 避免"做梦""精神病""系统强行解释"等廉价反转
6. 人物动机必须合理
7. 故事整体要有中国现实生活质感
```

### 3.3 阶段三：天龙8步法正文生成 Chain

**Chain ID**: `tianlong-8step` | **节点数**: 10 | **每章耗时**: 90~180s

```
[Input] 本章大纲（来自阶段二）+ 前文摘要 + 伏笔状态
   │
   ▼
Node 0: 上下文装配 (context-assembly)
  类型: transform（非LLM节点）
  └─ 功能: 装配RAG上下文（RTCO分级注入）
  └─ P0（强制·~2K tokens）：本章大纲 + 上一章结尾钩子
  └─ P1（关键·~4K tokens）：出场角色状态 + 世界观约束 + 应回收伏笔
  └─ P2（参考·~6K tokens）：前3章摘要 + 伏笔原始文本 + 素材库条目
   │
   ▼
Node 1~8: 天龙8步（顺序执行）

  Node 1: 目标 (step1-goal)
    模型: 强推理型 | Temp: 0.5
    输出: { 主角, 本章目标, 动机, 输赢条件 }
    质量门: 目标是否与角色动机一致（与RAG角色卡对比）

  Node 2: 诱因 (step2-trigger)
    模型: 通用型 | Temp: 0.6
    输出: { 触发事件, 触发方式, 紧急程度 }
    质量门: 诱因是否具体、突然、有压迫感

  Node 3: 行动 (step3-action)
    模型: 写手型(低成本) | Temp: 0.8
    输出: action_text（600~1000字正文）
    质量门: OOC检测 + 是否"主动做事"而非"只在心里想"

  Node 4: 阻碍 (step4-obstacle)
    模型: 强推理型 | Temp: 0.6
    输出: { 阻碍类型, 阻碍描述, 主角反应 }
    质量门: 阻碍是否合理且有张力

  Node 5: 误判 (step5-misjudge)
    模型: 创意型 | Temp: 0.7
    输出: { 主角认为, 实际真相, 信息差来源, 误判后果 }
    质量门: 误判是否与前文信息一致（不能是"突然降智"）

  Node 6: 反转 (step6-reversal) ★ 核心高潮节点
    模型: 强推理型(高性能) | Temp: 0.7
    输出: { 反转类型, 反转时刻描写(400~800字), 各方反应 }
    质量门: 反转是否有前文伏笔支撑（与伏笔管理系统交叉验证）
    RAG: 获取反转相关伏笔的原始埋设文本

  Node 7: 代价 (step7-cost)
    模型: 写手型 | Temp: 0.7
    输出: { 代价类型, 代价描写(200~400字), 后续影响 }
    RAG: 触发24维状态引擎更新（记录角色新状态）

  Node 8: 钩子 (step8-hook)
    模型: 创意型 | Temp: 0.8
    输出: { 钩子类型, 钩子文本, 下章衔接方向 }
    质量门: 钩子是否制造了"想看下一章"的欲望
   │
   ▼
Node 9: 正文合成 (chapter-synthesis)
  类型: transform（非LLM节点）
  └─ 功能: 将 Node 3/6/7/8 的正文片段按序拼接
  └─ 自动添加衔接过渡句
  └─ 输出: full_chapter（完整Markdown正文）
   │
   ▼
Node 10: 章节质检 (chapter-qa)
  类型: prompt | 模型: 质检型 | Temp: 0.3
  └─ 输出: qa_report {
      通过, 大纲吻合度, 角色一致性, AI痕迹指数,
      热血感评分, 章节结尾吸引力, 版权风险, 问题列表[]
    }
  └─ 质量门: 不通过 → 根据失败维度回退到对应节点重试
```

**天龙8步法核心约束（保留原始模板约束）：**

```
1. 全文第一人称"我"，开头直接进入事件，不做铺垫
2. 8步不暴露小标题，自然融入剧情
3. 每300字左右必须出现一次新的疑点/冲突/信息变化
4. 对话要短、有压迫感，不能解释过多
5. 细节要有中国生活质感（小区门禁/物业群/派出所/医院走廊/县城街道/
   婚宴大厅/工位/监控/微信群/外卖柜/短视频评论区等）
6. 主角必须主动做事，不能一直被动等待
7. 每章结尾必须留下强钩子
8. 不要总结，不要解释创作思路，只输出小说正文
```

---

## 4. 长篇每日工作流 Chain 设计

### 4.1 长篇 vs 短篇的关键差异

```
短篇（3K~1W字）：单线因果 + 单次高潮 + 单角色弧光 + 1次性大纲
长篇（10W+字）：多线交织 + 多次波浪型高潮 + 多角色并行弧光 +
               伏笔网络 + 世界观迭代 + 每日重复工作流
```

### 4.2 长篇大纲 Chain

**Chain ID**: `long-novel-outline` | **节点数**: 6 | **一次性执行**

```
[Input] 核心创意 + 目标字数(200万字) + 世界观设定 + 风格
   │
   ▼
Node 1: 全书骨架 (book-skeleton)
  模型: 强推理型(Claude/GPT-4) | Temp: 0.5
  └─ 输出「全书规划书」：
      核心冲突（什么推动全书）、主线(A/B/C线)、主题表达、
      分卷规划(X卷，每卷核心)、体量评估（400~500章/每章4000~5000字）
   │
   ▼
Node 2: 分卷规划 (volume-plan) —— 每卷独立执行
  模型: 强推理型 | Temp: 0.5
  └─ 输出: volume { 卷号, 卷名, 卷目标, 起承转合, 核心事件[],
      Goal弧线类型, 章节数(每卷约50章/25万字), 开卷状态, 收卷状态 }
  └─ 8卷 × 每卷独立一次调用（可批量并行）
   │
   ▼
Node 3: 章节拆分 (chapter-split)
  模型: 强推理型 | Temp: 0.4
  └─ 每卷拆分为具体章节列表
  └─ 输出: chapters[] { 章号, 章名, 核心内容, 章节功能(6种),
      Goal弧线阶段, 目标字数, 主要出场角色[], 核心冲突 }
   │
   ▼
Node 4: 章节功能分布检查 (chapter-function-check)
  类型: transform（非LLM节点）
  └─ 分析爆发章/呼吸章/蓄力章/铺垫章/过渡章/收束章的占比
  └─ 检查高潮间隔：每3章小高潮 / 每10章大高潮
   │
   ▼
Node 5: 伏笔网络规划 (foreshadow-network)
  模型: 强推理型 | Temp: 0.5
  └─ 输出三级伏笔体系：
      - 全局伏笔（贯穿全书，5~8个）：如主角身世、终极BOSS
      - 卷级伏笔（在本卷内埋设+回收，每卷3~5个）
      - 章节伏笔（跨章不超过3章，每章1~2个）
   │
   ▼
Node 6: 长篇一致性检查 (long-consistency)
  模型: 强推理型(Claude) | Temp: 0.2
  └─ 输出评估报告：主线逻辑/分卷衔接/角色弧光完整性/伏笔网络完整性/节奏评估
  └─ 质量门: 任一维度 < 6/10 → 回退修正
```

### 4.3 长篇每日生成 Chain（核心工作流）

**Chain ID**: `long-novel-daily-gen` | **节点数**: 12 | **每章耗时**: 120~240s

```
[每日工作流启动]
   │
   ▼
Node A: 长篇上下文装配 (daily-gen-context) —— 非LLM节点
  └─ RTCO三级注入：
     P0(强制·~2K tokens)：
       ├─ 本章大纲全文
       ├─ 上一章最后500字（用于衔接判断）
       ├─ 上一章结尾钩子类型
       └─ 本章衔接模式（紧衔接/跳衔接/平行衔接）
     P1(关键·~4K tokens)：
       ├─ 出场角色最新24维状态快照（伤势/位置/关系/承诺/能力…）
       ├─ 出场角色性格摘要 + 对话风格
       ├─ 相关世界观约束（时代/地理/势力）
       └─ 本章应回收伏笔列表（来自伏笔管理系统）
     P2(参考·~6K tokens)：
       ├─ 前5章正文摘要
       ├─ 伏笔原始埋设文本
       ├─ 本卷Goal弧线进度
       └─ 素材库相关条目
   │
   ▼
Node B: 衔接判断 (transition-judge) —— 非LLM节点
  └─ 根据上一章结尾钩子类型决定衔接模式：
     - 悬念钩子 → 紧衔接（前200字直接承接）
     - 对话钩子 → 紧衔接同上
     - 动作钩子 → 紧衔接（动作连续）
     - 情绪钩子 → 可跳衔接（时间/场景微切换）
  └─ 输出: transition_instruction → 注入到 Node C 的 Prompt
   │
   ▼
Node C: 天龙8步生成（同短篇的节点1~8）
  附加长篇特有检查：
  └─ 每步增加角色状态连续性检查（24维状态引擎实时查询）
  └─ 伏笔回收状态检查（如果本章标记了回收伏笔，检查是否确实回收）
  └─ 场景道具连续性检查（上一章出现的物件不能无故消失/出现）
  └─ 时间线检查（无断层/重叠/倒叙不一致）
   │
   ▼
Node K: 长篇三连续检查 (three-continuity-check) —— 非LLM节点
  └─ 角色连续：第N章状态 = 第N-1章结束状态 ± 本章变化
  └─ 场景连续：场景道具无矛盾
  └─ 时间连续：时间线无断层/重叠
   │
   ▼
Node L: 信息回写 (info-writeback) —— 非LLM节点（事务性）
  └─ 同步写入：
     ├─ 24维状态引擎（角色新状态 + 状态变化时间戳）
     ├─ 伏笔管理系统（新埋设伏笔 + 已回收伏笔标记）
     ├─ RAG索引（本章摘要 + 关键事件 + 向量嵌入）
     ├─ 章节文件（写入 chapters/{vol}-{ch}.md + YAML front matter）
     └─ SQLite主数据（章节元数据 + 状态快照）
  └─ 事务保证：全部成功或全部回滚
```

### 4.4 日更工作流提示词模板

```
# 长篇每日章节生成提示词
# 模板ID: daily-gen-context
# 版本: 1.0.0

你是一名成熟的长篇网络小说写手，正在创作一部【{{user_input.genre}}】类型的长篇小说。

## 作品总设定
- 书名：{{user_input.book_title}}
- 核心冲突：{{chain_output.book_skeleton.core_conflict}}
- 当前进度：第{{user_input.current_volume}}卷 第{{user_input.current_chapter}}章
- 目标字数：本章 {{user_input.target_words}} 字
- 当前风格：{{constant.style_label}}

## 上一章结尾（衔接依据）
{{chain_output.prev_chapter_end}}

## 本章大纲
{{chain_output.chapter_outline}}

## 本章必须完成的剧情功能
- 章节类型：{{chain_output.chapter_function}}（{{chapterFunctionLabel}}）
- 应回收伏笔：{{#each chain_output.foreshadowing_to_recover}}
  - {{content}}（埋设于第{{buried_at}}章）
{{/each}}

## 出场角色状态
{{characterRoster chain_output.active_characters}}

## 世界观约束
{{#each chain_output.active_constraints}}
- {{this}}
{{/each}}

## 写作要求

### 硬约束
1. 严格第一人称"我"（或第三人称，根据项目设定）
2. 开头直接承接上一章结尾，不做铺垫
3. 每章必须隐含天龙8步：目标→诱因→行动→阻碍→误判→反转→代价→钩子
4. 不得在正文中暴露8步结构
5. 每300字必须有新的信息变化（疑点/冲突/揭示）
6. 对话占比30~40%，用"三板斧"（动作/表情/背景）丰富对话
7. 本章如标记回收伏笔，必须在正文中自然回收

### 软约束
1. 细节要有中国现实生活质感
2. 角色说话风格必须一致（参考上方角色状态中的对话风格）
3. 如有战斗场景，根据{{constant.style_label}}风格确定描写比例
4. 章节结尾必须有强钩子，让读者产生"下拉冲动"

### 禁止
- 提前泄露最终真相（除非本章是终局反转章）
- 角色OOC（行为与已建立性格矛盾）
- 空降设定（无前文铺垫的新规则）
- 解释性独白超过100字

## 输出
直接输出小说正文，不要小标题、不要分析、不要解释。
以一句强钩子结尾。
```

### 4.5 长篇日更频率约束

```
日更6000~8000字的 Chain 工作量估算：

1. 上下文装配（Node A）：10min（人工检查大纲+伏笔状态）
2. 生成本章 Prompt（Node B）：20min（填入具体变量+检查）
3. AI 执行天龙8步（Node C）：30~45min（批量生成+等待）
4. 三连续检查（Node K）：5min（自动，人工复核）
5. 人工修改：1~2h（最重要环节）
6. 信息回写（Node L）：自动（<5s）

总耗时：约2~3小时/章，适合日更节奏
```

---

## 5. 多风格引擎的 Prompt 差异化方案

### 5.1 风格定义文件结构

每种风格是一个独立的 YAML 配置包，存储于 `chains/styles/{style_id}.yaml`：

```yaml
# 示例：styles/historical.yaml
style:
  id: historical
  name: "历史"
  description: "基于真实历史背景，时间线严格对齐，人物行为受时代约束"

  # 章节功能比例（覆盖全局默认值）
  chapterFunctionRatios:
    breathing:   0.08   # 呼吸章（历史叙事节奏较缓）
    charging:    0.20   # 蓄力章
    explosion:   0.15   # 爆发章
    paving:      0.25   # 铺垫章（历史需更多背景铺垫）
    transition:  0.15   # 过渡章
    closing:     0.17   # 收束章

  # 写作规则（注入到系统提示词中）
  writingRules:
    - "时间线必须严格对齐所选历史时期的真实事件"
    - "人物行为必须符合当时的社会制度、阶级和道德观念"
    - "禁止出现超越时代的科技、词汇和观念"
    - "历史人物如出场，其大事件时间固定不可修改"
    - "架空历史需明确标注'基于XX时代/YY事件改编'"

  # Prompt 覆盖（按节点 ID 覆盖默认模板）
  promptOverrides:
    "tianlong-step3-action":
      templateId: "styles/historical/action.hbs"
      temperature: 0.7
      extraConstraints:
        - "行动描写需注意时代背景下的可行性（如古代不能打电话）"
    "tianlong-step6-reversal":
      templateId: "styles/historical/reversal.hbs"
      temperature: 0.6
      extraConstraints:
        - "反转需符合历史逻辑，不能凭空改变历史走向"

  # 质量门覆盖（增加历史专属质检维度）
  qualityGateOverrides:
    eraConsistency:
      type: llm_judge
      criteria:
        - "文中是否有时代错误（物品/词汇/制度/观念）"
        - "历史人物行为是否与史实严重矛盾"
      threshold: 8
      onFailure: retry

  # 模型偏好（历史类对逻辑要求更高）
  modelPreference:
    default: "claude"     # Claude 在逻辑一致性上表现最佳
    qaNode: "claude"

  # 默认 Goal 弧线
  defaultGoalArc: "build_climax"  # 历史类常用"铺垫→高潮"
```

### 5.2 七种风格的差异化参数表

| 维度 | 群像 | 系统 | 历史 | 抗战 | 都市 | 玄幻 | 悬疑 |
|------|------|------|------|------|------|------|------|
| **Temperature** | 0.8 | 0.5 | 0.5 | 0.4 | 0.7 | 0.8 | 0.6 |
| **对话占比** | 35~45% | 20~30% | 30~40% | 25~35% | 35~45% | 25~35% | 30~40% |
| **战斗/场景描写** | 低 | 高(面板) | 中 | 高 | 低 | 高 | 低 |
| **段落长度** | 短(100~200字) | 中 | 中 | 中 | 短 | 中 | 短 |
| **伏笔密度** | 中 | 低 | 高 | 中 | 中 | 中 | 极高 |
| **反转频率** | 每5章 | 每8章 | 每6章 | 每5章 | 每4章 | 每6章 | 每3章 |
| **优先模型** | Claude | DeepSeek | Claude | Claude | GPT-4 | DeepSeek | Claude |
| **章节功能侧重** | 铺垫25% | 爆发25% | 铺垫25% | 爆发22% | 过渡18% | 爆发25% | 铺垫30% |
| **最大POV/章** | 3 | 1 | 2 | 2 | 2 | 1 | 1 |

### 5.3 风格注入流程

```
用户选择风格 → style-loader 加载对应 YAML
  │
  ├─ 覆盖全局 chapterFunctionRatios
  ├─ 覆盖对应节点的 promptTemplateId
  ├─ 注入 writingRules 到系统提示词
  ├─ 注入 qualityGateOverrides
  └─ 注入 modelPreference
  │
  ▼
每次 Chain 执行前：
  ├─ Node 0（上下文装配）注入风格专属约束
  ├─ 各 Prompt 节点使用风格专属模板（如果覆盖了）
  └─ Node 10（质检）增加风格专属质检维度
```

### 5.4 风格混搭支持

```typescript
// 混搭配置
interface BlendedStyle {
  primary: string;     // 主风格ID（如 "historical"）
  secondary: string[]; // 子风格ID（如 ["mass_narrative"]）
  // 冲突解决规则：主风格优先
  conflictResolution: 'primary_wins' | 'merge' | 'custom';
}

// 示例：历史+群像混搭
const blended: BlendedStyle = {
  primary: 'historical',
  secondary: ['mass_narrative'],
  conflictResolution: 'primary_wins',
};
// 结果：时代约束来自历史，视角切换规则来自群像，
//       冲突时（如 chapterFunctionRatios）以历史为准
```

---

## 6. 质量门（Quality Gate）设计

### 6.1 质量门分级体系

| 级别 | 标识 | 含义 | 处理方式 |
|------|------|------|---------|
| **CRITICAL** | 🔴 | 致命缺陷：逻辑矛盾、角色OOC、伏笔断裂 | 必须重试（最多3次），仍失败则停止Chain |
| **WARNING** | 🟡 | 一般问题：文风偏差、节奏不当、AI痕迹偏高 | 建议重试（最多2次），仍失败则标记+继续 |
| **INFO** | 🟢 | 优化建议：可改进但不影响全局 | 仅记录，不阻断流程 |

### 6.2 各节点的质量门配置

#### 阶段一·题材生成

| 节点 | 门类型 | 检查项 | 阈值 | 级别 | 失败处理 |
|------|--------|--------|------|------|---------|
| Node 3 脑洞发散 | Rule | 输出至少5个脑洞 | count ≥ 5 | WARNING | retry |
| Node 4 题材筛选 | Rule | 每个题材含10个必要字段 | 100% | CRITICAL | retry |
| Node 5 报告生成 | Rule + LLM | 钩子是否真的有吸引力 | ≥ 6/10 | WARNING | retry |

#### 阶段二·大纲生成

| 节点 | 门类型 | 检查项 | 阈值 | 级别 | 失败处理 |
|------|--------|--------|------|------|---------|
| Node 1 核心设定 | Rule | 10字段完整 | 100% | CRITICAL | retry |
| Node 2 人物关系 | Rule | 每人8维度完整 | 100% | CRITICAL | retry |
| Node 3 章节结构 | Rule | 9段结构齐全 + 每章有冲突和钩子 | 100% | CRITICAL | retry |
| Node 4 反转表 | Rule + LLM | ≥3次反转 + 每次8维度 + 反转有冲击力 | ≥ 7/10 | CRITICAL | retry |
| Node 5 伏笔表 | Rule | ≥8个伏笔 + 每个有回收位置 | 100% | WARNING | retry |
| Node 6 章节细化 | Rule + LLM | 每章冲突+钩子+信息增量 | ≥ 7/10 | CRITICAL | retry |
| Node 7 一致性校验 | LLM | 反转有伏笔支撑 / 伏笔都有回收 / 无逻辑矛盾 | ≥ 8/10 | CRITICAL | 回退到Node 3 |

#### 阶段三·天龙8步正文

| 节点 | 门类型 | 检查项 | 阈值 | 级别 | 失败处理 |
|------|--------|--------|------|------|---------|
| Node 1 目标 | Rule + LLM | 目标与角色动机一致 | ≥ 8/10 | WARNING | retry(2) |
| Node 2 诱因 | LLM | 诱因具体、突然、有压迫感 | ≥ 7/10 | WARNING | retry(2) |
| Node 3 行动 | Rule + LLM | OOC检测 + 主动行动(非纯心理) | ≥ 7/10 | CRITICAL | retry(3) |
| Node 4 阻碍 | LLM | 阻碍合理且有张力 | ≥ 7/10 | WARNING | retry(2) |
| Node 5 误判 | Rule + LLM | 误判与前文信息一致（非降智） | ≥ 7/10 | CRITICAL | retry(3) |
| Node 6 反转 | Rule + LLM | 反转有伏笔支撑 + 冲击力 | ≥ 8/10 | CRITICAL | retry(3) |
| Node 7 代价 | Rule | 代价与反转匹配 | ≥ 6/10 | WARNING | retry(2) |
| Node 8 钩子 | LLM | 钩子制造"想看后续"欲望 | ≥ 7/10 | CRITICAL | retry(3) |
| Node 10 质检 | Rule + LLM | 综合质量（见下方10维质检） | ≥ 7/10 | CRITICAL | 回退到对应失败节点 |

### 6.3 10维终稿质检标准

```typescript
interface FinalQAStandard {
  openingHook:        { threshold: 7, weight: 1.5 };  // 开头钩子（前500字）
  hotBlood:           { threshold: 6, weight: 1.0 };  // 热血感（爽点密度/对抗张力）
  shortForeshadow:    { threshold: 6, weight: 1.2 };  // 短伏笔密度（2~3章内回收）
  longForeshadow:     { threshold: 5, weight: 1.0 };  // 长伏笔密度（10章+回收）
  chapterEndHook:     { threshold: 7, weight: 1.5 };  // 章节结尾吸引力
  immersion:          { threshold: 7, weight: 1.0 };  // 代入感（角色共鸣度）
  suspenseDensity:    { threshold: 6, weight: 1.0 };  // 悬念密度（伏笔密度）
  reversalImpact:     { threshold: 6, weight: 1.3 };  // 反转力度（意外又合理）
  characterMotivation:{ threshold: 7, weight: 1.2 };  // 人物动机（行为逻辑）
  aiTraceIndex:       { threshold: 25, invert: true };// AI痕迹指数（≤25%过关，>40%必须降AI）
}

// 加权总分计算
// 总分 = Σ(维度得分 × 权重) / Σ(权重)
// ≥ 7.0 → 通过 | 6.0~6.9 → 警告 | < 6.0 → 不通过
```

### 6.4 质量门执行流程

```
节点执行完成 → 输出结果
  │
  ├─ Rule 类型门：规则引擎立即检查
  │    ├─ 通过 → 继续下一个节点
  │    └─ 失败 → 重试逻辑
  │
  ├─ LLM Judge 类型门：调用评审模型
  │    ├─ 评审 Prompt 包含：原输出 + 检查标准 + 上下文
  │    ├─ 评审模型输出：{ passed, score, reasons[], suggestions[] }
  │    ├─ 通过 → 继续
  │    └─ 失败 → 重试逻辑
  │
  └─ 重试逻辑：
       ├─ retryCount > 0：带上失败原因重新执行本节点
       ├─ retryCount = 0：
       │    ├─ onFailure = 'retry'：追加一次最终重试
       │    ├─ onFailure = 'skip'：标记跳过，继续
       │    ├─ onFailure = 'fallback'：执行 nextOnFailure 节点
       │    └─ onFailure = 'stop'：终止 Chain，返回部分结果
       └─ 每次重试时 Temperature 微调 +0.05（增加变化）
```

### 6.5 长篇三连续检查（额外质量门）

```
每章生成后自动执行，不通过时触发修正：

角色连续性检查：
  输入：上章结尾角色状态 vs 本章任何角色状态引用
  检测：伤势程度/位置/装备/关系/承诺是否一致
  不一致示例：第5章"陆川左手中枪" → 第6章"陆川双手举枪"

场景连续性检查：
  输入：上章场景道具列表 vs 本章场景道具列表
  检测：道具是否无故消失/出现
  不一致示例：第5章"桌上放着茶杯" → 第6章（同一场景未提茶杯，也未解释）

时间连续性检查：
  输入：上章结束时间 vs 本章开始时间
  检测：时间线是否断层/重叠/倒叙未标记
  不一致示例：第5章"深夜" → 第6章"正午"（中间无过渡）
```

---

## 7. 模型适配策略

### 7.1 模型能力矩阵

| 模型 | 核心优势 | 核心劣势 | 最佳场景 | 推荐 Temperature |
|------|---------|---------|---------|-----------------|
| **Claude 3.5 Sonnet** | 长文逻辑一致性、角色一致性、遵循复杂指令 | 创意发散较弱、JSON格式偶有偏差 | 大纲规划、反转设计、一致性校验、长篇骨架 | 0.3~0.6 |
| **GPT-4o** | 创意发散、指令遵循精确、JSON输出稳定 | 长篇一致性略弱、中文细节不如国产模型 | 脑洞发散、题材筛选、钩子设计 | 0.7~0.9 |
| **DeepSeek-V3** | 长文生成性价比极高、中文语感好、速度极快 | 复杂逻辑推理略弱 | 正文行动描写、过渡章节、批量生成 | 0.7~0.9 |
| **Kimi (Moonshot)** | 超长上下文(128K+)、对话角色一致性 | 创意能力中等、速度较慢 | 长篇上下文装配、角色对话生成 | 0.5~0.7 |
| **GLM-4** | 中文理解细腻、成本极低 | 长篇一致性一般、JSON输出不稳定 | 素材解析、风格分析、精修辅助 | 0.4~0.6 |
| **Qwen 2.5** | 中文细节优秀、指令遵循好 | 创意发散中等 | 中国现实场景描写、质检辅助 | 0.4~0.6 |

### 7.2 Chain 节点 → 模型 路由表

```typescript
const CHAIN_MODEL_ROUTING = {
  // ===== 阶段一：题材生成 =====
  'short-story-stage1.node1': { // 素材解析
    primary: 'deepseek', fallback: 'glm', temperature: 0.5, tier: 'economy'
  },
  'short-story-stage1.node3': { // 脑洞发散 ★
    primary: 'gpt4o', fallback: 'claude', temperature: 0.9, tier: 'performance'
  },
  'short-story-stage1.node4': { // 题材筛选
    primary: 'claude', fallback: 'gpt4o', temperature: 0.6, tier: 'performance'
  },

  // ===== 阶段二：大纲生成 =====
  'short-story-stage2.node1': { // 核心设定
    primary: 'claude', fallback: 'gpt4o', temperature: 0.5, tier: 'performance'
  },
  'short-story-stage2.node4': { // 反转表 ★
    primary: 'claude', fallback: 'gpt4o', temperature: 0.8, tier: 'performance'
  },
  'short-story-stage2.node7': { // 一致性校验
    primary: 'claude', fallback: null, temperature: 0.2, tier: 'performance' // Claude 独占，不降级
  },

  // ===== 阶段三：天龙8步 =====
  'tianlong-8step.node1': { primary: 'claude', fallback: 'gpt4o', temp: 0.5, tier: 'performance' },
  'tianlong-8step.node2': { primary: 'deepseek', fallback: 'glm', temp: 0.6, tier: 'economy' },
  'tianlong-8step.node3': { primary: 'deepseek', fallback: 'kimi', temp: 0.8, tier: 'economy' }, // 行动描写: 量大，走低成本
  'tianlong-8step.node4': { primary: 'claude', fallback: 'deepseek', temp: 0.6, tier: 'balanced' },
  'tianlong-8step.node5': { primary: 'gpt4o', fallback: 'claude', temp: 0.7, tier: 'balanced' },
  'tianlong-8step.node6': { primary: 'claude', fallback: null, temp: 0.7, tier: 'performance' }, // 反转描写: ★核心，不降级
  'tianlong-8step.node7': { primary: 'deepseek', fallback: 'glm', temp: 0.7, tier: 'economy' },
  'tianlong-8step.node8': { primary: 'gpt4o', fallback: 'claude', temp: 0.8, tier: 'performance' }, // 钩子设计: 需要创意
  'tianlong-8step.node10': { primary: 'claude', fallback: 'gpt4o', temp: 0.3, tier: 'performance' }, // 质检

  // ===== 长篇大纲 =====
  'long-novel-outline.node1': { primary: 'claude', fallback: null, temp: 0.5, tier: 'performance' },
  'long-novel-outline.node6': { primary: 'claude', fallback: null, temp: 0.2, tier: 'performance' },

  // ===== 精修 =====
  'polish.deai': { primary: 'deepseek', fallback: 'glm', temp: 0.4, tier: 'economy' },
  'polish.describe': { primary: 'gpt4o', fallback: 'claude', temp: 0.7, tier: 'balanced' },
};
```

### 7.3 Temperature 动态调节策略

```typescript
// Temperature 不是固定值，而是根据以下因素动态计算：

function calculateTemperature(
  baseTemp: number,
  context: NodeContext
): number {
  let temp = baseTemp;

  // 1. 重试时微升（增加变化，避免相同输出）
  if (context.retryCount > 0) {
    temp += 0.05 * context.retryCount;
  }

  // 2. 质量门不通过再次重试时继续微升
  if (context.qualityGateFailureCount > 0) {
    temp += 0.03 * context.qualityGateFailureCount;
  }

  // 3. 如果是"爆发章"函数类型，降低温度（需要更稳定）
  if (context.chapterFunction === 'explosion') {
    temp -= 0.1;
  }

  // 4. 上限和下限
  temp = Math.max(0.2, Math.min(1.2, temp));

  return temp;
}
```

### 7.4 成本优化策略

```typescript
const COST_STRATEGY = {
  // 高性能模型预算占比
  performanceBudget: 0.30,  // 30%的调用使用高性能模型

  // 节能模式触发阈值（剩余预算 < 10% → 全部降级）
  economyThreshold: 0.10,

  // 高性能模型白名单（即使预算不足也不能降级的节点）
  performanceWhitelist: [
    'tianlong-8step.node6',      // 反转描写 → 核心高潮
    'tianlong-8step.node10',     // 质检评审 → 需要最强逻辑
    'long-novel-outline.node1',  // 全书骨架 → 全局规划
    'long-novel-outline.node6',  // 长篇一致性 → 关键检查
  ],

  // 成本分级
  tiers: {
    performance: { maxCostPerCall: 0.05 },   // $0.05/次
    balanced:    { maxCostPerCall: 0.01 },   // $0.01/次
    economy:     { maxCostPerCall: 0.002 },  // $0.002/次
  },
};

// 预估：一篇1万字短篇（约8章正文 + 题材+大纲）
// 高性能调用: 约15次 × $0.05 = $0.75
// 均衡调用:   约10次 × $0.01 = $0.10
// 经济调用:   约25次 × $0.002 = $0.05
// 总成本: 约 $0.90/篇

// 预估：一章4000字长篇正文（每日工作流）
// 高性能调用: 约3次 × $0.05 = $0.15
// 均衡调用:   约2次 × $0.01 = $0.02
// 经济调用:   约5次 × $0.002 = $0.01
// 总成本: 约 $0.18/章，全书500章 ≈ $90
```

### 7.5 模型故障转移流程

```
调用主模型
  │
  ├─ 成功 → 返回结果
  │
  ├─ 超时（timeout秒内无响应）
  │    └─ 自动切换到 fallback 模型（如果配置了）
  │    └─ 无 fallback → 重试主模型1次 → 仍失败 → 节点失败
  │
  ├─ API错误（限流/额度不足/认证失败）
  │    └─ 限流(429) → 等待 retry-after 秒 → 重试
  │    └─ 额度不足 → 切换到 fallback 模型
  │    └─ 认证失败 → 停止 Chain，提示用户检查 API Key
  │
  └─ 输出格式错误（JSON解析失败等）
       └─ 自动追加格式修正 Prompt → 重新调用同一模型
       └─ 2次格式修正失败 → 切换到 fallback 模型
```

---

## 8. Author's Note 注入机制

### 8.1 什么是 Author's Note

Author's Note 是用户在每章生成前设置的 **临时强制规则**，直接注入到该章的 Prompt 链中。它允许用户在不修改全局设定的情况下，对单章或一段章节进行精细控制。

**规则来源与优先级：**

```
Author's Note（用户临时规则）  ← 最高优先级
    ↓ 覆盖
Prompt 模板中的硬约束
    ↓ 覆盖
风格引擎的 Writing Rules
    ↓ 覆盖
模型默认行为
```

### 8.2 Author's Note 数据结构

```typescript
interface AuthorsNote {
  id: string;
  content: string;              // 规则文本，如 "本章不能让主角死亡"
  type: 'plot_constraint'       // 情节约束
       | 'style_requirement'    // 风格要求
       | 'setting_override'     // 设定覆盖
       | 'foreshadow_operation' // 伏笔操作
       | 'custom';              // 自定义
  scope: 'single_chapter'       // 仅当前章节（默认）
       | 'current_volume'       // 当前卷剩余所有章节
       | 'permanent';           // 所有后续章节（直到手动删除）
  priority: number;             // 1~5，数字越大优先级越高
  createdAt: Date;
  activeFrom?: number;          // 从第几章开始生效
  activeUntil?: number;         // 到第几章停止生效
  appliedCount: number;         // 已应用次数
}
```

### 8.3 注入位置与方式

Author's Note 在 Chain 执行的 **两个位置** 注入：

```
位置一：系统提示词尾部（所有 Prompt 节点共享）
  ┌─────────────────────────────────────────┐
  │ [系统提示词]                              │
  │ 你是【角色身份】...                       │
  │ ...                                      │
  │                                          │
  │ ## ⚠️ Author's Note（本章强制规则）       │
  │ 以下规则具有最高优先级，必须严格遵守：      │
  │                                          │
  │ 1. [情节约束·本章] 本章不能让主角死亡      │
  │ 2. [风格要求·本章] 本章要用梦境开场        │
  │ 3. [伏笔操作·本章] 本章埋设关于XX的伏笔    │
  │                                          │
  │ 如果以上规则与任何其他指令冲突，           │
  │ 以 Author's Note 为准。                   │
  └─────────────────────────────────────────┘

位置二：质量门评审提示词（Node 10 质检）
  质检时额外检查 Author's Note 规则的遵守情况
  └─ 检查项增加：Author's Note 规则 1/2/3 是否满足
```

### 8.4 注入的 Handlebars Partial

```handlebars
{{!-- partials/authors-note.hbs --}}
{{#if authorsNotes.length}}
## ⚠️ Author's Note —— 本章强制遵守的最高优先级规则

以下规则在生成本章内容时必须严格遵守，违反任一条都将导致生成结果被驳回：

{{#each authorsNotes}}
{{@index_plus_one}}. [{{typeLabel this.type}}·{{scopeLabel this.scope}}] {{this.content}}
{{/each}}

**重要提示：**
- 以上规则优先级高于所有其他指令和默认行为
- 如果与其他约束冲突，以 Author's Note 为准
- 生成后将在质检环节逐条检查遵守情况
{{/if}}
```

### 8.5 注入流程图

```
用户打开章节写作页面
  │
  ├─ 系统自动加载：
  │   ├─ 当前生效的 Permanent Note
  │   ├─ 当前生效的 Volume Note
  │   └─ 上次使用的 Single Chapter Note（可选恢复）
  │
  ├─ 用户可在写作前编辑/新增 Author's Note
  │   └─ UI 显示所有生效规则（彩色标签区分类型和范围）
  │
  ├─ 用户点击"开始生成"
  │
  ├─ Chain 执行时注入：
  │   ├─ Node 0（上下文装配）：将 authorsNotes 加入上下文变量
  │   ├─ Node 1~8（天龙8步）：每个节点的系统提示词末尾注入
  │   └─ Node 10（章节质检）：作为质检维度之一
  │
  └─ 生成完成后：
      ├─ 质检报告中包含 Author's Note 遵守情况
      └─ 更新 appliedCount（用于历史统计）
```

### 8.6 冲突检测

```typescript
// 如果多条 Author's Note 之间存在矛盾，弹窗提示用户
function detectAuthorsNoteConflicts(notes: AuthorsNote[]): Conflict[] {
  const conflicts: Conflict[] = [];

  for (let i = 0; i < notes.length; i++) {
    for (let j = i + 1; j < notes.length; j++) {
      // 检测矛盾关键词
      if (isContradictory(notes[i].content, notes[j].content)) {
        conflicts.push({
          noteA: notes[i],
          noteB: notes[j],
          reason: `规则"${notes[i].content}"与规则"${notes[j].content}"可能存在矛盾`,
          suggestion: '请确认优先级或删除其中一条',
        });
      }
    }
  }

  return conflicts;
}

// 矛盾关键词检测
const CONTRADICTORY_PATTERNS = [
  ['不能死', '必须死'],
  ['不能出现新角色', '引入新角色'],
  ['天气必须是雨天', '天气必须是晴天'],
  ['第一人称', '第三人称'],
];
```

### 8.7 Author's Note 历史管理

```
用户可按以下维度查看/复用历史 Author's Note：

- 按类型筛选：情节约束 / 风格要求 / 设定覆盖 / 伏笔操作
- 按范围筛选：单章 / 本卷 / 永久
- 按使用频率排序：最常用的规则排前面
- 按项目：不同项目可拥有独立的 Note 模板
- 导入/导出：支持将一套 Note 保存为"写作规则模板"，跨项目复用
```

---

## 9. 附录：完整 Prompt 模板清单

### 9.1 短篇三阶段模板（17个）

| # | 模板ID | 用途 | 原始模板对应 |
|---|--------|------|-------------|
| 1 | `stage1-material-parse` | 素材解析 | 阶段一步骤1 |
| 2 | `stage1-style-analysis` | 平台风格分析 | 阶段一步骤2 |
| 3 | `stage1-idea-generation` | 脑洞发散 | 阶段一核心Prompt |
| 4 | `stage1-idea-filter` | 题材筛选 | 阶段一筛选逻辑 |
| 5 | `stage1-theme-report` | 题材报告 | 阶段一最终输出 |
| 6 | `stage2-core-setting` | 核心设定 | 阶段二·一 |
| 7 | `stage2-character-web` | 人物关系 | 阶段二·二 |
| 8 | `stage2-chapter-structure` | 章节结构 | 阶段二·三 |
| 9 | `stage2-reversal-table` | 反转表 | 阶段二·四 |
| 10 | `stage2-foreshadow-table` | 伏笔表 | 阶段二·五 |
| 11 | `stage2-chapter-detail` | 章节细化 | 阶段二扩展 |
| 12 | `stage2-consistency-check` | 一致性校验 | 新增（工程化） |
| 13 | `stage2-outline-report` | 大纲报告 | 阶段二最终输出 |
| 14 | `tianlong-context-assembly` | 上下文装配 | 阶段三前置 |
| 15 | `tianlong-step1~8` | 天龙8步 | 阶段三核心 |
| 16 | `tianlong-chapter-synthesis` | 正文合成 | 阶段三拼接 |
| 17 | `tianlong-chapter-qa` | 章节质检 | 外挂五工程化 |

### 9.2 外挂模块模板（6个）

| # | 模板ID | 用途 | 原始模板对应 |
|---|--------|------|-------------|
| 18 | `attach-opening-boost` | 开头强化 | 外挂一 |
| 19 | `attach-reversal-boost` | 反转强化 | 外挂二 |
| 20 | `attach-platform-rewrite` | 平台改写 | 外挂三 |
| 21 | `attach-title-synopsis` | 标题简介 | 外挂四 |
| 22 | `attach-final-qa` | 终稿质检 | 外挂五 |
| 23 | `attach-copyright-check` | 版权检测 | 新增 |

### 9.3 长篇模板（6个）

| # | 模板ID | 用途 |
|---|--------|------|
| 24 | `long-book-skeleton` | 全书骨架 |
| 25 | `long-volume-plan` | 分卷规划 |
| 26 | `long-chapter-split` | 章节拆分 |
| 27 | `long-foreshadow-network` | 伏笔网络 |
| 28 | `long-consistency-check` | 长篇一致性检查 |
| 29 | `long-daily-gen-context` | 每日生成上下文 |

### 9.4 精修与质检模板（5个）

| # | 模板ID | 用途 |
|---|--------|------|
| 30 | `polish-deai` | 去AI味处理 |
| 31 | `polish-describe` | Describe逐句精修 |
| 32 | `polish-rhythm` | 节奏优化 |
| 33 | `polish-dialogue` | 对话优化 |
| 34 | `polish-style-align` | 风格对齐 |

### 9.5 敏感词与版权（3个）

| # | 模板ID | 用途 |
|---|--------|------|
| 35 | `sensitive-detection` | 敏感词AI辅助检测 |
| 36 | `sensitive-replacement` | 敏感词替换建议 |
| 37 | `copyright-check` | 版权相似度检测 |

---

## 10. 与原始模板的一致性保证

本文档中所有 Prompt Chain 定义均严格基于 `短故事三步骤.md` 的原始模板设计。
以下是关键一致性对照：

| 原始模板元素 | Chain 工程化对应 | 保留/增强 |
|---|---|---|
| 阶段一：先问两个问题（素材 + 平台） | Node 1/2 自动解析 + Chain 启动时的用户输入界面 | 保留交互逻辑，增强为自动解析 |
| 阶段一：10字段题材输出 | Node 4/5 的 filtered_ideas 结构 | 保留全部10字段 |
| 阶段二：核心设定10字段 | Node 1 的 core_settings | 保留全部10字段 |
| 阶段二：人物关系8维度 | Node 2 的 characters 结构 | 保留全部8维度 |
| 阶段二：9段式章节结构 | Node 3 的 chapter_structure | 保留9段结构 |
| 阶段二：递进反转表8维度 | Node 4 的 reversal_table | 保留全部8维度 |
| 阶段二：伏笔回收表5维度 | Node 5 的 foreshadow_table | 保留全部5维度 |
| 阶段三：天龙8步法完整逻辑 | Node 1~8 | 保留完整8步，增加质检和质量门 |
| 阶段三："不要写小标题，自然融入" | 约束注入到系统提示词 | 精确保留 |
| 阶段三：中国生活质感要求 | 约束注入 + 质量门检查 | 精确保留 |
| 外挂一~五 | attachments/ 目录下6个模板 | 保留5个原始外挂 + 新增版权检测 |
| 禁止做梦/精神病/系统解释 | 质量门 Node 10 检查 | 转化为自动检查规则 |

---

> **文档结束。**
>
> 本文档定义了 AI 写作平台完整的 Prompt Chain 架构与模板方案，包含：
> - 3层架构（定义层/引擎层/集成层）
> - 50+ Handlebars 模板的分类、变量注入和版本管理
> - 短篇三阶段 Chain（17个节点，完整保留原始模板）
> - 长篇工作流 Chain（含大纲6节点 + 每日生成12节点）
> - 7种风格的差异化 Prompt 参数和注入流程
> - 每节点的质量门配置 + 10维终稿质检标准
> - 6种模型的适配策略、路由表和成本优化
> - Author's Note 动态注入机制（UI交互→Prompt注入→质检验证）
>
> 下一步：进入 Phase 4 研发阶段，将本文档转化为可执行的 YAML Chain 定义文件和 Handlebars 模板。
