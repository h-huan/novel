import { buildExecutionStandard, type CreativeConstitution } from '../modules/project/creative-constitution';

/** Model fixtures quote the actual supplied project criterion, rather than claiming a score alone. */
export function dimensionBasis(constitution: CreativeConstitution, dimension: string) {
  const criterion = buildExecutionStandard(constitution).dimensions.find(d => d.dimension === dimension)?.requirement;
  return criterion ? { status: 'evaluated', criterion, reason: '测试模型对照已提供的项目判据给出结论' } : undefined;
}

export function dimensionBasisFromPrompt(prompt: string, dimension: string) {
  const line = prompt.match(/^(?:各执行维度判据[^\n]*?|对应执行判据)：(.*)$/m)?.[1];
  const criterion = line ? JSON.parse(line)[dimension] : undefined;
  return criterion ? { status: 'evaluated', criterion, reason: '测试模型引用本次提示中的真实执行判据' } : undefined;
}
