import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { readConstitution } from '../project/creative-constitution';
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
 * Chapter body requires a fully current context and an explicit Gate PASS.
 * Structured assets created in one project-creation batch are different: the
 * batch generates skeleton/world/characters/outlines first and then persists
 * them. Persisting the first artifact necessarily changes the dependency
 * context, so comparing every later run against the already-mutated context
 * makes the batch invalidate itself. During project.status=creating we therefore
 * freeze currentness at the Creative Constitution revision: same project + same
 * constitution + successful provenance remains valid while this batch writes its
 * own Canon rows. Once the project becomes active, full context currentness is
 * required again.
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
   * Structured boundary used only after the current world/character/outline
   * pipeline has completed its own structural and source-hierarchy checks.
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
    const row = db.prepare(`SELECT id,project_id,stage,scenario,status,gate_status,output_text,constitution_json
      FROM generation_runs WHERE id=? AND project_id=? LIMIT 1`).get(runId, projectId) as {
        id: string;
        project_id: string;
        stage: string | null;
        scenario: string | null;
        status: string | null;
        gate_status: string | null;
        output_text: string | null;
        constitution_json: string | null;
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

    const project = db.prepare('SELECT * FROM projects WHERE id=? LIMIT 1').get(projectId) as any;
    if (!project) throw new BadRequestException('AI Canon 提交对应项目不存在');

    const fullContextCurrent = this.generationMetrics.runIsCurrent(runId, projectId);
    if (!fullContextCurrent) {
      // 创建批次在落库 world -> character -> outline 时会自然改变 context_snapshot。
      // 只对 structured + creating 开这个窄口：constitution 必须逐字仍是同一版；
      // 用户若修改创作宪法，旧 run 仍会立刻失效。
      const sameCreationConstitution = !requireGatePass
        && String(project.status || '') === 'creating'
        && !!row.constitution_json
        && row.constitution_json === JSON.stringify(readConstitution(project));
      if (!sameCreationConstitution) {
        throw new ConflictException('AI Canon 提交凭证已过期：项目创作宪法或依赖上下文已变化');
      }
    }

    return { runId, projectId, stage, scenario, outputText };
  }
}
