import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SYSTEM_WORKFLOW_RULES,
  activeSystemWorkflowRules,
  assertSystemWorkflowRuleRegistry,
} from './system-workflow-rules.registry';

function productionSources(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory()
      ? productionSources(path)
      : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [path] : [];
  });
}

const serverPath = (repoRef: string) => repoRef.startsWith('server/')
  ? join(process.cwd(), repoRef.slice('server/'.length))
  : null;
const repoRoot = resolve(process.cwd(), '..');

function registeredImplementationCovers(repoPath: string): boolean {
  const normalized = repoPath.replace(/\\/g, '/');
  return activeSystemWorkflowRules().some((rule) => rule.implementationRefs.some((ref) => {
    const base = ref.split('#')[0].replace(/\\/g, '/').replace(/\/$/, '');
    return normalized === base || normalized.startsWith(`${base}/`);
  }));
}

describe('public rule governance', () => {
  it('registry Rule IDs, dependencies and parameter ownership are structurally valid', () => {
    expect(() => assertSystemWorkflowRuleRegistry()).not.toThrow();
    const ids = SYSTEM_WORKFLOW_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('QUALITY_EXECUTION.md and the machine registry expose exactly the same active Rule IDs', () => {
    const doc = readFileSync(join(repoRoot, 'QUALITY_EXECUTION.md'), 'utf8');
    const documentIds = [...doc.matchAll(/\[([A-Z]+-\d{3})\s*·\s*P[0-3]\]/g)].map((match) => match[1]);
    expect(new Set(documentIds).size).toBe(documentIds.length); // one authoritative heading per rule
    expect([...documentIds].sort()).toEqual(activeSystemWorkflowRules().map((rule) => rule.id).sort());
  });

  it('every active rule has implementation ownership and P0/P1 rules have non-UI execution/governance consumers', () => {
    const failures = activeSystemWorkflowRules().flatMap((rule) => {
      const problems: string[] = [];
      if (!rule.implementationRefs.length) problems.push('no implementationRefs');
      if ((rule.level === 'P0' || rule.level === 'P1')
        && !rule.consumers.some((consumer) => !['api', 'ui'].includes(consumer))) {
        problems.push('P0/P1 has no execution/test consumer');
      }
      return problems.map((problem) => `${rule.id}: ${problem}`);
    });
    expect(failures).toEqual([]);
  });

  it('server implementation refs registered by rules exist', () => {
    const missing = activeSystemWorkflowRules().flatMap((rule) => rule.implementationRefs
      .map((ref) => ref.split('#')[0])
      .map(serverPath)
      .filter((path): path is string => !!path)
      .filter((path) => !existsSync(path))
      .map((path) => ({ ruleId: rule.id, path })));
    expect(missing).toEqual([]);
  });

  it('module seed is a generated compatibility projection, not a second public-rule source', () => {
    const source = readFileSync(join(process.cwd(), 'src/modules/module-standards/module-standards.seed.ts'), 'utf8');
    expect(source).toContain('buildSeedModuleStandardsFromRegistry');
    expect(source).not.toMatch(/export const CHAPTER_COORDINATE_CONTRACT\s*=\s*['"`]/);
    expect(source).not.toMatch(/export const SEED_MODULE_STANDARDS[^=]*=\s*\[/);
  });

  it('production source cannot restore retired fixed-count/special-story public rules', () => {
    const retired = [
      /buildOutlineAdherenceContract/,
      /buildNarrativeQualityContract/,
      /buildAlignmentRepairPrompt/,
      /SHORT_IDEA_HOOK_MIN_SIGNALS/,
      /每1000字必须有钩子或爽点/,
      /至少每3组问答插入/,
      /每章至少3处不完美细节/,
      /增加具体的动作细节和五感描写/,
      /主角至少覆盖热血与牺牲之一/,
      /每章采用八拍结构/,
      /转场机械词\s*≥\s*3\s*次/,
      /hasEntryErasure/,
      /hasRoundTripErasure/,
      /hasRealityRewind/,
      /hasInteriorOnlyRewind/,
      /ideaTimeConflict/,
      /每(?:进|推|次).*?(?:倒退|回退).*?小时/,
    ];
    const violations = productionSources(join(process.cwd(), 'src')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return retired.filter((pattern) => pattern.test(source)).map((pattern) => ({ path, pattern: pattern.source }));
    });
    expect(violations).toEqual([]);
  });

  it('prompt callers keep task-local parameters/schema but do not re-own shared idea public rules', () => {
    const source = readFileSync(join(process.cwd(), 'src/chain/chain.controller.ts'), 'utf8');
    expect(source).toContain('ideaPremiseSelectionDirective');
    expect(source).toContain('ideaCardStructuringDirective');
    expect(source).toContain('targetPlatform 必须原样等于'); // runtime/project parameter remains caller-owned
    expect(source).toContain('JSON 结构'); // output schema remains task-local
    expect(source).not.toContain('pool 以 ${premisePoolSize} 项为广搜目标');
    expect(source).not.toContain('每项从改变主角命运的具体事件起步');
    expect(source).not.toContain('凡可概括为“某种行为→直接受到超常惩罚/奖励”');
    expect(source).not.toContain('若写每次进入倒退N小时');
    expect(source).not.toContain('ideaTimeConflict');
  });

  it('chapter responsibility is not synthesized from chapter position or fixed rhythm cycles', () => {
    const source = readFileSync(join(process.cwd(), 'src/chain/chain.controller.ts'), 'utf8');
    expect(source).not.toContain('const shortRhythm: OutlineChapterFunction[]');
    expect(source).not.toContain('const longCycle: OutlineChapterFunction[]');
    expect(source).not.toContain('const shortArc = [');
    expect(source).not.toContain('const longArc = [');
    expect(source).not.toContain('最后一章强制为 climax 或 resolution');
    expect(source).not.toContain('倒数第二章如果是短篇');
    expect(source).toContain("missing/unknown chapter responsibility must not be invented from chapter order");
  });

  it('chapter/world/location callers do not restore shared quality prose or fixed content quotas', () => {
    const source = readFileSync(join(process.cwd(), 'src/chain/chain.controller.ts'), 'utf8');
    expect(source).not.toContain('【整体质量要求（最高优先级，不可妥协）】');
    expect(source).not.toContain('【大纲↔正文铁律】');
    expect(source).not.toContain('【严格审查合同】');
    expect(source).not.toContain('核心内容"的5步事件链');
    expect(source).not.toContain('100字左右的事件链要点，从开场到转折结果的5步推进');
    expect(source).not.toContain('2-3个关键场景数组');
    expect(source).not.toContain('列出2-3个本章冲突');
    expect(source).not.toContain('至少1个核心人物本章状态变化');
    expect(source).not.toContain("if (conflicts.length < 1) issues.push('缺少conflict/conflicts')");
    expect(source).not.toContain('核心规则数组：2-3 条');
    expect(source).not.toContain('地点最多2级');
    expect(source).not.toContain('每个一级地点下的二级地点不超过3个');
    expect(source).toContain('不设固定层级数或每层子节点配额');
  });

  it('public decision-owner files discovered by behavior are attached to the Registry', () => {
    const decisionSignatures = [
      /qualityIssue\s*\(\s*\{/,
      /GeneratedQualityGateError/,
      /\bmaxAttempts\b/,
      /\bretryable\b/,
      /categoryWordScaleStanding\s*\(/,
      /detectStructuredFactConflicts\s*\(/,
      /compareRepair\s*\(/,
    ];
    const roots = [
      join(process.cwd(), 'src/chain'),
      join(process.cwd(), 'src/modules/writing-quality'),
      join(process.cwd(), 'src/modules/generation-metrics'),
      join(process.cwd(), 'src/modules/workflow-guard'),
    ];
    const candidates = roots.flatMap(productionSources).filter((path) => {
      const source = readFileSync(path, 'utf8');
      return decisionSignatures.some((pattern) => pattern.test(source));
    });
    const missing = candidates
      .map((path) => `server/${relative(process.cwd(), path).replace(/\\/g, '/')}`)
      .filter((repoPath) => !registeredImplementationCovers(repoPath));
    expect(missing).toEqual([]);
  });

  it('known public rule owner layers do not introduce an unregistered Rule ID', () => {
    const knownIds = new Set(SYSTEM_WORKFLOW_RULES.map((rule) => rule.id));
    const found = productionSources(join(process.cwd(), 'src')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return [...source.matchAll(/\b(?:GOV|AUTH|ARCH|CTX|GEN|QLT|RPR|WF|PLAT|LEARN)-\d{3}\b/g)]
        .map((match) => ({ path, id: match[0] }));
    });
    expect(found.filter((entry) => !knownIds.has(entry.id))).toEqual([]);
  });

  it('root does not accumulate parallel public-rule markdown documents', () => {
    const allowed = new Set(['README.md', 'QUALITY_EXECUTION.md', 'DEVELOPMENT_GOVERNANCE.md']);
    const suspicious = readdirSync(repoRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => basename(entry.name))
      .filter((name) => !allowed.has(name) && /(rule|standard|quality|workflow|规范|规则|标准)/i.test(name));
    expect(suspicious).toEqual([]);
  });
});
