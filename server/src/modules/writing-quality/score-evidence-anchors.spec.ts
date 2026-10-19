import { expect, it } from 'vitest';
import { scoreEvidenceAnchors, selectedScoreEvidence, renderScoreEvidenceAnchors } from './score-evidence-anchors';

it('selects exact original text and UTF-16 positions without retranscription', () => {
  const content='🙂他问：“你真想好了？我等你答复。”\n\n“走吧，门开着。”';
  const anchors=scoreEvidenceAnchors(content);
  expect(anchors).toHaveLength(2);
  for (const anchor of anchors) expect(content.slice(anchor.start,anchor.end)).toBe(anchor.quote);
  expect(selectedScoreEvidence(content,{evidenceIds:[anchors[1].id]})).toEqual(['“走吧，门开着。”']);
  expect(renderScoreEvidenceAnchors(content)).toContain(anchors[0].id);
});
it('rejects unknown IDs, stale content IDs, empty and mixed invalid IDs without falling back to quotes',()=>{
  const content='“走吧，门开着。”',id=scoreEvidenceAnchors(content)[0].id;
  for(const evidenceIds of [[],['missing'],[id,'missing'],[42],null])
    expect(selectedScoreEvidence(content,{evidenceIds,evidence:[content]})).toEqual([]);
  expect(selectedScoreEvidence(content+' ',{evidenceIds:[id]})).toEqual([]);
});
it('does not guess typographical corrections or rewrite legacy quotations',()=>{
  const quote='“走吧，车开着。”';
  expect(selectedScoreEvidence('“走吧，门开着。”',{evidence:[quote]})).toEqual([quote]);
  expect(selectedScoreEvidence('原文',{})).toEqual([]);
});
it('keeps repeated lines distinct by position and collapses only repeated selected IDs',()=>{
  const content='他没回答。\n他没回答。',anchors=scoreEvidenceAnchors(content);
  expect(anchors[0].id).not.toBe(anchors[1].id);
  expect(selectedScoreEvidence(content,{evidenceIds:[anchors[1].id,anchors[1].id]})).toEqual(['他没回答。']);
});
