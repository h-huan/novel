/**
 * Verifies explicit causal trigger and time-scope claims before a prose call.
 * This is deliberately narrow: an unrecognized story mechanic is left to the
 * semantic cross-module review, never silently declared consistent here.
 */
export interface SourceRuleDocuments {
  confirmedStory?: string;
  worldPremise?: string;
  worldRules?: string;
  worldProfileRules?: string;
  chapterOutlines?: Array<{ chapterIndex: number; text: string }>;
}

export function describeWorldSourceCandidate(value: unknown, protagonistName = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['世界观未返回JSON对象'];
  const world = value as Record<string, unknown>;
  const problems: string[] = [];
  for (const field of ['era', 'storyPremise', 'atmosphere', 'endingDirection']) {
    if (typeof world[field] !== 'string' || !String(world[field]).trim()) problems.push(`世界观缺少${field}`);
  }
  if (!Array.isArray(world.rules) || world.rules.length < 2 || world.rules.length > 3
    || world.rules.some(rule => typeof rule !== 'string' || !rule.trim())) {
    problems.push('世界观rules必须包含2-3条非空因果规则');
  }
  if (!Array.isArray(world.locations) || !world.locations.some(location => typeof location === 'string' && location.trim())) {
    problems.push('世界观缺少有效locations');
  }
  if (protagonistName && !String(world.storyPremise || '').includes(protagonistName)) problems.push(`世界观storyPremise未保留主角“${protagonistName}”`);
  return problems;
}

function readableIdea(raw: string): string {
  try {
    const idea = JSON.parse(raw) as Record<string, unknown>;
    if (!idea || typeof idea !== 'object' || Array.isArray(idea)) return raw;
    return ['angle', 'hook', 'description', 'coreConflict', 'uniquePoint']
      .map(key => String(idea[key] || '')).filter(Boolean).join('。');
  } catch {
    return raw;
  }
}

function hasEntryErasure(text: string): boolean {
  return /每(?:进(?:门|入)?|推门|跨(?:门|槛))一次[^。；\n]{0,38}(?:抹去|抹除|扣名|扣掉|少(?:一|1)户|消失)/.test(text);
}

function hasRoundTripErasure(text: string): boolean {
  return /每(?:完整)?进出(?:门)?一次[^。；\n]{0,45}(?:抹去|抹除|扣名|扣掉|少(?:一|1)户|消失)|(?:完整进出|跨入并跨出)[^。；\n]{0,45}(?:抹去|抹除|扣名|扣掉|少(?:一|1)户|消失)/.test(text);
}

function hasRealityRewind(text: string): boolean {
  return /(?:每进一次|每次进门|每次推门)[^。；\n]{0,12}现实(?:时间)?(?:倒退|回拨|回退)一小时/.test(text);
}

function hasInteriorOnlyRewind(text: string): boolean {
  return /楼内(?:时间)?(?:倒退|回拨|回退)一小时[^。\n]{0,90}外(?:界|面|部)(?:时间|时钟)?(?:不退|不变|不回拨|不回退)|外(?:界|面|部)(?:时间|时钟)?(?:不退|不变|不回拨|不回退)[^。\n]{0,90}楼内(?:时间)?(?:倒退|回拨|回退)一小时|(?:楼内|门后)[^。\n]{0,90}(?:比现实早一小时|回拨一小时)[^。\n]{0,90}现实(?:时间)?(?:不倒流|不回拨|不退)/.test(text);
}

export function detectSourceRuleConflicts(input: SourceRuleDocuments): string[] {
  const idea = readableIdea(String(input.confirmedStory || ''));
  const core = `${input.worldPremise || ''}。${input.worldRules || ''}`;
  const profile = String(input.worldProfileRules || '');
  const sources = [
    { name: '确认题材', text: idea },
    { name: '世界观主记录', text: core },
    { name: '世界观深度档案', text: profile },
    ...(input.chapterOutlines || []).map(chapter => ({ name: `第${chapter.chapterIndex}章章纲`, text: chapter.text })),
  ].filter(source => source.text.trim());
  const conflicts: string[] = [];
  const entry = sources.filter(source => hasEntryErasure(source.text));
  const roundTrip = sources.filter(source => hasRoundTripErasure(source.text));
  if (entry.length && roundTrip.length) {
    conflicts.push(`扣名触发条件互斥：「${entry.map(item => item.name).join('、')}」写每次进门即扣名，「${roundTrip.map(item => item.name).join('、')}」写完整进出才扣名；请先统一资料源。`);
  }
  const reality = sources.filter(source => hasRealityRewind(source.text));
  const interior = sources.filter(source => hasInteriorOnlyRewind(source.text));
  if (reality.length && interior.length) {
    conflicts.push(`回拨作用范围互斥：「${reality.map(item => item.name).join('、')}」写现实倒退一小时，「${interior.map(item => item.name).join('、')}」写仅楼内回拨、外界不退；请先统一资料源。`);
  }
  return conflicts;
}
