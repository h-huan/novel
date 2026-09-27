/**
 * 代码侧执行标准只读镜像。
 *
 * 唯一规范文档是仓库根 QUALITY_EXECUTION.md；本服务只把代码 seed 暴露给页面并装入
 * standardDirectiveCache。运行时不得通过数据库、指标或 LLM 改写 hard rules。
 */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SEED_BASELINE_VERSION, SEED_MODULE_STANDARDS, SeedModuleStandard } from './module-standards.seed';
import { standardDirectiveCache } from './standard-directive.cache';

@Injectable()
export class ModuleStandardsService implements OnModuleInit {
  onModuleInit(): void {
    this.loadToCache();
  }

  /** 运行时注入只读取代码 seed，不读取本地数据库历史，保证同一 commit 执行同一套标准。 */
  loadToCache(): void {
    standardDirectiveCache.rebuild(
      SEED_MODULE_STANDARDS.map((standard) => ({
        module_key: standard.module_key,
        module_name: standard.module_name,
        category: standard.category,
        version: SEED_BASELINE_VERSION,
        seed_baseline_version: SEED_BASELINE_VERSION,
        scenarios: [...standard.scenarios],
        purpose: standard.purpose,
        steps_json: JSON.stringify(standard.steps),
        requirements_json: JSON.stringify(standard.requirements),
        rules_json: JSON.stringify(standard.rules),
        quality_bar: standard.quality_bar,
      })),
    );
  }

  private toView(standard: SeedModuleStandard) {
    return {
      moduleKey: standard.module_key,
      moduleName: standard.module_name,
      category: standard.category,
      scenarios: [...standard.scenarios],
      businessTables: [...standard.business_tables],
      purpose: standard.purpose,
      steps: structuredClone(standard.steps),
      requirements: [...standard.requirements],
      rules: [...standard.rules],
      qualityBar: standard.quality_bar,
      inputs: [...standard.inputs],
      outputs: [...standard.outputs],
      version: SEED_BASELINE_VERSION,
      changeNote: `代码执行标准镜像 v${SEED_BASELINE_VERSION}`,
      source: 'code_seed',
      seedBaselineVersion: SEED_BASELINE_VERSION,
      updatedAt: null,
    };
  }

  list() {
    return [...SEED_MODULE_STANDARDS]
      .sort((a, b) => `${a.category}:${a.module_key}`.localeCompare(`${b.category}:${b.module_key}`))
      .map((standard) => this.toView(standard));
  }

  get(moduleKey: string) {
    const standard = SEED_MODULE_STANDARDS.find((item) => item.module_key === moduleKey);
    return standard ? this.toView(standard) : null;
  }

  /** 保留只读状态接口，明确运行时不存在 dirty / 归纳 / 动态 hard-rule 版本。 */
  status() {
    const modules = this.list().map((standard) => ({
      moduleKey: standard.moduleKey,
      moduleName: standard.moduleName,
      category: standard.category,
      version: standard.version,
      running: false,
      dirty: false,
      reasons: [],
      lastSummarizedAt: null,
    }));
    return {
      running: [],
      recent: [],
      modules,
      dirtyCount: 0,
      standardSource: 'code_seed',
      seedBaselineVersion: SEED_BASELINE_VERSION,
      cacheRebuiltAt: standardDirectiveCache.getRebuiltAt(),
    };
  }
}
