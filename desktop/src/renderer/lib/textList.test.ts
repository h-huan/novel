import { describe, it, expect } from 'vitest';
import { splitToLines } from './textList';

describe('splitToLines', () => {
  it('按 、；/ 与换行拆分并去空', () => {
    expect(splitToLines('A、B；C/D\nE')).toEqual(['A', 'B', 'C', 'D', 'E']);
  });
  it('数组输入逐项清洗', () => {
    expect(splitToLines(['x', '', ' y '])).toEqual(['x', 'y']);
  });
  it('空/未定义返回空数组', () => {
    expect(splitToLines('')).toEqual([]);
    expect(splitToLines(null)).toEqual([]);
    expect(splitToLines(undefined)).toEqual([]);
  });
  it('对象摘要输入取其 summary 字段', () => {
    expect(splitToLines({ summary: 'a。b。' })).toEqual(['a。b。']);
  });
});
