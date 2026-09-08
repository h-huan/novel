import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getBaseUrl, initializeApiBaseUrl } from '../lib/api';

type ServerStatus = 'online' | 'offline' | 'connecting';
type AutoSaveStatus = 'saved' | 'saving' | 'error' | 'idle';

interface AppState {
  sidebarCollapsed: boolean;
  serverStatus: ServerStatus;
  autoSaveStatus: AutoSaveStatus;
  serverError: string | null;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setServerStatus: (status: ServerStatus) => void;
  setAutoSaveStatus: (status: AutoSaveStatus) => void;
  setServerError: (error: string | null) => void;
  checkServerHealth: () => Promise<void>;
  startHealthPolling: () => void;
  stopHealthPolling: () => void;
}

let healthPollInterval: ReturnType<typeof setInterval> | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      serverStatus: 'connecting',
      autoSaveStatus: 'idle',
      serverError: null,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      setServerStatus: (status) => set({ serverStatus: status, serverError: status === 'online' ? null : get().serverError }),

      setAutoSaveStatus: (status) => set({ autoSaveStatus: status }),

      setServerError: (error) => set({ serverError: error }),

      checkServerHealth: async () => {
        try {
          await initializeApiBaseUrl();
          const baseUrl = getBaseUrl();
          const res = await fetch(`${baseUrl}/health`);
          if (res.ok) {
            set({ serverStatus: 'online', serverError: null });
          } else {
            set({ serverStatus: 'offline', serverError: `HTTP ${res.status}` });
          }
        } catch {
          set({ serverStatus: 'offline', serverError: '服务器未启动' });
        }
      },

      startHealthPolling: () => {
        if (healthPollInterval) clearInterval(healthPollInterval);
        const initialize = async () => {
          await get().checkServerHealth();
        };
        void initialize();
        healthPollInterval = setInterval(() => {
          get().checkServerHealth();
        }, 5000);
      },

      stopHealthPolling: () => {
        if (healthPollInterval) clearInterval(healthPollInterval);
        healthPollInterval = null;
      },
    }),
    {
      name: 'app-store',
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
