/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    platform: string;
    versions: {
      node: string;
      chrome: string;
      electron: string;
    };
    // IPC通信方法将在后续扩展
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
    on: (channel: string, callback: (...args: unknown[]) => void) => void;
    removeAllListeners: (channel: string) => void;
  };
}
