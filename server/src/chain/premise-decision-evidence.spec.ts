import {expect,it} from 'vitest';
import {premiseDecisionEvidenceIssues} from './premise-payoff-review';
const candidate={activeChoice:'技师带着实测记录提出保留设备的建议',escalation:'车间负责人掌握设备处置权，既定规程规定连续三次实测达标即可保留设备',payoff:'负责人据实测记录批准保留设备',causalPlan:[{action:{field:'activeChoice',quote:'技师带着实测记录提出保留设备的建议'},conditions:[],result:{field:'payoff',quote:'负责人据实测记录批准保留设备'}}]};
const proof={status:'supported',deciderQuote:'车间负责人掌握设备处置权',basisQuote:'既定规程规定连续三次实测达标即可保留设备',reason:'有权者和实际采纳依据均已在原文建立'};
it('requires decision evidence before a supported transition can enter card generation',()=>{expect(premiseDecisionEvidenceIssues(undefined,candidate,'S1')).not.toEqual([]);expect(premiseDecisionEvidenceIssues(proof,candidate,'S1')).toEqual([]);});
it('rejects an outcome or reviewer-invented approval premise as its own decision basis',()=>{for(const basisQuote of [candidate.payoff,'公开证明能力所以公司一定采纳'])expect(premiseDecisionEvidenceIssues({...proof,basisQuote},candidate,'S1').length).toBeGreaterThan(0);});
it('requires an actual decider and keeps negative or ordinary direct-effect verdicts',()=>{expect(premiseDecisionEvidenceIssues({...proof,deciderQuote:'审查器新添的审批委员会'},candidate,'S1').length).toBeGreaterThan(0);for(const status of ['gap','unknown','not_required'])expect(premiseDecisionEvidenceIssues({status,reason:'按本项真实结果保留原有独立审核结论'},candidate,'S1')).toEqual([]);});

it('rejects the same result copied into a different source field while preserving real prior evidence',()=>{
 const alias={...candidate,escalation:candidate.escalation+'；'+candidate.payoff};
 expect(premiseDecisionEvidenceIssues({...proof,basisQuote:candidate.payoff},alias,'S1').length).toBeGreaterThan(0);
 expect(premiseDecisionEvidenceIssues(proof,alias,'S1')).toEqual([]);
});
