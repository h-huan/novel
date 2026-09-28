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
 * Verifies an existing generation run before AI-produced data may enter Canon.
 *
 * This service deliberately does not score, repair, regenerate, or create a
 * second quality system. The production Gate already decided whether a run
 * passed. This boundary only proves that the source run:
 *  - belongs to this project;
 *  - finished successfully;
 *  - has an explicit Gate PASS (never success/not_evaluated as a substitute);
 *  - still matches the project's current constitution/context;
 *  - produced a non-empty final output.
 *
 * Plain-text Canon (chapter body) additionally requires byte-for-byte equality
 * through assertCanCommit(). Structured Canon is parsed/normalized before it is
 * stored, so assertStructuredCanCommit() returns the passed raw source instead
 * of pretending the normalized object can equal the raw JSON bytes.
 */
@Injectable()
export class GeneratedCanonGuardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly generationMetrics: GenerationMetricsService,
  ) {}

  /** Exact-text boundary used by chapter body commits. */
  assertCanCommit(input: GeneratedCanonGuardInput): GeneratedCanonProof {
    const outputText = String(input.outputText ?? '');
    if (!outputText.trim()) throw new BadRequestException('AI Canon 提交内容为空');
    const proof = this.assertRunCanCommit(input);
    if (proof.outputText !== outputText) {
      throw new BadRequestException('AI Canon 提交内容与通过 Gate 的最终输出不一致');
    }
    return proof;
  }

  /**
   * Structured internal boundary used by world/character/outline commits.
   * The caller must use the parsed value produced from this same run; this
   * method returns the authoritative passed raw source for audit/provenance.
   */
  assertStructuredCanCommit(input: StructuredCanonGuardInput): GeneratedCanonProof {
    return this.assertRunCanCommit(input);
  }

  private assertRunCanCommit(input: StructuredCanonGuardInput): GeneratedCanonProof {
    const projectId = String(input.projectId || '').trim();
    const runId = String(input.runId || '').trim();
    if (!projectId) throw new BadRequestException('AI Canon 提交缺少 projectId');
    if (!runId) throw new BadRequestException('AI Canon 提交缺少 generation run 凭证');

    const row = this.databaseService.getDb().prepare(`SELECT id,project_id,stage,scenario,status,gate_status,output_text
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
    if (row.gate_status !== 'passed') {
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
