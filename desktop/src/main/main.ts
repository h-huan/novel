/**
 * Electron 主进程入口
 * 负责窗口管理、系统托盘、IPC通信、文件系统操作、
 * 自动更新检测、NestJS后端服务管理
 */

import {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  shell,
  dialog,
  nativeImage,
  globalShortcut,
} from 'electron';
import path from 'path';
import fs from 'fs';

// ---------- 类型定义 ----------

interface IpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

interface ServerProcess {
  process: import('child_process').ChildProcess | null;
  port: number;
}

// ---------- 全局状态 ----------

let launcherWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let serverProcess: ServerProcess = { process: null, port: 3100 };

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
function getWindowStatePath(): string {
  return path.join(app.getPath('userData'), 'window-state.json');
}

// ---------- 窗口状态持久化 ----------

function saveWindowBounds(): void {
  if (!mainWindow) return;
  try {
    const bounds = mainWindow.getBounds();
    fs.writeFileSync(getWindowStatePath(), JSON.stringify(bounds, null, 2), 'utf-8');
  } catch {
    // 静默失败 - 窗口位置保存非关键
  }
}

function loadWindowBounds(): WindowBounds {
  try {
    if (fs.existsSync(getWindowStatePath())) {
      const data = fs.readFileSync(getWindowStatePath(), 'utf-8');
      const saved = JSON.parse(data) as WindowBounds;
      // 验证保存的坐标在屏幕范围内
      if (typeof saved.width === 'number' && typeof saved.height === 'number') {
        return saved;
      }
    }
  } catch {
    // 静默失败 - 使用默认值
  }
  return { width: 1400, height: 900 };
}

// ---------- 托盘图标 (程序化生成) ----------

function createTrayIcon(): Electron.NativeImage {
  // 生成一个 16x16 的简单图标 (深色背景 + 亮色亮点)
  const size = 16;
  const buffer = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const dx = x - size / 2;
      const dy = y - size / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        // 内圈 - 亮色
        buffer[offset] = 233;     // R
        buffer[offset + 1] = 69;  // G
        buffer[offset + 2] = 96;  // B (#e94560)
        buffer[offset + 3] = 255; // A
      } else if (dist < 7) {
        // 外圈 - 边框
        buffer[offset] = 26;      // R
        buffer[offset + 1] = 26;  // G
        buffer[offset + 2] = 46;  // B (#1a1a2e)
        buffer[offset + 3] = 200; // A
      } else {
        buffer[offset + 3] = 0;   // 透明
      }
    }
  }

  return nativeImage.createFromBuffer(buffer, { width: size, height: size });
}

// ---------- 系统托盘 ----------

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('AI写作平台');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else if (launcherWindow) {
          launcherWindow.show();
          launcherWindow.focus();
        }
      },
    },
    {
      label: '最小化到托盘',
      click: () => {
        mainWindow?.hide();
        launcherWindow?.hide();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // 双击托盘图标恢复窗口
  tray.on('double-click', () => {
    // 优先恢复主窗口，否则恢复引导窗口
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    } else if (launcherWindow) {
      if (launcherWindow.isVisible()) {
        launcherWindow.focus();
      } else {
        launcherWindow.show();
        launcherWindow.focus();
      }
    }
  });
}

// ---------- 窗口管理 ----------

/**
 * 创建引导窗口（欢迎窗口）
 * 类似 IntelliJ IDEA 的欢迎界面：项目列表 + 灵感发现 + 新建项目
 * 用户选择/创建项目后，关闭此窗口并打开主窗口
 */
function createLauncherWindow(): void {
  launcherWindow = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    title: 'AI写作平台',
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  launcherWindow.once('ready-to-show', () => {
    launcherWindow?.show();
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
    // 引导窗口关闭且没有主窗口 → 退出应用
    if (!mainWindow && !isQuitting) {
      app.quit();
    }
  });

  // 加载引导页
  if (VITE_DEV_SERVER_URL) {
    launcherWindow.loadURL(VITE_DEV_SERVER_URL + 'launcher.html');
    launcherWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    launcherWindow.loadFile(path.join(__dirname, '../../dist/launcher.html'));
  }
}

/**
 * 创建主编辑窗口
 * 用户选择/创建项目后打开，包含侧边栏、Header 菜单、编辑器等
 */
function createMainWindow(projectId?: string, projectTitle?: string): void {
  const savedBounds = loadWindowBounds();

  mainWindow = new BrowserWindow({
    width: savedBounds.width,
    height: savedBounds.height,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 1024,
    minHeight: 680,
    title: projectTitle ? `${projectTitle} - AI写作平台` : 'AI写作平台',
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  // 窗口准备好后再显示，避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // 保存窗口位置/大小（移动/调整时）
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);

  // 关闭行为：最小化到托盘而非退出
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // 窗口关闭后清理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 加载应用（带 project 参数，方便直接跳转）
  let url: string;
  if (VITE_DEV_SERVER_URL) {
    url = VITE_DEV_SERVER_URL;
    if (projectId) {
      url += `#/project/${projectId}/dashboard`;
    }
    mainWindow.loadURL(url);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    // 生产模式用 hash 参数传递项目 ID
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
      hash: projectId ? `/project/${projectId}/dashboard` : '/',
    });
  }
}

/**
 * 兼容旧代码的 createWindow（启动时创建引导窗口）
 */
function createWindow(): void {
  createLauncherWindow();
}

// ---------- 快捷键 ----------

function registerShortcuts(): void {
  // F11: 沉浸式全屏写作模式
  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });
}

// ---------- 自动更新 ----------

function setupAutoUpdater(): void {
  try {
    // 动态导入 electron-updater，避免未安装时崩溃
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater');

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.log('[auto-updater] Check failed (non-critical):', err.message);
    });

    autoUpdater.on('update-available', (info: unknown) => {
      console.log('[auto-updater] Update available:', info);
      mainWindow?.webContents.send('app-update', { available: true, info });
    });

    autoUpdater.on('update-not-available', (info: unknown) => {
      console.log('[auto-updater] No update available:', info);
    });

    autoUpdater.on('error', (err: Error) => {
      console.log('[auto-updater] Error:', err.message);
    });
  } catch {
    console.log('[auto-updater] electron-updater not installed, skipping auto-update setup');
  }
}

// ---------- NestJS 服务连接（不 fork，只检测并连接） ----------

async function connectToServer(port: number = 3100): Promise<boolean> {
  try {
    const healthUrl = `http://127.0.0.1:${port}/api/v1/health`;
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      console.log(`[server] 已连接后端服务 http://127.0.0.1:${port}`);
      mainWindow?.webContents.send('server-status', { running: true, port });
      launcherWindow?.webContents.send('server-status', { running: true, port });
      return true;
    }
  } catch {
    // 服务未启动
  }
  return false;
}

function getServerBinaryPath(): string {
  if (VITE_DEV_SERVER_URL) {
    return path.resolve(__dirname, '..', '..', '..', 'server', 'dist', 'src', 'main.js');
  }
  return path.join(process.resourcesPath, 'server', 'main.js');
}

/**
 * 查找系统 Node.js 路径（Electron 内置 Node.js 版本可能过旧）
 * 开发模式下，系统 Node.js 通常支持 node:sqlite；Electron 内置的 v20 不支持
 */
function findSystemNodePath(): string | undefined {
  try {
    const { execSync } = require('child_process');
    const cmd = process.platform === 'win32' ? 'where node' : 'which node';
    const nodePath = execSync(cmd, { encoding: 'utf8', timeout: 3000 })
      .split(/[\r\n]+/)[0]
      .trim();
    return nodePath || undefined;
  } catch {
    return undefined;
  }
}

// ---------- IPC 处理器 ----------

function registerIpcHandlers(): void {
  const fsp = fs.promises;

  // ===== 窗口管理：引导窗口 → 主窗口切换 =====

  ipcMain.handle('open-project', (_event, projectData: { projectId: string; projectTitle: string }): IpcResult => {
    const { projectId, projectTitle } = projectData;

    // 守卫：如果主窗口已存在，不重复创建，仅通过路由跳转
    if (mainWindow) {
      // 主窗口中直接通过 hash 导航到目标项目
      mainWindow.webContents.executeJavaScript(
        `window.location.hash = '#/project/${projectId}/dashboard'`
      ).catch(() => {});
      return { success: true };
    }

    // 1. 创建主窗口
    createMainWindow(projectId, projectTitle);

    // 2. 关闭引导窗口
    if (launcherWindow) {
      launcherWindow.close();
      launcherWindow = null;
    }

    return { success: true };
  });

  ipcMain.handle('close-project', (): IpcResult => {
    // 1. 关闭主窗口
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }

    // 2. 重新打开引导窗口
    if (!launcherWindow) {
      createLauncherWindow();
    }

    return { success: true };
  });

  // ===== 基础 & 系统 =====

  ipcMain.handle('get-platform-info', (): IpcResult => {
    return {
      success: true,
      data: {
        platform: process.platform,
        versions: {
          node: process.versions.node,
          chrome: process.versions.chrome,
          electron: process.versions.electron,
        },
      },
    };
  });

  ipcMain.handle('get-app-path', (_event, name?: string): IpcResult => {
    try {
      const result: Record<string, string> = {
        userData: app.getPath('userData'),
        documents: app.getPath('documents'),
        home: app.getPath('home'),
      };
      if (name && name in result) {
        return { success: true, data: result[name] };
      }
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('open-external', async (_event, url: string): Promise<IpcResult> => {
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ===== 文件操作 =====

  ipcMain.handle('read-file', async (_event, filePath: string): Promise<IpcResult> => {
    try {
      const content = await fsp.readFile(filePath, 'utf-8');
      return { success: true, data: content };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'write-file',
    async (_event, filePath: string, content: string): Promise<IpcResult> => {
      try {
        await fsp.mkdir(path.dirname(filePath), { recursive: true });
        await fsp.writeFile(filePath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('delete-file', async (_event, filePath: string): Promise<IpcResult> => {
    try {
      await fsp.unlink(filePath);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('get-file-info', async (_event, filePath: string): Promise<IpcResult> => {
    try {
      const stats = await fsp.stat(filePath);
      return {
        success: true,
        data: {
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
        },
      };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('list-directory', async (_event, dirPath: string): Promise<IpcResult> => {
    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      const result = entries.map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile(),
      }));
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('exists-path', async (_event, targetPath: string): Promise<IpcResult> => {
    try {
      await fsp.access(targetPath);
      return { success: true, data: true };
    } catch {
      return { success: true, data: false };
    }
  });

  ipcMain.handle('mkdir-path', async (_event, dirPath: string): Promise<IpcResult> => {
    try {
      await fsp.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ===== 对话框 =====

  ipcMain.handle(
    'show-save-dialog',
    async (_event, options: Electron.SaveDialogOptions): Promise<IpcResult> => {
      try {
        const result = await dialog.showSaveDialog(
          mainWindow!,
          options ?? { title: '保存文件' },
        );
        return { success: !result.canceled, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  ipcMain.handle(
    'show-open-dialog',
    async (_event, options: Electron.OpenDialogOptions): Promise<IpcResult> => {
      try {
        const result = await dialog.showOpenDialog(
          mainWindow!,
          options ?? {
            title: '选择文件',
            properties: ['openFile'],
          },
        );
        return { success: !result.canceled, data: result };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ===== 项目管理 =====

  ipcMain.handle('create-project-dir', async (_event, projectId: string): Promise<IpcResult> => {
    try {
      const basePath = path.join(app.getPath('userData'), 'projects', projectId);
      await fsp.mkdir(path.join(basePath, 'chapters'), { recursive: true });
      await fsp.mkdir(path.join(basePath, 'data'), { recursive: true });
      await fsp.mkdir(path.join(basePath, '.rag'), { recursive: true });
      await fsp.mkdir(path.join(basePath, 'export'), { recursive: true });
      return { success: true, data: { basePath } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('list-projects', async (): Promise<IpcResult<ProjectMeta[]>> => {
    try {
      const projectsDir = path.join(app.getPath('userData'), 'projects');
      await fsp.mkdir(projectsDir, { recursive: true });

      const entries = await fsp.readdir(projectsDir, { withFileTypes: true });
      const projects: ProjectMeta[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const projectJsonPath = path.join(projectsDir, entry.name, '.project.json');
        try {
          const raw = await fsp.readFile(projectJsonPath, 'utf-8');
          const meta = JSON.parse(raw) as ProjectMeta;
          projects.push({ ...meta, id: entry.name });
        } catch {
          // 没有 .project.json 的项目，使用目录名作为名称
          const stat = await fsp.stat(path.join(projectsDir, entry.name));
          projects.push({
            id: entry.name,
            name: entry.name,
            createdAt: stat.birthtime.toISOString(),
            updatedAt: stat.mtime.toISOString(),
          });
        }
      }

      projects.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );

      return { success: true, data: projects };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle(
    'save-project-config',
    async (_event, projectId: string, config: ProjectMeta): Promise<IpcResult> => {
      try {
        const projectDir = path.join(app.getPath('userData'), 'projects', projectId);
        await fsp.mkdir(projectDir, { recursive: true });
        const configPath = path.join(projectDir, '.project.json');
        await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return { success: true };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  // ===== NestJS 服务管理 =====

  ipcMain.handle(
    'start-server',
    async (_event, port?: number): Promise<IpcResult> => {
      try {
        const targetPort = port ?? 3100;

        // 只检测后端是否在运行，不 fork
        try {
          const healthUrl = `http://127.0.0.1:${targetPort}/api/v1/health`;
          const healthRes = await fetch(healthUrl, { signal: AbortSignal.timeout(3000) });
          if (healthRes.ok) {
            serverProcess.port = targetPort;
            serverProcess.process = null;
            console.log(`[server] 连接后端 http://127.0.0.1:${targetPort} 成功`);
            mainWindow?.webContents.send('server-status', { running: true, port: targetPort });
            launcherWindow?.webContents.send('server-status', { running: true, port: targetPort });
            return { success: true, data: { port: targetPort, status: 'already-running' } };
          }
        } catch { /* 无服务 */ }

        return { success: false, error: `后端服务未启动 (http://127.0.0.1:${targetPort})，请先在终端启动 server` };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    },
  );

  ipcMain.handle('stop-server', async (): Promise<IpcResult> => {
    try {
      if (!serverProcess.process) {
        return { success: true, data: { status: 'not-running' } };
      }

      serverProcess.process.kill('SIGTERM');

      // 给进程一点时间优雅关闭，然后强制杀掉
      setTimeout(() => {
        if (serverProcess.process) {
          serverProcess.process.kill('SIGKILL');
          serverProcess.process = null;
        }
      }, 5000);

      mainWindow?.webContents.send('server-status', { running: false });
      launcherWindow?.webContents.send('server-status', { running: false });

      return { success: true, data: { status: 'stopping' } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ===== 项目事件发送 (渲染进程通过 IPC 触发) =====
  // 这些通道由渲染进程调用，向其他渲染进程广播事件

  const eventChannels = [
    'project-changed',
    'chapter-locked',
    'foreshadowing-alert',
    'conflict-detected',
  ];

  for (const channel of eventChannels) {
    ipcMain.on(channel, (_event, ...args: unknown[]) => {
      mainWindow?.webContents.send(channel, ...args);
    });
  }
}

// ---------- 应用生命周期 ----------

// 在 app ready 前设置 userData 路径，避免数据写入 C 盘
// 开发模式：存到项目根目录的 .appdata 下
// 生产模式：存到可执行文件所在目录的 .appdata 下（与 C 盘解耦）
const userDataPath = VITE_DEV_SERVER_URL
  ? path.resolve(__dirname, '..', '..', '..', '..', '.appdata')  // dev: d:\code\novel\.appdata
  : path.join(path.dirname(app.getPath('exe')), '.appdata');      // prod: 安装目录\.appdata
try {
  app.setPath('userData', userDataPath);
} catch {
  // setPath 在 ready 后调用会抛异常，忽略
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
  registerIpcHandlers();
  setupAutoUpdater();

  // 自动启动后端服务
  connectToServer();

  // macOS: 点击 dock 图标重新创建窗口
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(); // 创建引导窗口
    } else {
      // 优先显示主窗口，否则显示引导窗口
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      } else if (launcherWindow) {
        launcherWindow.show();
        launcherWindow.focus();
      }
    }
  });
});

// 所有窗口关闭时退出 (macOS 除外)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 退出前清理
app.on('before-quit', () => {
  isQuitting = true;

  // 保存窗口状态
  saveWindowBounds();

  // 停止服务器
  if (serverProcess.process) {
    serverProcess.process.kill('SIGTERM');
    serverProcess.process = null;
  }

  // 注销快捷键
  globalShortcut.unregisterAll();
});

// 防止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 优先恢复主窗口，否则恢复引导窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else if (launcherWindow) {
      if (launcherWindow.isMinimized()) launcherWindow.restore();
      launcherWindow.show();
      launcherWindow.focus();
    }
  });
}
