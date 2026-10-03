import { createRequire } from 'node:module';
import * as crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { IdempotentRealLLMService } from './idempotent-real-llm.service';
import { RealLLMService } from './real-llm.service';
import { compileContext } from '../modules/generation-metrics/context-compiler';
import { qualityStage } from '../routing/scenario-taxonomy';
import { standardDirectiveCache } from '../modules/module-standards/standard-directive.cache';
import { readConstitution } from '../modules/project/creative-constitution';
import { getPlatform, targetForLength } from './platform-benchmarks';
import { LLM_TUNABLES } from '../config/llm-tunables';
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
  return { db };
}

function serviceFor(db: any) {
  const router = {
    getModelForScenario: () => ({ modelName: 'test-model', modelVersion: 'v1' }),
    getConfig: () => ({ scenarios: { outline: { maxTokens: 4096 } }, defaults: { maxTokens: 4096 } }),
  } as any;
  return new IdempotentRealLLMService(router, {} as any, { getDb: () => db } as any);
}

function seedCachedRun(
  db: any,
  request: any,
  runId: string,
  output: string,
  finishedAt = '2026-09-27T00:00:00.000Z',
) {
  const scenario = request.scenario;
  const stepKey = request.metrics.stepKey;
  const chapterIndex = request.metrics.chapterIndex != null ? Number(request.metrics.chapterIndex) : null;
  const stage = qualityStage(scenario, stepKey);
  const context = compileContext(db, { projectId: 'p', stage, chapterIndex });
  const contextVersion = String(context.version || digest(''));
  const standards = standardDirectiveCache.snapshot(scenario, request.injectStandard !== false, stepKey);
  const requestFingerprint = digest(JSON.stringify({
    prompt: request.prompt,
    systemPrompt: request.systemPrompt || '',
    scenario,
    stepKey,
    chapterIndex,
    model: 'test-model@v1',
    temperature: request.temperature ?? null,
    maxTokens: request.maxTokens ?? null,
    responseFormat: request.responseFormat || 'text',
    evaluationUnit: request.evaluationUnit || 'chapter',
    injectStandard: request.injectStandard !== false,
  }));
  const fingerprintDirective = `【内部运行恢复指纹】${requestFingerprint}；仅用于幂等恢复，禁止在输出中复述。`;
  const systemPrompt = [request.systemPrompt, fingerprintDirective].filter(Boolean).join('\n');
  const project = db.prepare('SELECT * FROM projects WHERE id=?').get('p') as any;
  const runtimeConstitution = readConstitution(project);
  const promptVersion = digest(systemPrompt + JSON.stringify(runtimeConstitution) + standards.digest);
  db.prepare(`INSERT INTO generation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    runId, 'p', stage, scenario, 'success', runtimeConstitution.revision ?? null, contextVersion, promptVersion,
    chapterIndex, output, 'test-model', finishedAt,
  );
}

describe('IdempotentRealLLMService', () => {
  it('returns the original run id together with an exact cached creation-stage output', async () => {
    const { db } = fixture();
    try {
      const service = serviceFor(db);
      const request: any = {
        prompt: '生成世界观JSON',
        systemPrompt: '只输出JSON',
        scenario: 'world_building',
        temperature: 0.2,
        responseFormat: 'json_object',
        deferQualityGate: true,
        metrics: { projectId: 'p', stepKey: 'world_foundation' },
      };
      seedCachedRun(db, request, 'run-1', '{"world":"cached"}');

      const response = await service.generate(request);
      expect(response.content).toBe('{"world":"cached"}');
      expect(response.finishReason).toBe('cached_successful_stage');
      expect(response.latency).toBe(0);
      expect(response.runId).toBe('run-1');
    } finally { db.close(); }
  });

  it('reuses an identical chapter-scoped planning review but not a changed review', async () => {
    const { db } = fixture();
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockResolvedValue({
      content: '{"consistent":false}', model: 'test-model', latency: 30,
    });
    try {
      const service = serviceFor(db);
      const request: any = {
        prompt: '核对第4章章纲是否违背上层事实',
        systemPrompt: '只输出JSON',
        scenario: 'review',
        temperature: 0.1,
        responseFormat: 'json_object',
        deferQualityGate: true,
        metrics: { projectId: 'p', chapterIndex: 4, stepKey: 'outline_source_review' },
      };
      seedCachedRun(db, request, 'review-4', '{"consistent":true}');

      const cached = await service.generate(request);
      expect(cached.content).toBe('{"consistent":true}');
      expect(cached.runId).toBe('review-4');
      expect(cached.latency).toBe(0);
      expect(superGenerate).not.toHaveBeenCalled();

      const changed = await service.generate({ ...request, prompt: `${request.prompt}\n新增事实已变化` });
      expect(changed.content).toBe('{"consistent":false}');
      expect(superGenerate).toHaveBeenCalledTimes(1);
    } finally {
      superGenerate.mockRestore();
      db.close();
    }
  });

  it('binds a fresh project-scoped response to the exact completed generation run', async () => {
    const { db } = fixture();
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockResolvedValue({
      content: '{"chapter":"fresh"}',
      model: 'test-model',
      latency: 12,
    });
    try {
      db.prepare(`INSERT INTO generation_runs VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        'run-fresh','p','chapter','writing','success',1,'ctx','prompt',1,
        '{"chapter":"fresh"}','test-model','2026-09-27T00:00:01.000Z',
      );
      const service = serviceFor(db);

      const response = await service.generate({
        prompt: '生成正文',
        scenario: 'writing',
        metrics: { projectId: 'p', chapterIndex: 1, stepKey: 'body_first' },
      });

      expect(superGenerate).toHaveBeenCalledTimes(1);
      expect(response.content).toBe('{"chapter":"fresh"}');
      expect(response.runId).toBe('run-fresh');
    } finally {
      superGenerate.mockRestore();
      db.close();
    }
  });

  it('binds structured Canon provenance by the full request/context fingerprint even when output formatting differs', async () => {
    const { db } = fixture();
    const request: any = {
      prompt: '生成世界观JSON',
      scenario: 'world_building',
      deferQualityGate: true,
      metrics: { projectId: 'p', stepKey: 'world_foundation' },
    };
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockImplementation(async () => {
      seedCachedRun(
        db,
        request,
        'world-physical-run',
        '{"world":"persisted-normalized"}',
        new Date(Date.now() + 1000).toISOString(),
      );
      return { content: '{ "world" : "caller-normalized" }', model: 'test-model', latency: 12 } as any;
    });
    try {
      const service = serviceFor(db);
      const response = await service.generate(request);

      expect(superGenerate).toHaveBeenCalledTimes(1);
      expect(response.runId).toBe('world-physical-run');
    } finally {
      superGenerate.mockRestore();
      db.close();
    }
  });

  it('fails closed when more than one identical-fingerprint run finishes inside the physical call', async () => {
    const { db } = fixture();
    const request: any = {
      prompt: '生成世界观JSON',
      scenario: 'world_building',
      deferQualityGate: true,
      metrics: { projectId: 'p', stepKey: 'world_foundation' },
    };
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockImplementation(async () => {
      const finishedAt = new Date(Date.now() + 1000).toISOString();
      seedCachedRun(db, request, 'world-run-a', '{"world":"a"}', finishedAt);
      seedCachedRun(db, request, 'world-run-b', '{"world":"b"}', finishedAt);
      return { content: '{"world":"unmatched-caller-output"}', model: 'test-model', latency: 12 } as any;
    });
    try {
      const service = serviceFor(db);
      const response = await service.generate(request);

      expect(superGenerate).toHaveBeenCalledTimes(1);
      expect(response.runId).toBeUndefined();
    } finally {
      superGenerate.mockRestore();
      db.close();
    }
  });

  it('does not invent provenance when no completed run matches the fresh output', async () => {
    const { db } = fixture();
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate').mockResolvedValue({
      content: '{"chapter":"untracked"}',
      model: 'test-model',
      latency: 12,
    });
    try {
      const service = serviceFor(db);
      const response = await service.generate({
        prompt: '生成正文',
        scenario: 'writing',
        metrics: { projectId: 'p', chapterIndex: 1, stepKey: 'body_first' },
      });

      expect(response.runId).toBeUndefined();
    } finally {
      superGenerate.mockRestore();
      db.close();
    }
  });

  it('re-enters the same configured provider call after an exhausted transient socket failure', async () => {
    const { db } = fixture();
    const oldRetries = LLM_TUNABLES.NETWORK_RECOVERY_RETRIES;
    const oldDelay = LLM_TUNABLES.NETWORK_RECOVERY_DELAY_MS;
    (LLM_TUNABLES as any).NETWORK_RECOVERY_RETRIES = 1;
    (LLM_TUNABLES as any).NETWORK_RECOVERY_DELAY_MS = 0;
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockRejectedValueOnce(new Error('DeepSeek 网络连接失败(UND_ERR_SOCKET): other side closed'))
      .mockResolvedValue({ content: '{"consistent":true}', model: 'test-model', latency: 20 });
    try {
      const service = serviceFor(db);
      const response = await service.generate({
        prompt: '复核大纲来源事实',
        scenario: 'review',
        responseFormat: 'json_object',
        deferQualityGate: true,
        metrics: { projectId: 'p', stepKey: 'outline_source_review' },
      });

      expect(superGenerate).toHaveBeenCalledTimes(2);
      expect(response.content).toBe('{"consistent":true}');
    } finally {
      superGenerate.mockRestore();
      (LLM_TUNABLES as any).NETWORK_RECOVERY_RETRIES = oldRetries;
      (LLM_TUNABLES as any).NETWORK_RECOVERY_DELAY_MS = oldDelay;
      db.close();
    }
  });

  it('does not retry non-network model failures at the provider boundary', async () => {
    const { db } = fixture();
    const oldRetries = LLM_TUNABLES.NETWORK_RECOVERY_RETRIES;
    const oldDelay = LLM_TUNABLES.NETWORK_RECOVERY_DELAY_MS;
    (LLM_TUNABLES as any).NETWORK_RECOVERY_RETRIES = 1;
    (LLM_TUNABLES as any).NETWORK_RECOVERY_DELAY_MS = 0;
    const superGenerate = vi.spyOn(RealLLMService.prototype, 'generate')
      .mockRejectedValue(new Error('DeepSeek API error: 400 invalid_request_error'));
    try {
      const service = serviceFor(db);
      await expect(service.generate({
        prompt: '复核大纲来源事实',
        scenario: 'review',
        responseFormat: 'json_object',
        deferQualityGate: true,
        metrics: { projectId: 'p', stepKey: 'outline_source_review' },
      })).rejects.toThrow(/400 invalid_request_error/);

      expect(superGenerate).toHaveBeenCalledTimes(1);
    } finally {
      superGenerate.mockRestore();
      (LLM_TUNABLES as any).NETWORK_RECOVERY_RETRIES = oldRetries;
      (LLM_TUNABLES as any).NETWORK_RECOVERY_DELAY_MS = oldDelay;
      db.close();
    }
  });

  it('physically blocks the historical automatic whole-chapter alignment rewrite', async () => {
    const { db } = fixture();
    try {
      const service = serviceFor(db);
      await expect(service.generate({
        prompt: '根据评审结论重写整章',
        scenario: 'writing_climax',
        metrics: { projectId: 'p', chapterIndex: 1, stepKey: 'body_alignment_repair' },
      })).rejects.toThrow(/自动整章.*禁用/);
    } finally { db.close(); }
  });
});
