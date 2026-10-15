import { describe, expect, it } from 'vitest';
import { discoveryTagOptions, toggleDiscoveryTagSelection, dictionaryDiscoveryTags, dictionaryRowsForTag } from './discoveryTagOptions';

describe('字典与发现标签同步', () => {
  it('字典页与发现页复用同一投影，包含旧情绪词、别名和自建关系分组', () => {
    const rows = [
      { id: 'a', dictType: 'tone_tag', label: '热血' },
      { id: 'b', dictType: 'web_novel_genre', label: '系统流' },
      { id: 'c', dictType: 'plot_tag', label: '自建关系', parentLabel: '人物与关系' },
    ];
    const options = dictionaryDiscoveryTags(rows);
    expect(options.find(option => option.value === '热血')?.group).toBe('情节与体验');
    const system = options.find(option => option.value === '系统')!;
    expect(dictionaryRowsForTag(system, rows).map(row => row.id)).toEqual(['b']);
    expect(options.find(option => option.value === '自建关系')?.group).toBe('人物与关系');
    expect(dictionaryDiscoveryTags(rows, { selectedGenres: [], selectedPlotTags: ['自建关系'], selectedTones: [], selectedSubmissionTags: [] })).toEqual(options);
  });
  it('按共享语义分组，保留实际请求字段和值及自建项', () => {
    const selected = { selectedGenres: [], selectedPlotTags: [], selectedTones: [], selectedSubmissionTags: [] };
    const options = discoveryTagOptions({ selectedGenres: ['修仙', '穿越脑洞'], selectedPlotTags: ['婆媳', '亲情与利益', '种田经营', '自建玩法'], selectedTones: ['温馨'], selectedSubmissionTags: [] }, selected);
    const relationship = options.find(option => option.value === '婆媳')!;
    expect(relationship.group).toBe('人物与关系');
    expect(relationship.hint).toContain('儿媳');
    const chosen = toggleDiscoveryTagSelection(relationship, selected);
    expect(chosen.selectedPlotTags).toEqual(['婆媳']);
    expect(toggleDiscoveryTagSelection(relationship, chosen).selectedPlotTags).toEqual([]);
    expect(options.find(option => option.value === '亲情与利益')?.group).toBe('主题');
    expect(options.find(option => option.value === '修仙')?.group).toBe('主题与设定');
    expect(options.find(option => option.value === '自建玩法')?.group).toBe('情节与体验');
    expect(options.find(option => option.value === '温馨')?.group).toBe('情节与体验');
  });
});
