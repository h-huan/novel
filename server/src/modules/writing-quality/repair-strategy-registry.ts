import { applyLocalPatches } from './local-repair';
import type { QualityIssue } from './quality-issue';
import { attributeCharacterEvidence, type CharacterVoiceContract } from './character-contract';

type Input = { content: string; issues: QualityIssue[]; contracts?: CharacterVoiceContract[]; structured?: boolean };
const definitions = {
  character_voice_contract_patch: { maxPatches: 4, ratio: 0.15, prompt: '逐角色对照版本化契约，只修改已明确归属该角色的对白或行为；保留说话人、动作结果、事实和所有其他角色声音。不可把契约偏好机械添加为口头禅。' },
  scene_structure_patch: { maxPatches: 6, ratio: 0.4, prompt: '对照 Scene Fingerprint、Dialogue Function、Show/Explain 风险及全部同根质量问题，修复场景内的揭示、冲突、反应与决策组织。结构化大纲必须同步修改 content、scenes、characterActions、conflicts、highlights、hook 等受影响字段，消除事件链错位和重复动作；用具体动作或潜台词替代冗余解释，保留场景因果、起终点和情节结果。' },
  platform_metric_patch: { maxPatches: 6, ratio: 0.2, prompt: '只调整段落划分、对白密度或已有开篇/章尾钩子的表达，以创作宪法平台指标为目标；禁止新增人物或剧情，禁止为凑字数重复内容。复检平台测量必须改善。' },
  unique_local_replacement: { maxPatches: 8, ratio: 0.3, prompt: '只修复问题证据附近的局部文字，保留事实、身份、情节和JSON结构。禁止无关润色。' },
  // 确定性硬红线命中（规则号 + 段号由扫描器给出）专用：命中段落就是要改的地方，
  // 不需要也不允许整章重写。ratio 是【改动预算】而非质量门槛——硬红线可能连续命中
  // 若干段（如规则 42 的连续无人味对答），按 ratio 硬拒会直接丢弃已生成的整章产物。
  // 真正的护栏仍是 maxPatches + 唯一匹配 + 改写后必须【严格减少】硬红线命中数。
  hardline_local_replacement: { maxPatches: 8, ratio: 0.6, prompt: '只就地改写确定性硬红线命中的段落内文字，保留段落位置、事实、人物身份、说话人与情节结果；未命中段落必须一字不动。禁止整章重写，禁止无关润色。' },
} as const;
export type RepairStrategyId = keyof typeof definitions;
export const repairStrategies = definitions;
const hasRuleSegment = (rule: string, segment: string): boolean =>
  rule === segment || rule.startsWith(`${segment}.`) || rule.endsWith(`.${segment}`) || rule.includes(`.${segment}.`);
export function defaultRepairStrategy(rules: string[]): RepairStrategyId {
  return rules.some(r => r.includes('character_voice')) ? 'character_voice_contract_patch'
    : rules.some(r => r.startsWith('ai_trace.') || hasRuleSegment(r, 'structure') || hasRuleSegment(r, 'pacing')
      || hasRuleSegment(r, 'timeline') || hasRuleSegment(r, 'world_rules') || hasRuleSegment(r, 'context') || hasRuleSegment(r, 'logic')) ? 'scene_structure_patch'
    : rules.some(r => r.startsWith('platform.')) ? 'platform_metric_patch' : 'unique_local_replacement';
}
export function repairPrompt(id: string): string {
  const d = definitions[id as RepairStrategyId] || definitions.unique_local_replacement;
  if (id === 'hardline_local_replacement') {
    // 这里曾复用「预算内挑最有价值的缺陷」模板，后果是 4 条硬红线只返回 2 个小补丁，
    // 全文计数 4→4 被回滚；局部批次必须按命中规则逐条清除，而不是随意挑两处润色。
    return `${d.prompt} 本轮列出的每条命中规则都要针对性处理；优先让至少一条规则完全清除。若同一规则跨多个命中窗，本轮预算不足以全部清除，也必须严格减少该规则的命中窗，并在下一轮继续；最终全部硬红线清零前质量门绝不保存。不得通过新增破折号、机械短句或其它新硬伤交换旧硬伤。至多${d.maxPatches}处替换，且所有替换的改动总和不得超过全文${d.ratio * 100}%（硬上限）。若无法在预算内证明净改善，明确输出空 patches 让质量门阻断，不得声称通过。每处original必须唯一匹配。输出JSON：{"patches":[{"original":"原文","replacement":"替换"}]}`;
  }
  // 预算措辞必须与 applyLocalPatches 的硬闸门一致：改动总长超过全文 ratio% 会直接抛错，
  // 整轮精修作废（白烧一次 60-130s 的生成）。此前提示词写「尽量控制在…以内、以修好为准」，
  // 模型据此超预算输出 → 执行器拒绝 → 精修等于没跑，同一批缺陷还得再跑一轮。
  // 改为硬上限表述：模型必须在预算内挑最有价值的缺陷下刀。
  return `${d.prompt} 至多${d.maxPatches}处替换，且所有替换的改动总和不得超过全文${d.ratio * 100}%（硬上限：超出会被执行器直接拒绝，本轮精修作废）：在此预算内挑最有价值的缺陷下刀，不要为凑数量做无关改写。每处original必须唯一匹配。输出JSON：{"patches":[{"original":"原文","replacement":"替换"}]}`;
}
export function executeRepair(id: string, input: Input, patches: any): string {
  const d = definitions[id as RepairStrategyId];
  if (!d) throw new Error('未知修复执行器');
  if (!Array.isArray(patches) || patches.length > d.maxPatches) throw new Error('超过策略替换数量限制');
  if (patches.some(p => typeof p?.original !== 'string' || typeof p?.replacement !== 'string')) throw new Error('修复格式无效');
  // ratio 是【硬改动预算上限】而不是质量门槛：applyLocalPatches 在
  // touched > content.length * ratio 时直接拒绝（local-repair.ts）。预算是上限不是目标——
  // 不为凑够比例做无关改写。越界类缺陷（如 scene_structure_patch 的事件链错位）需要更大改动范围时，
  // 用该策略自己的 ratio 与 maxPatches 拿预算，而不是取消预算、更不是把整章重写。
  // 质量判定在 compareRepair：必须改善且不引入新的有证据严重问题，否则回滚。
  if (id === 'character_voice_contract_patch') {
    const evidence = attributeCharacterEvidence(input.content, input.contracts || []);
    if (patches.some(p => !evidence.some(e => e.quote.includes(p.original) && input.issues.some(i => i.entityId === e.characterId)))) throw new Error('人物修复必须位于违规角色的可归属证据内');
  } else if (id === 'scene_structure_patch') {
    const scenes = input.content.split(/\n\s*\n|\n(?:\*{3,}|—{3,})\n/);
    if (patches.some(p => !scenes.some(s => s.includes(p.original)))) throw new Error('场景修复不得跨越场景边界');
  } else if (id === 'unique_local_replacement' || id === 'hardline_local_replacement') {
    if (patches.some(p => !input.issues.some(i => i.evidence.verified && (i.evidence.quote.includes(p.original) || p.original.includes(i.evidence.quote))))) throw new Error('局部替换必须关联问题证据');
  }
  const result = applyLocalPatches(input.content, patches, input.structured, d.ratio);
  if (id === 'platform_metric_patch' && /[“「]/g.test(input.content) && !/[“「]/g.test(result)) throw new Error('平台修复不可移除全部对白');
  return result;
}
