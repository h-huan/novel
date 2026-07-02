/**
 * DiffView - 文本差异对比视图
 * 左右分屏显示原文与修改后的文本，高亮增删
 */

import React, { useMemo } from 'react';

export interface DiffViewProps {
  original: string;
  modified: string;
  className?: string;
}

interface DiffWord {
  text: string;
  type: 'added' | 'removed' | 'unchanged';
}

interface DiffStats {
  added: number;
  removed: number;
}

/**
 * 简单逐词 diff 算法
 * 基于 LCS (Longest Common Subsequence) 实现
 */
function computeWordDiff(original: string, modified: string): {
  originalWords: DiffWord[];
  modifiedWords: DiffWord[];
  stats: DiffStats;
} {
  const origWords = original.split(/(\s+)/).filter((w) => w.length > 0);
  const modWords = modified.split(/(\s+)/).filter((w) => w.length > 0);

  // 构建 LCS 表
  const m = origWords.length;
  const n = modWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origWords[i - 1] === modWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯构建 diff
  const originalResult: DiffWord[] = [];
  const modifiedResult: DiffWord[] = [];

  let i = m;
  let j = n;

  const backtraceOrig: DiffWord[] = [];
  const backtraceMod: DiffWord[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origWords[i - 1] === modWords[j - 1]) {
      backtraceOrig.unshift({ text: origWords[i - 1], type: 'unchanged' });
      backtraceMod.unshift({ text: modWords[j - 1], type: 'unchanged' });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      backtraceOrig.unshift({ text: '', type: 'unchanged' });
      backtraceMod.unshift({ text: modWords[j - 1], type: 'added' });
      j--;
    } else {
      backtraceOrig.unshift({ text: origWords[i - 1], type: 'removed' });
      backtraceMod.unshift({ text: '', type: 'unchanged' });
      i--;
    }
  }

  const addedCount = backtraceMod.filter((d) => d.type === 'added').length;
  const removedCount = backtraceOrig.filter((d) => d.type === 'removed').length;

  return {
    originalWords: backtraceOrig.filter((d) => d.text !== ''),
    modifiedWords: backtraceMod.filter((d) => d.text !== ''),
    stats: { added: addedCount, removed: removedCount },
  };
}

const DiffView: React.FC<DiffViewProps> = ({ original, modified, className }) => {
  const { originalWords, modifiedWords, stats } = useMemo(
    () => computeWordDiff(original, modified),
    [original, modified],
  );

  return (
    <div className={className} style={styles.container}>
      <div style={styles.statsBar}>
        <span style={styles.statItem}>
          <span style={styles.statAdded}>+{stats.added}</span> 字新增
        </span>
        <span style={styles.statItem}>
          <span style={styles.statRemoved}>-{stats.removed}</span> 字删除
        </span>
      </div>
      <div style={styles.panels}>
        <div style={{ ...styles.panel, ...styles.originalPanel }}>
          <div style={styles.panelHeader}>原文</div>
          <div style={styles.panelContent}>
            {originalWords.map((word, idx) => (
              <span
                key={idx}
                style={
                  word.type === 'removed'
                    ? { ...styles.word, ...styles.removedWord }
                    : word.type === 'unchanged'
                      ? { ...styles.word, ...styles.unchangedWord }
                      : { display: 'none' }
                }
              >
                {word.type === 'removed' && word.text}
                {word.type === 'unchanged' && word.text}
              </span>
            ))}
          </div>
        </div>
        <div style={{ ...styles.panel, ...styles.modifiedPanel }}>
          <div style={styles.panelHeader}>修改后</div>
          <div style={styles.panelContent}>
            {modifiedWords.map((word, idx) => (
              <span
                key={idx}
                style={
                  word.type === 'added'
                    ? { ...styles.word, ...styles.addedWord }
                    : word.type === 'unchanged'
                      ? { ...styles.word, ...styles.unchangedWord }
                      : { display: 'none' }
                }
              >
                {word.type === 'added' && word.text}
                {word.type === 'unchanged' && word.text}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: 'var(--color-bg-primary, #1a1a2e)',
  },
  statsBar: {
    display: 'flex',
    gap: '16px',
    padding: '8px 16px',
    backgroundColor: 'var(--color-bg-secondary, #16213e)',
    borderBottom: '1px solid var(--color-border, #2a2a4a)',
    fontSize: '13px',
    color: 'var(--color-text-secondary, #a0a0b0)',
  },
  statItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  statAdded: {
    color: '#2ecc71',
    fontWeight: 700,
  },
  statRemoved: {
    color: '#e94560',
    fontWeight: 700,
  },
  panels: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  originalPanel: {
    borderRight: '1px solid var(--color-border, #2a2a4a)',
  },
  modifiedPanel: {
  },
  panelHeader: {
    padding: '6px 16px',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--color-text-muted, #6c6c80)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid var(--color-border, #2a2a4a)',
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
  },
  panelContent: {
    flex: 1,
    padding: '16px',
    overflowY: 'auto',
    fontFamily: 'var(--font-family, sans-serif)',
    fontSize: '14px',
    lineHeight: '1.8',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  word: {},
  removedWord: {
    backgroundColor: 'rgba(233, 69, 96, 0.3)',
    color: '#e94560',
    textDecoration: 'line-through',
    borderRadius: '2px',
    padding: '0 2px',
  },
  addedWord: {
    backgroundColor: 'rgba(46, 204, 113, 0.3)',
    color: '#2ecc71',
    borderRadius: '2px',
    padding: '0 2px',
  },
  unchangedWord: {
    color: 'var(--color-text-primary, #eaeaea)',
  },
};

export default DiffView;
