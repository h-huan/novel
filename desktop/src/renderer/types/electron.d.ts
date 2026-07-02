/**
 * Electron 类型声明
 * 扩展 Window 接口，定义 preload 暴露的 IPC API
 */

interface PlatformInfo {
  platform: string;
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

interface DirectoryEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface ElectronAPI {
  /** 当前平台信息 */
  platform: string;
  /** 运行时版本信息 */
  versions: PlatformInfo['versions'];

  // ===== IPC invoke 通道（有精确类型签名） =====

  /** 获取平台信息 */
  invoke(channel: 'get-platform-info'): Promise<PlatformInfo>;
  /** 读取文件内容 */
  invoke(channel: 'read-file', filePath: string): Promise<string>;
  /** 写入文件 */
  invoke(channel: 'write-file', filePath: string, content: string): Promise<void>;
  /** 创建项目目录，返回项目路径 */
  invoke(channel: 'create-project-dir', projectId: string): Promise<string>;
  /** 列出所有项目 */
  invoke(channel: 'list-projects'): Promise<Array<{ id: string; title: string; createdAt: string; updatedAt: string }>>;
  /** 保存项目配置 */
  invoke(channel: 'save-project-config', projectId: string, config: Record<string, unknown>): Promise<void>;
  /** 获取应用路径 */
  invoke(channel: 'get-app-path'): Promise<string>;
  /** 用系统默认方式打开外部链接/文件 */
  invoke(channel: 'open-external', url: string): Promise<void>;
  /** 显示保存文件对话框 */
  invoke(channel: 'show-save-dialog', options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ filePath?: string; canceled: boolean }>;
  /** 显示打开文件对话框 */
  invoke(channel: 'show-open-dialog', options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ filePaths?: string[]; canceled: boolean }>;
  /** 获取文件信息 */
  invoke(channel: 'get-file-info', filePath: string): Promise<FileInfo>;
  /** 删除文件 */
  invoke(channel: 'delete-file', filePath: string): Promise<void>;
  /** 列出目录内容 */
  invoke(channel: 'list-directory', dirPath: string): Promise<DirectoryEntry[]>;
  /** 检查路径是否存在 */
  invoke(channel: 'exists-path', targetPath: string): Promise<boolean>;
  /** 创建目录 */
  invoke(channel: 'mkdir-path', dirPath: string): Promise<void>;
  /** 启动后端服务 */
  invoke(channel: 'start-server'): Promise<{ success: boolean; port?: number }>;
  /** 停止后端服务 */
  invoke(channel: 'stop-server'): Promise<{ success: boolean }>;
  /** 打开项目（引导窗口 → 主窗口切换） */
  invoke(channel: 'open-project', projectData: { projectId: string; projectTitle: string }): Promise<{ success: boolean }>;
  /** 关闭项目（主窗口 → 引导窗口切换） */
  invoke(channel: 'close-project'): Promise<{ success: boolean }>;

  // ===== IPC invoke 通道（通用 fallback） =====
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;

  // ===== IPC 监听通道 =====

  /** 自动保存触发 */
  on(channel: 'auto-save', callback: () => void): void;
  /** 应用更新通知 */
  on(channel: 'app-update', callback: (info: { version: string }) => void): void;
  /** 服务端状态变更 */
  on(channel: 'server-status', callback: (status: { running: boolean; port?: number }) => void): void;
  /** 项目变更通知 */
  on(channel: 'project-changed', callback: (data: { projectId: string; action: string }) => void): void;
  /** 章节锁定通知 */
  on(channel: 'chapter-locked', callback: (data: { chapterId: string; lockedBy: string }) => void): void;
  /** 伏笔提醒 */
  on(channel: 'foreshadowing-alert', callback: (data: { message: string; foreshadowingId: string }) => void): void;
  /** 冲突检测通知 */
  on(channel: 'conflict-detected', callback: (data: { type: string; message: string }) => void): void;
  /** 通用监听 fallback */
  on(channel: string, callback: (...args: unknown[]) => void): void;

  /** 移除指定 channel 的所有监听器 */
  removeAllListeners(channel: string): void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
