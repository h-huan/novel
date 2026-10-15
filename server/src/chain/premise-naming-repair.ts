import { applyFictionNamingReplacements, prohibitedFictionNames } from '../../shared/src/fiction-naming';
import { normalizePremiseSelectionPayload } from './idea-discovery-contract';

export function premiseNamingRepairPlan(payload: any) {
  const affected = (payload.selectedPremises || []).flatMap((selected: any) => {
    const source = payload.pool.find((row: any) => row.premiseId === selected.premiseId);
    const names = prohibitedFictionNames({ ...source, ...selected, workingTitle: source?.workingTitle, storyCore: source?.storyCore });
    return names.length ? [{ source, selected, names }] : [];
  });
  const names: string[] = [...new Set<string>(affected.flatMap((row: any) => row.names))];
  return { names, prompt: '按GEN-008仅为点名禁止名称选择原创虚构名称。只返回名称映射，不重写题材，不改变角色、行为、关系、能力、程序条件或结果。'
    + '\n【须完整覆盖的原名称】' + JSON.stringify(names)
    + '\n【原池与展开上下文】' + JSON.stringify(affected)
    + '\n只输出JSON:{"namingReplacements":{"原名称":"原创虚构名称"}}。每个点名名称恰好一次，不返回pool、selectedPremises或故事补丁。' };
}

export function applyPremiseNamingRepair(payload: any, value: any, count: number, poolTarget: number, categories?: readonly string[]) {
  const names = premiseNamingRepairPlan(payload).names;
  const replacements = value?.namingReplacements;
  if (!value || Object.keys(value).length !== 1 || !replacements || typeof replacements !== 'object' || Array.isArray(replacements)
    || Object.keys(replacements).length !== names.length || names.some(name => !Object.prototype.hasOwnProperty.call(replacements, name)))
    throw new Error('轻量题材命名修复只能返回完整的点名名称映射');
  return normalizePremiseSelectionPayload({ ...payload,
    pool: payload.pool.map((row: any) => applyFictionNamingReplacements(row, replacements)),
    selectedPremises: payload.selectedPremises.map((row: any) => applyFictionNamingReplacements(row, replacements)),
  }, count, poolTarget, categories);
}
