# 灵感种子智能补全 Prompt Chain 设计

> Chain ID: `inspiration-seed-enrich` | 版本: 1.2.0 | 场景: 灵感转项目时自动丰富骨架种子实体
>
> v1.1 变更: MapLevel continent→region、Organization type 加枚举约束（与 writing-workflow-expert 方法论对齐）
> v1.2 变更: 枚举统一为小写，与后端共享类型完全对齐（zero conversion）

## 1. Chain 节点定义与依赖

```
user_input { hook, description, setting, characters[], isLong }
    │
    ├──► node_1_character  (角色深度补全)  ──┐
    │                                        │  可并行(无相互依赖)
    ├──► node_2_worldview   (世界观补全)  ──┘
              │
              ├──► node_3_organization (组织生成，依赖世界观)
              └──► node_4_location     (地点生成，依赖世界观)
```

| 节点 | promptTemplateId | 模型(tier) | 温度 | 超时 | 重试 |
|------|-----------------|-----------|------|------|------|
| node_1_character | `seed-character-enrich` | deepseek(economy) | 0.6 | 30s | 2 |
| node_2_worldview | `seed-worldview-enrich` | deepseek(economy) | 0.5 | 30s | 2 |
| node_3_organization | `seed-organization-gen` | glm(economy) | 0.6 | 20s | 1 |
| node_4_location | `seed-location-gen` | deepseek(economy) | 0.6 | 30s | 2 |

> **高质量模式**: 用户勾选"高质量补全"时，tier 升级为 balanced(claude)，温度降至 0.4。

## 2. 输出 JSON Schema (TypeScript)

```typescript
// 节点1输出 → 喂给 CharacterService.create()
interface CharacterEnrichResult {
  characters: Array<{
    name: string;                    // 原名(不修改)
    personality: {
      extraversion: number;          // 0-100
      agreeableness: number;
      conscientiousness: number;
      neuroticism: number;
      openness: number;
    };
    background: string;              // 背景故事(含钩子潜质)
    appearance: string;              // 外貌描写
    dialogueStyle: string;           // 对话风格概述
    dialoguePatterns: string[];      // 口头禅/说话习惯(2-4个)
  }>;
}

// 节点2输出 → 喂给 WorldSettingService.create() + update()
interface WorldviewEnrichResult {
  name: string;
  era: string;
  geography: string;                 // 地理环境
  history: string;                   // 历史背景
  rules: string;                     // 社会/力量规则
  factionLayout: string;             // 势力格局概述
  constraints: Array<{               // 世界观约束(喂给constraints)
    category: string;
    rule: string;
    description: string;
    severity: string;
  }>;
}

// 节点3输出 → 喂给 OrganizationService.create()
// type 枚举与后端共享类型完全对齐(小写7值)
type OrganizationType = 'regime' | 'faction' | 'army' | 'sect' | 'camp' | 'organization' | 'other';
interface OrganizationGenResult {
  organizations: Array<{
    name: string;
    type: OrganizationType;          // 枚举: regime政权/faction势力/army军队/sect门派/camp阵营/organization组织/other其他
    description: string;             // 含钩子潜质
  }>;
}

// 节点4输出 → 喂给 MapPointService.create()
// level 枚举与后端共享类型完全对齐(小写，continent→region)
type MapLevel = 'world' | 'region' | 'country' | 'city' | 'location' | 'scene';
interface LocationGenResult {
  locations: Array<{
    name: string;
    level: MapLevel;
    parentId?: string;               // 父节点name(运行时映射为ID)
    description: string;             // 含钩子潜质
  }>;
}
```

## 3. Prompt 模板

### 节点1: 角色深度补全

```
你是一名资深网文角色设计师，擅长为网络短篇小说/长篇网文设计立体角色。

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 角色名单: {{#each user_input.characters}}{{this}}{{#unless @last}}、{{/unless}}{{/each}}

## 执行要求
1. 为每个角色生成完整的性格五维(0-100)、背景故事、外貌、对话风格和口头禅
2. **钩子思维**: 每个角色的background必须包含一个"钩子潜质"——能埋伏笔或制造冲突的暗线(如隐藏身份/未说出口的秘密/与他人的暗流关系)
3. **反幻觉**: 所有设定必须与hook和description有逻辑关联，不得凭空捏造与灵感无关的核心设定
4. 第一个角色(POV视角)的background应直接呼应hook中的核心冲突
5. dialoguePatterns给出2-4个具体口头禅或说话习惯

## 输出格式
输出合法JSON，不要markdown包裹:
{"characters":[{"name":"角色名","personality":{"extraversion":50,"agreeableness":50,"conscientiousness":50,"neuroticism":50,"openness":50},"background":"背景故事(含钩子潜质)","appearance":"外貌","dialogueStyle":"对话风格","dialoguePatterns":["口头禅1","口头禅2"]}]}
```

### 节点2: 世界观补全

```
你是一名资深网文世界观架构师，擅长为中国网络文学构建沉浸式世界观。

## 灵感信息
- 钩子: {{user_input.hook}}
- 故事简介: {{user_input.description}}
- 世界观种子: {{user_input.setting}}

## 执行要求
1. 基于setting种子补全完整的地理环境、历史背景、社会/力量规则、势力格局
2. **钩子思维**: geography/history/rules中各埋至少一处"钩子潜质"——能后续展开冲突或反转的暗线(如禁地/禁忌/历史悬案/规则漏洞)
3. **反幻觉**: 世界观必须与hook和description的题材基调一致，不得引入与灵感无关的体系(如都市题材不能凭空加修仙体系)
4. constraints给出2-3条世界观硬约束(如"修炼者不可跨界""公司内部禁止私联")
5. 如果setting为空或极简，根据hook推断最合理的中国现实/架空背景

## 输出格式
输出合法JSON，不要markdown包裹:
{"name":"世界观名","era":"时代背景","geography":"地理环境(含钩子)","history":"历史背景(含钩子)","rules":"社会/力量规则(含钩子)","factionLayout":"势力格局概述","constraints":[{"category":"分类","rule":"规则","description":"说明","severity":"critical/major/minor"}]}
```

### 节点3: 组织生成

```
你是一名网文势力设计专家。基于以下世界观，生成2-3个主要势力/组织。

## 世界观设定
{{json chain_output.node_2}}

## 执行要求
1. 生成2-3个组织，type必须从以下枚举中选择(小写):
   - regime: 政权/朝廷/政府
   - faction: 派系/势力
   - army: 军队/武装力量
   - sect: 门派/宗派/学院
   - camp: 阵营/联盟
   - organization: 组织/机构/公司
   - other: 其他
2. **钩子思维**: 每个组织的description必须包含"钩子潜质"——组织内部的暗流/与主角的潜在冲突/隐藏目的
3. **反幻觉**: 组织必须与世界观geography和factionLayout逻辑一致
4. 至少一个组织与hook中的核心冲突有直接关联

## 输出格式
输出合法JSON，不要markdown包裹:
{"organizations":[{"name":"组织名","type":"regime","description":"组织描述(含钩子)"}]}
```

### 节点4: 地点生成

```
你是一名网文地图设计师。基于世界观生成故事地点。

## 世界观设定
{{json chain_output.node_2}}

## 篇幅类型
{{#if user_input.isLong}}长篇(按6层层级: world→region→country→city→location→scene，生成8-15个地点){{else}}短篇(简化为1-2层，生成3-5个location/scene级地点){{/if}}

## 执行要求
1. **钩子思维**: 每个地点的description必须包含"钩子潜质"——能发生关键剧情/埋伏笔/制造冲突的场所特征
2. **反幻觉**: 地点必须与世界观geography一致
3. level必须从以下枚举中选择(小写): world / region / country / city / location / scene
   - region对应区域(如华北地区、东北地区)，替代"大陆"概念，更贴合中国地理叙事
4. 长篇: parentId填父级地点name(如"长安城"的parentId为"大唐")
5. 短篇: 只生成location/scene级，不需要parentId

## 输出格式
输出合法JSON，不要markdown包裹:
{"locations":[{"name":"地点名","level":"world","parentId":"父地点名(短篇不需要)","description":"地点描述(含钩子)"}]}
```

## 4. 成本与降级策略

```
默认: economy tier (deepseek/glm)，单次chain总成本 ≈ 4次API调用 × 2K-4K tokens
高质量: balanced tier (claude)，温度降至0.4，总成本 ≈ 4次API调用 × 4K-8K tokens

降级策略:
1. 节点失败 → retryCount次重试(每次升温+0.05)
2. 重试用尽 → skip该节点，保留骨架种子(仅name)，不阻断convertToProject流程
3. Chain整体失败 → strictMode=false，返回partial状态，项目仍正常创建
4. JSON解析失败 → tryParseJSON兜底提取，失败则返回原文由调用方忽略
```

## 5. 调用顺序与集成要点

```
convertToProject() 改造:
1. 先执行现有 createSeedEntities() 创建骨架实体(保留原有逻辑)
2. 异步执行 inspiration-seed-enrich chain
3. chain完成后，用update方法回填丰富后的字段:
   - 角色用 characterService.update() 回填personality/background/appearance/dialogueStyle/dialoguePatterns
   - 世界观用 worldSettingService.update() 回填era + 扩展字段(需扩展DTO接收geography等)
   - 组织用 organizationService.create() 新建(chain输出是数组)
   - 地点用 mapPointService.create() 新建(需扩展支持level/parentId)
   - level 枚举: world/region/country/city/location/scene (小写)
   - organization type 枚举: regime/faction/army/sect/camp/organization/other (小写)
4. node_1 ∥ node_2 可并行执行(无依赖)，node_3/node_4依赖node_2输出
```

## 6. ChainNode 定义示例 (TypeScript)

```typescript
// 节点1: 角色深度补全
const node1: ChainNode = {
  id: 'node_1_character',
  name: '角色深度补全',
  type: 'prompt',
  chainId: 'inspiration-seed-enrich',
  promptTemplateId: 'seed-character-enrich',
  modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.6, tier: 'economy' },
  inputMapping: {
    hook: 'user_input.hook',
    description: 'user_input.description',
    characters: 'user_input.characters',
  },
  outputMapping: {},
  timeout: 30,
  retryCount: 2,
  skipOnEmptyInput: true, // 无角色名时跳过
  description: '基于角色名+hook生成性格五维/背景/对话风格',
};

// 节点2: 世界观补全
const node2: ChainNode = {
  id: 'node_2_worldview',
  name: '世界观补全',
  type: 'prompt',
  chainId: 'inspiration-seed-enrich',
  promptTemplateId: 'seed-worldview-enrich',
  modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.5, tier: 'economy' },
  inputMapping: {
    hook: 'user_input.hook',
    description: 'user_input.description',
    setting: 'user_input.setting',
  },
  outputMapping: {},
  timeout: 30,
  retryCount: 2,
  description: '基于setting+hook生成地理/历史/规则/势力格局',
};

// 节点3: 组织生成 (依赖node_2)
const node3: ChainNode = {
  id: 'node_3_organization',
  name: '组织生成',
  type: 'prompt',
  chainId: 'inspiration-seed-enrich',
  promptTemplateId: 'seed-organization-gen',
  modelConfig: { primary: 'glm', fallback: 'deepseek', temperature: 0.6, tier: 'economy' },
  inputMapping: { worldview: 'chain_output.node_2' },
  outputMapping: {},
  timeout: 20,
  retryCount: 1,
  description: '基于世界观生成2-3个主要势力',
};

// 节点4: 地点生成 (依赖node_2)
const node4: ChainNode = {
  id: 'node_4_location',
  name: '地点生成',
  type: 'prompt',
  chainId: 'inspiration-seed-enrich',
  promptTemplateId: 'seed-location-gen',
  modelConfig: { primary: 'deepseek', fallback: 'glm', temperature: 0.6, tier: 'economy' },
  inputMapping: {
    worldview: 'chain_output.node_2',
    isLong: 'user_input.isLong',
  },
  outputMapping: {},
  timeout: 30,
  retryCount: 2,
  description: '长篇按6层层级/短篇简化生成地点',
};
```
