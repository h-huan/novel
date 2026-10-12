import { describe, it, expect } from 'vitest';
import { quotedText } from './quoted-text';
import { measureNarrative } from './platform-benchmarks';
describe('paired quotation measurement', () => {
  it.each([['“','”'],['「','」'],['『','』'],['"','"']])('measures paired %s %s consistently', (a,b) => {
    const content = '她回答：'+a+'这份名单不能签。'+b+'他站在门外。';
    expect(quotedText(content).map(q=>q.text)).toEqual(['这份名单不能签。']);
    expect(measureNarrative(content).dialogueRatio).toBe(measureNarrative('她回答：“这份名单不能签。”他站在门外。').dialogueRatio);
  });
  it('counts nested quotations once and rejects unmatched pairs', () => {
    expect(quotedText('“他说「别动」。”').length).toBe(1);
    expect(quotedText('“错误」')).toEqual([]);
    expect(measureNarrative('她没有开口。').dialogueRatio).toBe(0);
  });
});
