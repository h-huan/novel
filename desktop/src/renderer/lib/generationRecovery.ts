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

export async function getGenerationRecovery(projectId: string): Promise<GenerationRecoveryAudit | null> {
  const response: any = await api.get(`/chain/generation-recovery/${projectId}`);
  return (response?.data ?? response)?.audit ?? null;
}

export async function startFailedProjectRecovery(projectId: string): Promise<void> {
  await api.post(`/chain/generation-recovery/${projectId}/resume-start`, {}, 30_000);
}
