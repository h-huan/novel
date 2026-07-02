/**
 * Preload Script
 * 通过 contextBridge 安全暴露 IPC API 给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';

// 平台信息
const platformInfo = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
};

// 允许的 IPC 调用通道 (invoke/handle)
const INVOKE_CHANNELS = [
  'get-platform-info',
  'read-file',
  'write-file',
  'create-project-dir',
  'list-projects',
  'save-project-config',
  'get-app-path',
  'open-external',
  'show-save-dialog',
  'show-open-dialog',
  'get-file-info',
  'delete-file',
  'list-directory',
  'exists-path',
  'mkdir-path',
  'start-server',
  'stop-server',
  'open-project',
  'close-project',
];

// 允许的 IPC 监听通道 (on/send)
const LISTENER_CHANNELS = [
  'auto-save',
  'app-update',
  'server-status',
  'project-changed',
  'chapter-locked',
  'foreshadowing-alert',
  'conflict-detected',
];

contextBridge.exposeInMainWorld('electronAPI', {
  // 平台信息
  platform: platformInfo.platform,
  versions: platformInfo.versions,

  // IPC 调用
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (INVOKE_CHANNELS.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Channel "${channel}" is not allowed`));
  },

  // IPC 监听
  on: (channel: string, callback: (...args: unknown[]) => void): void => {
    if (LISTENER_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args));
    }
  },

  // 移除监听
  removeAllListeners: (channel: string): void => {
    ipcRenderer.removeAllListeners(channel);
  },
});
