import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { GenerationMetricsService } from './generation-metrics.service';

export interface GeneratedCanonProof {
  runId: string;
  projectId: string;
  stage: string;
  scenario: string;
  outputText: string;
}

export interface GeneratedCanonGuardInput {
  projectId: string;
  runId?: string | null;
  /** The exact final raw LLM output from which the canonical rows are derived. */
  outputText: string;
  expectedStages?: string[];
  expectedScenarios?: string[];
}

export interface StructuredCanonGuardInput {
  projectId: string;
  runId?: string | null;
  expectedStages?: string[];
  expectedScenarios?: string[];
}

/**
 * Single provenance boundary for AI-produced Canon.
 *
 * Currentness is always checked against the real project context. Creation
 * batches must therefore validate every generated run before the first Canon
 * write, then persist that already-validated batch without re-validating against
 * the context it is changing itself. The guard deliberately has no
 * "project.status=creating" stale-run bypass: such a bypass would also admit a
 * genuinely stale run produced by another creation attempt.
 *
 * Project/context existence and freshness belong to GenerationMetricsService;
 * this boundary only validates the generation-run proof itself. Keeping that
 * responsibility in one place avoids a second schema/currentness implementation.
 */
@Injectable()
export class GeneratedCanonGuardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly generationMetrics: GenerationMetricsService,
  ) {}

  /** Exact-text boundary used by chapter body commits after the final quality Gate. */
  assertCanCommit(input: GeneratedCanonGuardInput): GeneratedCanonProof {
    const outputText = String(input.outputText ?? '');
    if (!outputText.trim()) throw new BadRequestException('AI Canon 提交内容为空');
    const proof = this.assertRunProvenance(input, true);
    if (proof.outputText !== outputText) {
      throw new BadRequestException('AI Canon 提交内容与通过 Gate 的最终输出不一致');
    }
    return proof;
  }

  /**
   * Structured boundary used after the current structural/source-hierarchy Gate.
   * For a multi-artifact creation batch, callers must invoke this for all batch
   * runIds before writing the first artifact.
   */
  assertStructuredCanCommit(input: StructuredCanonGuardInput): GeneratedCanonProof {
    return this.assertRunProvenance(input, false);
  }

  private assertRunProvenance(input: StructuredCanonGuardInput, requireGatePass: boolean): GeneratedCanonProof {
    const projectId = String(input.projectId || '').trim();
    const runId = String(input.runId || '').trim();
    if (!projectId) throw new BadRequestException('AI Canon 提交缺少 projectId');
    if (!runId) throw new BadRequestException('AI Canon 提交缺少 generation run 凭证');

    const db = this.databaseService.getDb();
    // 这里只读取提交边界真正需要的稳定列。constitution/context 当前性与项目存在性由
    // GenerationMetricsService.runIsCurrent 统一判断，避免 Guard 自己复制 schema/算法。
    const row = db.prepare(`SELECT id,project_id,stage,scenario,status,gate_status,output_text
      FROM generation_runs WHERE id=? AND project_id=? LIMIT 1`).get(runId, projectId) as {
        id: string;
        project_id: string;
        stage: string | null;
        scenario: string | null;
        status: string | null;
        gate_status: string | null;
        output_text: string | null;
      } | undefined;

    if (!row) throw new BadRequestException('AI Canon 提交凭证不存在或不属于当前项目');
    if (row.status !== 'success') {
      throw new BadRequestException(`AI Canon 提交凭证未成功完成：status=${row.status || 'unknown'}`);
    }
    if (requireGatePass && row.gate_status !== 'passed') {
      throw new BadRequestException(`AI Canon 提交必须来自已通过质量 Gate 的运行：gate=${row.gate_status || 'not_evaluated'}`);
    }

    const stage = String(row.stage || '');
    const scenario = String(row.scenario || '');
    if (input.expectedStages?.length && !input.expectedStages.includes(stage)) {
      throw new BadRequestException(`AI Canon 提交阶段不匹配：stage=${stage || 'unknown'}`);
    }
    if (input.expectedScenarios?.length && !input.expectedScenarios.includes(scenario)) {
      throw new BadRequestException(`AI Canon 提交场景不匹配：scenario=${scenario || 'unknown'}`);
    }

    const outputText = String(row.output_text ?? '');
    if (!outputText.trim()) {
      throw new BadRequestException('AI Canon 提交凭证没有可提交的最终输出');
    }

    if (!this.generationMetrics.runIsCurrent(runId, projectId)) {
      throw new ConflictException('AI Canon 提交凭证已过期：项目创作宪法或依赖上下文已变化');
    }

    return { runId, projectId, stage, scenario, outputText };
  }
}
