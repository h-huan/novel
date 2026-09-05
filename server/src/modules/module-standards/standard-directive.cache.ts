/**
 * 标准指令内存缓存（无 Nest 依赖的进程内单例）
 *
 * 为什么不用 DI：RealLLMService 需要在每次调用时读取"当前生效标准"并注入提示，
 * 而 ModuleStandardsService 归纳时又要调用 RealLLMService，直接互相注入会形成循环依赖。
 * 因此由 ModuleStandardsService 在启动 seed / 每次归纳后把最新标准写入这个纯缓存，
 * RealLLMService 只单向读取它——依赖方向为 ModuleStandardsService → RealLLMService（单向），无环。
 */

interface CacheStandard {
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
  /** scenario → 该场景应注入的标准指令文本 */
  private readonly byScenario = new Map<string, string>();
  /** 横切标准（如原创性），对所有创作场景注入 */
  private crosscut = '';
  private rebuiltAt = 0;

  /** 由 ModuleStandardsService 用当前 active 标准全量重建。 */
  rebuild(standards: CacheStandard[]): void {
    this.byScenario.clear();
    const crosscutParts: string[] = [];
    for (const s of standards) {
      const directive = this.format(s);
      if (s.category === 'crosscut') {
        crosscutParts.push(directive);
        continue;
      }
      for (const scenario of s.scenarios) {
        // 一个场景可能对应多个模块标准，追加合并
        const existing = this.byScenario.get(scenario);
        this.byScenario.set(scenario, existing ? `${existing}\n\n${directive}` : directive);
      }
    }
    this.crosscut = crosscutParts.join('\n\n');
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
  get(scenario?: string | null): string {
    const parts: string[] = [];
    const key = scenario || 'daily';
    const own = this.byScenario.get(key);
    // 日常兜底场景不重复叠加（其本身可能就是某模块场景）
    if (own) parts.push(own);
    if (this.crosscut && key !== 'daily') parts.push(this.crosscut);
    return parts.filter(Boolean).join('\n\n');
  }

  getRebuiltAt(): number {
    return this.rebuiltAt;
  }

  clear(): void {
    this.byScenario.clear();
    this.crosscut = '';
    this.rebuiltAt = 0;
  }
}

export const standardDirectiveCache = new StandardDirectiveCacheClass();
