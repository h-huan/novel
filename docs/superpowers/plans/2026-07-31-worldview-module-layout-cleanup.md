# 世界观模块重建 + 布局自适应 + 文件整理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平台「核心设定」统一改名为「世界观」、补齐经济体系/势力分布/自定义设定字段、重排 6 个模块页面布局、清理历史版本文件，同时保留角色状态功能。

**Architecture:** 三个独立阶段：(A) 文件清理（删历史文件 + 死代码 WorldTabView）；(B) 世界观模块重建（迁移 047 加列 → 服务端字段/摘要 → 前端字段分组与术语改名 → 短篇大纲与爽点/热点提示词）；(C) 布局自适应（扩展 LayoutKit 工具 → 应用到 6 个页面）。每阶段独立可验证。

**Tech Stack:** NestJS (server/src)、React/Electron (desktop/src/renderer)、SQLite node:sqlite（迁移 0XX 自动扫描）、vitest。

## Global Constraints

- 数据库迁移文件 `server/src/database/migrations/0XX_*.ts`（47 个）**不得删除或改名**，仅追加 `047_*`。
- 「魂穿北洋，领众破局/」整个文件夹**保留不动**。
- 角色状态功能（草稿/标签/状态时间线）**不删除、不简化**。
- 短篇《短故事三步骤》的「故事核心设定」区块**保留原名**；迁移文件注释不改。
- 内部键名 `coreSetting`/`worldview` 保持稳定（仅改术语层），不重命名数据库列与接口路径。
- 术语改名：把「核心设定」当**模块名**用的地方改为「世界观」；作为题材/故事通用词的（题材核心设定、故事核心设定）保留。
- 遵循用户反馈：不新增大量 AI 说明文档，本计划只产出必要的代码改动。

---

## Phase A：文件清理

### Task A1: 删除历史/冗余文件

**Files:**
- Delete（相对 novel-ai-platform/ 仓库根）：`server/projects/db15b585-f890-43b4-95a0-5826f325948a/` 整个目录（含 vol-001-ch-001.md、vol-001-ch-002.md）
- Delete（相对仓库根）：`server/data/novel.db.c.db`、`server/data/novel.db.cc.db`、`server/data/novel.db.chk.db`、`server/data/novel.db.chk2.db`、`server/data/novel.db.t`、`server/data/vectors.db.t`、`server/data/state.db.t`、`server/data/novelai.db`、`server/data/novelai.db.t`
- Delete（相对 d:\code\novel\）：`~$万字小说创作全流程指南.docx`、`nul`、`server/nul`、`output/doc/两百万字小说创作全流程指南（原始备份）.docx`、`output/doc/两百万字小说创作全流程指南（平台流程补全版）.docx`、`tmp/docs/update_novel_guide.py`、`这个游戏太真实了/AAA/imports/01-核心设定.txt`

**Interfaces:**
- Consumes: 无
- Produces: 干净的 git 工作树（除有意改动）

- [ ] **Step 1: 确认主库健康后再删除备份**

```bash
# 在 novel-ai-platform/server 目录下，确认主库存在且非空
ls -la server/data/novel.db
# 期望：novel.db 存在（约 4.5MB）
```

- [ ] **Step 2: 删除备份/临时 DB 文件与遗留 chapter 文件**

```bash
cd /d/code/novel/novel-ai-platform
rm -rf server/projects/db15b585-f890-43b4-95a0-5826f325948a
rm -f server/data/novel.db.c.db server/data/novel.db.cc.db server/data/novel.db.chk.db server/data/novel.db.chk2.db server/data/novel.db.t server/data/vectors.db.t server/data/state.db.t server/data/novelai.db server/data/novelai.db.t
```

- [ ] **Step 3: 删除根目录临时/备份文件**

```bash
cd /d/code/novel
rm -f "~\$万字小说创作全流程指南.docx" nul server/nul
rm -f "output/doc/两百万字小说创作全流程指南（原始备份）.docx" "output/doc/两百万字小说创作全流程指南（平台流程补全版）.docx"
rm -f tmp/docs/update_novel_guide.py
rm -f "这个游戏太真实了/AAA/imports/01-核心设定.txt"
# 若 output/doc、tmp/docs 目录已空，一并删除
rmdir output/doc tmp/docs 2>/dev/null || true
```

- [ ] **Step 4: 验证**

```bash
cd /d/code/novel/novel-ai-platform
git status --porcelain | grep -iE "projects|novel.db.c|\.t$|备份|原始" || echo "PASS: 无残留"
# 期望：无上述残留输出
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove legacy chapter files, db backups, and duplicate assets"
```

### Task A2: 删除死代码 WorldTabView 并清理引用

**Files:**
- Delete: `desktop/src/renderer/components/world/WorldTabView.tsx`
- Modify: `desktop/src/renderer/pages/WorldPage.tsx:6`（移除 `import WorldTabView from '../components/world/WorldTabView';`）

**Interfaces:**
- Consumes: 无
- Produces: WorldPage 不再引用 WorldTabView；无任何文件引用该组件

- [ ] **Step 1: 确认 WorldTabView 无引用**

```bash
cd /d/code/novel/novel-ai-platform
grep -rn "WorldTabView" desktop/src --include=*.tsx --include=*.ts | grep -v "components/world/WorldTabView.tsx"
# 期望：仅显示 WorldPage.tsx:6 的 import
```

- [ ] **Step 2: 删除文件并移除 import**

```bash
rm desktop/src/renderer/components/world/WorldTabView.tsx
```

- [ ] **Step 3: 编辑 WorldPage.tsx 移除未用 import**

在 `desktop/src/renderer/pages/WorldPage.tsx` 第 6 行删除：
```tsx
import WorldTabView from '../components/world/WorldTabView';
```

- [ ] **Step 4: 类型检查 + 构建**

```bash
cd /d/code/novel/novel-ai-platform/desktop
npm run typecheck
# 期望：无错误
npm run build
# 期望：构建成功，无 "WorldTabView" 错误
```

- [ ] **Step 5: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add -A
git commit -m "chore: remove dead WorldTabView component"
```

### Task A3: 删除历史 phase 文档与废弃引用核对

**Files:**
- Delete（相对仓库根 docs/）：`phase-5-state-center-acceptance.md`、`phase-6-writing-quality-acceptance.md`、`phase-7-continuity-cockpit-requirements.md`、`phase-7-2-character-relationship-requirements.md`、`phase-7-3-foreshadowing-radar-requirements.md`、`phase-7-4-world-timeline-requirements.md`、`phase-7-5-precheck-postupdate-requirements.md`、`phase-8-0-preflight-core-loop-acceptance.md`
- Delete（相对仓库根 docs/）：`第二阶段-IdeaLab想法孵化实施说明.md`、`第三阶段-WorkflowGuard流程守卫实施说明.md`、`第四阶段-长短篇流程硬约束实施说明.md`、`第五阶段-状态确稿中心与角色成长状态引擎实施说明.md`、`小说Agent平台第2步代码分析与第一阶段实施方案.md`
- Delete（相对仓库根 docs/superpowers/specs/）：`2026-07-16-generation-recovery-design.md`、`2026-07-16-unauthorized-config-rollback-design.md`、`2026-07-17-canonical-story-and-author-facing-ui-design.md`
- Modify: `.gitignore`（追加 `server/projects/`）

**Interfaces:**
- Consumes: 无
- Produces: docs/ 只保留需求/规范类文档；git 状态干净

- [ ] **Step 1: 确认文档未被引用**

```bash
cd /d/code/novel/novel-ai-platform
grep -rln "phase-5\|phase-6\|phase-7\|phase-8\|第2步代码分析\|第一阶段实施方案" --include=*.ts --include=*.tsx --include=*.md README.md progress.md findings.md task_plan.md 2>/dev/null | grep -v "^docs/" || echo "PASS: 无引用"
```

- [ ] **Step 2: 删除文档**

```bash
rm docs/phase-5-state-center-acceptance.md docs/phase-6-writing-quality-acceptance.md docs/phase-7-continuity-cockpit-requirements.md docs/phase-7-2-character-relationship-requirements.md docs/phase-7-3-foreshadowing-radar-requirements.md docs/phase-7-4-world-timeline-requirements.md docs/phase-7-5-precheck-postupdate-requirements.md docs/phase-8-0-preflight-core-loop-acceptance.md
rm docs/第二阶段-IdeaLab想法孵化实施说明.md docs/第三阶段-WorkflowGuard流程守卫实施说明.md docs/第四阶段-长短篇流程硬约束实施说明.md docs/第五阶段-状态确稿中心与角色成长状态引擎实施说明.md docs/小说Agent平台第2步代码分析与第一阶段实施方案.md
rm docs/superpowers/specs/2026-07-16-generation-recovery-design.md docs/superpowers/specs/2026-07-16-unauthorized-config-rollback-design.md docs/superpowers/specs/2026-07-17-canonical-story-and-author-facing-ui-design.md
```

- [ ] **Step 3: .gitignore 追加运行时目录**

在 `.gitignore` 末尾追加：
```gitignore
# Runtime project artifacts (legacy/regenerated)
server/projects/
```

- [ ] **Step 4: 验证**

```bash
git status --porcelain
# 期望：docs 下的删除与 .gitignore 修改；docs/ 仅剩需求文档、RAG规范、全局规则、superpowers 目录
ls docs/
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: remove historical phase docs and gitignore runtime projects dir"
```

---

## Phase B：世界观模块重建

### Task B1: 迁移 047 新增 3 列

**Files:**
- Create: `server/src/database/migrations/047_world_profile_guide_fields.ts`

**Interfaces:**
- Consumes: 迁移自动注册（migrator.ts 扫描 `/^\d+_.*\.ts$/`，default 导出 `{ up, down }`）
- Produces: `world_system_profiles` 表新增 `economy_system`、`factions`、`custom_settings` 三列；Task B2 的 `WORLD_PROFILE_FIELDS` 依赖此列

- [ ] **Step 1: 编写迁移文件**

创建 `server/src/database/migrations/047_world_profile_guide_fields.ts`：
```ts
import { DatabaseSync } from 'node:sqlite';

// 047 — 对齐《两百万字小说创作全流程指南》世界观 7 类，补齐经济体系与势力分布；
// custom_settings 为按小说自定义设定（JSON 键值对数组）。
export function up(db: DatabaseSync): void {
  const table = 'world_system_profiles';
  const existing: Set<string> = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c: any) => c.name),
  );
  const cols: Array<[string, string]> = [
    ['economy_system', 'TEXT DEFAULT \'\''],
    ['factions', 'TEXT DEFAULT \'\''],
    ['custom_settings', 'TEXT DEFAULT \'\''],
  ];
  for (const [col, def] of cols) {
    if (existing.has(col)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def};`);
  }
}

export function down(db: DatabaseSync): void {
  // SQLite 旧运行时不支持 DROP COLUMN；新列留空不影响旧数据。
}

export default { up, down };
```

- [ ] **Step 2: 验证迁移可运行且幂等**

```bash
cd /d/code/novel/novel-ai-platform/server
npm run typecheck
# 期望：无错误
# 用现有测试基建跑一次迁移相关测试（无迁移测试则用 node 直跑验证列存在）
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE world_system_profiles (id TEXT, project_id TEXT, world_setting_id TEXT)');
const m = require('./dist/src/database/migrations/047_world_profile_guide_fields.js').default;
m.up(db);
const cols = db.prepare('PRAGMA table_info(world_system_profiles)').all().map(c=>c.name);
console.log('economy_system' in cols, 'factions' in cols, 'custom_settings' in cols);
m.up(db); // 幂等
console.log('idempotent OK');
"
# 期望：true true true / idempotent OK
```

- [ ] **Step 3: Commit**

```bash
git add server/src/database/migrations/047_world_profile_guide_fields.ts
git commit -m "feat(db): migration 047 add economy_system, factions, custom_settings to world profile"
```

### Task B2: 服务端 WORLD_PROFILE_FIELDS / 摘要 / 分组更新

**Files:**
- Modify: `server/src/modules/world-setting/world-setting.service.ts:13`（WORLD_PROFILE_FIELDS）、`:130-147`（buildWritingSummary）、`:168`（worldGroups）

**Interfaces:**
- Consumes: Task B1 的 3 个新列
- Produces: profile 读写支持新字段；写作摘要包含经济体系/势力分布/自定义设定；Task B4 前端字段依赖

- [ ] **Step 1: 更新 WORLD_PROFILE_FIELDS**

`server/src/modules/world-setting/world-setting.service.ts:13` 改为：
```ts
export const WORLD_PROFILE_FIELDS = ['synopsis','basic_info','era','locations','atmosphere_tone','rules','social_structure','tech_supernatural','system_mechanics','economy_system','culture_customs','naming_rules','factions','scale_plan','ending','hierarchy_rules','supplementary','custom_settings'] as const;
```

- [ ] **Step 2: 更新 buildWritingSummary**

`world-setting.service.ts:130-146` 的 `fields` 数组替换为（新增经济体系、势力分布，custom_settings 单独处理）：
```ts
    const fields: Array<[string, string]> = [
      ['作品简介/核心卖点','synopsis'],
      ['基本信息（书名/类型/时代/结局/字数目标/标签）','basic_info'],
      ['时代（时间线/历史背景）','era'],
      ['地点（主要区域/关键地点）','locations'],
      ['氛围基调','atmosphere_tone'],
      ['规则','rules'],
      ['社会结构（政治势力/经济资源/宗教信仰）','social_structure'],
      ['经济体系（货币/贸易/产业）','economy_system'],
      ['科技/超自然/力量体系（体系名称/能力来源/约束代价）','tech_supernatural'],
      ['系统机制（核心机制/金手指/特殊设定）','system_mechanics'],
      ['文化风俗（语言习俗/禁忌）','culture_customs'],
      ['命名规则','naming_rules'],
      ['势力分布（主要势力/组织）','factions'],
      ['全文规模/数据规划（人口/势力/资源等量化）','scale_plan'],
      ['结局设定','ending'],
      ['核心层级规则（最高优先级·世界观>大纲>正文）','hierarchy_rules'],
      ['补充说明','supplementary'],
    ];
```
第 147 行返回值改为：
```ts
    const custom = (profile['custom_settings'] || '').trim();
    const customLines = custom ? [`自定义设定：${custom}`] : [];
    return ['【世界观写作摘要】', ...fields.map(([label, key]) => `${label}：${value(key)}`), ...customLines].join('\n');
```

- [ ] **Step 3: 更新 worldGroups**

`world-setting.service.ts:168` 的 groups 映射补全：
```ts
  private worldGroups(fields: readonly string[]) { const groups: Record<string,string[]> = { synopsis:['synopsis'],basic_info:['basic_info'],era:['era'],locations:['locations'],atmosphere_tone:['atmosphere_tone'],rules:['rules'],social_structure:['social_structure'],economy_system:['economy_system'],tech_supernatural:['tech_supernatural'],system_mechanics:['system_mechanics'],culture_customs:['culture_customs'],naming_rules:['naming_rules'],factions:['factions'],scale_plan:['scale_plan'],ending:['ending'],hierarchy_rules:['hierarchy_rules'],supplementary:['supplementary'],custom_settings:['custom_settings'] }; return Object.entries(groups).filter(([, keys]) => keys.some(key => fields.includes(key))).map(([group]) => group); }
```

- [ ] **Step 4: 服务端类型检查 + 测试**

```bash
cd /d/code/novel/novel-ai-platform/server
npm run typecheck
# 期望：无错误
npm test 2>&1 | tail -5
# 期望：全部通过（world-setting 相关 spec 若断言旧字段列表需同步检查）
```

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/world-setting/world-setting.service.ts
git commit -m "feat(world): support economy_system/factions/custom_settings in profile service"
```

### Task B3: 服务端术语改名（核心设定 → 世界观）

**Files:**
- Modify（逐个替换「核心设定」当模块名用的位置）：
  - `server/src/chain/chain-template.service.ts:82,87,89`
  - `server/src/chain/chain.controller.ts:4921,4934,5591,6650,6673,6745,6799,6802,6804,7078,7200,7930,8004`
  - `server/src/chain/prompt-registry.service.ts:252,479,617,620,623,641,698`
  - `server/src/modules/world-setting/world-setting.service.ts:144,147`（在 B2 已改 147；144 层级规则文案）
  - `server/src/state/state-item.service.ts:1124`

**Interfaces:**
- Consumes: 无
- Produces: 服务端不再把「核心设定」当模块名；测试与类型检查通过

- [ ] **Step 1: 精确替换（保留项除外）**

逐文件执行以下替换（用 Edit 工具逐个修改，不全局 sed 以免误伤）：
- `chain-template.service.ts`：注释与 `name: '核心设定+世界观生成'` → `name: '世界观生成'`；description 中「生成核心设定（14字段）+世界观（7维详细）」→「生成世界观（含故事核心设定14字段+详细世界观7维）」。
- `chain.controller.ts:4921` 注释 `// 存储核心设定` → `// 存储世界观`；`:4934` 错误信息 `核心设定写入失败` → `世界观写入失败`；`:5591` 提示词开头 `【核心层级纪律】核心设定（上方"设定"中的已保存世界观）>` 中的「核心设定（」→「世界观（」；`:6650` 注释 `核心设定 world_system_profiles` → `世界观 world_system_profiles`；`:6673` 进度 `补全角色/核心设定/组织/地点` → `补全角色/世界观/组织/地点`；`:6745` `核心设定深度资料 -> world_system_profiles` → `世界观深度资料 -> world_system_profiles`；`:6799/6802/6804` 「核心设定深度资料」→「世界观深度资料」；`:7078` `提取项目settings中的核心设定和反转表` → `提取项目settings中的世界观和反转表`；`:7200` `不得脱离大纲补核心设定` → `不得脱离大纲补世界观`；`:7930` 错误 `缺少核心设定或世界观` → `缺少世界观`；`:8004` 提示词 `核心设定：${JSON.stringify(foundation.coreSetting)}` → `世界观（地基）：${JSON.stringify(foundation.coreSetting)}`。
- `prompt-registry.service.ts`：`:252` 模板名 `核心设定补全` → `世界观补全`；`:479` `### 一、核心设定` → `### 一、世界观`；`:617,620,623` 注释/模板名/描述中「核心设定+世界观」→「世界观」；`:641` `### 模块一：核心设定 (coreSetting)` → `### 模块一：故事核心设定 (coreSetting)`；`:698` `核心设定每个字段必须详细` → `故事核心设定每个字段必须详细`。
- `world-setting.service.ts:144` `核心设定>大纲>正文` → `世界观>大纲>正文`。
- `state-item.service.ts:1124` `角色行为可能违背核心设定` → `角色行为可能违背世界观`。

保留不改：`chain.controller.ts:4349,4353`（题材核心设定）、`:7373`（故事核心设定，短篇）、`chain.types.ts:272`（短篇阶段二注释）、`prompt-registry.service.ts:611,703`（changelog 历史）、迁移文件注释（039/042/045/046）、`chain.controller.ts:6770`（引用 `核心设定.txt` 文件名，保持文件原名）。

- [ ] **Step 2: 验证**

```bash
cd /d/code/novel/novel-ai-platform/server
grep -rn "核心设定" src --include=*.ts | grep -vE "\.spec\.|故事核心设定|题材.*核心设定|核心设定\.txt|changelog|//|\*" | grep -vE "migrations/"
# 期望：无输出（或仅剩确认为保留的项）
npm run typecheck
# 期望：无错误
npm test 2>&1 | tail -5
# 期望：全部通过
```

- [ ] **Step 3: Commit**

```bash
git add server/src
git commit -m "refactor(world): rename 核心设定 module terminology to 世界观 on server"
```

### Task B4: 前端字段分组重组 + 术语改名（WorldPage）

**Files:**
- Modify: `desktop/src/renderer/pages/WorldPage.tsx`（WORLD_FIELD_LABELS 增加 3 字段、PROFILE_SECTION_GROUPS 重组为 10 组、hint 文案改名、自定义设定键值编辑器）

**Interfaces:**
- Consumes: Task B2 的新字段；Task A2 已删 WorldTabView import
- Produces: 世界观页显示经济体系/势力分布/自定义设定，术语为「世界观」

- [ ] **Step 1: 更新 WORLD_FIELD_LABELS 与 hint**

`WorldPage.tsx:13-31` 中，`WORLD_FIELD_LABELS` 增加：
```ts
  economy_system: '经济体系（货币 / 贸易 / 产业）',
  factions: '势力分布（主要势力 / 组织）',
  custom_settings: '自定义设定（按本书补充的键值对，如金手指规则、专有名词表）',
```
`WORLD_FIELD_META` hint 文案中 `按《核心设定.txt》地基型与《世界观模板》` → `按《两百万字小说创作全流程指南》世界观结构与本书剧情需要`。

- [ ] **Step 2: 重组 PROFILE_SECTION_GROUPS**

`WorldPage.tsx:35-43` 替换为（10 组，指南为主、真实小说地基为辅）：
```ts
export const PROFILE_SECTION_GROUPS: WorldProfileSectionConfig[] = [
  section('作品地基', '小说的简介、类型、结局方向与规模规划，约束一切后续设定。', ['synopsis', 'basic_info', 'scale_plan', 'ending']),
  section('历史背景', '时间线与历史背景，奠定年代感。', ['era']),
  section('世界地理', '主要区域与关键地点（大陆/国家/城市分层）。', ['locations']),
  section('社会结构', '阶级、政治、经济资源与宗教信仰格局。', ['social_structure']),
  section('经济体系', '货币、贸易、产业等经济运行规则。', ['economy_system']),
  section('力量与科技体系', '力量/科技/超自然体系与系统机制（含金手指）。', ['tech_supernatural', 'system_mechanics']),
  section('文化特色', '氛围基调、文化风俗与命名规则。', ['atmosphere_tone', 'culture_customs', 'naming_rules']),
  section('势力分布', '主要势力、组织及其目标与关系。', ['factions']),
  section('核心规则', '世界运行必须遵守的核心规则与层级纪律。', ['rules', 'hierarchy_rules']),
  section('补充与自定义', '其他设定与按本书补充的自定义设定。', ['supplementary', 'custom_settings']),
];
```

- [ ] **Step 3: 自定义设定键值编辑器**

在 `WorldProfileEditor` 组件内，`custom_settings` 字段渲染为键值编辑器而不是纯 textarea。在 `WorldPage.tsx` 组件内新增：
```tsx
const CustomSettingsEditor: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const items = React.useMemo<Array<{ key: string; val: string }>>(() => {
    try {
      const parsed = JSON.parse(value || '[]');
      return Array.isArray(parsed) ? parsed.map((it: any) => ({ key: String(it?.key ?? ''), val: String(it?.value ?? '') })) : [];
    } catch { return []; }
  }, [value]);
  const commit = (next: Array<{ key: string; val: string }>) => onChange(JSON.stringify(next.filter(it => it.key || it.val)));
  const setItem = (idx: number, patch: Partial<{ key: string; val: string }>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    commit(next);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {items.map((it, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr)', gap: 6 }}>
          <input value={it.key} placeholder="设定名" onChange={e => setItem(idx, { key: e.target.value })} style={darkField} />
          <input value={it.val} placeholder="设定内容" onChange={e => setItem(idx, { val: e.target.value })} style={darkField} />
        </div>
      ))}
      <button type="button" onClick={() => commit([...items, { key: '', val: '' }])}>+ 添加自定义设定</button>
    </div>
  );
};
```
在渲染字段处，当 `item.key === 'custom_settings'` 时渲染 `<CustomSettingsEditor value={profile['custom_settings'] || '[]'} onChange={v => setProfile(cur => ({ ...cur, custom_settings: v }))} />`，其余字段保持 textarea。

- [ ] **Step 4: 类型检查 + 构建**

```bash
cd /d/code/novel/novel-ai-platform/desktop
npm run typecheck
# 期望：无错误
npm run build
# 期望：构建成功
```

- [ ] **Step 5: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add desktop/src/renderer/pages/WorldPage.tsx
git commit -m "feat(world): regroup world profile sections per guide, add custom settings editor"
```

### Task B5: 前端术语改名（WorldSimpleView / LayoutKit / OutlinePage）

**Files:**
- Modify: `desktop/src/renderer/components/world/WorldSimpleView.tsx`（注释与 console 文案）、`desktop/src/renderer/components/common/LayoutKit.tsx:5`、`desktop/src/renderer/pages/OutlinePage.tsx:1394`

**Interfaces:**
- Consumes: 无
- Produces: 前端用户可见与注释术语统一为「世界观」

- [ ] **Step 1: 替换**

- `WorldSimpleView.tsx`：`:2` 注释 `短篇核心设定极简视图` → `短篇世界观极简视图`；`:4` `对接短篇核心设定读取与保存接口` → `对接短篇世界观读取与保存接口`；`:11` `短篇核心设定数据结构` → `短篇世界观数据结构`；`:118` `// 加载核心设定` → `// 加载世界观`；`:153` `console.error('加载核心设定失败:')` → `console.error('加载世界观失败:')`；`:164` `// 保存核心设定` → `// 保存世界观`；`:174` `console.error('保存核心设定失败:')` → `console.error('保存世界观失败:')`。
- `LayoutKit.tsx:5`：`所有"核心设定/角色/地点与势力/大纲/伏笔"页面共用` → `所有"世界观/角色/地点与势力/大纲/伏笔"页面共用`。
- `OutlinePage.tsx:1394`：placeholder `输入已有选题、核心设定或灵感素材` → `输入已有选题、世界观或灵感素材`。

- [ ] **Step 2: 验证**

```bash
cd /d/code/novel/novel-ai-platform/desktop
grep -rn "核心设定" src/renderer --include=*.tsx --include=*.ts | grep -vE "WorldTabView|故事核心设定" || echo "PASS"
# 期望：无输出（或仅剩确认保留项）
npm run typecheck
# 期望：无错误
```

- [ ] **Step 3: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add desktop/src/renderer
git commit -m "refactor(world): rename 核心设定 to 世界观 in renderer terminology"
```

### Task B6: 短篇大纲对齐《短故事三步骤》 + 爽点/热点提示词

**Files:**
- Modify: `server/src/chain/prompt-registry.service.ts:524,531`（章节结构 prompt）、短篇题材/大纲模板 prompt（同一文件内）、`server/src/modules/outline/outline.service.ts:477`（shortStoryFlow 对齐）

**Interfaces:**
- Consumes: 无
- Produces: 短篇大纲结构 = 题材→核心设定/人物关系表/章节结构/递进反转表/伏笔回收表；长短篇提示词含爽点与热点

- [ ] **Step 1: 强化章节结构 prompt 的爽点/热点**

`prompt-registry.service.ts:531` 的 `- highlight: 爽点设置` 替换为：
```
- highlight: 爽点设置（必须写出本章具体爽点与热点元素/读者偏好：热门设定、强情绪点、打脸/逆袭/高能名场面、反转冲击；不能写空话）
```

- [ ] **Step 2: 短篇题材生成强化社会热点**

在短篇题材生成模板（文件内「短篇/题材」相关 prompt）的题材要求处追加：
```
11. 爆点判断
每个题材必须同时给出"热点契合度"（近期社会议题/情绪痛点的关联）与"爽点设计"（读者看完第一章最爽的一点）。
```
若模板已有爆点判断字段，则在要求行后追加「热点契合度」说明。

- [ ] **Step 3: shortStoryFlow 对齐三步骤**

`outline.service.ts:477` 的短篇流程改为：
```ts
      shortStoryFlow: isShort ? ['题材钩子', '故事核心设定', '人物关系表', '章节结构', '递进反转表', '伏笔回收表', '章节写作包', '开篇吸引力检查'] : [],
```
（若后端校验流程名处有白名单，同步补充新增名。）

- [ ] **Step 4: 验证**

```bash
cd /d/code/novel/novel-ai-platform/server
npm run typecheck
# 期望：无错误
npm test 2>&1 | tail -5
# 期望：全部通过（outline 相关 spec 若断言旧流程名需同步更新）
```

- [ ] **Step 5: Commit**

```bash
git add server/src/chain/prompt-registry.service.ts server/src/modules/outline/outline.service.ts
git commit -m "feat(chain): align short outline with 3-step guide, strengthen 爽点/热点 in prompts"
```

### Task B7: 长篇内容承载 + 生成不截断验证

**Files:**
- Modify: 无（验证性任务；若验收审查截断漏规则，则调整 `server/src/chain/chain.controller.ts:691` 的 reviewPrompt 截断参数）

**Interfaces:**
- Consumes: Task B2 的字段、RAG chunker 分层分块
- Produces: 验收证据：129KB 核心设定可完整保存/回读；写作上下文含关键规则

- [ ] **Step 1: 验证 profile 大内容完整往返**

```bash
cd /d/code/novel/novel-ai-platform/server
node -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const db = new DatabaseSync('server/data/novel.db');
const text = fs.readFileSync('d:/code/novel/这个游戏太真实了/01-核心设定.txt', 'utf8');
console.log('source bytes:', Buffer.byteLength(text));
// 找任意一个世界设定 profile 行，模拟写入大文本再回读
const row = db.prepare('SELECT world_setting_id FROM world_system_profiles LIMIT 1').get();
if (row) {
  db.prepare('UPDATE world_system_profiles SET supplementary=? WHERE world_setting_id=?').run(text, row.world_setting_id);
  const back = db.prepare('SELECT supplementary FROM world_system_profiles WHERE world_setting_id=?').get(row.world_setting_id).supplementary;
  console.log('roundtrip equal:', back === text);
}
"
# 期望：roundtrip equal: true
```

- [ ] **Step 2: 复核验收审查截断是否漏关键规则**

阅读 `chain.controller.ts:691` 附近 reviewPrompt 的 `storyContext.slice(0, 14000)`。将世界规则摘要（`getWritingSummary` 输出）排在 storyContext 最前，确保关键规则先于截断窗口。若已排前，本步仅记录确认：
```bash
grep -n "slice(0, 14000)\|storyContext" server/src/chain/chain.controller.ts | head
```

- [ ] **Step 3: 记录验收结论**

在 `progress.md` 追加一行（遵守「不新增文档」约定）：
```markdown
- [completed] 世界观模块承载验证：01-核心设定.txt（129KB）profile 往返一致；写作摘要含经济体系/势力分布/自定义设定；验收审查上下文规则靠前注入。
```

- [ ] **Step 4: Commit（如无代码改动则仅记录）**

```bash
cd /d/code/novel/novel-ai-platform
git add progress.md
git commit -m "docs: record world profile large-content roundtrip acceptance" 2>/dev/null || echo "no code change"
```

---

## Phase C：布局自适应

### Task C1: LayoutKit 扩展（AutoTextarea / ClampSidebar / ModalBox）

**Files:**
- Modify: `desktop/src/renderer/components/common/LayoutKit.tsx`

**Interfaces:**
- Consumes: 现有 `darkField`
- Produces: `AutoTextarea`、`clampSidebar()`、`modalBox()` 三个导出；Task C2/C3 使用

- [ ] **Step 1: 追加三个自适应工具**

在 `LayoutKit.tsx` 末尾追加：
```tsx
/** 内容自适应高度文本域（随内容增高，超 400px 滚动） */
export const AutoTextarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({ style, ...props }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 400)}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} style={{ ...darkField, resize: 'none', overflowY: 'auto', minHeight: 80, maxHeight: 400, ...style }} />;
};

/** 响应式侧栏宽度：窄窗口收缩、宽窗口受限 */
export const clampSidebar = (min = 220, vw = 22, max = 320): React.CSSProperties => ({
  width: `clamp(${min}px, ${vw}vw, ${max}px)`,
  minWidth: min,
  maxWidth: max,
});

/** 模态框宽度保护，窄窗口不溢出 */
export const modalBox = (width = 640): React.CSSProperties => ({
  width: `min(${width}px, 95vw)`,
  maxHeight: '80vh',
  overflow: 'auto',
});
```

- [ ] **Step 2: 类型检查**

```bash
cd /d/code/novel/novel-ai-platform/desktop
npm run typecheck
# 期望：无错误
```

- [ ] **Step 3: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add desktop/src/renderer/components/common/LayoutKit.tsx
git commit -m "feat(ui): add AutoTextarea, clampSidebar, modalBox to LayoutKit"
```

### Task C2: 应用角色 / 时间线 / 组织页面

**Files:**
- Modify:
  - `desktop/src/renderer/pages/CharacterPage.tsx:689`（sidebar width）、`:708`（heroInfoTruncated）
  - `desktop/src/renderer/pages/TimelinePage.tsx:501-502`（timelineList）
  - `desktop/src/renderer/pages/OrganizationMapPage.tsx:327-332`（leftPane）、`:315-320`（overviewHint）

**Interfaces:**
- Consumes: Task C1 的 `clampSidebar`
- Produces: 三个页面侧栏/固定宽度改为响应式

- [ ] **Step 1: 角色页侧栏与截断**

`CharacterPage.tsx`：
- 导入 `clampSidebar`：`import { clampSidebar } from '../components/common/LayoutKit';`
- `:689` `sidebar: { width: 300, minWidth: 300, ... }` → `sidebar: { ...clampSidebar(240, 25, 360), ... }`（保留其余字段）
- `:708` `heroInfoTruncated: { maxWidth: 320, ... }` → `heroInfoTruncated: { maxWidth: 'min(320px, 40vw)', ... }`

- [ ] **Step 2: 时间线页**

`TimelinePage.tsx` `:501-502`：
```ts
timelineList: { ...clampSidebar(200, 25, 320), borderRight: '1px solid rgba(255,255,255,0.06)' },
```
在文件顶部导入 `clampSidebar`。

- [ ] **Step 3: 组织页**

`OrganizationMapPage.tsx`：
- `:327-332` `leftPane: { width: 260, minWidth: 240, ... }` → `leftPane: { ...clampSidebar(220, 22, 320), ... }`
- `:315-320` `overviewHint: { minWidth: 260, flex: 1 }` → `overviewHint: { minWidth: 180, flex: 1 }`
- 顶部导入 `clampSidebar`。

- [ ] **Step 4: 验证**

```bash
cd /d/code/novel/novel-ai-platform/desktop
npm run typecheck
# 期望：无错误
npm run build
# 期望：构建成功
```

- [ ] **Step 5: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add desktop/src/renderer/pages/CharacterPage.tsx desktop/src/renderer/pages/TimelinePage.tsx desktop/src/renderer/pages/OrganizationMapPage.tsx
git commit -m "feat(ui): responsive sidebars on character/timeline/organization pages"
```

### Task C3: 应用大纲 / 短篇世界观 / 长篇世界观页面

**Files:**
- Modify:
  - `desktop/src/renderer/pages/OutlinePage.tsx:1639,1658`（treePanel/shortListPane）、`:1619`（headerMessage）
  - `desktop/src/renderer/components/world/WorldSimpleView.tsx:210`（maxWidth）、`:458`（7维度网格）
  - `desktop/src/renderer/pages/WorldPage.tsx`（分组折叠 + 大字段 AutoTextarea）

**Interfaces:**
- Consumes: Task C1 的 `clampSidebar`、`AutoTextarea`
- Produces: 大纲/世界观页面自适应窗口与内容量

- [ ] **Step 1: 大纲页侧栏与截断**

`OutlinePage.tsx`：
- 顶部导入 `clampSidebar`。
- `:1639` `treePanel: { width: 260, minWidth: 240, ... }` → `treePanel: { ...clampSidebar(220, 20, 320), ... }`
- `:1658` `shortListPane: { width: 260, minWidth: 240, ... }` → `shortListPane: { ...clampSidebar(220, 20, 320), ... }`
- `:1619` `headerMessage: { color:'#8a8aa0', fontSize:12, maxWidth:420, ... }` → `maxWidth: 'min(420px, 50vw)'`

- [ ] **Step 2: 短篇世界观页**

`WorldSimpleView.tsx`：
- `:210` `maxWidth: '800px', margin: '0 auto'` → `maxWidth: 1200, margin: '0 auto'`
- `:458` `gridTemplateColumns: '1fr 1fr', ...` → `gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', ...`

- [ ] **Step 3: 长篇世界观页大字段用 AutoTextarea + 分组折叠**

`WorldPage.tsx`：
- 顶部导入 `AutoTextarea`、`SectionHeader`（来自 LayoutKit）。
- 文本域渲染处（`:142-146`）改为使用 `AutoTextarea`（替换原生 `<textarea rows={rows} ...>`），移除 rows 计算逻辑。
- 在 `WorldProfileEditor` 状态增加 `collapsed: Record<string, boolean>`；每组 `Card` 标题栏增加折叠按钮，默认展开，空分组默认折叠。

- [ ] **Step 4: 验证**

```bash
cd /d/code/novel/novel-ai-platform/desktop
npm run typecheck
# 期望：无错误
npm run build
# 期望：构建成功
```

- [ ] **Step 5: Commit**

```bash
cd /d/code/novel/novel-ai-platform
git add desktop/src/renderer/pages/OutlinePage.tsx desktop/src/renderer/components/world/WorldSimpleView.tsx desktop/src/renderer/pages/WorldPage.tsx
git commit -m "feat(ui): responsive outline and world pages with auto-sizing fields"
```

---

## 自检记录

**1. Spec coverage:**
- 术语改名 → B3/B5；字段结构 → B1/B2/B4；长篇承载不截断 → B7；短篇三步骤+爽点热点 → B6；布局 6 页面 → C1/C2/C3；清理 → A1/A2/A3；角色状态保留 → 全局约束，无改动任务。
- 优化意见：死代码 A2、布局统一 C、文档瘦身 A3、爽点热点 B6、不截断 B7、gitignore A3、术语 B3/B5。

**2. Placeholder scan:** 无 TBD/TODO；所有代码步骤含实际代码。

**3. Type consistency:** `clampSidebar`/`AutoTextarea`/`modalBox` 在 C1 定义、C2/C3 使用；`economy_system`/`factions`/`custom_settings` 在 B1 建列、B2 服务、B4 前端统一使用；`WORLD_PROFILE_FIELDS` 顺序 B2 定义、updateProfile 使用同一常量。
