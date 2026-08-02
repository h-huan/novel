# 四区显示与生成质量改进 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构世界观/大纲/角色/地点势力四个区域的展示与生成逻辑，解决重复、拥挤、缺爽点、缺内容等问题。

**Architecture:** 前端新增共享"列表化"工具并重构 4 个页面/组件；后端改世界观落库职责边界、大纲生成 prompt 与校验、角色变动历史表/接口、getWritingSummary。采用 TDD：服务端用 vitest，前端用 typecheck + build 验证。

**Tech Stack:** NestJS + node:sqlite（server）、React + Vite + vitest（desktop）、Handlebars 风格模板字符串 prompt。

## Global Constraints

- 所有命令在 `novel-ai-platform/` 下执行（本仓库根）。
- 服务端测试：`npm test`（= `vitest run --exclude **/*.acceptance.spec.ts`）；只跑单个文件 `npx vitest run src/modules/character/character.service.spec.ts`。
- 服务端类型检查：`cd server && npm run typecheck`。
- 前端类型检查：`cd desktop && npm run typecheck`；构建：`cd desktop && npm run build`。
- 数据库迁移新文件：`server/src/database/migrations/048_*.ts`，格式见现有 `047_world_profile_guide_fields.ts`（`export function up(db: DatabaseSync): void`）。
- 不新增任何"说明文档"文件（用户偏好）；只新增代码/测试/迁移。
- 不触碰用户工作区未提交的改动（`server/src/chain/chain.controller.ts` 等已有未提交修改——本计划对 chain.controller.ts 的修改是在其之上追加，勿回退）。
- 主色板：主题红 `#e94560`、蓝 `#60a5fa`/`#93c5fd`、绿 `#22c55e`、橙 `#f59e0b`、紫 `#a855f7`、正文 `#c0c0d0`、弱文本 `#8a8aa0`、底色 `#16213e`。

---

## Phase 0：共享列表化工具

### Task 1: 列表化工具 `textList` + `ListBlocks`

**Files:**
- Create: `desktop/src/renderer/lib/textList.ts`
- Create: `desktop/src/renderer/lib/textList.test.ts`
- Create: `desktop/src/renderer/components/common/ListBlocks.tsx`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `splitToLines(text: unknown): string[]` — 按 `、；，,;/` 换行拆为去空项数组。
  - `SectionHeading: React.FC<{ title: string; accent?: string; hint?: string }>` — 二级标题（左侧竖线 + 加粗 + 主题色）。
  - `FieldList: React.FC<{ label: string; value: unknown; accent?: string; empty?: string }>` — 字段名 + bullet 列表。

- [ ] **Step 1: 写失败测试** `desktop/src/renderer/lib/textList.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { splitToLines } from './textList';

describe('splitToLines', () => {
  it('按 、；/ 与换行拆分并去空', () => {
    expect(splitToLines('A、B；C/D\nE')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
  it('数组输入逐项清洗', () => {
    expect(splitToLines(['x', '', ' y '])).toEqual(['x', 'y']);
  });
  it('空/未定义返回空数组', () => {
    expect(splitToLines('')).toEqual([]);
    expect(splitToLines(null)).toEqual([]);
    expect(splitToLines(undefined)).toEqual([]);
  });
  it('对象摘要输入取其 summary 字段', () => {
    expect(splitToLines({ summary: 'a。b。' })).toEqual(['a。b。']);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd desktop && npx vitest run src/renderer/lib/textList.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现** `desktop/src/renderer/lib/textList.ts`

```ts
/** 把未知类型的文本/数组/对象转成列表项，供列表化展示。 */
export function splitToLines(text: unknown): string[] {
  if (Array.isArray(text)) {
    return text.map(v => String(v ?? '').trim()).filter(Boolean);
  }
  if (text === null || text === undefined) return [];
  if (typeof text === 'object') {
    const obj = text as Record<string, unknown>;
    const summary = obj.summary ?? obj.description ?? obj.text ?? obj.core ?? '';
    return splitToLines(summary);
  }
  const raw = String(text).trim();
  if (!raw) return [];
  return raw.split(/[、，,；;\/\n\r]+/).map(s => s.trim()).filter(Boolean);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd desktop && npx vitest run src/renderer/lib/textList.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 实现** `desktop/src/renderer/components/common/ListBlocks.tsx`

```tsx
import React from 'react';
import { splitToLines } from '../../lib/textList';

export const SectionHeading: React.FC<{ title: string; accent?: string; hint?: string }> = ({ title, accent = '#e94560', hint }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '14px 0 8px' }}>
    <span style={{ width: 3, alignSelf: 'stretch', backgroundColor: accent, borderRadius: 2 }} />
    <span style={{ fontSize: 13, fontWeight: 800, color: '#eaeaea', letterSpacing: 0.5 }}>{title}</span>
    {hint && <span style={{ fontSize: 11, color: '#8a8aa0' }}>{hint}</span>}
  </div>
);

export const FieldList: React.FC<{ label: string; value: unknown; accent?: string; empty?: string }> = ({
  label, value, accent = '#93c5fd', empty = '未填写',
}) => {
  const items = splitToLines(value);
  if (items.length === 0) {
    return (
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#6c6c80' }}>{empty}</div>
      </div>
    );
  }
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accent, marginBottom: 3 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#c0c0d0', lineHeight: 1.7 }}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
};

export const ChipList: React.FC<{ items: string[]; color?: string; empty?: string }> = ({ items, color = '#60a5fa', empty = '暂无' }) => {
  if (!items.length) return <span style={{ fontSize: 12, color: '#6c6c80' }}>{empty}</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <span key={i} style={{ padding: '4px 9px', borderRadius: 5, fontSize: 12, color, backgroundColor: `${color}1a`, border: `1px solid ${color}44` }}>{item}</span>
      ))}
    </div>
  );
};
```

- [ ] **Step 6: typecheck**

Run: `cd desktop && npm run typecheck`
Expected: 通过。

- [ ] **Step 7: Commit**

```bash
git add desktop/src/renderer/lib/textList.ts desktop/src/renderer/lib/textList.test.ts desktop/src/renderer/components/common/ListBlocks.tsx
git commit -m "feat(ui): add shared list-rendering utilities (splitToLines, SectionHeading, FieldList)"
```

---

## Phase 1：世界观

### Task 2: WorldSimpleView 重构（速览层 + 详细列表 + 阅读/编辑双模式）

**Files:**
- Modify: `desktop/src/renderer/components/world/WorldSimpleView.tsx`
- Uses: `ListBlocks.tsx`（FieldList / ChipList / SectionHeading）、`textList.ts`

**Interfaces:**
- Consumes: Task 1 的 `splitToLines`, `FieldList`, `ChipList`, `SectionHeading`。
- Produces: 组件对外签名不变（`export default WorldSimpleView`），仅内部渲染变化。

**设计**：`isEditing=false` 时渲染新的阅读模式（速览层 + 详细层），`isEditing=true` 时保留现有 textarea 编辑表单。

- [ ] **Step 1: 在组件内新增阅读模式渲染函数**（替换原 `fieldset disabled={!isEditing}` 整段的渲染逻辑）

在 `WorldSimpleView` 组件内 `return (` 之前插入：

```tsx
const readMode = (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
    {/* 非详细速览层 */}
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionHeading title="故事速览" accent="#e94560" hint="一句话背景 · 时代 · 核心地点 · 核心规则" />
      {settings.storyPremise && <div style={{ fontSize: 14, lineHeight: 1.7, color: '#eaeaea' }}>{settings.storyPremise}</div>}
      <div><span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', marginRight: 8 }}>时代</span><ChipList items={settings.era ? [settings.era] : []} color="#f59e0b" /></div>
      <div><span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd', marginRight: 8 }}>核心地点</span><ChipList items={settings.locations} color="#60a5fa" /></div>
      <FieldList label="社会与行业规则" value={settings.socialRules} accent="#a78bfa" />
      <FieldList label="特殊设定" value={settings.specialSettings} accent="#f59e0b" />
    </section>

    {/* 详细设定层 */}
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SectionHeading title="详细设定" accent="#a855f7" hint="仅展示已填写维度" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
        {[
          { label: '时代（时间线/历史背景）', v: settings.history || settings.era, c: '#f59e0b' },
          { label: '地点（主要区域/关键地点）', v: settings.geography, c: '#60a5fa' },
          { label: '氛围基调', v: settings.atmosphereTone, c: '#22c55e' },
          { label: '规则', v: settings.rules, c: '#e94560' },
          { label: '社会结构', v: settings.socialStructure, c: '#a78bfa' },
          { label: '经济体系', v: settings.economy, c: '#38bdf8' },
          { label: '科技/超自然体系', v: settings.powerSystem, c: '#f472b6' },
          { label: '文化风俗（语言/习俗/禁忌）', v: settings.culture, c: '#34d399' },
          { label: '补充说明', v: settings.supplementary, c: '#8a8aa0' },
        ].filter(item => item.v).map(item => (
          <div key={item.label} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.14)', backgroundColor: 'rgba(139,92,246,0.05)' }}>
            <FieldList label={item.label} value={item.v} accent={item.c} />
          </div>
        ))}
      </div>
    </section>
  </div>
);
```

- [ ] **Step 2: 修改组件渲染，按 isEditing 切换**：把原 `fieldset disabled={!isEditing} ... </fieldset>` 整体替换为：

```tsx
{isEditing ? (
  <fieldset style={{ border: 0, padding: 0, margin: 0, minInlineSize: 0, display: 'flex', flexDirection: 'column', gap: '20px' }}>
    {/* 以下 1-5 个编辑 section 与底部保存按钮 = 现有 fieldset 内的原样内容，原封不动保留：
        1. 📖 故事背景 textarea(storyPremise)
        2. 🕐 时代背景选择器(ERA_OPTIONS)
        3. 📍 核心地点标签(locations + 添加/移除)
        4. ⚖️ 社会与行业规则 textarea(socialRules)
        5. 🔮 特殊设定折叠区(specialSettings)
        6. 💾 保存/重新加载按钮 */}
  </fieldset>
) : (
  readMode
)}
```

> 编辑模式字段保持原样，**不要**改动现有 textarea。原 fieldset 内第 6 节「详细世界观设定（7维度）」只读网格整体删除（阅读模式 `readMode` 已覆盖该内容），避免与编辑区重复。若新老代码中 `isEditing` 开关的"取消编辑"分支调用 `loadSettings()` 的既有逻辑不动。

- [ ] **Step 3: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/components/world/WorldSimpleView.tsx
git commit -m "feat(world): restructure short-story worldview view into quick-view + detailed list"
```

---

### Task 3: WorldProfileEditor 重构（作品速览卡 + 阅读/编辑双模式）

**Files:**
- Modify: `desktop/src/renderer/pages/WorldPage.tsx`
- Uses: `ListBlocks.tsx`（SectionHeading / FieldList / ChipList）、`textList.ts`

**Interfaces:**
- Consumes: Task 1 工具。
- Produces: `WorldProfileEditor` 增加 `viewMode: 'edit' | 'read'` state 与「阅读/编辑」切换按钮；对外签名不变。

- [ ] **Step 1: 新增 viewMode 状态与阅读渲染**

在 `WorldProfileEditor` 内 `const [collapsed, setCollapsed] = useState...` 后加：
```tsx
const [viewMode, setViewMode] = useState<'edit' | 'read'>('read');
```
在 `saveProfile` 保存成功后追加 `setViewMode('read')`。

在 `PageShell actions` 中「保存世界观资料」旁加切换按钮：
```tsx
<button type="button" onClick={() => setViewMode(mode => mode === 'edit' ? 'read' : 'edit')}>
  {viewMode === 'edit' ? '阅读视图' : '编辑视图'}
</button>
```

- [ ] **Step 2: 阅读模式渲染（作品速览卡 + 各 section 列表化）**

在 `return` 中，`<CardGrid ...>` 之前插入阅读视图（`viewMode === 'read'` 时渲染）：

```tsx
{viewMode === 'read' ? (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <Card title="作品速览" span>
      <FieldList label="作品简介 / 核心卖点" value={profile.synopsis} accent="#e94560" />
      <FieldList label="基本信息" value={profile.basic_info} accent="#60a5fa" />
      <FieldList label="全文规模 / 数据规划" value={profile.scale_plan} accent="#22c55e" />
      <FieldList label="结局设定" value={profile.ending} accent="#f59e0b" />
    </Card>
    {PROFILE_SECTION_GROUPS.map(group => {
      const entries = group.fields
        .map(f => ({ f, value: profile[f.key] || '' }))
        .filter(e => (e.value || '').trim());
      if (!entries.length) return null;
      return (
        <Card key={group.title} title={group.title} subtitle={group.description}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 6 }}>
            {entries.map(({ f, value }) => <FieldList key={f.key} label={f.label} value={value} accent="#93c5fd" />)}
          </div>
        </Card>
      );
    })}
  </div>
) : (
  <>
    {/* ……现有 CardGrid 编辑视图原样保留…… */}
  </>
)}
```

- [ ] **Step 3: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/pages/WorldPage.tsx
git commit -m "feat(world): add read/list view + work intro card to long-novel worldview editor"
```

---

### Task 4: 世界观生成 prompt 字段边界 + mergeText 去重

**Files:**
- Modify: `server/src/chain/chain.controller.ts`（短篇 pipeline 世界观 prompt 两处 + 落库 `mergeText`）

**Interfaces:**
- Consumes: 现有 `mergeText`、`serializeGeneratedSqlText`、`llmCallWithRetry`。
- Produces: 世界观各字段不再跨字段回填；`social_rules` 只含规则、`locations` 只含地点。

- [ ] **Step 1: 第一个世界观 prompt（约 L5249）加字段边界**

在 `const worldPrompt = ...` 的 7 维度说明处追加（`只输出以下7维度JSON...` 之后）：

```ts
字段职责边界（必须严格遵守，禁止互相包含）：
- socialStructure 只写阶级/政治/经济资源/宗教信仰格局；不得写行业规则。
- locations/geography 只写地理与地点分布；不得在 socialStructure 或 socialRules 中重复地点。
- socialRules（若有）只写行业规则/法律边界/社会行为规范，用短句列表。
- powerSystem 只写力量/科技/超自然体系；economy 只写货币/贸易/产业。
```

- [ ] **Step 2: 第二个世界观 prompt（sequentialTasks 任务B，约 L6077）加同样边界**

在该 `worldPrompt` 的 `每维度200-400字...` 前插入同样边界文案（同上内容，复制一份）。

- [ ] **Step 3: 修落库 mergeText 跨字段回填（约 L6088-6110）**

把：
```ts
mergeText(existingWorldRow.social_rules, serializeGeneratedSqlText(wd.socialRules || wd.socialStructure)),
mergeText(existingWorldRow.special_settings, serializeGeneratedSqlText(wd.specialSettings || wd.powerSystem || wd.rules)),
mergeText(existingWorldRow.locations, JSON.stringify(Array.isArray(wd.locations) ? wd.locations : (Array.isArray(wd.geography) ? wd.geography : []))),
```
改为（去掉跨字段兜底，职责独立）：
```ts
mergeText(existingWorldRow.social_rules, serializeGeneratedSqlText(wd.socialRules)),
mergeText(existingWorldRow.special_settings, serializeGeneratedSqlText(wd.specialSettings)),
mergeText(existingWorldRow.locations, JSON.stringify(Array.isArray(wd.locations) ? wd.locations : [])),
```
并同步修改下方新建 INSERT 分支里的对应参数（`social_rules`、`special_settings`、`locations` 三个占位取值同样去掉 `|| wd.xxx` 兜底）。

- [ ] **Step 4: 服务端 typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add server/src/chain/chain.controller.ts
git commit -m "fix(world): define field ownership boundaries in world prompts and stop cross-field merge duplication"
```

---

## Phase 2：角色

### Task 5: migration 048 + profile-changes 服务/控制器/接口

**Files:**
- Create: `server/src/database/migrations/048_character_profile_changes.ts`
- Modify: `server/src/modules/character/character.service.ts`（新增 4 个方法）
- Modify: `server/src/modules/character/character.controller.ts`（新增 4 个路由）
- Create: `server/src/modules/character/profile-change.service.spec.ts`

**Interfaces:**
- Consumes: `DatabaseService`、`uuid`。
- Produces:
  - `CharacterService.listProfileChanges(projectId, characterId): any[]`
  - `CharacterService.createProfileChange(projectId, characterId, input: { fieldKey; fieldLabel; beforeValue; afterValue; chapterIndex?; reason? }): any`
  - `CharacterService.updateProfileChange(projectId, characterId, id, patch: { chapterIndex?; reason?; afterValue? }): any`
  - `CharacterService.deleteProfileChange(projectId, characterId, id): void`
  - `CharacterService.recordAutoProfileChanges(projectId, characterId, before, after): number`
  - Controller: `GET/POST /projects/:projectId/characters/:id/profile-changes`，`PUT/DELETE .../profile-changes/:changeId`

- [ ] **Step 1: 写失败测试** `server/src/modules/character/profile-change.service.spec.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CharacterService } from './character.service';
import { CharacterRepository } from '../../database/repositories/character.repository';
import { CharacterStateRepository } from '../../database/repositories/character-state.repository';
import { DatabaseService } from '../../database/database.service';

const db = {
  prepare: vi.fn(() => ({
    run: vi.fn(), get: vi.fn(() => undefined), all: vi.fn(() => []), bind: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn(() => []) })),
  })),
};

const mkService = () => new CharacterService(
  {} as unknown as CharacterRepository,
  {} as unknown as CharacterStateRepository,
  db as unknown as DatabaseService,
);

describe('CharacterService.profileChanges', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it('listProfileChanges 返回行', () => {
    (db.prepare as any).mockReturnValue({ all: vi.fn(() => [{ id: 'c1', field_key: 'personality_traits', before_value: 'a', after_value: 'b' }]) });
    const rows = mkService().listProfileChanges('p1', 'char-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].field_key).toBe('personality_traits');
  });
  it('createProfileChange 写入并返回', () => {
    const run = vi.fn(); const get = vi.fn(() => ({ id: 'c1' }));
    (db.prepare as any).mockReturnValue({ run, get });
    const out = mkService().createProfileChange('p1', 'char-1', { fieldKey: 'appearance', fieldLabel: '外貌特征', beforeValue: '', afterValue: 'new' });
    expect(run).toHaveBeenCalled();
    expect(out.id).toBe('c1');
  });
  it('deleteProfileChange 执行删除', () => {
    const run = vi.fn(); (db.prepare as any).mockReturnValue({ run });
    mkService().deleteProfileChange('p1', 'char-1', 'c1');
    expect(run).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd server && npx vitest run src/modules/character/profile-change.service.spec.ts`
Expected: FAIL（方法不存在）。

- [ ] **Step 3: 实现 migration** `server/src/database/migrations/048_character_profile_changes.ts`

```ts
import { DatabaseSync } from 'node:sqlite';

// 048 — 角色字段级变动历史（手动 + 自动记录）。
export function up(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS character_profile_changes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    character_id TEXT NOT NULL,
    field_key TEXT NOT NULL,
    field_label TEXT NOT NULL DEFAULT '',
    before_value TEXT NOT NULL DEFAULT '',
    after_value TEXT NOT NULL DEFAULT '',
    chapter_index INTEGER,
    reason TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_character_profile_changes_char ON character_profile_changes(project_id, character_id);`);
}

export function down(db: DatabaseSync): void {
  db.exec(`DROP TABLE IF EXISTS character_profile_changes;`);
}

export default { up, down };
```

- [ ] **Step 4: 实现服务方法**（追加到 `character.service.ts` 的 `getWritingSummary` 之后）

```ts
  /** 角色字段级变动历史 */
  listProfileChanges(projectId: string, characterId: string): any[] {
    const db = this.databaseService.getDb();
    return db.prepare(
      `SELECT * FROM character_profile_changes WHERE project_id = ? AND character_id = ? ORDER BY created_at DESC, rowid DESC`,
    ).all(projectId, characterId) as any[];
  }

  createProfileChange(projectId: string, characterId: string, input: {
    fieldKey: string; fieldLabel?: string; beforeValue?: string; afterValue?: string; chapterIndex?: number; reason?: string;
  }): any {
    const db = this.databaseService.getDb();
    const now = new Date().toISOString();
    const id = uuid();
    db.prepare(`INSERT INTO character_profile_changes (id, project_id, character_id, field_key, field_label, before_value, after_value, chapter_index, reason, source, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'manual',?,?)`)
      .run(id, projectId, characterId, input.fieldKey, input.fieldLabel || input.fieldKey, input.beforeValue || '', input.afterValue || '',
        input.chapterIndex ?? null, input.reason || '', now, now);
    return db.prepare(`SELECT * FROM character_profile_changes WHERE id = ?`).get(id);
  }

  updateProfileChange(projectId: string, characterId: string, id: string, patch: { chapterIndex?: number; reason?: string; afterValue?: string }): any {
    const db = this.databaseService.getDb();
    const row = db.prepare(`SELECT * FROM character_profile_changes WHERE id = ? AND project_id = ? AND character_id = ?`).get(id, projectId, characterId) as any;
    if (!row) throw new NotFoundException('变动记录不存在');
    db.prepare(`UPDATE character_profile_changes SET chapter_index = ?, reason = ?, after_value = ?, updated_at = ? WHERE id = ?`)
      .run(patch.chapterIndex ?? row.chapter_index ?? null, patch.reason ?? row.reason ?? '', patch.afterValue ?? row.after_value ?? '', new Date().toISOString(), id);
    return db.prepare(`SELECT * FROM character_profile_changes WHERE id = ?`).get(id);
  }

  deleteProfileChange(projectId: string, characterId: string, id: string): void {
    const db = this.databaseService.getDb();
    db.prepare(`DELETE FROM character_profile_changes WHERE id = ? AND project_id = ? AND character_id = ?`).run(id, projectId, characterId);
  }

  /** 自动记录：对比 before/after 的 PROFILE_FIELDS 差异，逐个写一条 auto 记录 */
  recordAutoProfileChanges(projectId: string, characterId: string, before: Record<string, unknown>, after: Record<string, unknown>): number {
    let count = 0;
    for (const field of PROFILE_FIELDS) {
      const b = String(before[field] ?? '');
      const a = String(after[field] ?? '');
      if (b !== a && (a || b)) {
        this.createProfileChange(projectId, characterId, {
          fieldKey: field,
          fieldLabel: PROFILE_FIELD_LABELS[field] || field,
          beforeValue: b, afterValue: a, reason: '',
        });
        count++;
      }
    }
    return count;
  }
```

> 需要文件顶部已 `import { NotFoundException } from '@nestjs/common'`（该文件已用，无需新增）；`uuid` 已导入。

- [ ] **Step 5: 定义 PROFILE_FIELD_LABELS 常量**（`PROFILE_FIELDS` 之后）

```ts
export const PROFILE_FIELD_LABELS: Record<string, string> = {
  alias_title: '别名/称号', identity_occupation: '身份/职业', faction_stance: '阵营/立场', role_type: '角色类型',
  appearance: '外貌特征', personality_traits: '性格特点', abilities_skills: '能力/技能', backstory: '背景故事',
  relationships: '人物关系', catchphrase_speech_style: '口头禅/说话风格', goals_motivation: '目标/动机',
  weaknesses_fears: '弱点/恐惧', supplementary: '补充说明',
};
```

- [ ] **Step 6: 在 updateProfile 中接入自动记录**

在 `updateProfile` 的 `const changed = ...` 行之后加：
```ts
    this.recordAutoProfileChanges(projectId, id, before ?? {}, input);
```

- [ ] **Step 7: 控制器新增 4 个路由** `character.controller.ts`

```ts
  @Get(':id/profile-changes')
  getProfileChanges(@Param('projectId') projectId: string, @Param('id') id: string) {
    return this.service.listProfileChanges(projectId, id);
  }

  @Post(':id/profile-changes')
  createProfileChange(@Param('projectId') projectId: string, @Param('id') id: string, @Body() body: any) {
    return this.service.createProfileChange(projectId, id, body);
  }

  @Put(':id/profile-changes/:changeId')
  updateProfileChange(@Param('projectId') projectId: string, @Param('id') id: string, @Param('changeId') changeId: string, @Body() body: any) {
    return this.service.updateProfileChange(projectId, id, changeId, body);
  }

  @Delete(':id/profile-changes/:changeId')
  deleteProfileChange(@Param('projectId') projectId: string, @Param('id') id: string, @Param('changeId') changeId: string) {
    this.service.deleteProfileChange(projectId, id, changeId);
    return { success: true };
  }
```

- [ ] **Step 8: 运行测试 + typecheck**

Run: `cd server && npx vitest run src/modules/character/profile-change.service.spec.ts && npm run typecheck`
Expected: PASS + 通过。

- [ ] **Step 9: Commit**

```bash
git add server/src/database/migrations/048_character_profile_changes.ts server/src/modules/character/character.service.ts server/src/modules/character/character.controller.ts server/src/modules/character/profile-change.service.spec.ts
git commit -m "feat(character): add field-level profile change history (migration + service + API)"
```

---

### Task 6: getWritingSummary 重构（一句话 hook）

**Files:**
- Modify: `server/src/modules/character/character.service.ts`

**Interfaces:**
- Consumes: `PROFILE_FIELDS`。
- Produces: `getWritingSummary().summary` 变为精简一句话（`【人物一句话】姓名… 身份… 性格… 目标…`），`sections` 结构不变（前端按分区列表渲染）。

- [ ] **Step 1: 替换 summary 拼接逻辑**（`getWritingSummary` 内 `narrativeParts` 段）

把：
```ts
    const narrativeParts = [
      c.name && `姓名：${c.name}`,
      p.identity_occupation && `身份职业：${p.identity_occupation}`,
      p.role_type && `角色类型：${p.role_type}`,
      p.faction_stance && `阵营立场：${p.faction_stance}`,
      p.goals_motivation && `目标动机：${p.goals_motivation}`,
      p.personality_traits && `性格：${p.personality_traits}`,
      p.appearance && `外貌：${p.appearance}`,
      p.backstory && `背景：${p.backstory}`,
      p.abilities_skills && `能力技能：${p.abilities_skills}`,
      p.catchphrase_speech_style && `说话风格：${p.catchphrase_speech_style}`,
      p.weaknesses_fears && `弱点恐惧：${p.weaknesses_fears}`,
    ].filter(Boolean);
    const summary = narrativeParts.length
      ? `【角色速览】${narrativeParts.join('；')}。`
      : '角色资料较简略，建议补充目标、矛盾与背景后再生成写作摘要。';
```
改为：
```ts
    const firstTrait = String(p.personality_traits || '').trim().split(/[、，,；;]/)[0] || '';
    const hookParts = [
      c.name && `姓名：${c.name}`,
      p.identity_occupation && `身份：${p.identity_occupation}`,
      firstTrait && `性格：${firstTrait}`,
      p.goals_motivation && `目标：${String(p.goals_motivation).trim().split(/[。；;\n]/)[0]}`,
      p.weaknesses_fears && `软肋：${String(p.weaknesses_fears).trim().split(/[。；;\n]/)[0]}`,
    ].filter(Boolean);
    const summary = hookParts.length
      ? `【人物一句话】${hookParts.join('；')}。`
      : '角色资料较简略，建议补充目标、性格与背景后再生成写作摘要。';
```

- [ ] **Step 2: 运行现有测试 + typecheck**

Run: `cd server && npx vitest run src/modules/character && npm run typecheck`
Expected: 通过（若旧断言依赖原 summary 文案，更新断言）。

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/character/character.service.ts
git commit -m "refactor(character): shorten writing summary to one-line hook to remove archive duplication"
```

---

### Task 7: CharacterPage 合并视图 + 读者共鸣点卡

**Files:**
- Modify: `desktop/src/renderer/pages/CharacterPage.tsx`
- Uses: `ListBlocks.tsx`（SectionHeading / FieldList / ChipList）

**Interfaces:**
- Consumes: `profile`（`character_extended_profiles` 13 字段 + `reader_empathy_point` 等）、`summarySections`、`writingSummary`。
- Produces: 单一档案视图；删掉原「角色速览」面板与「人物设定档案」面板，替换为合并列表。

- [ ] **Step 1: 替换「角色速览」面板**

把 `summaryPanel` 区块（`<div style={styles.summaryPanel}>...角色速览...`）整体替换为「人物一句话」+「读者共鸣点」：

```tsx
<section style={styles.summaryPanel}>
  <div style={styles.panelTitle}>人物一句话</div>
  <div style={styles.panelBody}>
    <div style={styles.summaryText}>{writingSummary || '保存角色资料后将生成写作摘要。'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
      <FieldList label="读者共鸣点" value={profile['reader_empathy_point']} accent="#f472b6" empty="建议补充悲惨/反转/热血/牺牲等代入钩子" />
      <FieldList label="角色标签" value={Array.isArray(selected.tags) ? selected.tags.join('、') : selected.tags} accent="#60a5fa" />
    </div>
  </div>
</section>
```
> `profile` 需能从 `character_extended_profiles` 读出 `reader_empathy_point`（该列已存在）。若 getProfile 的 `profileData` 未包含该列，需在 `character.service.ts` 的 `profileRow` 映射中补上（`PROFILE_FIELDS` 不含 reader_empathy_point，改在 `getProfile` 返回的 `profile` 对象上直接附带：`profileData.reader_empathy_point = row?.reader_empathy_point`）。

- [ ] **Step 2: 合并「人物设定档案」为列表**

把 `profileArchive` 区块替换为按 `PROFILE_SECTION_GROUPS` 分区渲染的列表视图（用 SectionHeading + FieldList）：

```tsx
<section style={styles.profileArchive}>
  <div style={styles.panelTitle}>人物设定</div>
  <p style={styles.archiveHint}>基础信息、外貌与性格等均为列表；二级标题区分设定名与内容。点击性格/能力等字段标签可查看或记录变动历史。</p>
  <div style={{ padding: 12 }}>
    {PROFILE_SECTION_GROUPS.map(section => {
      const entries = section.fields
        .map(field => ({ field, value: profile[field.key] || '' }))
        .filter(e => (e.value || '').trim());
      if (!entries.length) return null;
      return (
        <section key={section.title} style={{ marginBottom: 6 }}>
          <SectionHeading title={section.title} accent="#e94560" hint={section.description} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 4 }}>
            {entries.map(({ field, value }) => (
              <div key={field.key}>
                <FieldList label={field.label} value={value} accent="#93c5fd" />
              </div>
            ))}
          </div>
        </section>
      );
    })}
  </div>
</section>
```

- [ ] **Step 3: 移除重复的 `selected.background` 摘要块**

原 `summaryBackground`（`<strong>背景：</strong>{selected.background}`）从速览面板删除——背景已在「能力与背景」分区展示，避免重复。

- [ ] **Step 4: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/pages/CharacterPage.tsx
git commit -m "feat(character): merge quick-view and archive into one list view with reader-hook card"
```

---

### Task 8: 变动历史 UI（ChangeHistoryPanel + 可点击字段标签）

**Files:**
- Create: `desktop/src/renderer/components/character/ChangeHistoryPanel.tsx`
- Modify: `desktop/src/renderer/pages/CharacterPage.tsx`

**Interfaces:**
- Consumes: `GET/POST/PUT/DELETE /projects/:id/characters/:charId/profile-changes`。
- Produces: `ChangeHistoryPanel` 组件 + 字段标签点击打开历史。

- [ ] **Step 1: 实现组件** `desktop/src/renderer/components/character/ChangeHistoryPanel.tsx`

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

type ChangeRow = { id: string; field_key: string; field_label: string; before_value: string; after_value: string; chapter_index?: number; reason: string; source: string };

const payload = (res: any) => res?.data?.data ?? res?.data ?? res ?? [];

export const ChangeHistoryPanel: React.FC<{ projectId: string; characterId: string; fieldKey: string; fieldLabel: string; onClose: () => void }> = ({
  projectId, characterId, fieldKey, fieldLabel, onClose,
}) => {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [chapter, setChapter] = useState('');
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    const res = await api.get(`/projects/${projectId}/characters/${characterId}/profile-changes`);
    const data = payload(res);
    setRows(Array.isArray(data) ? data.filter((r: any) => r.field_key === fieldKey) : []);
  }, [projectId, characterId, fieldKey]);
  useEffect(() => { void load(); }, [load]);
  const addManual = async () => {
    await api.post(`/projects/${projectId}/characters/${characterId}/profile-changes`, {
      fieldKey, fieldLabel, beforeValue: '', afterValue: '', chapterIndex: chapter ? Number(chapter) : null, reason,
    });
    setChapter(''); setReason('');
    await load();
  };
  const remove = async (id: string) => {
    await api.delete(`/projects/${projectId}/characters/${characterId}/profile-changes/${id}`);
    await load();
  };
  return (
    <div style={{ marginTop: 6, padding: 10, borderRadius: 8, border: '1px solid rgba(233,69,96,0.22)', backgroundColor: 'rgba(0,0,0,0.18)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#eaeaea' }}>{fieldLabel} · 变动历史</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
      {rows.length === 0 && <p style={{ fontSize: 12, color: '#8a8aa0', margin: '8px 0' }}>暂无变动记录。保存设定时的自动变化会记录在这里，也可手动补录。</p>}
      {rows.map(row => (
        <div key={row.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 12, color: '#c0c0d0' }}>
          <strong style={{ color: '#f59e0b' }}>{row.chapter_index ? `第${row.chapter_index}章` : '未定位章节'}</strong>
          <span style={{ color: '#8a8aa0' }}> · {row.source === 'auto' ? '自动' : '手动'}</span>
          <div style={{ marginTop: 3, lineHeight: 1.6 }}>
            {row.before_value && <span style={{ color: '#ef4444', textDecoration: 'line-through' }}>{row.before_value}</span>}
            {row.before_value && row.after_value && <span style={{ color: '#8a8aa0', margin: '0 4px' }}>→</span>}
            {row.after_value && <span style={{ color: '#22c55e' }}>{row.after_value}</span>}
          </div>
          {row.reason && <div style={{ color: '#fbbf24', marginTop: 2 }}>原因：{row.reason}</div>}
          <button type="button" onClick={() => remove(row.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11, marginTop: 3 }}>删除</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        <input value={chapter} onChange={e => setChapter(e.target.value)} placeholder="第几章（可空）" style={{ width: 90, padding: '6px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', fontSize: 12 }} />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="变化原因（如：第5章真相揭晓后不再伪装）" style={{ flex: 1, minWidth: 180, padding: '6px 8px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.22)', color: '#eaeaea', fontSize: 12 }} />
        <button type="button" onClick={addManual} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', backgroundColor: '#e94560', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>补录变化</button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: CharacterPage 接入——字段点击打开历史**

在 `CharacterPage` 组件内加 state 与处理器：
```tsx
const [historyField, setHistoryField] = useState<string | null>(null);
const historyLabel = historyField
  ? (PROFILE_SECTION_GROUPS.flatMap(s => s.fields).find(f => f.key === historyField)?.label ?? historyField)
  : '';
```
在合并档案的分区渲染中，把 `FieldList` 外层包成可点击标签（点击 setHistoryField）：
```tsx
<div key={field.key} onClick={() => setHistoryField(field.key)} title="点击查看/记录变动历史"
  style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 6, border: '1px solid transparent' }}
  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(233,69,96,0.25)')}
  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
  <FieldList label={field.label} value={value} accent="#93c5fd" />
</div>
```
在档案区下方（`</section>` 之前）插入历史面板：
```tsx
{historyField && (
  <ChangeHistoryPanel projectId={projectId} characterId={selected.id} fieldKey={historyField} fieldLabel={historyLabel} onClose={() => setHistoryField(null)} />
)}
```

- [ ] **Step 3: 引入组件**

文件顶部 `import { ChangeHistoryPanel } from '../components/character/ChangeHistoryPanel';`

- [ ] **Step 4: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add desktop/src/renderer/components/character/ChangeHistoryPanel.tsx desktop/src/renderer/pages/CharacterPage.tsx
git commit -m "feat(character): add field change-history panel with clickable tags and manual recording"
```

---

### Task 9: 角色生成 prompt 增强（读者代入钩子 + 成长标签）

**Files:**
- Modify: `server/src/chain/chain.controller.ts`（任务A 角色 prompt）
- Modify: `server/src/chain/prompt-registry.service.ts`（`long-novel-character-settings` 模板）

**Interfaces:**
- Consumes: 现有角色 prompt 结构。
- Produces: 角色 profile 含 `reader_empathy_point` + 初始成长标签。

- [ ] **Step 1: 短篇任务A 角色 prompt 追加要求**（`【需要包含 5 个核心人物...】` 段之后）

```ts
【读者代入钩子（必填）】每个角色必须写明至少 2 类读者代入钩子并写入 readerEmpathyPoint：悲惨经历 / 反转设定 / 热血高光 / 牺牲瞬间（主角至少覆盖热血与牺牲之一）。例如"被最信任的人背叛后仍选择相信（悲惨+反转）"。
【成长标签（必填）】每个角色给出 2-3 个"从→到"成长标签（如"隐忍→爆发""冷漠→守护""轻信→审慎"），写入 growthTags 数组。
```
并把输出 JSON 示例的角色结构补上 `"readerEmpathyPoint":"...","growthTags":["..."]`。落库时把 `readerEmpathyPoint` 写入 `reader_empathy_point`，`growthTags` 合并进 `tags`。

- [ ] **Step 2: 长篇模板** `prompt-registry.service.ts` 的 `long-novel-character-settings` content 的「6. 成长弧线」后追加：

```text
### 7. 读者代入钩子（必填）
每个角色写明至少 2 类：悲惨经历 / 反转设定 / 热血高光 / 牺牲瞬间，写入 readerEmpathyPoint。
### 8. 成长标签（必填）
给出 2-3 个"从→到"成长标签，写入 growthTags。
```
并在其输出 JSON 示例的角色对象中加入 `"readerEmpathyPoint":"...", "growthTags":[...]`。

- [ ] **Step 3: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add server/src/chain/chain.controller.ts server/src/chain/prompt-registry.service.ts
git commit -m "feat(character): require reader empathy hooks + growth tags in character generation prompts"
```

---

## Phase 3：地点势力

### Task 10: 前端名字解析（OrganizationMapPage 载入角色/章节映射）

**Files:**
- Modify: `desktop/src/renderer/pages/OrganizationMapPage.tsx`

**Interfaces:**
- Consumes: `useCharacterStore`、`api`（outlines/tree）。
- Produces: `characterNameById`、`chapterTitleById` 两个映射传入 detail cards。

- [ ] **Step 1: 载入映射**

```tsx
const { characters, fetchCharacters } = useCharacterStore();
const [chapterMap, setChapterMap] = useState<Record<string, string>>({});
useEffect(() => {
  if (!projectId) return;
  fetchCharacters(projectId);
  api.get(`/projects/${projectId}/outlines/tree`).then((res: any) => {
    const data = (res as any).data ?? res;
    const map: Record<string, string> = {};
    const walk = (nodes: any[]) => nodes.forEach(n => { if (n?.title) map[n.id] = n.title; if (Array.isArray(n.children)) walk(n.children); });
    if (Array.isArray(data)) walk(data);
    setChapterMap(map);
  }).catch(() => {});
}, [projectId, fetchCharacters]);
const characterNameById = Object.fromEntries(characters.map((c: any) => [c.id, c.name]));
```
> 在 OrganizationMapPage 里使用 hook 需保证该文件在组件顶层调用（现有函数组件，OK）。

- [ ] **Step 2: 传入 MapDetailCard / OrgDetailCard**

```tsx
<MapDetailCard
  mapPoint={selectedMapPoint}
  characterNameById={characterNameById}
  chapterTitleById={chapterMap}
  ...
/>
<OrgDetailCard
  organization={selectedOrg}
  allOrganizations={organizations}
  characterNameById={characterNameById}
  ...
/>
```

- [ ] **Step 3: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/pages/OrganizationMapPage.tsx
git commit -m "feat(map): load character/chapter name maps for id resolution in detail cards"
```

---

### Task 11: MapDetailCard 富展示 + 名字

**Files:**
- Modify: `desktop/src/renderer/components/world/MapDetailCard.tsx`

**Interfaces:**
- Consumes: `characterNameById: Record<string,string>`、`chapterTitleById: Record<string,string>`（新 props）。
- Produces: 展示全部字段 + 名字。

- [ ] **Step 1: 全组件重写**

```tsx
import React from 'react';
import type { MapPoint } from '@novel/shared';
import { splitToLines } from '../../lib/textList';

interface MapDetailCardProps {
  mapPoint: MapPoint | null;
  characterNameById?: Record<string, string>;
  chapterTitleById?: Record<string, string>;
  onUpdate: (id: string, data: Partial<MapPoint>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<string, string> = {
  world: '世界', region: '区域', country: '国家/政权', city: '城市', location: '地点', scene: '场景',
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#93c5fd', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, color: '#c0c0d0', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const MapDetailCard: React.FC<MapDetailCardProps> = ({ mapPoint, characterNameById = {}, chapterTitleById = {}, onDelete, onClose }) => {
  if (!mapPoint) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8a8aa0', fontSize: 12 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
        <div>选择地点查看详情</div>
      </div>
    );
  }
  const chapters = (mapPoint.linkedChapterIds || []).map(id => chapterTitleById[id] || `第${id.slice(0, 4)}章`).filter(Boolean);
  const characters = (mapPoint.linkedCharacterIds || []).map(id => characterNameById[id]).filter(Boolean);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#131b36', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#eaeaea' }}>地点详情</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#eaeaea', marginBottom: 4 }}>{mapPoint.name}</div>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#e94560', backgroundColor: 'rgba(233,69,96,0.12)', border: '1px solid rgba(233,69,96,0.3)' }}>
          {LEVEL_LABELS[mapPoint.level] || mapPoint.level}
        </span>
        {mapPoint.type && <Row label="类型"><span>{mapPoint.type}</span></Row>}
        <Row label="描述">{mapPoint.description || <span style={{ color: '#6c6c80' }}>暂无描述</span>}</Row>
        {mapPoint.climate && <Row label="气候/环境">{mapPoint.climate}</Row>}
        {mapPoint.resources && <Row label="资源/物产"><ul style={{ margin: 0, paddingLeft: 18 }}>{splitToLines(mapPoint.resources).map((r, i) => <li key={i}>{r}</li>)}</ul></Row>}
        {mapPoint.significance && <Row label="重要性与剧情意义">{mapPoint.significance}</Row>}
        {mapPoint.sensory_detail && <Row label="感官细节">{mapPoint.sensory_detail}</Row>}
        {mapPoint.coordinates && <Row label="坐标"><span style={{ fontFamily: 'monospace' }}>{mapPoint.coordinates}</span></Row>}
        <Row label={`关联章节 (${chapters.length})`}>
          {chapters.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{chapters.map((c, i) => <span key={i} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>{c}</span>)}</div> : <span style={{ color: '#6c6c80' }}>暂无</span>}
        </Row>
        <Row label={`关联角色 (${characters.length})`}>
          {characters.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{characters.map((c, i) => <span key={i} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>{c}</span>)}</div> : <span style={{ color: '#6c6c80' }}>暂无</span>}
        </Row>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => onDelete(mapPoint.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>删除</button>
      </div>
    </div>
  );
};

export default MapDetailCard;
```

- [ ] **Step 2: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/world/MapDetailCard.tsx
git commit -m "feat(map): enrich location detail card with all fields and resolved names"
```

---

### Task 12: OrgDetailCard 富展示 + 名字

**Files:**
- Modify: `desktop/src/renderer/components/world/OrgDetailCard.tsx`

**Interfaces:**
- Consumes: `characterNameById?: Record<string,string>`（新 props）。
- Produces: 展示 leader/strength/territory/characteristics/signature_equipment/relationships。

- [ ] **Step 1: 全组件重写**（结构同 Task 11，字段换为组织字段）

关键渲染：名称、类型 badge、描述、领袖（`characterNameById[leader]` 或原文）、实力等级、领地（splitToLines）、特点（splitToLines）、标志性装备（splitToLines）、关系（`relationships_json` 解析为 JSON 数组后逐条渲染 组织名/类型/描述）、上级组织、下属组织。

```tsx
import React from 'react';
import type { Organization } from '@novel/shared';
import { splitToLines } from '../../lib/textList';

const TYPE_LABELS: Record<string, string> = { regime: '政权', faction: '势力', army: '军队', sect: '门派', camp: '阵营', organization: '组织', other: '其他' };

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, color: '#c0c0d0', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const OrgDetailCard: React.FC<{
  organization: Organization | null;
  allOrganizations: Organization[];
  characterNameById?: Record<string, string>;
  onUpdate: (id: string, data: Partial<Organization>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}> = ({ organization, allOrganizations, characterNameById = {}, onDelete, onClose }) => {
  if (!organization) {
    return <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8a8aa0', fontSize: 12 }}>
      <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div><div>选择组织查看详情</div></div>;
  }
  let relationships: any[] = [];
  if (typeof organization.relationships_json === 'string') {
    try { relationships = JSON.parse(organization.relationships_json); } catch {}
  } else if (Array.isArray(organization.relationships_json)) relationships = organization.relationships_json;
  const parentOrg = allOrganizations.find(o => o.id === organization.parentId);
  const childOrgs = allOrganizations.filter(o => o.parentId === organization.id);
  const leaderName = organization.leader ? (characterNameById[organization.leader] || organization.leader) : '';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#131b36', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#eaeaea' }}>组织详情</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#eaeaea', marginBottom: 4 }}>{organization.name}</div>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
          {TYPE_LABELS[organization.type] || organization.type}
        </span>
        {organization.description && <Row label="描述">{organization.description}</Row>}
        {leaderName && <Row label="领袖">{leaderName}</Row>}
        {organization.strength_level && <Row label="实力等级">{organization.strength_level}</Row>}
        {organization.territory && <Row label="领地/范围"><ul style={{ margin: 0, paddingLeft: 18 }}>{splitToLines(organization.territory).map((t, i) => <li key={i}>{t}</li>)}</ul></Row>}
        {organization.characteristics && <Row label="特点"><ul style={{ margin: 0, paddingLeft: 18 }}>{splitToLines(organization.characteristics).map((t, i) => <li key={i}>{t}</li>)}</ul></Row>}
        {organization.signature_equipment && <Row label="标志性装备/手段"><ul style={{ margin: 0, paddingLeft: 18 }}>{splitToLines(organization.signature_equipment).map((t, i) => <li key={i}>{t}</li>)}</ul></Row>}
        {relationships.length > 0 && (
          <Row label={`关系 (${relationships.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {relationships.map((r, i) => (
                <div key={i} style={{ padding: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <strong style={{ color: '#a78bfa' }}>{r.name || r.target || '?'}</strong>
                  {r.type && <span style={{ color: '#8a8aa0', marginLeft: 6 }}>{r.type}</span>}
                  {r.description && <div style={{ marginTop: 2, color: '#c0c0d0' }}>{r.description}</div>}
                </div>
              ))}
            </div>
          </Row>
        )}
        {parentOrg && <Row label="上级组织">{parentOrg.name}</Row>}
        {childOrgs.length > 0 && (
          <Row label={`下属组织 (${childOrgs.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{childOrgs.map(c => <span key={c.id} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>{c.name}</span>)}</div>
          </Row>
        )}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => onDelete(organization.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>删除</button>
      </div>
    </div>
  );
};

export default OrgDetailCard;
```

- [ ] **Step 2: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/world/OrgDetailCard.tsx
git commit -m "feat(org): enrich organization detail card with leadership, territory, relations and resolved names"
```

---

### Task 13: LocationKnowledgePanelV2 暗色主题重构

**Files:**
- Modify: `desktop/src/renderer/components/world/LocationKnowledgePanelV2.tsx`

**Interfaces:**
- Consumes: `api` 现有接口（`/map-points/:id/profile`, `/relations`, `/writing-summary`）。
- Produces: 组件 props 与接口不变，仅样式/结构暗色列表化。

- [ ] **Step 1: 整体替换为暗色主题列表结构**

把组件 `LocationKnowledgeEditor` 的 JSX 改为：外层深色容器（`#131b36` 卡片）、写作摘要 pre 用暗色、profile sections 用 `SectionHeading` + `FieldList`（可编辑时保留 textarea）、relations 用表格行 + 输入框、保存按钮沿用 app 样式（`#e94560`）。props 与数据逻辑（load/save/updateRelation/addRelation/removeRelation）不变，仅替换 `return (...)` 的样式对象与结构。

> 实现时复用 Task 1 的 `SectionHeading`；编辑态 textarea 保持最小改动（只改配色边框），不做功能重写。

- [ ] **Step 2: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add desktop/src/renderer/components/world/LocationKnowledgePanelV2.tsx
git commit -m "feat(map): restyle location knowledge panel to dark list theme"
```

---

## Phase 4：大纲

### Task 14: 短篇章纲 prompt 增强（爽点类型/跨章弧/热血/频率）+ 弧规划注入

**Files:**
- Modify: `server/src/chain/chain.controller.ts`

**Interfaces:**
- Consumes: `chapterTitles`、`chapterResponsibilityPlan`、`shortStoryPrompt`。
- Produces: `chapterResponsibilityPlan` 增加 `arcRole`（'build'|'burst'）与 `arcIndex`；`chapterPrompt` 增加爽点类型/跨章弧/热血/频率要求。

- [ ] **Step 1: 构造跨章爽点弧规划**（`chapterResponsibilityPlan` 构建处，约 L5552）

```ts
        // 跨章爽点弧：每 3 章为一段弧，段内最后一章为"爆发/高潮"章；埋设与蓄力由各章按弧序号承接。
        const ARC_LEN = 3;
        const chapterResponsibilityPlan = chapterTitles.map((chapter, index) => {
          const arcIndex = Math.floor(index / ARC_LEN);
          const inArcPos = index % ARC_LEN;
          const arcRole = inArcPos === ARC_LEN - 1 ? 'burst' : 'build';
          return {
            chapter: index + 1,
            title: chapter.title,
            function: chapter.func,
            responsibility: chapter.brief || '',
            arcIndex,
            arcRole,
            arcLabel: `第${arcIndex + 1}条跨章爽点弧（第${arcIndex * ARC_LEN + 1}-${Math.min(arcIndex * ARC_LEN + ARC_LEN, chapterTitles.length)}章）${arcRole === 'burst' ? '·爆发章' : '·埋设/蓄力章'}`,
          };
        });
```

- [ ] **Step 2: chapterPrompt 质量要求增强**（在 `【整体质量要求（最高优先级，不可妥协）】` 段内/后追加）

把：
```ts
- 爽点密集但不突兀：2-3个爽点必须有剧情铺垫，不可"天降"——每个爽点都必须与本章场景和人物行动有因果链
```
扩展为：
```ts
- 爽点密集但不突兀：本章 2-3 个爽点必须混合至少 2 类（打脸/逆袭/热血名场面/反转冲击/情感暴击/信息爆点），在 highlights 中标明类型；其中 1 个为本章"高能记忆点"（最容易被读者记住的瞬间）。每个爽点必须有剧情铺垫、与本章场景和人物行动有因果链，不可"天降"
- 跨章爽点弧：本章属于【全书章节分工】中标注的爽点弧——若是"埋设/蓄力章"，只埋设与蓄力（伏笔+铺垫），不得提前爆发；若是"爆发章"，必须兑现该弧此前埋设的爽点，形成打脸/逆袭/热血/名场面高潮
- 热血/高光镜头：题材允许时，本章应包含至少 1 个可落笔的高光动作/对峙/宣言场景（热血燃点），写入 conflicts 或 scenes
- 频率兜底：每 2-3 章至少 1 个反转或强钩子；每卷至少 2 条跨章爽点弧，不得整卷平铺
```

- [ ] **Step 3: 把弧信息注入 chapterResponsibilityPlan 与 prompt 输出**

`【全书章节分工】${JSON.stringify(chapterResponsibilityPlan)}` 已输出，弧信息随之进入 prompt；单章 prompt 追加一行：
```ts
当前章所属爽点弧：${JSON.stringify(chapterResponsibilityPlan[chapterIndex]?.arcLabel || '')}
```

- [ ] **Step 4: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add server/src/chain/chain.controller.ts
git commit -m "feat(outline): add cross-chapter payoff arcs, rousing-scene and frequency requirements to chapter outline prompt"
```

---

### Task 15: 落库 normalize 校验 + 旧数据回填 migration

**Files:**
- Modify: `server/src/chain/chain.controller.ts`（写入前校验 preparedChapters 的 chapterFunction 已 normalize）
- Create: `server/src/database/migrations/049_outline_function_backfill.ts`
- Create: `server/src/database/migrations/049_outline_function_backfill.spec.ts`

**Interfaces:**
- Consumes: `normalizeOutlineChapterFunction`。
- Produces: 旧全 paving 行按短篇节奏回填；`preparedChapters` 写入前统一 normalize。

- [ ] **Step 1: 写入前兜底 normalize**

在 `db.exec('BEGIN IMMEDIATE')` 之前、`preparedChapters` 已填充完成后，插入防御性归一化（确保落库值非全 paving；`preparedChapters` 是 `const`，用 `splice` 原地修正）：

```ts
        // 防御：无论模型/上游给出什么功能值，短篇落库前统一按节奏兜底，避免全 paving 或非法值入库
        preparedChapters.forEach((c, i) => {
          const fn = normalizeOutlineChapterFunction(c.chapterFunction, c.order, isShort);
          if (fn !== c.chapterFunction) preparedChapters[i] = { ...c, chapterFunction: fn };
        });
```

- [ ] **Step 2: 写回填 migration** `049_outline_function_backfill.ts`

```ts
import { DatabaseSync } from 'node:sqlite';

// 049 — 回填旧的"全 paving"短篇章节功能：按章节顺序套用短篇节奏数组，保证大纲节奏可视化。
const SHORT_RHYTHM = ['opening', 'exposition', 'rising_action', 'conflict', 'climax', 'transition', 'climax', 'cliffhanger', 'resolution'];

export function up(db: DatabaseSync): void {
  const projects = db.prepare(`SELECT project_id FROM outlines WHERE level='chapter' AND chapter_function='paving' GROUP BY project_id`).all() as any[];
  for (const { project_id } of projects) {
    const rows = db.prepare(`SELECT id, "order" FROM outlines WHERE project_id=? AND level='chapter' AND chapter_function='paving' ORDER BY "order"`).all(project_id) as any[];
    for (const row of rows) {
      const fn = SHORT_RHYTHM[Math.min((Number(row.order) || 1) - 1, SHORT_RHYTHM.length - 1)];
      db.prepare(`UPDATE outlines SET chapter_function=? WHERE id=?`).run(fn, row.id);
    }
  }
}

export function down(db: DatabaseSync): void {
  // 不回滚（幂等回填）。
}

export default { up, down };
```

- [ ] **Step 3: 写 migration 测试** `049_outline_function_backfill.spec.ts`（参照现有 migration spec 模式，用 `:memory:` DatabaseSync）

```ts
import { describe, it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { up } from './049_outline_function_backfill';

const buildDb = () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE outlines (id TEXT PRIMARY KEY, project_id TEXT, level TEXT, "order" INTEGER, chapter_function TEXT);`);
  db.prepare(`INSERT INTO outlines VALUES (?,?,?,?,?)`).run('v1','p1','volume',0,'');
  for (let i = 1; i <= 9; i++) db.prepare(`INSERT INTO outlines VALUES (?,?,?,?,?)`).run(`c${i}`,'p1','chapter',i,'paving');
  return db;
};

describe('049 backfill outline function', () => {
  it('把全 paving 的章节按短篇节奏回填', () => {
    const db = buildDb();
    up(db);
    const rows = db.prepare(`SELECT "order", chapter_function FROM outlines WHERE level='chapter' ORDER BY "order"`).all() as any[];
    expect(rows.map(r => r.chapter_function)).toEqual(['opening','exposition','rising_action','conflict','climax','transition','climax','cliffhanger','resolution']);
    expect(db.prepare(`SELECT count(*) c FROM outlines WHERE chapter_function='paving'`).get().c).toBe(0);
  });
});
```

- [ ] **Step 4: 运行测试 + typecheck**

Run: `cd server && npx vitest run src/database/migrations/049_outline_function_backfill.spec.ts && npm run typecheck`
Expected: PASS + 通过。

- [ ] **Step 5: Commit**

```bash
git add server/src/chain/chain.controller.ts server/src/database/migrations/049_outline_function_backfill.ts server/src/database/migrations/049_outline_function_backfill.spec.ts
git commit -m "fix(outline): normalize persisted chapter functions and backfill legacy flat-paving rows"
```

---

### Task 16: assessChapter 加严（爽点/冲突数量与类型）

**Files:**
- Modify: `server/src/chain/chain.controller.ts`（`assessChapter` 函数，约 L5642）

**Interfaces:**
- Consumes: `assessChapter` 现有签名。
- Produces: 校验要求 highlights ≥ 2 且含类型、conflicts ≥ 2。

- [ ] **Step 1: 增强 assessChapter**

在 `assessChapter` 中，把：
```ts
            if (!(candidate.highlights || candidate.highlight)) issues.push('缺少highlights/highlight');
```
改为：
```ts
            const highlights = Array.isArray(candidate.highlights)
              ? candidate.highlights
              : (Array.isArray(candidate.highlight) ? candidate.highlight : (String(candidate.highlight || '').trim() ? [candidate.highlight] : []));
            if (highlights.length < 2) issues.push(`highlights必须至少2个（当前${highlights.length}个）`);
            const typedHighlights = highlights.filter((h: any) => h && typeof h === 'object' && (h.type || h.point));
            if (highlights.length >= 2 && typedHighlights.length < 2) issues.push('highlights每项需含 type（打脸/逆袭/热血/反转/情感暴击/信息爆点）与 point');
            const conflicts = Array.isArray(candidate.conflicts)
              ? candidate.conflicts
              : (String(candidate.conflict || '').trim() ? [candidate.conflict] : []);
            if (conflicts.length < 2) issues.push(`conflicts必须至少2个（当前${conflicts.length}个）`);
```
并把原 `if (!(candidate.conflicts || candidate.conflict || candidate.conflictDesign)) issues.push('缺少conflict/conflicts');` 一并替换为上述 conflicts 校验。

- [ ] **Step 2: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 3: Commit**

```bash
git add server/src/chain/chain.controller.ts
git commit -m "fix(outline): tighten chapter-outline validator to require 2+ typed highlights and 2+ conflicts"
```

---

### Task 17: 长篇大纲模板增强

**Files:**
- Modify: `server/src/chain/prompt-registry.service.ts`（`long-novel-outline-initial`、`long-novel-volume-planning`、`long-novel-chapter-summary`）

**Interfaces:**
- Consumes: 三个模板的 content 字符串。
- Produces: 模板要求每卷含爽点弧清单、热血高潮章、全书爽点密度。

- [ ] **Step 1: `long-novel-outline-initial` 追加**

在其 `### 4. 节奏控制` 段之后追加：
```text
### 5. 爽点与热血规划（必填）
- 每卷给出"跨章爽点弧清单"（至少 2 条）：每条含 埋设卷章 → 蓄力卷章 → 爆发卷章，并写明爽点类型（打脸/逆袭/热血名场面/反转冲击/情感暴击/信息爆点）。
- 每卷定位至少 2 个"热血/高光章节"（爆发或高潮章），并说明其燃点。
- 全书爽点密度兜底：平均每 2-3 章至少 1 个反转或强钩子，不得整卷平铺。
```
并把它加入输出 JSON：`volumes[].payoffArcs`、`volumes[].rousingChapters`。

- [ ] **Step 2: `long-novel-volume-planning` 追加**

在 `### 卷内结构（起承转合）` 段后追加：
```text
### 卷内爽点与节奏（必填）
- 本章节规划需落定本卷跨章爽点弧（埋→蓄→爆）的具体章号，并在对应章节标注 arcRole（build/burst）。
- 至少 2 个章节的 pacingFunction 为爆发/高潮（climax/explosion/conflict），不能全是铺垫/过渡。
- 每章需含爽点或钩子；平均每 2-3 章 1 个反转。
```
并在输出 JSON 的 `chapters[].pacingFunction` 旁补充可选 `highlightType` 字段说明。

- [ ] **Step 3: `long-novel-chapter-summary` 追加**

在其章节要求中追加：
```text
- 本章爽点：2-3 个，混合至少 2 类（打脸/逆袭/热血名场面/反转冲击/情感暴击/信息爆点），标注高能记忆点；若属于跨章弧的爆发章，必须兑现该弧埋设内容。
```

- [ ] **Step 4: typecheck**

Run: `cd server && npm run typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add server/src/chain/prompt-registry.service.ts
git commit -m "feat(outline): add payoff-arc / rousing-chapter / frequency requirements to long-novel outline templates"
```

---

### Task 18: OutlinePage 爽点节奏摘要

**Files:**
- Modify: `desktop/src/renderer/pages/OutlinePage.tsx`

**Interfaces:**
- Consumes: `volumeBlock`（treePanel）现有渲染；`ChapterNode.highlight`、`chapterFunction`。
- Produces: 卷骨架显示每章爽点数、功能章色块、跨章弧标记。

- [ ] **Step 1: 新增解析函数**（`resolveHighlights` 附近）

```tsx
const countHighlights = (chapter: ChapterNode): number => {
  const raw = resolveHighlights(chapter.highlight, (chapter as any).scenes?.highlights);
  if (!raw) return 0;
  const parsed = (chapter as any).scenes?.highlights;
  if (Array.isArray(parsed)) return parsed.length;
  return raw.split(/\n•\s*/).filter(Boolean).length || 1;
};
const isRousing = (fn: ChapterFunctionType): boolean => ['conflict', 'explosion', 'climax'].includes(fn);
```

- [ ] **Step 2: volumeBlock 增加节奏摘要行**（在 `{volume.keyEvents?.length ? ...}` 行后）

```tsx
{volume.chapters.length > 0 && (
  <div style={{ padding: '0 10px 6px', fontSize: 10, color: '#8a8aa0', lineHeight: 1.5 }}>
    爽点节奏：
    {volume.chapters.map((c, i) => {
      const n = countHighlights(c);
      const rousing = isRousing(c.chapterFunction);
      return (
        <span key={c.id} style={{ marginRight: 5, color: rousing ? '#e94560' : '#8a8aa0' }} title={`${c.title}：${n}个爽点${rousing ? '（热血/高潮）' : ''}`}>
          {i + 1}·{n}{rousing ? '🔥' : ''}
        </span>
      );
    })}
  </div>
)}
```

- [ ] **Step 3: typecheck + build**

Run: `cd desktop && npm run typecheck && npm run build`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add desktop/src/renderer/pages/OutlinePage.tsx
git commit -m "feat(outline): show per-chapter payoff count and rousing markers in volume skeleton"
```

---

## 验证清单（收尾）

- [ ] `cd server && npm run typecheck` 通过。
- [ ] `cd server && npm test` 通过（含既有 acceptance 之外的单元测试）。
- [ ] `cd desktop && npm run typecheck` 通过。
- [ ] `cd desktop && npm run build` 通过。
- [ ] 手测一个已有 short_story 项目：世界观页阅读模式列表化、角色页合并视图 + 变动历史、地点势力详情卡富展示、大纲卷骨架爽点节奏。
- [ ] 服务端启动后验证 migration 048/049 自动执行（看启动日志）。
