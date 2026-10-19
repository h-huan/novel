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
    expect(isLanguageHardline(gate.ruleId)).toBe(true);
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
});
