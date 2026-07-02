import React from 'react';
import { useAppStore } from '../../stores/appStore';

const StatusBar: React.FC = () => {
  const { autoSaveStatus, serverStatus } = useAppStore();

  const autoSaveText: Record<string, string> = {
    saved: '已保存',
    saving: '正在保存...',
    error: '保存出错',
    idle: '',
  };

  const serverColors: Record<string, string> = {
    online: 'bg-success',
    offline: 'bg-accent',
    connecting: 'bg-warning',
  };

  return (
    <footer className="h-statusbar bg-bg-secondary border-t border-border flex items-center justify-between px-3 text-xs select-none">
      {/* Left: Auto-save status */}
      <div className="flex items-center gap-1.5 min-w-0">
        {autoSaveStatus !== 'idle' && (
          <>
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                autoSaveStatus === 'saved'
                  ? 'bg-success'
                  : autoSaveStatus === 'saving'
                    ? 'bg-warning animate-pulse'
                    : 'bg-accent'
              }`}
            />
            <span className="text-text-muted">{autoSaveText[autoSaveStatus]}</span>
          </>
        )}
      </div>

      {/* Center: Word count */}
      <div className="flex items-center gap-2 text-text-muted">
        <span className="font-mono">0 / 0 字</span>
      </div>

      {/* Right: Server status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${serverColors[serverStatus]}`}
        />
        <span className="text-text-muted">
          {serverStatus === 'online'
            ? '服务器在线'
            : serverStatus === 'connecting'
              ? '连接中...'
              : '服务器离线'}
        </span>
      </div>
    </footer>
  );
};

export default StatusBar;
