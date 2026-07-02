import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import App from './App';
import './index.css';

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
