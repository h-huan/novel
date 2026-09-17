import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';
import { RealLLMService } from './real-llm.service';
import { readConstitution } from '../modules/project/creative-constitution';

@Controller('generation-metrics/benchmark')
export class BenchmarkController {
  constructor(private readonly database: DatabaseService, private readonly metrics: GenerationMetricsService, private readonly llm: RealLLMService) {}
  @Get('runs')
  runs(@Query('projectId') projectId?: string) {
    return this.database.getDb().prepare('SELECT * FROM quality_benchmark_runs WHERE (? IS NULL OR project_id=?) ORDER BY started_at DESC LIMIT 20').all(projectId ?? null,projectId ?? null);
  }
  @Post('run')
  async run(@Body() body: { projectId?: string; sampleIds?: string[]; repair?: boolean }) {
    if (body.repair !== undefined && typeof body.repair !== 'boolean') throw new BadRequestException('repair 必须为布尔值');
    if (body.sampleIds !== undefined && (!Array.isArray(body.sampleIds) || body.sampleIds.length > 20 || body.sampleIds.some(id => typeof id !== 'string'))) throw new BadRequestException('最多选择20个样本');
    const db = this.database.getDb();
    const eligible = db.prepare("SELECT * FROM quality_benchmark_samples WHERE annotation_status='labeled' AND source_ref IS NOT NULL AND trim(source_ref)!='' AND (? IS NULL OR project_id=?) ORDER BY id")
      .all(body.projectId ?? null,body.projectId ?? null) as any[];
    const samples = eligible.filter(s => !body.sampleIds || body.sampleIds.includes(s.id)).slice(0,20);
    if (!samples.length) return { status: 'waiting_for_real_samples', completed: 0, evaluations: [] };
    const id = randomUUID(); const results: any[] = [];
    db.prepare('INSERT INTO quality_benchmark_runs(id,project_id,status,repair_requested,sample_count,started_at) VALUES (?,?,?,?,?,?)')
      .run(id,body.projectId ?? null,'running',body.repair ? 1 : 0,samples.length,new Date().toISOString());
    let completed = 0; let failed = 0;
    for (const sample of samples) {
      try {
        const project = db.prepare('SELECT * FROM projects WHERE id=?').get(sample.project_id) as any;
        if (!project) throw new Error('真实样本缺少有效项目上下文');
        const constitution = readConstitution(project);
        if (constitution.projectType !== sample.story_type || constitution.targetPlatform !== sample.platform) throw new Error('样本平台/长短篇与项目创作宪法不一致');
        const result = await this.llm.evaluateBenchmarkSample(sample.project_id, sample.chapter_index, sample.content, body.repair === true);
        if (result.before.status !== 'evaluated') throw new Error('评审证据不足，不计入基准指标');
        const predicted = [...new Set(result.before.issues.filter(i => i.evaluation === 'evidenced' && !i.source.includes('heuristic') && !i.ruleId.endsWith('_risk')).map(i => i.ruleId))];
        const human = new Set<string>(JSON.parse(sample.human_labels_json));
        const tp = predicted.filter(label => human.has(label)).length;
        const fp = predicted.filter(label => !human.has(label)).length;
        const fn = [...human].filter(label => !predicted.includes(label)).length;
        const evaluation = this.metrics.recordBenchmarkEvaluation({ sampleId: sample.id, runId: result.runId, predictedLabels: predicted,
          repairAttempted: result.repairAttempted, repairAccepted: result.accepted, introducedIssue: result.introducedIssue,
          beforeScore: result.before.overallScore ?? undefined, afterScore: result.after?.overallScore ?? undefined });
        results.push({ sampleId: sample.id, evaluationId: evaluation.id, predictedLabels: predicted, truePositives: tp, falsePositives: fp, falseNegatives: fn,
          precision: tp+fp ? tp/(tp+fp) : null, recall: tp+fn ? tp/(tp+fn) : null, repairAttempted: result.repairAttempted, repairAccepted: result.accepted, introducedIssue: result.introducedIssue });
        completed++;
      } catch (error) { failed++; results.push({ sampleId: sample.id, status: 'failed', error: error instanceof Error ? error.message : String(error) }); }
      db.prepare('UPDATE quality_benchmark_runs SET completed_count=?,failed_count=?,results_json=? WHERE id=?').run(completed,failed,JSON.stringify(results),id);
    }
    const status = failed ? (completed ? 'partial' : 'failed') : 'completed';
    db.prepare('UPDATE quality_benchmark_runs SET status=?,finished_at=? WHERE id=?').run(status,new Date().toISOString(),id);
    return { id,status,completed,failed,evaluations: results };
  }
}
