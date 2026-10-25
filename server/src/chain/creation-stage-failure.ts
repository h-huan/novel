import type { GenerationMetricsService } from '../modules/generation-metrics/generation-metrics.service';

export type CreationFailureOrigin = 'generation_execution' | 'generation_contract' | 'source_review_incomplete'
  | 'source_review_rejected' | 'source_repair_contract' | 'quality_gate' | 'persistence_write' | 'persistence_readback';

/** A model-call success is not a stage commit. Persist the business failure in
 * the existing run ledger, including its actual boundary, without a model call. */
export function recordCreationStageFailure(
  metrics: Pick<GenerationMetricsService, 'beginRun' | 'finishRun'> | undefined,
  projectId: string, step: string, origin: CreationFailureOrigin, message: string,
  details: Record<string, unknown> = {},
): void {
  if (!metrics) return;
  const started = Date.now();
  const run = metrics.beginRun(projectId, 'review', message, undefined, 'creation_stage_failure', undefined, false);
  metrics.finishRun(run.id, 'failed', started,
    JSON.stringify({ ...details, kind: 'creation_stage_failure', step, origin }), message);
}
