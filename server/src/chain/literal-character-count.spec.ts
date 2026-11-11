import {describe,it,expect} from 'vitest';
import {literalCharacterCountMismatches} from './literal-character-count';
import {detectForbiddenTells,isLanguageHardline} from './hardline-scanner';

describe('exact narrative quotation counts',()=>{
  it('computes a direct claim and anchors the unchanged source paragraph',()=>{
    const text='她把纸放下。\n\n通知写着“立即返航”五个字，下面留着签名。';
    const [finding]=literalCharacterCountMismatches(text);
    expect(finding).toMatchObject({quote:'立即返航',declared:5,actual:4});
    expect(text.slice(finding.start,finding.end)).toBe(finding.evidence);
    const [gate]=detectForbiddenTells(text).filter(f=>f.ruleId==='literal-character-count');
    expect(isLanguageHardline(gate.ruleId)).toBe(false);
    expect(gate.hitCharOffsets).toEqual([finding.start]);
    expect(gate.paragraphIndices).toEqual([1]);
    expect(gate.paragraphs).toEqual([text.split('\n\n')[1]]);
  });
  it.each(['“风停了”三个字','「立即返航」4个字','“一二三四五六七八九十甲乙”十二个字'])('accepts the correct literal count: %s',text=>{
    expect(literalCharacterCountMismatches(text)).toEqual([]);
  });
  it.each([
    '并非“风停了”四个字，而是另一句话。',
    '“风停了”四个字？他又数了一遍。',
    '“她把「风停了」四个字读了出来。”这是人物的原话。',
    '"她把「风停了」四个字读了出来。"这是人物的原话。',
    '“风停了”至少四个字。',
    '“你先……”五个字。',
    '“我用AI”四个字。',
    '“风停了」四个字。',
    '他数了四个字，题目写的是“风停了”。',
  ])('does not turn ambiguous, mixed or quoted speech into a hard fact: %s',text=>{
    expect(literalCharacterCountMismatches(text)).toEqual([]);
  });
  it('keeps a corrected number free of this finding without deleting the quotation',()=>{
    const source='通知上写着“立即返航”五个字。';
    expect(literalCharacterCountMismatches(source)).toHaveLength(1);
    expect(literalCharacterCountMismatches(source.replace('五个字','四个字'))).toEqual([]);
  });
  it('checks an anaphoric count against the single preceding quotation',()=>{
    const text='登记单上，家属栏里写的是“家属放弃抢救”。\n\n这四个字我在值班台见过一次。';
    const [finding]=literalCharacterCountMismatches(text);
    expect(finding).toMatchObject({quote:'家属放弃抢救',declared:4,actual:6});
    expect(text.slice(finding.start,finding.end)).toBe('这四个字');
  });
  it('checks a paragraph-opening count against the previous quoted line',()=>{
    const text='“给馆里招事。”\n\n四个字，说得很平，没抬高。';
    const [finding]=literalCharacterCountMismatches(text);
    expect(finding).toMatchObject({quote:'给馆里招事',declared:4,actual:5});
  });
  it.each([
    '登记单上写的是“放弃抢救”。\n\n这四个字他记得很清楚。',
    '他说“走吧”。\n\n这两个字很轻。',
    '“第一句。”\n\n“第二句。”\n\n这四个字都不是我说的。',
    '他数了四个字，题目写的是“风停了”。',
    '笔尖落在最后一个“救”字上。\n\n那六个字说的是另一件事。',
    '“掰不开就先放着。”\n\n这两个字，他说得很轻。',
    '“说吧。”\n\n那三个字他说得很慢。',
  ])('leaves correct or ambiguous anaphoric counts alone: %s',text=>{
    expect(literalCharacterCountMismatches(text)).toEqual([]);
  });
  it('flags half-width punctuation between Han characters with an exact offset',()=>{
    const text='遗体停在化妆间里，不走,等火化排期。';
    const [gate]=detectForbiddenTells(text).filter(f=>f.ruleId==='punctuation-width');
    expect(gate).toBeTruthy();
    expect(isLanguageHardline(gate.ruleId)).toBe(false);
    expect(text[gate.hitCharOffsets[0]]).toBe(',');
  });
  it.each(['金额 1,000 元','hello, world','“ok, fine”他说。','版本 1.2:3'])(
    'leaves punctuation in non-Chinese contexts alone: %s',text=>{
      expect(detectForbiddenTells(text).filter(f=>f.ruleId==='punctuation-width')).toEqual([]);
    });
});
