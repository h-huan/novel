import { describe, expect, it } from 'vitest';
import { generationRecoveryUiState, type GenerationRecoveryAudit } from './generationRecovery';

const audit = (overrides: Partial<GenerationRecoveryAudit> = {}): GenerationRecoveryAudit => ({
  status: 'creating',
  canResume: false,
  running: false,
  recommendedAction: '',
  missingModules: [],
  consistencyIssues: [],
  protectionReasons: [],
  ...overrides,
});

describe('generationRecoveryUiState', () => {
  it('shows progress instead of starting a second recovery while creation is running', () => {
    expect(generationRecoveryUiState('creating', audit({ running: true, canResume: true }))).toMatchObject({
      running: true,
      recoverable: false,
      statusLabel: '资料生成中 · 查看进度',
      actionLabel: '查看进度',
    });
  });

  it('exposes recovery when a project is stranded in creating but the server says it can resume', () => {
    expect(generationRecoveryUiState('creating', audit({ running: false, canResume: true }))).toMatchObject({
      running: false,
      recoverable: true,
      blocked: false,
      statusLabel: '生成中断 · 可恢复',
      actionLabel: '恢复生成',
    });
  });

  it('exposes recovery for generation_failed only when the audit allows it', () => {
    expect(generationRecoveryUiState('generation_failed', audit({ status: 'generation_failed', canResume: true }))).toMatchObject({
      recoverable: true,
      blocked: false,
      statusLabel: '生成失败 · 可恢复',
    });
    expect(generationRecoveryUiState('generation_failed', audit({ status: 'generation_failed', canResume: false }))).toMatchObject({
      recoverable: false,
      blocked: true,
      statusLabel: '生成失败 · 需查看诊断',
      actionLabel: null,
    });
  });

  it('does not turn a normal active project into a recovery candidate', () => {
    expect(generationRecoveryUiState('active', audit({ status: 'active', canResume: true }))).toEqual({
      tracked: false,
      running: false,
      recoverable: false,
      blocked: false,
      statusLabel: '可继续创作',
      actionLabel: null,
    });
  });
});
