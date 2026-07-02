/**
 * DiffPanel - 逐段精修+三栏对比+冲突标记
 * H2 人工微调模式 + M3 三栏差异对比视图
 *
 * 功能:
 * - 逐段显示 AI 修改 vs 原文
 * - 逐段确认/驳回
 * - 红色/黄色/绿色冲突标记
 * - 冲突详情侧边栏
 * - 冲突后局部质检
 */

import React, { useState, useCallback } from 'react';
import { api } from '../../lib/api';

interface DiffSegment {
  type: 'keep' | 'modify' | 'insert' | 'delete';
  original: string;
  modified: string;
  accepted: boolean | null; // null=未决策, true=已确认, false=已驳回
}

interface Variant {
  style: string;
  content: string;
  diff: { type: string; text: string }[];
}

interface ConflictMark {
  level: 'critical' | 'warning' | 'pass';
  lineIndex: number;
  text: string;
  reason: string;
  suggestion: string;
}

const STYLE_LABELS: Record<string, string> = {
  poetic: '诗意', direct: '直白', suspense: '悬念',
  emotional: '情绪', sensory: '感官增强', metaphorical: '隐喻',
};

const CONFLICT_COLORS: Record<string, string> = {
  critical: '#e74c3c',
  warning: '#f39c12',
  pass: '#2ecc71',
};

const CONFLICT_BG: Record<string, string> = {
  critical: 'rgba(231,76,60,0.08)',
  warning: 'rgba(243,156,18,0.08)',
  pass: 'rgba(46,204,113,0.05)',
};

const DiffPanel: React.FC<{
  projectId: string;
  chapterId?: string;
  paragraphText?: string;
  onComplete?: (finalText: string) => void;
}> = ({ projectId, chapterId, paragraphText, onComplete }) => {
  const [activeTab, setActiveTab] = useState<'polish' | 'diff' | 'conflicts'>('polish');
  const [text, setText] = useState(paragraphText || '');
  const [variants, setVariants] = useState<Variant[]>([]);
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [segments, setSegments] = useState<DiffSegment[]>([]);
  const [conflicts, setConflicts] = useState<ConflictMark[]>([]);
  const [loading, setLoading] = useState(false);
  const [qaResult, setQaResult] = useState<any>(null);

  // 逐段精修
  const handlePolish = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    setVariants([]);
    setConflicts([]);
    setQaResult(null);

    try {
      const res = await api.post('/chain/per-paragraph-polish', {
        projectId, chapterId, paragraphText: text,
        styles: ['poetic', 'direct', 'suspense', 'emotional', 'sensory'],
      });
      const data = res.data as any;
      if (data.success && data.variants) {
        setVariants(data.variants);
        setSelectedVariant(0);
        // 默认选中第一个变体，生成逐段对比
        generateSegments(text, data.variants[0]);
        setActiveTab('diff');
      }
    } catch (err: any) {
      console.error(err);
    }
    setLoading(false);
  }, [text, projectId, chapterId]);

  // 生成逐段对比
  const generateSegments = (original: string, variant: Variant) => {
    const origParts = original.split(/(?<=[。！？\n])/).filter(s => s.trim());
    const modParts = variant.content.split(/(?<=[。！？\n])/).filter(s => s.trim());
    const maxLen = Math.max(origParts.length, modParts.length);
    const newSegments: DiffSegment[] = [];

    for (let i = 0; i < maxLen; i++) {
      const orig = origParts[i]?.trim() || '';
      const mod = modParts[i]?.trim() || '';
      if (!orig && mod) newSegments.push({ type: 'insert', original: '', modified: mod, accepted: null });
      else if (orig && !mod) newSegments.push({ type: 'delete', original: orig, modified: '', accepted: null });
      else if (orig !== mod) newSegments.push({ type: 'modify', original: orig, modified: mod, accepted: null });
      else newSegments.push({ type: 'keep', original: orig, modified: mod, accepted: true });
    }
    setSegments(newSegments);
  };

  // 切换变体
  const switchVariant = (idx: number) => {
    if (variants[idx]) {
      setSelectedVariant(idx);
      generateSegments(text, variants[idx]);
    }
  };

  // 确认/驳回单段
  const toggleSegment = (idx: number) => {
    setSegments(prev => prev.map((s, i) => i === idx ? { ...s, accepted: s.accepted === null ? true : s.accepted ? false : null } : s));
  };

  // 冲突检测
  const handleConflictCheck = useCallback(async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const res = await api.post('/chain/conflict-mark', {
        projectId, modifiedContent: text,
      });
      const data = res.data as any;
      if (data.success && data.conflicts) setConflicts(data.conflicts as ConflictMark[]);
      setActiveTab('conflicts');
    } catch { /* ignore */ }
    setLoading(false);
  }, [text, projectId]);

  // 冲突后质检
  const handlePostConflictQA = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.post('/chain/post-conflict-qa', {
        projectId, modifiedContent: text,
      });
      setQaResult((res.data as any).success ? res.data : (res.data as any));
    } catch { /* ignore */ }
    setLoading(false);
  }, [text, projectId]);

  // 确认所有修改
  const acceptAll = () => {
    const finalText = segments
      .map(s => s.type === 'delete' && s.accepted === false ? s.original : s.accepted === false ? s.original : s.modified)
      .join('');
    onComplete?.(finalText);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', overflow: 'hidden' }}>
      {/* Tab */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setActiveTab('polish')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === 'polish' ? '#e94560' : '#8a8aa0', borderBottom: activeTab === 'polish' ? '2px solid #e94560' : '2px solid transparent' }}>✏️ 精修</button>
        <button onClick={() => setActiveTab('diff')} disabled={variants.length === 0} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === 'diff' ? '#e94560' : variants.length === 0 ? '#3a3a50' : '#8a8aa0', borderBottom: activeTab === 'diff' ? '2px solid #e94560' : '2px solid transparent' }}>📊 逐段对比</button>
        <button onClick={() => setActiveTab('conflicts')} style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === 'conflicts' ? '#e94560' : '#8a8aa0', borderBottom: activeTab === 'conflicts' ? '2px solid #e94560' : '2px solid transparent' }}>
          ⚡ 冲突 {conflicts.filter(c => c.level !== 'pass').length > 0 ? `(${conflicts.filter(c => c.level !== 'pass').length})` : ''}
        </button>
      </div>

      {/* 精修 Tab */}
      {activeTab === 'polish' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'auto' }}>
          <textarea value={text} onChange={e => setText(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#eaeaea', fontSize: '13px', fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', minHeight: '100px' }}
            placeholder="输入需要精修的段落..." />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePolish} disabled={loading || !text.trim()}
              style={{ padding: '8px 16px', backgroundColor: '#e94560', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
              {loading ? '精修中...' : '✏️ 生成5种风格变体'}
            </button>
            <button onClick={handleConflictCheck} disabled={loading || !text.trim()}
              style={{ padding: '8px 16px', backgroundColor: 'rgba(243,156,18,0.1)', border: '1px solid rgba(243,156,18,0.2)', borderRadius: '6px', color: '#f39c12', fontSize: '13px', fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              ⚡ 冲突检测
            </button>
          </div>
        </div>
      )}

      {/* 逐段对比 Tab */}
      {activeTab === 'diff' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
          {/* 风格选择 */}
          {variants.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {variants.map((v, i) => (
                <button key={v.style} onClick={() => switchVariant(i)}
                  style={{
                    padding: '4px 10px', borderRadius: '4px', border: '1px solid', cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px',
                    backgroundColor: selectedVariant === i ? 'rgba(233,69,96,0.12)' : 'rgba(255,255,255,0.04)',
                    borderColor: selectedVariant === i ? '#e94560' : 'rgba(255,255,255,0.08)',
                    color: selectedVariant === i ? '#e94560' : '#8a8aa0',
                  }}>{STYLE_LABELS[v.style] || v.style}</button>
              ))}
            </div>
          )}

          {/* 逐段对比列表 */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {segments.map((seg, idx) => (
              <div key={idx} style={{
                padding: '8px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid',
                backgroundColor: seg.accepted === null ? 'rgba(52,152,219,0.04)' : seg.accepted ? 'rgba(46,204,113,0.04)' : 'rgba(231,76,60,0.04)',
                borderColor: seg.accepted === null ? 'rgba(52,152,219,0.15)' : seg.accepted ? 'rgba(46,204,113,0.15)' : 'rgba(231,76,60,0.15)',
              }} onClick={() => toggleSegment(idx)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* 三栏对比 */}
                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px' }}>
                      <div style={{ flex: 1, padding: '4px 6px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '4px' }}>
                        <span style={{ fontSize: '9px', color: '#6c6c80', fontWeight: 600 }}>原文: </span>
                        <span style={{ color: '#c0c0d0' }}>{seg.original || <span style={{ color: '#5a5a70', fontStyle: 'italic' }}>(空)</span>}</span>
                      </div>
                      {seg.type !== 'keep' && (
                        <div style={{ flex: 1, padding: '4px 6px', backgroundColor: 'rgba(233,69,96,0.05)', borderRadius: '4px' }}>
                          <span style={{ fontSize: '9px', color: '#e94560', fontWeight: 600 }}>修改: </span>
                          <span style={{ color: '#eaeaea' }}>{seg.modified || <span style={{ color: '#5a5a70', fontStyle: 'italic' }}>(已删除)</span>}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 状态 */}
                  <span style={{
                    marginLeft: '8px', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap',
                    backgroundColor: seg.accepted === null ? 'rgba(52,152,219,0.1)' : seg.accepted ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
                    color: seg.accepted === null ? '#3498db' : seg.accepted ? '#2ecc71' : '#e74c3c',
                  }}>
                    {seg.accepted === null ? '待确认' : seg.accepted ? '已确认' : '已驳回'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* 全部确认 */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={acceptAll}
              style={{ flex: 1, padding: '8px 16px', backgroundColor: '#2ecc71', border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              ✅ 确认所有修改
            </button>
            <button onClick={handlePostConflictQA} disabled={loading}
              style={{ padding: '8px 16px', backgroundColor: 'rgba(52,152,219,0.1)', border: '1px solid rgba(52,152,219,0.2)', borderRadius: '6px', color: '#3498db', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              🔍 冲突后质检
            </button>
          </div>

          {/* 质检结果 */}
          {qaResult && (
            <div style={{ padding: '10px 12px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <pre style={{ margin: 0, fontSize: '11px', color: '#c0c0d0', whiteSpace: 'pre-wrap' }}>{JSON.stringify(qaResult, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* 冲突 Tab */}
      {activeTab === 'conflicts' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'auto' }}>
          {conflicts.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px', color: '#6c6c80', fontSize: '13px' }}>
              暂无冲突检测结果，请先在"精修"tab点击冲突检测
            </div>
          )}
          {conflicts.map((c, idx) => (
            <div key={idx} style={{
              padding: '10px 12px', borderRadius: '8px', border: '1px solid',
              backgroundColor: CONFLICT_BG[c.level],
              borderColor: `${CONFLICT_COLORS[c.level]}30`,
              borderLeft: `4px solid ${CONFLICT_COLORS[c.level]}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 700, color: '#fff',
                  backgroundColor: CONFLICT_COLORS[c.level],
                }}>
                  {c.level === 'critical' ? '🔴 致命' : c.level === 'warning' ? '🟡 警告' : '🟢 通过'}
                </span>
                <span style={{ fontSize: '11px', color: '#6c6c80' }}>第{c.lineIndex + 1}段</span>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#c0c0d0', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600 }}>内容: </span>{c.text}
              </p>
              <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#8a8aa0', lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: '#e94560' }}>原因: </span>{c.reason}
              </p>
              {c.suggestion && (
                <div style={{ marginTop: '6px', padding: '6px 10px', backgroundColor: 'rgba(46,204,113,0.08)', borderRadius: '4px', fontSize: '11px', color: '#2ecc71' }}>
                  💡 {c.suggestion}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DiffPanel;
