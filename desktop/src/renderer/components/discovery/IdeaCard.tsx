import React from 'react';

const ANGLE_COLORS: Record<string, string> = { '历史缝隙': '#60a5fa', '新闻改编': '#e94560', '小人物大历史': '#22c55e', '穿越新解': '#a855f7', '职业传奇': '#f59e0b' };

const CARD_BG = 'rgba(255,255,255,0.03)';
const BORDER = '1px solid rgba(255,255,255,0.08)';
const LABEL_SIZE = '12px';
const VALUE_SIZE = '13px';

const s: Record<string, React.CSSProperties> = {
  card: { backgroundColor: CARD_BG, borderRadius: '12px', border: BORDER, overflow: 'hidden', transition: 'all 0.2s', cursor: 'pointer', minWidth: 0, },
  header: { padding: '18px 18px 0' },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' },
  title: { fontSize: '17px', fontWeight: 700, color: '#eaeaea', lineHeight: 1.3, flex: 1 },
  hook: { margin: '0', padding: '0 0 12px 0', fontSize: '14px', color: '#8a8aa0', fontStyle: 'italic', lineHeight: 1.6, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  tags: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' },
  body: { padding: '10px 18px 8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column' as const, flex: '1 1 auto', minWidth: 0 },
  label: { fontSize: LABEL_SIZE, fontWeight: 600, color: '#6c6c80', marginBottom: '1px' },
  value: { fontSize: VALUE_SIZE, color: '#c0c0d0', lineHeight: 1.5, wordBreak: 'break-word' as const },
  charList: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  charTag: { display: 'inline-block', padding: '3px 10px', borderRadius: '5px', fontSize: '12px', fontWeight: 500 },
  actions: { padding: '12px 18px 16px', display: 'flex', gap: '8px' },
  btn: { flex: 1, padding: '11px', backgroundColor: '#e94560', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s' },
};

function getAngleBadgeStyle(angle: string): React.CSSProperties {
  return { fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '5px',
    backgroundColor: (ANGLE_COLORS[angle] || '#6c6c80') + '22', color: ANGLE_COLORS[angle] || '#6c6c80', whiteSpace: 'nowrap', flexShrink: 0 };
}
function getStyleTagStyle(): React.CSSProperties {
  return { fontSize: '12px', fontWeight: 500, padding: '3px 10px', borderRadius: '5px', backgroundColor: 'rgba(255,255,255,0.05)', color: '#8a8aa0' };
}

interface IdeaCardProps { idea: any; onClick: (idea: any) => void; }

const IdeaCard: React.FC<IdeaCardProps> = ({ idea, onClick }) => {
  const isRawFallback = !!idea.raw && !idea.description && !idea.protagonist && !idea.setting && !idea.hook && !idea.angle;
  const hasBody = idea.description || idea.coreConflict || idea.tone || idea.uniquePoint || idea.mainReversal || idea.estimatedWords || idea.protagonist || idea.setting || idea.raw;

  return (
    <div style={s.card}>
      {/* 标题区域 */}
      <div style={s.header}>
        <div style={s.titleRow}>
          <span style={s.title}>{idea.title}</span>
          {idea.angle && <span style={getAngleBadgeStyle(idea.angle)}>{idea.angle}</span>}
        </div>
        {idea.hook && <p style={s.hook}>「{idea.hook}」</p>}
        {Array.isArray(idea.styleTags) && idea.styleTags.length > 0 && (
          <div style={s.tags}>
            {idea.styleTags.map((tag: string) => <span key={tag} style={getStyleTagStyle()}>{tag}</span>)}
          </div>
        )}
        {/* 主角+地点 单行 */}
        {(idea.protagonist || idea.setting) && (
          <div style={{ fontSize: '13px', color: '#8a8aa0', marginTop: '10px', lineHeight: 1.6 }}>
            {idea.protagonist && <span>👤 <b style={{ color: '#c0c0d0' }}>{idea.protagonist}</b></span>}
            {idea.protagonist && idea.setting && <span style={{ margin: '0 8px', color: '#5c5c70' }}>|</span>}
            {idea.setting && <span>📍 {idea.setting}</span>}
          </div>
        )}
      </div>

      {/* 详情区域 — 统一纵向 */}
      {hasBody && (
        <div style={s.body}>
          {/* raw 回退：显示 AI 原始输出 */}
          {isRawFallback && idea.raw && (
            <div style={s.field}>
              <div style={{ ...s.label, color: '#f59e0b' }}>⚠️ AI 返回了非结构化内容（原始输出）</div>
              <div style={{ ...s.value, whiteSpace: 'pre-wrap', maxHeight: '280px', overflowY: 'auto', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '12px', lineHeight: '1.8' }}>
                {idea.raw}
              </div>
            </div>
          )}
          {idea.description && (
            <div style={s.field}>
              <div style={s.label}>📖 故事概要</div>
              <div style={s.value}>{idea.description}</div>
            </div>
          )}
          {idea.coreConflict && (
            <div style={{ ...s.field }}>
              <div style={s.label}>⚔️ 核心冲突</div>
              <div style={{ ...s.value, color: '#e94560' }}>{idea.coreConflict}</div>
            </div>
          )}
          {idea.tone && (
            <div style={s.field}>
              <div style={s.label}>🎭 情绪基调</div>
              <div style={s.value}>{idea.tone}</div>
            </div>
          )}
          {idea.uniquePoint && (
            <div style={s.field}>
              <div style={s.label}>💡 独特卖点</div>
              <div style={s.value}>{idea.uniquePoint}</div>
            </div>
          )}
          {idea.mainReversal && (
            <div style={{ ...s.field }}>
              <div style={s.label}>🔄 核心反转</div>
              <div style={{ ...s.value, color: '#a855f7', fontStyle: 'italic' }}>{idea.mainReversal}</div>
            </div>
          )}
          {idea.estimatedWords && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={s.label}>📏 预估字数</div>
              <span style={{ fontSize: '15px', color: '#e94560', fontWeight: 700 }}>
                🔥 {typeof idea.estimatedWords === 'number' ? idea.estimatedWords.toLocaleString() + '字' : idea.estimatedWords}
              </span>
            </div>
          )}
          {Array.isArray(idea.characters) && idea.characters.length > 0 && (
            <div style={s.field}>
              <div style={s.label}>👥 主要人物</div>
              <div style={s.charList}>
                {idea.characters.map((c: string, ci: number) => (
                  <span key={c} style={{ ...s.charTag, backgroundColor: ci === 0 ? 'rgba(233,69,96,0.14)' : 'rgba(255,255,255,0.05)', color: ci === 0 ? '#e94560' : '#8a8aa0' }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div style={s.actions}>
        <button
          style={s.btn}
          onClick={(e) => { e.stopPropagation(); onClick(idea); }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#ff6b81'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#e94560'; }}
        >
          ✨ 选这个，创建项目
        </button>
      </div>
    </div>
  );
};

export default IdeaCard;
