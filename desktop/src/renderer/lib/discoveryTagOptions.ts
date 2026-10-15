import { CREATIVE_TAG_GUIDES, GENRE_GUIDES, TONE_GUIDES, DISCOVERY_TAG_GROUPS, creativeTagGroup, type CreativeTagGroup } from '@novel/shared';
/** Presentation only: keep the existing creation/quality fields and their exact values. */
export type DiscoveryTagField = 'selectedGenres' | 'selectedPlotTags' | 'selectedTones' | 'selectedSubmissionTags';
export type TagGroup = CreativeTagGroup;
export interface DiscoveryTagOption {
  value: string; label: string; group: TagGroup; hint: string; searchText: string;
  bindings: Array<{ field: DiscoveryTagField; value: string }>;
}
const aliases: Record<string, string> = { 系统流: '系统', 霸总: '总裁', '打脸回报': '打脸' };
export function discoveryTagOptions(candidates: Record<DiscoveryTagField, string[]>, selected: Record<DiscoveryTagField, string[]>, groupOverrides: Record<string, TagGroup> = {}): DiscoveryTagOption[] {
  const options = new Map<string, DiscoveryTagOption>();
  for (const field of Object.keys(candidates) as DiscoveryTagField[]) {
    for (const raw of new Set([...candidates[field], ...selected[field]])) {
      if (!raw.trim()) continue;
      const key = aliases[raw] || raw;
      const group = groupOverrides[field + '\u0000' + raw] || creativeTagGroup(key, field === 'selectedGenres' ? '主题与设定'
        : field === 'selectedPlotTags' || field === 'selectedTones' ? '情节与体验' : '平台标签（待核实分组）');
      let option = options.get(key);
      if (!option) {
        option = { value: key, label: key, group, hint: '', searchText: key, bindings: [] };
        options.set(key, option);
      } else if (option.group === '平台标签（待核实分组）') option.group = group;
      if (!option.bindings.some(b => b.field === field && b.value === raw)) option.bindings.push({ field, value: raw });
      option.searchText += ' ' + raw + (key === '末世' ? ' 末日' : key === '末日' ? ' 末世' : key === '总裁' ? ' 霸总' : '');
    }
  }
  return [...options.values()].map(option => ({ ...option,
    hint: CREATIVE_TAG_GUIDES[option.value] || GENRE_GUIDES[option.value] || TONE_GUIDES[option.value]
      || option.bindings.map(binding => GENRE_GUIDES[binding.value] || TONE_GUIDES[binding.value]).find(Boolean)
      || (option.bindings.some(binding => binding.field === 'selectedSubmissionTags' && candidates.selectedSubmissionTags.includes(binding.value))
        ? '所选平台分类中的作品标签参考，按故事实际内容选择。' : '用于指定故事方向，选择后会传入故事卡、框架和正文。'),
  }));
}

export interface CreativeDictionaryItem { id: string; dictType: string; label: string; parentLabel?: string; isCustom?: boolean; }
export const CREATIVE_DICTIONARY_TYPES = ['web_novel_genre', 'plot_tag', 'tone_tag', 'writing_style', 'narrative_pov'] as const;
const dictionaryBindings: Record<string, DiscoveryTagField> = { web_novel_genre: 'selectedGenres', plot_tag: 'selectedPlotTags', tone_tag: 'selectedTones' };

/** Both pages use this projection, including explicit groups on custom entries. */
export function dictionaryDiscoveryTags(items: CreativeDictionaryItem[], selected?: Record<DiscoveryTagField, string[]>, platformTags: string[] = []): DiscoveryTagOption[] {
  const candidates: Record<DiscoveryTagField, string[]> = { selectedGenres: [], selectedPlotTags: [], selectedTones: [], selectedSubmissionTags: platformTags };
  const overrides: Record<string, TagGroup> = {};
  for (const item of items) {
    const field = dictionaryBindings[item.dictType];
    if (!field) continue;
    candidates[field].push(item.label);
    if (DISCOVERY_TAG_GROUPS.some(group => group.key === item.parentLabel)) overrides[field + '\u0000' + item.label] = item.parentLabel as TagGroup;
  }
  const empty: Record<DiscoveryTagField, string[]> = { selectedGenres: [], selectedPlotTags: [], selectedTones: [], selectedSubmissionTags: [] };
  return discoveryTagOptions(candidates, selected || empty, overrides);
}

export function dictionaryRowsForTag(option: DiscoveryTagOption, items: CreativeDictionaryItem[]): CreativeDictionaryItem[] {
  return items.filter(item => option.bindings.some(binding => dictionaryBindings[item.dictType] === binding.field && binding.value === item.label));
}
export function toggleDiscoveryTagSelection(option: DiscoveryTagOption, state: Record<DiscoveryTagField, string[]>): Record<DiscoveryTagField, string[]> {
  const checked = option.bindings.some(b => state[b.field].includes(b.value));
  const next = { ...state };
  for (const {field, value} of option.bindings) next[field] = checked ? next[field].filter(item => item !== value) : [...new Set([...next[field], value])];
  return next;
}
