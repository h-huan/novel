import { api } from './api';

export interface GenerationRecoveryAudit {
  status: string;
  canResume: boolean;
  running: boolean;
  recommendedAction: string;
  missingModules: string[];
  consistencyIssues: string[];
  protectionReasons: string[];
}

export interface GenerationRecoveryUiState {
  tracked: boolean;
  running: boolean;
  recoverable: boolean;
  blocked: boolean;
  statusLabel: string;
  actionLabel: string | null;
}

/**
 * One UI interpretation for incomplete project creation.
 *
 * A project can be stranded in `creating` after the background worker has already
 * stopped. Treating only `generation_failed` as recoverable hid the existing
 * recovery endpoint from exactly that state. The server audit remains authoritative:
 * - running=true -> observe progress, never start a second recovery;
 * - canResume=true + not running -> recovery action is available;
 * - generation_failed + canResume=false -> show the failure but do not send a
 *   recovery request that the backend has already said is unsafe.
 */
export function generationRecoveryUiState(
  projectStatus: string | null | undefined,
  audit: GenerationRecoveryAudit | null | undefined,
): GenerationRecoveryUiState {
  const status = String(projectStatus || audit?.status || '');
  const tracked = status === 'creating' || status === 'generation_failed';
  const running = tracked && audit?.running === true;
  const recoverable = tracked && !running && audit?.canResume === true;
  const blocked = status === 'generation_failed' && !running && !recoverable;

  if (running) {
    return {
      tracked,
      running: true,
      recoverable: false,
      blocked: false,
      statusLabel: '资料生成中 · 查看进度',
      actionLabel: '查看进度',
    };
  }
  if (recoverable) {
    return {
      tracked,
      running: false,
      recoverable: true,
      blocked: false,
      statusLabel: status === 'creating' ? '生成中断 · 可恢复' : '生成失败 · 可恢复',
      actionLabel: '恢复生成',
    };
  }
  if (blocked) {
    return {
      tracked,
      running: false,
      recoverable: false,
      blocked: true,
      statusLabel: '生成失败 · 需查看诊断',
      actionLabel: null,
    };
  }
  return {
    tracked,
    running: false,
    recoverable: false,
    blocked: false,
    statusLabel: status === 'creating' ? '资料生成中' : status === 'active' ? '可继续创作' : status,
    actionLabel: null,
  };
}

export async function getGenerationRecovery(projectId: string): Promise<GenerationRecoveryAudit | null> {
  const response: any = await api.get(`/chain/generation-recovery/${projectId}`);
  return (response?.data ?? response)?.audit ?? null;
}

export async function startFailedProjectRecovery(projectId: string): Promise<void> {
  await api.post(`/chain/generation-recovery/${projectId}/resume-start`, {}, 30_000);
}
