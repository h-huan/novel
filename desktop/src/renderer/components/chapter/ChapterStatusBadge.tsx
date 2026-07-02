/**
 * ChapterStatusBadge - 章节状态徽章组件
 * 根据状态显示不同颜色：draft(黄色)、reviewing(蓝色)、locked(绿色)
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
    label: '草稿',
    color: '#f39c12',
    bgColor: 'rgba(243, 156, 18, 0.12)',
  },
  reviewing: {
    label: '质检中',
    color: '#3498db',
    bgColor: 'rgba(52, 152, 219, 0.12)',
  },
  locked: {
    label: '已锁定',
    color: '#2ecc71',
    bgColor: 'rgba(46, 204, 113, 0.12)',
  },
};

const ChapterStatusBadge: React.FC<ChapterStatusBadgeProps> = ({
  status,
  showLockIcon = true,
  size = 'medium',
}) => {
  const config = STATUS_CONFIG[status];
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
