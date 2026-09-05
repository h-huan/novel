import React from 'react';
import ReactDOM from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import App from './App';
import './index.css';

// 使用本地 monaco-editor 实例，避免从 CDN 加载（被 Content-Security-Policy 拦截）
// 必须在任何 <Editor /> 组件挂载前配置
loader.config({ monaco });

const rootEl = document.getElementById('root');

if (!rootEl) {
  throw new Error('Root element not found. Ensure index.html has <div id="root"></div>');
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
