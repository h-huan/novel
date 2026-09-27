/**
 * 标准指令内存缓存（无 Nest 依赖的进程内单例）
 *
 * 为什么不用 DI：RealLLMService 需要在每次调用时读取"当前生效标准"并注入提示，
 * 而 ModuleStandardsService 归纳时又要调用 RealLLMService，直接互相注入会形成循环依赖。
 * 因此由 ModuleStandardsService 在启动 seed / 每次归纳后把最新标准写入这个纯缓存，
 * RealLLMService 只单向读取它——依赖方向为 ModuleStandardsService → RealLLMService（单向），无环。
 */

import { createHash } from 'node:crypto';
import { standardScene } from '../../routing/scenario-taxonomy';

interface CacheStandard {
  version?: number;
  seed_baseline_version?: number;
  module_key: string;
  module_name: string;
  scenarios: string[];
  purpose: string;
  steps_json: string;
  requirements_json: string;
  rules_json: string;
  quality_bar: string;
  category: string;
}

class StandardDirectiveCacheClass {
  private rebuiltAt = 0;
  private standards: CacheStandard[] = [];

  /** 由 ModuleStandardsService 用当前 active 标准全量重建。 */
  rebuild(standards: CacheStandard[]): void {
    this.standards = structuredClone(standards);
    this.rebuiltAt = Date.now();
  }

  private format(s: CacheStandard): string {
    const parse = (raw: string): string[] => {
      try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? v.map((x: any) => (typeof x === 'string' ? x : x?.name ? `${x.name}：${x.goal || ''}` : '')).filter(Boolean) : [];
      } catch {
        return [];
      }
    };
    const steps = parse(s.steps_json);
    const reqs = parse(s.requirements_json);
    const rules = parse(s.rules_json);
    const lines: string[] = [`【${s.module_name}·执行标准】${s.purpose}`];
    if (steps.length) lines.push(`标准步骤：${steps.map((x, i) => `${i + 1}.${x}`).join(' ')}`);
    if (reqs.length) lines.push(`硬性要求：${reqs.map(x => `·${x}`).join(' ')}`);
    if (rules.length) lines.push(`规则纪律：${rules.map(x => `·${x}`).join(' ')}`);
    if (s.quality_bar) lines.push(`质量门槛：${s.quality_bar}`);
    return lines.join('\n');
  }

  /** 取某场景需注入的全部标准（场景专属 + 横切）。 */
  get(scenario?: string | null, stepKey?: string | null): string {
    const key = standardScene(scenario, stepKey);
    return this.standards
      .filter(s => s.scenarios.includes(key))
      .map(s => this.format(s))
      .join('\n\n');
  }

  getRebuiltAt(): number {
    return this.rebuiltAt;
  }

  snapshot(scenario: string, enabled = true, stepKey?: string | null) {
    const directive = enabled ? this.get(scenario, stepKey) : '';
    return {
      enabled, available: !!directive,
      digest: createHash('sha256').update(directive).digest('hex'),
      modules: enabled ? this.standards.filter(s => s.scenarios.includes(standardScene(scenario, stepKey)))
        .map(s => ({ key: s.module_key, version: s.version ?? null, baseline: s.seed_baseline_version ?? null })) : [],
    };
  }

  clear(): void {
    this.standards = [];
    this.rebuiltAt = 0;
  }
}

export const standardDirectiveCache = new StandardDirectiveCacheClass();
