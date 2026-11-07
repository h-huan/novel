import {it,expect} from 'vitest';
import {targetIdeaReviews,presentationReviewIssues} from './idea-presentation-review';
it('formats suggestions only for explicit false verdicts without changing rejection or evidence',()=>{
 const cards=[{title:'原始标题'}];
 const row:any={position:1,title:'原始标题',titleCompelling:true,openingCompelling:true,distinctFromBatch:true,storyCoherent:true,payoffCredible:false,platformFit:true,storyEvidence:'已有行动',payoffEvidence:'缺少条件的结果',platformEvidence:'已有故事',qualityReason:'有行动但缺少有权人的实际决定',issues:[{criterion:'payoffCredible',reason:'缺少剥夺资格所需的实际规则'}],warnings:[{criterion:'payoffCredible',suggestion:'须补足真实有权决定的条件'}]};
 const before=JSON.stringify(row),normalized=targetIdeaReviews({reviews:[row]},cards,[]).reviews[0];
 expect(normalized.payoffCredible).toBe(false);
 expect(normalized.issues).toEqual(['payoffCredible：缺少剥夺资格所需的实际规则']);
 expect(normalized.warnings).toEqual(['payoffCredible：须补足真实有权决定的条件']);
 expect(normalized.payoffEvidence).toBe(row.payoffEvidence);expect(JSON.stringify(row)).toBe(before);
 for(const patch of [{payoffCredible:true},{warnings:[{criterion:'payoffCredible',suggestion:'建议',hidden:'不明内容'}]}]){
  const value=targetIdeaReviews({reviews:[{...row,...patch}]},cards,[]);
  expect(presentationReviewIssues(value,cards).some(issue=>issue.includes('warnings'))).toBe(true);
 }
});
