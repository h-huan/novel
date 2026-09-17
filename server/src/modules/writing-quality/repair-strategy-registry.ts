import { applyLocalPatches } from './local-repair';
import type { QualityIssue } from './quality-issue';
import { attributeCharacterEvidence, type CharacterVoiceContract } from './character-contract';

type Input = { content: string; issues: QualityIssue[]; contracts?: CharacterVoiceContract[]; structured?: boolean };
const definitions = {
  character_voice_contract_patch: { maxPatches: 4, ratio: 0.15, prompt: '逐角色对照版本化契约，只修改已明确归属该角色的对白或行为；保留说话人、动作结果、事实和所有其他角色声音。不可把契约偏好机械添加为口头禅。' },
  scene_structure_patch: { maxPatches: 3, ratio: 0.3, prompt: '对照 Scene Fingerprint、Dialogue Function 和 Show/Explain 风险及语义证据，修复单个场景内的揭示、冲突、反应与决策组织。用具体动作或潜台词替代冗余解释，保留场景因果、起终点和情节结果。' },
  platform_metric_patch: { maxPatches: 6, ratio: 0.2, prompt: '只调整段落划分、对白密度或已有开篇/章尾钩子的表达，以创作宪法平台指标为目标；禁止新增人物或剧情，禁止为凑字数重复内容。复检平台测量必须改善。' },
  unique_local_replacement: { maxPatches: 8, ratio: 0.3, prompt: '只修复问题证据附近的局部文字，保留事实、身份、情节和JSON结构。禁止无关润色。' },
} as const;
export type RepairStrategyId = keyof typeof definitions;
export const repairStrategies = definitions;
export function defaultRepairStrategy(rules: string[]): RepairStrategyId {
  return rules.some(r => r.includes('character_voice')) ? 'character_voice_contract_patch'
    : rules.some(r => r.startsWith('ai_trace.') || r.includes('structure')) ? 'scene_structure_patch'
    : rules.some(r => r.startsWith('platform.')) ? 'platform_metric_patch' : 'unique_local_replacement';
}
export function repairPrompt(id: string): string {
  const d = definitions[id as RepairStrategyId] || definitions.unique_local_replacement;
  return `${d.prompt} 至多${d.maxPatches}处替换，总改动范围不超过全文${d.ratio * 100}%。每处original必须唯一匹配。输出JSON：{"patches":[{"original":"原文","replacement":"替换"}]}`;
}
export function executeRepair(id: string, input: Input, patches: any): string {
  const d = definitions[id as RepairStrategyId];
  if (!d) throw new Error('未知修复执行器');
  if (!Array.isArray(patches) || patches.length > d.maxPatches) throw new Error('超过策略替换数量限制');
  if (patches.some(p => typeof p?.original !== 'string' || typeof p?.replacement !== 'string')) throw new Error('修复格式无效');
  if (patches.reduce((n,p) => n + Math.max(p.original.length, p.replacement.length), 0) > input.content.length * d.ratio) throw new Error('超过策略修改范围');
  if (id === 'character_voice_contract_patch') {
    const evidence = attributeCharacterEvidence(input.content, input.contracts || []);
    if (patches.some(p => !evidence.some(e => e.quote.includes(p.original) && input.issues.some(i => i.entityId === e.characterId)))) throw new Error('人物修复必须位于违规角色的可归属证据内');
  } else if (id === 'scene_structure_patch') {
    const scenes = input.content.split(/\n\s*\n|\n(?:\*{3,}|—{3,})\n/);
    if (patches.some(p => !scenes.some(s => s.includes(p.original)))) throw new Error('场景修复不得跨越场景边界');
  } else if (id === 'unique_local_replacement') {
    if (patches.some(p => !input.issues.some(i => i.evidence.verified && (i.evidence.quote.includes(p.original) || p.original.includes(i.evidence.quote))))) throw new Error('局部替换必须关联问题证据');
  }
  const result = applyLocalPatches(input.content, patches, input.structured);
  if (id === 'platform_metric_patch' && /[“「]/g.test(input.content) && !/[“「]/g.test(result)) throw new Error('平台修复不可移除全部对白');
  return result;
}
