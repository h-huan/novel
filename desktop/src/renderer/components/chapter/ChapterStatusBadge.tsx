/**
 * ChapterStatusBadge - 章节状态徽章组件
 * 三态颜色文字统一区分：未锁定(琥珀)、质检中(蓝)、已锁定(绿)
 */

import React from 'react';
import type { ChapterStatus } from '@novel/shared';

export interface ChapterStatusBadgeProps {
  /** 章节状态 */
  status: ChapterStatus;
  /** 是否显示锁定图标（仅当 status=locked 时有效） */
  showLockIcon?: boolean;
  /** 尺寸 */
  size?: 'small' | 'medium';
}

const STATUS_CONFIG: Record<ChapterStatus, { label: string; color: string; bgColor: string }> = {
  draft: {
    label: '未锁定',
    color: 'var(--color-warning)',
    bgColor: 'rgba(243, 156, 18, 0.12)',
  },
  reviewing: {
    label: '质检中',
    color: 'var(--color-info)',
    bgColor: 'rgba(52, 152, 219, 0.12)',
  },
  locked: {
    label: '已锁定',
    color: 'var(--color-success)',
    bgColor: 'rgba(46, 204, 113, 0.12)',
  },
};

const ChapterStatusBadge: React.FC<ChapterStatusBadgeProps> = ({
  status,
  showLockIcon = true,
  size = 'medium',
}) => {
  // 后端可能返回未枚举的状态，回退到 draft，避免 STATUS_CONFIG[status] 为 undefined 后访问 .color 崩溃
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  const isSmall = size === 'small';

  return (
    <span
      style={{
        ...styles.badge,
        backgroundColor: config.bgColor,
        color: config.color,
        fontSize: isSmall ? '11px' : '12px',
        padding: isSmall ? '2px 8px' : '3px 10px',
      }}
    >
      {showLockIcon && status === 'locked' && (
        <span style={styles.lockIcon}>🔒</span>
      )}
      {config.label}
    </span>
  );
};

const styles: Record<string, React.CSSProperties> = {
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontWeight: 600,
    borderRadius: '4px',
    lineHeight: 1.4,
    whiteSpace: 'nowrap',
  },
  lockIcon: {
    fontSize: '10px',
    lineHeight: 1,
  },
};

export default ChapterStatusBadge;
