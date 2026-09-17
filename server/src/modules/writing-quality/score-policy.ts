import type { CreativeConstitution } from '../project/creative-constitution';
import type { ScoreDimension, DimensionScore } from './stage-score';

export interface ScorePolicy { version: 1; floors: Partial<Record<ScoreDimension, number>>; weights: Partial<Record<ScoreDimension, number>> }
export function scorePolicy(c: Pick<CreativeConstitution, 'targetPlatform' | 'projectType'>, override?: Partial<ScorePolicy>): ScorePolicy {
  const floors = { character_voice: 70, world_rules: 70, context: 70, logic: 70, ...override?.floors };
  const weights = { context: 2, logic: 2, character_voice: 1.5, world_rules: 1.5,
    ...(c.projectType === 'short_story' ? { structure: 2, payoff: 2 } : { timeline: 1.5, retention: 1.5 }),
    ...(c.targetPlatform === 'fanqie' ? { pacing: 2, retention: 2 } : {}), ...override?.weights };
  for (const value of Object.values(floors)) if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('无效最低分');
  for (const value of Object.values(weights)) if (!Number.isFinite(value) || value <= 0) throw new Error('无效评分权重');
  return { version: 1, floors, weights };
}
export function weightedScore(dimensions: Record<ScoreDimension, DimensionScore>, policy: ScorePolicy) {
  const required = Object.entries(dimensions).filter(([,d]) => d.status !== 'not_applicable');
  if (!required.length || required.some(([,d]) => d.score === null)) return null;
  const weight = (k: string) => policy.weights[k as ScoreDimension] ?? 1;
  return Math.round(required.reduce((sum,[k,d]) => sum + d.score! * weight(k), 0) / required.reduce((sum,[k]) => sum + weight(k), 0));
}
