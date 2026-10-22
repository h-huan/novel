import { buildExecutionStandard, type CreativeConstitution } from '../modules/project/creative-constitution';

/** Model fixtures quote the actual supplied project criterion, rather than claiming a score alone. */
export function dimensionBasis(constitution: CreativeConstitution, dimension: string) {
  const criterion = buildExecutionStandard(constitution).dimensions.find(d => d.dimension === dimension)?.requirement;
  return criterion ? { status: 'evaluated', criterion, reason: '测试模型对照已提供的项目判据给出结论' } : undefined;
}

export function dimensionBasisFromPrompt(prompt: string, dimension: string) {
  // Use the same criterion-ID contract as production: the evaluator binds the exact
  // current criterion from the project's execution standard instead of echoing a
  // potentially stale or paraphrased copy from a prompt.
  const matches = [...prompt.matchAll(/^(?:各执行维度判据[^\n]*?|对应执行判据)：(\{[^\n]*\})$/gm)];
  for (const match of matches.reverse()) {
    try {
      const criteria = JSON.parse(match[1]);
      if (typeof criteria?.[dimension] === 'string' && criteria[dimension].trim()) {
        return { status: 'evaluated', criterionId: dimension, reason: '测试模型引用本次提示中的真实执行判据' };
      }
    } catch {
      // Ignore unrelated or malformed prompt blocks; absence must remain unevaluated.
    }
  }
  return undefined;
}
