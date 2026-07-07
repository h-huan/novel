/**
 * workflowGuardStore - 流程守卫状态管理
 */
import { create } from 'zustand';
import { api } from '../lib/api';

// ========== 类型定义 ==========

export interface StageMapItem {
  key: string;
  label: string;
  status: 'done' | 'current' | 'next' | 'locked' | 'warning';
}

export interface AllowedAction {
  key: string;
  label: string;
  targetRoute?: string;
}

export interface BlockedAction {
  key: string;
  label: string;
  reason: string;
}

export interface AssetItem {
  key: string;
  label: string;
  severity: string;
  reason: string;
}

export interface CompletedAssetItem {
  key: string;
  label: string;
}

export interface WarningItem {
  key: string;
  message: string;
}

export interface WorkflowGuardData {
  projectId: string;
  projectType: string;
  creationSource: string;
  currentStage: string;
  currentStageLabel: string;
  recommendedNextStage: string;
  recommendedNextAction: string;
  progressPercent: number;
  canProceed: boolean;
  allowedActions: AllowedAction[];
  blockedActions: BlockedAction[];
  missingAssets: AssetItem[];
  completedAssets: CompletedAssetItem[];
  warnings: WarningItem[];
  stageMap: StageMapItem[];
}

// ========== Store ==========

interface WorkflowGuardState {
  data: WorkflowGuardData | null;
  loading: boolean;
  error: string | null;
  lastFetched: number;

  fetchGuard: (projectId: string) => Promise<void>;
  checkAction: (projectId: string, action: string) => Promise<{
    allowed: boolean;
    reason: string;
    missingAssets: string[];
    warnings: string[];
    currentStage?: string;
    recommendedNextAction?: string;
  }>;
  advanceStage: (projectId: string, targetStage: string) => Promise<void>;
  clear: () => void;
}

const CACHE_TTL = 30_000; // 30s cache

export const useWorkflowGuardStore = create<WorkflowGuardState>((set, get) => ({
  data: null,
  loading: false,
  error: null,
  lastFetched: 0,

  fetchGuard: async (projectId: string) => {
    // 缓存命中
    const now = Date.now();
    const state = get();
    if (state.data && state.data.projectId === projectId && now - state.lastFetched < CACHE_TTL) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const res = await api.get<WorkflowGuardData>(`/projects/${projectId}/workflow-guard`);
      const data = (res as any).data ?? res;
      set({ data: data as WorkflowGuardData, loading: false, lastFetched: now });
    } catch (err: any) {
      const msg = err.message || '获取流程状态失败';
      set({ loading: false, error: msg });
    }
  },

  checkAction: async (projectId: string, action: string) => {
    try {
      const res = await api.post<any>(`/projects/${projectId}/workflow-guard/check`, { action });
      const result = (res as any).data ?? res;
      return {
        allowed: Boolean(result.allowed),
        reason: result.reason || '',
        missingAssets: result.missingAssets || [],
        warnings: result.warnings || [],
        currentStage: result.currentStage,
        recommendedNextAction: result.recommendedNextAction,
      };
    } catch {
      return {
        allowed: false,
        reason: '流程校验失败，请刷新后重试',
        missingAssets: [],
        warnings: [],
      };
    }
  },

  advanceStage: async (projectId: string, targetStage: string) => {
    set({ loading: true, error: null });
    try {
      await api.post(`/projects/${projectId}/workflow-guard/advance`, { targetStage });
      set({ data: null, loading: false, lastFetched: 0 });
      await get().fetchGuard(projectId);
    } catch (err: any) {
      const msg = err.message || '推进阶段失败';
      set({ loading: false, error: msg });
      throw err;
    }
  },

  clear: () => {
    set({ data: null, loading: false, error: null, lastFetched: 0 });
  },
}));
