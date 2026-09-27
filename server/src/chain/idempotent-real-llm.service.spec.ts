import { createRequire } from 'node:module';
import * as crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { IdempotentRealLLMService } from './idempotent-real-llm.service';
import { compileContext } from '../modules/generation-metrics/context-compiler';
import { qualityStage } from '../routing/scenario-taxonomy';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { getPlatform, targetForLength } from './platform-benchmarks';
import { CHAPTER_WORD_RANGE } from '../../shared/src';
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY,type TEXT,settings TEXT);
    CREATE TABLE generation_runs(
      id TEXT PRIMARY KEY,project_id TEXT,stage TEXT,scenario TEXT,status TEXT,
      constitution_revision INTEGER,context_version TEXT,prompt_version TEXT,
      chapter_index INTEGER,output_text TEXT,model TEXT,finished_at TEXT
    );
  `);
  const constitution = {
    schemaVersion: 1,
    revision: 1,
    projectType: 'short_story',
    targetPlatform: 'custom',
    targetWords: 12000,
    platformRules: targetForLength(getPlatform('custom'), 'short_story'),
    category: '悬疑',
    storyTone: ['紧张'],
    writingStyle: ['简洁'],
    webNovelGenre: ['悬疑推理'],
    submissionTags: ['悬疑'],
    plotTags: ['调查'],
    genreFitNote: '通过持续调查与反转兑现悬疑预期',
    pov: '第三人称限知',
    targetAudience: '悬疑读者',
    customPlatformNote: '每章3000至5000字，快速进入核心事件，章尾保留追读钩子。',
    chapterWordRange: { ...CHAPTER_WORD_RANGE },
    confirmedStory: { title: '失踪档案', coreConflict: '档案每天增加一名不存在的失踪者' },
  };
  db.prepare('INSERT INTO projects VALUES (?,?,?)').run('p', 'short_story', JSON.stringify({ creativeConstitution: constitution }));
  return { db, constitution };
}

describe('IdempotentRealLLMService', () => {
  it('returns an exact successful creation-stage run without another model call', async () => {
    const { db, constitution } = fixture();
    try {
      const router = {
        getModelForScenario: () => ({ modelName: 'test-model', modelVersion: 'v1' }),
      } as any;
      const database = { getDb: () => db } as any;
      const metrics = {} as any;
      const service = new IdempotentRealLLMService(router, metrics, database, router);
      const request: any = {
        prompt: '生成世界观JSON',
        systemPrompt: '只输出JSON',
        scenario: 'world_building',
        temperature: 0.2,
        responseFormat: 'json_object',
        deferQualityGate: true,
        metrics: { projectId: 'p', stepKey: 'world_foundation' },
      };
      const stage = qualityStage(request.scenario, request.metrics.stepKey);
      const context = compileContext(db, { projectId: 'p', stage, chapterIndex: null });
      const standards = standardDirectiveCache.snapshot(request.scenario, true, request.metrics.stepKey);
      const requestFingerprint = digest(JSON.stringify({
        prompt: request.prompt,
        systemPrompt: request.systemPrompt,
        scenario: request.scenario,
        stepKey: request.metrics.stepKey,
        model: 'test-model@v1',
        temperature: request.temperature,
        maxTokens: null,
        responseFormat: request.responseFormat,
        evaluationUnit: 'chapter',
        injectStandard: true,
      }));
      const systemPrompt = `${request.systemPrompt}\n【内部运行恢复指纹】${requestFingerprint}；仅用于幂等恢复，禁止在输出中复述。`;
      const promptVersion = digest(systemPrompt + JSON.stringify(constitution) + standards.digest);
      db.prepare(`INSERT INTO generation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'run-1','p',stage,'world_building','success',1,context.version,promptVersion,null,
        '{"world":"cached"}','test-model','2026-09-27T00:00:00.000Z',
      );

      const response = await service.generate(request);
      expect(response.content).toBe('{"world":"cached"}');
      expect(response.finishReason).toBe('cached_successful_stage');
      expect(response.latency).toBe(0);
    } finally { db.close(); }
  });
});
