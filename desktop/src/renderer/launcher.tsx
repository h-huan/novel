/**
 * Launcher 入口 - 欢迎引导窗口
 * 项目列表 + 灵感发现 + 新建项目
 * 不包含侧边栏、Header 菜单等主窗口元素
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import LauncherApp from './LauncherApp';
import './index.css';

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element not found. Ensure launcher.html has <div id="root"></div>');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LauncherApp />
    </ErrorBoundary>
  </React.StrictMode>
);
