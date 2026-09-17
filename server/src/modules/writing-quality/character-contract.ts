import { createHash } from 'node:crypto';
import { qualityIssue, type QualityIssue } from './quality-issue';

export function canonical(value: any): string {
  if (value === undefined) return 'null';
  if (!value || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export function object(value: any): Record<string, any> {
  try { const v = typeof value === 'string' ? JSON.parse(value) : value; return v && !Array.isArray(v) && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function list(value: any): string[] {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string' && v.trim());
  if (typeof value !== 'string' || !value.trim()) return [];
  try { const parsed = JSON.parse(value); if (Array.isArray(parsed)) return list(parsed); } catch { /* prose field */ }
  return value.split(/[、,，;；\n]/).map(v => v.trim()).filter(Boolean);
}
export interface CharacterVoiceContract {
  schemaVersion: 1; version: string; characterId: string; name: string;
  sentenceLength: unknown; speechRegister: unknown; directness: unknown;
  questionFrequency: unknown; explanationTolerance: unknown;
  preferredVocabulary: string[]; forbiddenVocabulary: string[]; catchphrases: string[];
  speechRhythm: string[]; toneToDifferentPeople: unknown;
  authorityBehavior: unknown; dangerBehavior: unknown; betrayalBehavior: unknown;
  intimacyBehavior: unknown; conflictBehavior: unknown; weakPersonBehavior: unknown;
  moralBoundary: string[]; behaviorForbidden: string[];
}
/** Missing traits stay unknown: never invent numerical preferences from prose. */
export function compileCharacterContract(row: Record<string, any>): CharacterVoiceContract {
  const p = object(row.profile_json);
  const explicit = object(p.voiceContract ?? p.character_voice_contract);
  const merged = { ...p, ...Object.fromEntries(Object.entries(row).filter(([,v]) => v !== null && v !== '')), ...explicit };
  const pick = (...keys: string[]) => keys.map(k => merged[k]).find(v => v !== undefined && v !== null && v !== '') ?? null;
  const data = {
    schemaVersion: 1 as const, characterId: String(row.id), name: String(row.name || ''),
    sentenceLength: pick('sentenceLength', 'sentence_length'), speechRegister: pick('speechRegister', 'speech_register', 'speech_style'),
    directness: pick('directness'), questionFrequency: pick('questionFrequency', 'question_frequency', 'rhetorical_question_tendency'),
    explanationTolerance: pick('explanationTolerance', 'explanation_tolerance'),
    preferredVocabulary: list(pick('preferredVocabulary', 'common_words')), forbiddenVocabulary: list(pick('forbiddenVocabulary', 'forbidden_words')),
    catchphrases: list(pick('catchphrases', 'catchphrase')), speechRhythm: list(pick('speechRhythm', 'speech_rhythm', 'speech_style')),
    toneToDifferentPeople: pick('toneToDifferentPeople', 'tone_to_different_people'),
    authorityBehavior: pick('authorityBehavior', 'strong_person_reaction'), dangerBehavior: pick('dangerBehavior', 'danger_reaction'),
    betrayalBehavior: pick('betrayalBehavior', 'betrayal_reaction'), intimacyBehavior: pick('intimacyBehavior', 'intimacy_reaction'),
    conflictBehavior: pick('conflictBehavior', 'emotion_outburst_style'), weakPersonBehavior: pick('weakPersonBehavior', 'weak_person_reaction'),
    moralBoundary: list(pick('moralBoundary', 'moral_boundary', 'must_obey_rules')), behaviorForbidden: list(pick('behaviorForbidden', 'forbidden_writing')),
  };
  return { ...data, version: createHash('sha256').update(canonical(data)).digest('hex') };
}
export interface AttributedEvidence { characterId: string; kind: 'dialogue' | 'behavior'; quote: string; start: number; end: number }
/** Conservative attribution: a single named actor with an explicit speech/action marker. */
export function attributeCharacterEvidence(content: string, contracts: CharacterVoiceContract[]): AttributedEvidence[] {
  const results: AttributedEvidence[] = [];
  for (const match of content.matchAll(/(?:[“「][^”」]*[”」]|[^\n。！？])+[。！？]?/g)) {
    const text = match[0];
    const actors = contracts.filter(c => c.name && text.includes(c.name));
    if (actors.length !== 1) continue;
    const c = actors[0]; const escaped = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(escaped + '(?:低声|冷冷|轻声|笑着|怒声|缓缓|突然|立刻|\\s){0,3}(?:说|问|答|道|喊|喝|推|拿|走|拒绝|握|拔|转身|点头|摇头)').test(text)) continue;
    results.push({ characterId: c.characterId, kind: /[“「][^”」]*[”」]/.test(text) ? 'dialogue' : 'behavior', quote: text.trim(), start: match.index!, end: match.index! + text.length });
  }
  return results;
}
export function reviewCharacterContracts(input: { projectId: string; runId: string; content: string }, contracts: CharacterVoiceContract[]) {
  const evidence = attributeCharacterEvidence(input.content, contracts); const issues: QualityIssue[] = [];
  for (const item of evidence.filter(e => e.kind === 'dialogue')) {
    const contract = contracts.find(c => c.characterId === item.characterId)!;
    const dialogue = [...item.quote.matchAll(/[“「]([^”」]*)[”」]/g)].map(m => m[1]).join('');
    for (const word of contract.forbiddenVocabulary) if (dialogue.includes(word)) issues.push({ ...qualityIssue({
      ...input, entityId: item.characterId, stage: 'chapter', ruleId: 'character_voice.forbidden_vocabulary', severity: 'high',
      message: `${contract.name}对白使用契约禁用词“${word}”（契约 ${contract.version.slice(0, 12)}）`, quote: item.quote, source: 'character_contract_v1',
    }), contractVersion: contract.version, contractField: 'forbiddenVocabulary' });
  }
  return { contracts, evidence, issues };
}
