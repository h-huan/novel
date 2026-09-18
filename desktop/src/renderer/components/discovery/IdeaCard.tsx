import React from 'react';

const ANGLE_COLORS: Record<string, string> = { '历史缝隙': 'var(--color-info-light)', '新闻改编': 'var(--color-accent)', '小人物大历史': 'var(--color-success)', '穿越新解': 'var(--color-purple)', '职业传奇': 'var(--color-warning)' };

const CARD_BG = 'rgba(255,255,255,0.03)';
const BORDER = '1px solid rgba(255,255,255,0.08)';
const LABEL_SIZE = '12px';
const VALUE_SIZE = '13px';

const s: Record<string, React.CSSProperties> = {
  card: { backgroundColor: CARD_BG, borderRadius: '12px', border: BORDER, overflow: 'hidden', transition: 'all 0.2s', cursor: 'pointer', minWidth: 0, },
  header: { padding: '18px 18px 0' },
  titleRow: { display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' },
  title: { fontSize: '17px', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.3, flex: '1 1 220px', minWidth: 'min(220px, 100%)', overflowWrap: 'break-word' },
  hook: { margin: '0', padding: '0 0 12px 0', fontSize: '14px', color: 'var(--color-text-dim)', fontStyle: 'italic', lineHeight: 1.6, borderBottom: '1px solid rgba(255,255,255,0.05)' },
  tags: { display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' },
  body: { padding: '10px 18px 8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  row: { display: 'flex', gap: '12px', flexWrap: 'wrap' },
  field: { display: 'flex', flexDirection: 'column' as const, flex: '1 1 auto', minWidth: 0 },
  label: { fontSize: LABEL_SIZE, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '1px' },
  value: { fontSize: VALUE_SIZE, color: 'var(--color-text-soft)', lineHeight: 1.5, wordBreak: 'break-word' as const },
  charList: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  charTag: { display: 'inline-block', padding: '3px 10px', borderRadius: '5px', fontSize: '14px', fontWeight: 500 },
  actions: { padding: '12px 18px 16px', display: 'flex', gap: '8px' },
  qualityFlag: { fontSize: '14px', fontWeight: 600, padding: '3px 10px', borderRadius: '5px', backgroundColor: 'rgba(245,158,11,0.15)', color: 'var(--color-warning)', whiteSpace: 'nowrap', flexShrink: 0 },
  btn: { flex: 1, padding: '11px', backgroundColor: 'var(--color-accent)', border: 'none', borderRadius: '8px', color: 'var(--color-white)', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s' },
};

function getAngleBadgeStyle(angle: string): React.CSSProperties {
  return { fontSize: '14px', fontWeight: 600, padding: '3px 10px', borderRadius: '5px',
    backgroundColor: (ANGLE_COLORS[angle] || 'var(--color-text-muted)') + '22', color: ANGLE_COLORS[angle] || 'var(--color-text-muted)',
    whiteSpace: 'normal', overflowWrap: 'break-word', flex: '0 1 auto', maxWidth: '100%' };
}
function getStyleTagStyle(): React.CSSProperties {
  return { fontSize: '14px', fontWeight: 500, padding: '3px 10px', borderRadius: '5px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--color-text-dim)' };
}
/** 把数组项（字符串或 {name,desc} 等对象）归一化为可渲染的显示字符串 */
function toStr(item: unknown): string {
  if (item === null || item === undefined) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (typeof item === 'object') {
    const o = item as Record<string, unknown>;
    return String(o.name ?? o.title ?? o.label ?? o.desc ?? o.text ?? '');
  }
  return String(item);
}

interface IdeaCardProps { idea: any; onClick: (idea: any) => void; }

const IdeaCard: React.FC<IdeaCardProps> = ({ idea, onClick }) => {
  const isRawFallback = !!idea.raw && !idea.description && !idea.protagonist && !idea.setting && !idea.hook && !idea.angle;
  const hasBody = idea.description || idea.coreConflict || idea.tone || idea.uniquePoint || idea.mainReversal || idea.estimatedWords || idea.scopeReason || idea.protagonist || idea.setting || idea.raw;

  return (
    <div style={s.card}>
      {/* 标题区域 */}
      <div style={s.header}>
        <div style={s.titleRow}>
          <span style={s.title}>{idea.title}</span>
          {idea.angle && <span style={getAngleBadgeStyle(idea.angle)}>{idea.angle}</span>}
          {Array.isArray(idea.qualityIssues) && idea.qualityIssues.length > 0 && (
            <span style={s.qualityFlag} title={idea.qualityIssues.join('；')}>⚠️ {idea.qualityIssues.length} 项待优化</span>
          )}
        </div>
        {idea.hook && <p style={s.hook}>「{idea.hook}」</p>}
        {/* 风格配置标签：按权重 平台→流派→写作风格→基调 排列，明确标注类型，跨维度去重 */}
        {(() => {
          // 统一处理为字符串数组：支持数组、字符串（按·或,或、分割）
          const toTagArray = (val: unknown): string[] => {
            if (!val) return [];
            if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
            return String(val).split(/[·,，、]/).map(s => s.trim()).filter(Boolean);
          };
          const tone = toTagArray(idea.storyTone);
          const style = toTagArray(idea.writingStyle);
          const genre = toTagArray(idea.webNovelGenre);
          const platform = idea.targetPlatform || '';
          // 跨维度去重：按权重 流派→风格→基调，后面维度中已出现的词过滤掉
          const usedInGenre = new Set(genre);
          const filteredStyle = style.filter(s => !usedInGenre.has(s));
          const usedInStyleGenre = new Set([...filteredStyle, ...genre]);
          const filteredTone = tone.filter(t => !usedInStyleGenre.has(t));
          const hasAny = platform || genre.length > 0 || filteredStyle.length > 0 || filteredTone.length > 0;
          if (!hasAny) return null;
          return (
            <div style={{ ...s.tags, marginTop: '10px' }}>
              {platform && (
                <span style={{ ...getStyleTagStyle(), backgroundColor: 'rgba(46,204,113,0.15)', color: 'var(--color-success)', fontWeight: 600 }}>
                  平台：{platform}
                </span>
              )}
              {genre.length > 0 && (
                <span style={{ ...getStyleTagStyle(), backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--color-info-light)', fontWeight: 600 }}>
                  流派：{genre.join('·')}
                </span>
              )}
              {filteredStyle.length > 0 && (
                <span style={{ ...getStyleTagStyle(), backgroundColor: 'rgba(168,85,247,0.15)', color: 'var(--color-purple)', fontWeight: 600 }}>
                  风格：{filteredStyle.join('·')}
                </span>
              )}
              {filteredTone.length > 0 && (
                <span style={{ ...getStyleTagStyle(), backgroundColor: 'rgba(233,69,96,0.15)', color: '#ff8fa3', fontWeight: 600 }}>
                  基调：{filteredTone.join('·')}
                </span>
              )}
            </div>
          );
        })()}
        {/* 主角+地点 单行 */}
        {(idea.protagonist || idea.setting) && (
          <div style={{ fontSize: '14px', color: 'var(--color-text-dim)', marginTop: '10px', lineHeight: 1.6 }}>
            {idea.protagonist && <span>👤 <b style={{ color: 'var(--color-text-soft)' }}>{idea.protagonist}</b></span>}
            {idea.protagonist && idea.setting && <span style={{ margin: '0 8px', color: 'var(--color-text-muted)' }}>|</span>}
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
              <div style={{ ...s.label, color: 'var(--color-warning)' }}>⚠️ AI 返回了非结构化内容（原始输出）</div>
              <div style={{ ...s.value, whiteSpace: 'pre-wrap', maxHeight: '280px', overflowY: 'auto', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', fontSize: '14px', lineHeight: '1.8' }}>
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
              <div style={{ ...s.value, color: 'var(--color-accent)' }}>{idea.coreConflict}</div>
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
              <div style={{ ...s.value, color: 'var(--color-purple)', fontStyle: 'italic' }}>{idea.mainReversal}</div>
            </div>
          )}
          {idea.estimatedWords && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={s.label}>📏 动态建议篇幅</div>
              <span style={{ fontSize: '15px', color: 'var(--color-accent)', fontWeight: 700 }}>
                🔥 {typeof idea.estimatedWords === 'number' ? idea.estimatedWords.toLocaleString() + '字' : idea.estimatedWords}
              </span>
              {idea.plannedChapters && <span style={{ fontSize: '14px', color: 'var(--color-text-dim)' }}>约 {idea.plannedChapters} 章</span>}
            </div>
          )}
          {idea.scopeReason && (
            <div style={s.field}>
              <div style={s.label}>🧭 篇幅规划依据</div>
              <div style={s.value}>{idea.scopeReason}</div>
            </div>
          )}
          {Array.isArray(idea.scopeBreakdown) && idea.scopeBreakdown.length > 0 && (
            <div style={s.field}>
              <div style={s.label}>🧩 剧情线篇幅分配</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {idea.scopeBreakdown.map((item: any, index: number) => (
                  <div key={`${item.arc || 'arc'}-${index}`} style={s.value}>
                    <b style={{ color: 'var(--color-text-soft)' }}>{item.arc}</b> · {item.chapters}章：{item.reason}
                  </div>
                ))}
              </div>
            </div>
          )}
          {Array.isArray(idea.characters) && idea.characters.length > 0 && (
            <div style={s.field}>
              <div style={s.label}>👥 主要人物</div>
              <div style={s.charList}>
                {idea.characters.map((c: unknown, ci: number) => (
                  <span key={`${toStr(c)}-${ci}`} style={{ ...s.charTag, backgroundColor: ci === 0 ? 'rgba(233,69,96,0.14)' : 'rgba(255,255,255,0.05)', color: ci === 0 ? 'var(--color-accent)' : 'var(--color-text-dim)' }}>
                    {toStr(c)}
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
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--color-accent)'; }}
        >
          ✨ 选这个，创建项目
        </button>
      </div>
    </div>
  );
};

export default IdeaCard;
