import { describe, expect, it } from 'vitest';
import { applyChapterActionProofPatch } from './chapter-action-proof-repair';
const chapter = { title:'原章',targetWords:4000,wordCountReason:'原篇幅合同',
  content:'先核对合同再作出选择',scenes:[{goal:'守住店铺',outcome:'签署合同'}],
  characterActions:[{character:'主角',action:'提出合作',result:'对方接受'}],
  conflicts:[],highlights:[],characterStates:[],hook:'下一章追查',world:'原世界',chapterFunction:'climax'};
describe('bounded chapter action proof repair', () => {
  it('allows minimal existing-event repair while preserving identity, word plan and world',()=>{
    const updated=applyChapterActionProofPatch(chapter,{patch:{content:'先取得原有合作方授权，再核对合同并作出选择',
      characterActions:[{character:'主角',action:'核实既有授权',result:'收到合法答复'}]}});
    expect(updated.content).toContain('取得原有合作方授权');
    for(const key of ['title','targetWords','wordCountReason','chapterFunction','world','hook'])
      expect((updated as any)[key]).toEqual((chapter as any)[key]);
    expect(chapter.content).toBe('先核对合同再作出选择');
  });
  it.each([{}, {patch:{}},{patch:{title:'另一个故事'}},{patch:{targetWords:100}},{patch:{world:'编造新规则'}},
    {patch:{content:''}},{patch:{scenes:'重写成字符串'}},{patch:{content:null}}])
    ('rejects replacement, missing or forbidden patch %#', (value)=>{
      expect(()=>applyChapterActionProofPatch(chapter,value)).toThrow();
    });
});
