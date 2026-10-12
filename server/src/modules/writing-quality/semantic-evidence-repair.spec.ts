import { describe, expect, it } from 'vitest';
import { applySemanticEvidenceRepairs } from './semantic-evidence-repair';
import { verifySemanticEvidence, resolveExactCausalBasisSource } from './quality-issue';
import { createRequire } from 'node:module';
import { WritingQualityService } from './writing-quality.service';
import { causalEvidenceAnchors, causalEvidenceAnchorOptions } from './causal-review';

const body = '她把报纸交出去。\n\n复核处派人送来暂缓通知。';
const sources = { chapter_plan: '发行员送报到复核处。' };
const issue = { issueType: 'causality_gap', severity: 'low', summary: '传播缺口', evidence: '拼接引用',
  basisSource: 'chapter_plan', basisEvidence: '不在计划', basisReason: '尚未交代发行员向复核处送报。' };

describe('manual review citation repair', () => {
  it('completes omitted causal source and reasoning from real structured values without changing the verdict', () => {
    const content = JSON.stringify({ chapters: [{ content: '她仍在屋内。' }, { content: '他锁门后从楼道带她出来。' }] });
    const original = { ruleId: 'logic.exit_path', evidenceKind: 'causal_gap', severity: 'medium', message: '撤离顺序缺少交代', evidence: '错误拼接' };
    const [fixed] = applySemanticEvidenceRepairs([original], [0], { repairs: [{ index: 0, evidenceAnchorId: 'body:v2', basisAnchorId: 'body:v1', basisReason: '前段仍在屋内，后段直接出现在楼道，缺少离开过程' }] }, content, { body: content });
    expect(fixed).toMatchObject({ message: original.message, severity: 'medium', basisSource: 'body', basisEvidence: '她仍在屋内。', evidence: '他锁门后从楼道带她出来。' });
    expect(verifySemanticEvidence(fixed, content, { body: content }).verified).toBe(true);
    expect(causalEvidenceAnchors(content, {}).every(anchor => content.includes(anchor.text))).toBe(true);
    expect(causalEvidenceAnchorOptions(content, {}).map(anchor => anchor.id)).toEqual(['body:v1', 'body:v2']);
    const [missing] = applySemanticEvidenceRepairs([original], [0], { repairs: [{ index: 0, evidenceAnchorId: 'body:v2', basisAnchorId: 'body:v99' }] }, content, { body: content });
    expect(verifySemanticEvidence(missing, content, { body: content }).verified).toBe(false);
  });
  it('corrects an exact causal quote address, refusing invented, ambiguous or reveal-plan replacements', () => {
    const original = { evidenceKind: 'causal_gap', basisSource: 'chapter_plan', basisEvidence: '他被引到门外。', severity: 'blocking', message: '空间状态矛盾' };
    const sources = { body: '他被引到门外。随后被锁在屋内。', project_context: '送餐人员需要当单授权。', chapter_plan: '[]' };
    expect(resolveExactCausalBasisSource(original, sources)).toEqual({ ...original, basisSource: 'body' });
    expect(resolveExactCausalBasisSource(original, { ...sources, project_context: sources.body })).toBe(original);
    const invented = { ...original, basisEvidence: '凭空出现的授权' };
    expect(resolveExactCausalBasisSource(invented, sources)).toBe(invented);
    const premature = { ...original, evidenceKind: 'premature_reveal' };
    expect(resolveExactCausalBasisSource(premature, sources)).toBe(premature);
  });
  it('resolves exact paragraphs while retaining verdict and source', () => {
    const [fixed] = applySemanticEvidenceRepairs([issue], [0], { repairs: [
      { index: 0, evidenceAnchorId: 'body:p2', basisAnchorId: 'chapter_plan:p1' },
    ] }, body, sources);
    expect(fixed).toMatchObject({ ...issue, evidence: '复核处派人送来暂缓通知。', basisEvidence: sources.chapter_plan });
    expect(verifySemanticEvidence(fixed, body, sources).verified).toBe(true);
  });
  it('invalid IDs and substituted source remain unverified', () => {
    for (const basisAnchorId of ['body:p1', 'chapter_plan:p9']) {
      const [fixed] = applySemanticEvidenceRepairs([issue], [0], { repairs: [
        { index: 0, evidenceAnchorId: 'body:p2', basisAnchorId, severity: 'info', basisSource: 'body' },
      ] }, body, sources);
      expect(fixed.severity).toBe('low');
      expect(fixed.basisSource).toBe('chapter_plan');
      expect(verifySemanticEvidence(fixed, body, sources).verified).toBe(false);
    }
  });
  it('cannot drop issues, alter unaffected evidence or overwrite membership', () => {
    const issues = [issue, { evidence: '她把报纸交出去。' }];
    for (const repairs of [[], [{ index: 1 }], [{ index: 0 }, { index: 0 }]]) {
      expect(applySemanticEvidenceRepairs(issues, [0], { repairs }, body, sources)).toBe(issues);
    }
    const fixed = applySemanticEvidenceRepairs(issues, [0], { repairs: [{ index: 0, evidenceAnchorId: 'body:p2' }] }, body, sources);
    expect(fixed).toHaveLength(2);
    expect(fixed[1]).toBe(issues[1]);
  });
  it('service performs one bounded correction, retaining failure for invalid IDs', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('CREATE TABLE chapters(id TEXT, project_id TEXT, chapter_index INTEGER, content TEXT)');
    try {
      for (const evidenceAnchorId of ['body:p1', 'body:p900']) {
        let calls = 0;
        const service: any = new WritingQualityService({ getDb: () => db } as any);
        service.realLLM = { generate: async (request: any) => {
          calls++;
          if (calls === 1) return { content: JSON.stringify({ overallScore: 72,
            causalAudit: { status: 'not_applicable', reason: '这段测试文本没有声称关键事态改变', transitions: [] },
            issues: [{ issueType: 'pacing_risk', severity: 'low', summary: '节奏建议', evidence: '改写了的引用' }],
          }) };
          expect(request.metrics.stepKey).toBe('quality_issue_evidence_contract');
          return { content: JSON.stringify({ repairs: [{ index: 0, evidenceAnchorId }] }) };
        } };
        const { result } = await service.callQualityLLM(body, '标题', {}, { chapterId: 'ch' }, 'p');
        expect(calls).toBe(2);
        expect(result.overallScore).toBe(72);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].severity).toBe('low');
        expect(result.evidenceValidation.unverifiedIssues.filter((row: any) => row.index >= 0))
          .toHaveLength(evidenceAnchorId === 'body:p1' ? 0 : 1);
        if (evidenceAnchorId !== 'body:p1') expect(result.evidenceValidation.status).toBe('not_evaluated');
      }
    } finally { db.close(); }
  });
});
