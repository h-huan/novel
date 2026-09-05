import { describe, it, expect } from 'vitest';
import { MapPointService } from './map-point.service';

describe('MapPointService 地点确定性归并', () => {
  it('coreLocationName 剥离括号补充/人物修饰/功能后缀，同时保留主地点专名', () => {
    expect(MapPointService.coreLocationName('辰风科技办公室')).toBe('辰风科技');
    expect(MapPointService.coreLocationName('陈峰创立的辰风科技办公室')).toBe('辰风科技');
    expect(MapPointService.coreLocationName('半岛咖啡（前夫带新欢炫耀处）')).toBe('半岛咖啡');
    // “大厦/总部”是主点名的一部分，不得当功能后缀剥掉
    expect(MapPointService.coreLocationName('天辰集团总部大厦')).toBe('天辰集团总部大厦');
  });

  it('同一物理地点的人物修饰重复只保留一条（不再生成两个办公室）', () => {
    const { points, merged } = MapPointService.dedupeRawMapPoints([
      { name: '辰风科技办公室', type: '工作', level: 'location', description: '主角公司' },
      { name: '陈峰创立的辰风科技办公室', type: '工作', level: 'location', description: '同一处' },
    ]);
    expect(points).toHaveLength(1);
    expect(merged).toHaveLength(1);
  });

  it('主地点 + 内部子场景：子场景降为 scene 且 parentName 精确指向主地点，不再平铺成一级点', () => {
    const { points } = MapPointService.dedupeRawMapPoints([
      { name: '天辰集团总部大厦', level: 'location' },
      { name: '天辰集团总部大厦一楼大堂', level: 'location' },
    ]);
    expect(points).toHaveLength(2);
    const child = points.find(p => String(p.name).includes('大堂'))!;
    expect(child.level).toBe('scene');
    expect(child.parentName).toBe('天辰集团总部大厦');
  });

  it('名称相近但确为不同地点时不被误并', () => {
    const { points } = MapPointService.dedupeRawMapPoints([
      { name: '第一人民医院' },
      { name: '第二人民医院' },
    ]);
    expect(points).toHaveLength(2);
  });

  it('空/脏输入安全过滤', () => {
    expect(MapPointService.dedupeRawMapPoints([]).points).toHaveLength(0);
    expect(MapPointService.dedupeRawMapPoints([{ name: '   ' }, { name: '民政局' }] as any).points).toHaveLength(1);
  });
});
