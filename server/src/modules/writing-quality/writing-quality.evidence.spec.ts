import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { resolveQualityEvidence, verifySemanticEvidence, qualityIssue, qualityGate } from './quality-issue';
import { WritingQualityService } from './writing-quality.service';
import { parseStageScore, SCORE_DIMENSIONS } from './stage-score';
import { readConstitution } from '../project/creative-constitution';
import { dimensionBasis } from '../../test/quality-review.fixture';
import { up as initSchema } from '../../database/migrations/001_initial';

const constitution = readConstitution({ target_platform: 'fanqie', settings: {
  category: '悬疑', storyTone: ['压抑'], writingStyle: ['白描/朴素'], webNovelGenre: ['都市'], genreFitNote: '现实城市职业与人际冲突推动人物选择', pov: '第一人称',
} });
const dimensions = (content: string) => Object.fromEntries(SCORE_DIMENSIONS.map(key => [key, {
  score: 95, reason: '有依据的测试结论', evidence: [content], basis: dimensionBasis(constitution, key),
}]));

describe('QLT-003 evidence execution', () => {
  it('statistical probes reach review but do not change score; actual platform penalties remain', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys=OFF;'); initSchema(db);
    const text = '她把清样递过去，老周看了签名才点头。';
    db.prepare('INSERT INTO chapters(id,project_id,chapter_index,title,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('ch', 'p', 1, '标题', text, 'draft', 'now', 'now');
    try {
      const scores: number[] = [];
      for (const statisticalRisk of [0, 100]) {
        const service: any = new WritingQualityService({ getDb: () => db } as any);
        service.realLLM = {};
        service.qualityInspection = { detectAiFingerprints: () => ({ overallScore: statisticalRisk }) };
        service.buildProjectContext = () => ({ project: { creativeConstitution: constitution, tagProfile: {} } });
        service.buildPlatformReview = () => ({ rows: [], measurements: {} });
        service.callQualityLLM = async (...args: any[]) => {
          expect(args[5]).toEqual({ overallScore: statisticalRisk });
          return { result: { overallScore: 95, summary: '已核对实际正文', issues: [],
            evidenceValidation: { status: 'evaluated', unverifiedIssues: [] },
          } };
        };
        const result = await service.runChapterQualityAnalysis('p', { chapterId: 'ch' });
        scores.push(result.report.overallScore);
        const payload = JSON.parse(db.prepare('SELECT payload FROM writing_quality_reports WHERE id=?').get(result.report.id).payload);
        expect(payload.fingerprintEvaluation).toEqual({ role: 'semantic_review_probe', scorePenalty: 0 });
      }
      expect(scores[0]).toBe(scores[1]);
      const service: any = new WritingQualityService({ getDb: () => db } as any);
      service.realLLM = {};
      service.buildProjectContext = () => ({ project: { creativeConstitution: constitution, tagProfile: {} } });
      service.callQualityLLM = async () => ({ result: { overallScore: 95, summary: '已核对实际正文', issues: [], evidenceValidation: { status: 'evaluated', unverifiedIssues: [] } } });
      service.buildPlatformReview = () => ({ rows: [{ issueType: 'platform_chapter_length', severity: 'high', title: '真实篇幅不足', summary: '真实篇幅不足', evidence: text }], measurements: {} });
      const actualPenalty = await service.runChapterQualityAnalysis('p', { chapterId: 'ch' });
      expect(actualPenalty.report.overallScore).toBe(scores[0] - 4);
      expect(actualPenalty.issues.some((issue: any) => issue.issueType === 'platform_chapter_length')).toBe(true);
    } finally { db.close(); }
  });
  it('does not deduct a deterministic hardline penalty for ordinary repeated-prefix lists',async()=>{
    const {DatabaseSync}=createRequire(import.meta.url)('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF;');initSchema(db);
    const content='他截了三张图，一张评价总页，一张倒计时，一张账号信息。';
    db.prepare('INSERT INTO chapters(id,project_id,chapter_index,title,content,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').run('ch','p',1,'标题',content,'draft','now','now');
    try {const service:any=new WritingQualityService({getDb:()=>db} as any);service.realLLM={};service.buildProjectContext=()=>({project:{creativeConstitution:constitution,tagProfile:{}}});service.buildPlatformReview=()=>({rows:[],measurements:{}});
      service.callQualityLLM=async()=>({result:{overallScore:95,summary:'已确认是有用途的截图清单',issues:[],evidenceValidation:{status:'evaluated',unverifiedIssues:[]}}});
      const result=await service.runChapterQualityAnalysis('p',{chapterId:'ch'});expect(result.report.overallScore).toBe(95);expect(result.issues.some((x:any)=>String(x.issueType).includes('53-same'))).toBe(false);
    } finally {db.close();}
  });
  it('表面信号不被报告为真实读完率，也不声称语义冲突缺失', () => {
    const service: any = new WritingQualityService({} as any);
    const attention = service.buildAttentionAnalysis({ title: '铅字盘说未婚夫杀人', intro: '',
      content: '她从版框里取出弟弟惯用的铅条。'.repeat(100), mode: 'short_story' });
    expect(attention.completionRate).toBeNull();
    expect(attention.evidenceBasis).toBe('surface_signals');
    expect(attention.limitation).toContain('不能预测读完率');
    expect(attention.reasons.join('')).not.toContain('缺少新的疑点');
  });

  it('注意力附加检查不能覆盖已有语义质检分数、等级与结论', () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE writing_quality_reports(id TEXT, project_id TEXT, summary TEXT,
        overall_level TEXT, overall_score REAL, payload TEXT, attention_json TEXT, updated_at TEXT);
        INSERT INTO writing_quality_reports VALUES('report','p','语义质检结论','medium',74,'{}','{}','old');`);
      const service: any = new WritingQualityService({} as any);
      const attention = service.buildAttentionAnalysis({ title: '标题', intro: '', content: '她关上门。', mode: 'short' });
      service.persistAttentionReport(db, 'p', { reportId: 'report' }, { title: '标题', chapterId: 'ch', attention, chapterLocked: false });
      const row = db.prepare('SELECT * FROM writing_quality_reports').get();
      expect(row).toMatchObject({ overall_score: 74, overall_level: 'medium', summary: '语义质检结论' });
      expect(JSON.parse(row.attention_json).completionRate).toBeNull();
    } finally { db.close(); }
  });

  it('computes UTF-16 coordinates and restores only source whitespace', () => {
    const content = '😀前言\n\n他关了灯。\n\n门外有人。';
    const evidence = resolveQualityEvidence(content, '他关了灯。\n门外有人。');
    expect(evidence).toMatchObject({ verified: true, unique: true, start: content.indexOf('他'), end: content.length });
    expect(content.slice(evidence.start!, evidence.end!)).toBe(evidence.quote);
    expect(resolveQualityEvidence(content, '他关了灯。……门外有人。').verified).toBe(false);
    expect(resolveQualityEvidence(content, '他关了灯。/门外有人。').verified).toBe(false);
    expect(resolveQualityEvidence(content, '他打开灯。').verified).toBe(false);
    expect(resolveQualityEvidence('他说……', '他说……').verified).toBe(true);
  });

  it('retains repeated evidence without inventing a unique repair location', () => {
    expect(resolveQualityEvidence('门关了。门关了。', '门关了。'))
      .toMatchObject({ verified: true, unique: false, start: null, end: null });
  });

  it('does not let a trusted flag override false prose evidence or low severity create a false pass', () => {
    const issue = qualityIssue({ projectId: 'p', stage: 'chapter', source: 'semantic_judge', ruleId: 'prose',
      message: '轻微问题', severity: 'low', quote: '不存在', content: '真实正文', evidenceVerified: true });
    expect(issue.evaluation).toBe('insufficient_evidence');
    expect(qualityGate([issue], true).status).toBe('not_evaluated');
  });

  it('requires paired evidence for an explanation and the actual plan for premature disclosure', () => {
    const content = '两个人一起关了门。他们是在阻止我追问。';
    const claim = { issueType: 'over_explained', evidence: '他们是在阻止我追问。' };
    expect(verifySemanticEvidence(claim, content).verified).toBe(false);
    expect(verifySemanticEvidence({ ...claim, shownEvidence: '两个人一起关了门。', basisReason: '重复解释动作，未新增信息或选择' }, content).verified).toBe(true);
    expect(verifySemanticEvidence({ ...claim, evidenceKind: 'premature_reveal', basisSource: 'project_context',
      basisEvidence: '第三章揭示', basisReason: '提前揭示' }, content, { project_context: '第三章揭示' }).verified).toBe(false);
    expect(verifySemanticEvidence({ ...claim, evidenceKind: 'premature_reveal', basisSource: 'chapter_plan',
      basisEvidence: '第三章揭示', basisReason: '提前揭示' }, content, { chapter_plan: '第三章揭示' }).verified).toBe(true);
  });

  it('never declares complete scores when a low severity semantic claim is unverified', () => {
    const content = '我把钥匙放回桌上。';
    const score = parseStageScore({ dimensions: dimensions(content), issues: [{
      ruleId: 'ai_trace.causal_author_explanation', severity: 'low', message: '解释太多', evidence: content,
    }] }, { projectId: 'p', runId: 'r', stage: 'chapter', content, constitution });
    expect(score.status).toBe('partial');
    expect(score.overallScore).toBeNull();
    expect(score.gateStatus).toBe('not_evaluated');
  });

  it('does not score an unknown definition or shrink the dimension coverage denominator', () => {
    const content = '我把钥匙放回桌上。';
    const raw = dimensions(content);
    raw.genre.basis = { status: 'unknown_definition', criterion: '', reason: '未提供流派操作定义' };
    const score = parseStageScore({ dimensions: raw, issues: [] }, { projectId: 'p', runId: 'r', stage: 'chapter', content, constitution });
    expect(score.dimensions.genre.status).toBe('not_evaluated');
    expect(score.dimensions.genre.score).toBeNull();
    expect(score.coverage).toBeLessThan(1);
    expect(score.overallScore).toBeNull();
    const undefinedGenre = { ...constitution, genreFitNote: '', webNovelGenre: ['未定义的流派'] };
    const invented = parseStageScore({ dimensions: dimensions(content), issues: [] }, { projectId: 'p', runId: 'r', stage: 'chapter', content, constitution: undefinedGenre });
    expect(invented.dimensions.genre.score).toBeNull();
    expect(invented.overallScore).toBeNull();
  });

  it('normalizes model coordinates, rejects stitched quotes and invalid tag criteria', () => {
    const service: any = new WritingQualityService({} as any);
    const content = '😀开头\n\n我收起钥匙。\n\n他关上门。';
    const result: any = { issues: [
      { issueType: 'pacing_risk', evidence: '我收起钥匙。\n他关上门。', originalText: '他关上门。', startOffset: 999, endOffset: 1000 },
      { issueType: 'pacing_risk', evidence: '我收起钥匙。/他关上门。' },
    ], tagFit: { style: 99 }, tagFitEvidence: { style: '他关上门。' },
      tagFitBasis: { style: { status: 'evaluated', criterion: '不可追溯的模型自定义标准', reason: '符合' } } };
    service.normalizeReviewEvidence(result, content, {}, { style: '动作承载情绪' });
    expect(result.issues[0].startOffset).toBe(content.indexOf('我'));
    expect(content.slice(result.issues[0].startOffset, result.issues[0].endOffset)).toBe(result.issues[0].evidence);
    expect(result.issues[1].evidenceVerified).toBe(false);
    expect(result.evidenceValidation.status).toBe('not_evaluated');
    expect(result.tagFit.style).toBeUndefined();
    const invented: any = { issues: [], tagFit: { genre: 99 }, tagFitEvidence: { genre: '他关上门。' },
      tagFitBasis: { genre: { status: 'evaluated', criterion: '按该流派执行', reason: '模型自行解释该流派' } } };
    service.normalizeReviewEvidence(invented, content, {}, { genre: '按该流派执行' }, { genre: 'unknown_definition' });
    expect(invented.tagFit.genre).toBeUndefined();
    expect(invented.tagFitBasis.genre.status).toBe('unknown_definition');
  });

  it('permits deletion of a redundant explanation but rejects unsupported old fallback suggestions', async () => {
    const service: any = new WritingQualityService({} as any);
    const text = '他关上门。他不想让我进来。';
    const issue = { evidence: text, project_id: 'p', issue_type: 'over_explained' };
    service.realLLM = { generate: async () => ({ content: JSON.stringify({ beforeText: '他不想让我进来。', afterText: '', remainingRisk: 'none' }) }) };
    expect((await service.callRefineLLM(issue, text, text)).afterText).toBe('');
    service.realLLM = { generate: async () => ({ content: JSON.stringify({ beforeText: text, afterText: '改变整个场景。' }) }) };
    await expect(service.callRefineLLM({ ...issue, evidence: '他不想让我进来。' }, text, text)).rejects.toThrow('不属于问题证据范围');
    service.realLLM = { generate: async () => ({ content: 'invalid' }) };
    await expect(service.callRefineLLM({ ...issue, suggested_text: '旧建议' }, text, text)).rejects.toThrow('精修未完成');
  });

  it('preserves the old persisted report when the new semantic review is unverified', async () => {
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`CREATE TABLE chapters(id TEXT, project_id TEXT, title TEXT, content TEXT, status TEXT);
        CREATE TABLE writing_quality_reports(id TEXT, chapter_id TEXT, status TEXT);
        INSERT INTO chapters VALUES('ch','p','标题','我把钥匙放回桌上。','draft');
        INSERT INTO writing_quality_reports VALUES('old','ch','open');`);
      const service: any = new WritingQualityService({ getDb: () => db } as any);
      service.realLLM = {};
      service.buildProjectContext = () => ({});
      service.buildPlatformReview = () => ({ rows: [], measurements: {} });
      service.callQualityLLM = async () => ({ result: { overallScore: 99, issues: [],
        evidenceValidation: { status: 'not_evaluated', unverifiedIssues: [{ index: 0, reasons: ['拼接引文'] }] } } });
      const supersede = vi.spyOn(service, 'supersedeChapterReports');
      await expect(service.runChapterQualityAnalysis('p', { chapterId: 'ch' })).rejects.toThrow('保留旧报告');
      expect(supersede).not.toHaveBeenCalled();
      expect(db.prepare('SELECT status FROM writing_quality_reports WHERE id=?').get('old').status).toBe('open');
      expect(db.prepare('SELECT content FROM chapters WHERE id=?').get('ch').content).toBe('我把钥匙放回桌上。');
    } finally { db.close(); }
  });

  it('rechecks the full current chapter and cannot pass without current evidence', async () => {
    const service: any = new WritingQualityService({} as any);
    const fullContent = '旧场景。'.repeat(900) + '末尾保留新的线索。';
    service.realLLM = { generate: async (request: any) => {
      expect(request.prompt).toContain('末尾保留新的线索。');
      return { content: JSON.stringify({ pass: true, level: 'pass', remainingIssues: 0, newIssues: 0,
        summary: '有证据修复', evidence: '末尾保留新的线索。', basisReason: '新线索与必要因果保持' }) };
    } };
    expect((await service.callRecheckLLM({ title: '问题' }, '', fullContent)).pass).toBe(true);
    service.realLLM = { generate: async () => ({ content: JSON.stringify({ pass: true, level: 'pass', remainingIssues: 0, newIssues: 0, summary: '无证据通过' }) }) };
    await expect(service.callRecheckLLM({ title: '问题' }, '', fullContent)).rejects.toThrow('复检未评估');
  });
});

describe('persisted report evidence projection', () => {
  it('retains a verified result and exact stored coordinates without upgrading unknown legacy evidence', () => {
    const service:any=new WritingQualityService({} as any);
    const quote='她把钥匙交给门卫。';
    const row={id:'i',project_id:'p',chapter_id:'ch',report_id:'r',issue_type:'over_explained',severity:'low',status:'open',summary:'重复说明',evidence:quote,original_text:quote,start_offset:12,end_offset:12+quote.length,tags:'[]',navigation_json:JSON.stringify({target:'writing',label:'定位',path:'/writing',context:{}}),payload:JSON.stringify({evidenceVerified:true})};
    expect(service.issueRowToResponse(row).qualityIssue).toMatchObject({evaluation:'evidenced',evidence:{verified:true,start:12,end:12+quote.length}});
    for(const payload of ['{}',JSON.stringify({evidenceVerified:false}),JSON.stringify({evidenceVerified:'true'})]){
      expect(service.issueRowToResponse({...row,payload}).qualityIssue).toMatchObject({evaluation:'insufficient_evidence',evidence:{verified:false,start:null,end:null}});
    }
    expect(service.issueRowToResponse({...row,end_offset:999}).qualityIssue.evidence).toMatchObject({verified:true,start:null,end:null});
  });
});
