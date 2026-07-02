import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.setState({ errorInfo: errorInfo.componentStack || null });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          padding: 24,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#1a1a2e',
          color: '#e0e0e0',
        }}>
          <div style={{
            background: '#16213e',
            borderRadius: 12,
            padding: '32px 40px',
            maxWidth: 560,
            width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <h2 style={{ color: '#ff6b6b', marginTop: 0, fontSize: 20 }}>⚠️ 应用出错了</h2>
            <p style={{ color: '#aaa', fontSize: 14, marginBottom: 16 }}>
              渲染组件时发生错误，已阻止整页崩溃。请尝试重置或重启应用。
            </p>
            {this.state.error && (
              <pre style={{
                background: '#0f0f23',
                padding: 12,
                borderRadius: 6,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 160,
                color: '#ff6b6b',
                marginBottom: 16,
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo ? '\n\n' + this.state.errorInfo : ''}
              </pre>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background: '#4a9eff',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                🔄 重置状态
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: '1px solid #555',
                  background: 'transparent',
                  color: '#ccc',
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                🔃 重新加载
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
