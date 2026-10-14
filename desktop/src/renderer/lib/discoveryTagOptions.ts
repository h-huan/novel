import { CREATIVE_TAG_GUIDES, GENRE_GUIDES, TONE_GUIDES } from '@novel/shared';
/** Presentation only: keep the existing creation/quality fields and their exact values. */
export type DiscoveryTagField = 'selectedGenres' | 'selectedPlotTags' | 'selectedTones' | 'selectedSubmissionTags';
export type TagGroup = '主题与设定' | '人物与关系' | '情节与体验' | '平台标签（待核实分组）';
export interface DiscoveryTagOption {
  value: string; label: string; group: TagGroup; hint: string; searchText: string;
  bindings: Array<{ field: DiscoveryTagField; value: string }>;
}
const aliases: Record<string, string> = { 系统流: '系统', 霸总: '总裁', '打脸回报': '打脸' };
const settings = new Set(['古代', '现代', '未来', '末世', '末日', '年代', '民国', '架空', '星际', '校园', '职场', '娱乐圈', '丧尸', '天灾', '废土']);
const roles = new Set(['总裁', '霸总', '群像', '双强', '女强', '大女主', '萌宝', '反派', '单女主', '多女主', '无女主', '双男主', '双女主', '无CP', '大佬', '天才', '学霸', '高冷', '腹黑', '忠犬', '青梅竹马', '欢喜冤家', '暗恋', '团宠']);
const experiences = new Set(['爽文', '甜宠', '虐恋', '虐文', '热血', '搞笑', '爆笑', '轻松', '治愈', '压抑', '烧脑', '打脸', '逆袭', '复仇', '先婚后爱', '追妻火葬场', '破镜重圆', '一见钟情']);
export function discoveryTagOptions(candidates: Record<DiscoveryTagField, string[]>, selected: Record<DiscoveryTagField, string[]>): DiscoveryTagOption[] {
  const options = new Map<string, DiscoveryTagOption>();
  for (const field of Object.keys(candidates) as DiscoveryTagField[]) {
    for (const raw of [...candidates[field], ...selected[field]]) {
      if (!raw.trim()) continue;
      const key = aliases[raw] || raw;
      const group: TagGroup = settings.has(key) ? '主题与设定' : roles.has(key) ? '人物与关系' : experiences.has(key) ? '情节与体验'
        : field === 'selectedGenres' || field === 'selectedTones' ? '主题与设定'
        : field === 'selectedPlotTags' ? '情节与体验' : '平台标签（待核实分组）';
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
export function toggleDiscoveryTagSelection(option: DiscoveryTagOption, state: Record<DiscoveryTagField, string[]>): Record<DiscoveryTagField, string[]> {
  const checked = option.bindings.some(b => state[b.field].includes(b.value));
  const next = { ...state };
  for (const {field, value} of option.bindings) next[field] = checked ? next[field].filter(item => item !== value) : [...new Set([...next[field], value])];
  return next;
}
