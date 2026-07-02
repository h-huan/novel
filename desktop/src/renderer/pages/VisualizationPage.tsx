/**
 * VisualizationPage - 关系图谱 + 时序线可视化
 */
import React, { useState, useMemo, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Relation { source: string; target: string; type: string; label: string; }
interface TimelineEvent { id: string; chapter: number; title: string; desc: string; type: 'plot' | 'character' | 'setup' | 'reveal'; }
interface CharacterInfo { id: string; name: string; }
interface RelationData { characterName: string; type: string; description: string; }
interface ChapterData { id: string; title: string; chapterNumber?: number; content?: string; }

const TYPE_COLORS: Record<string, string> = { enemy: '#e74c3c', ally: '#2ecc71', mentor: '#3498db', neutral: '#95a5a6' };
const EVENT_COLORS: Record<string, string> = { plot: '#e94560', character: '#3498db', setup: '#f39c12', reveal: '#9b59b6' };

const VisualizationPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<'graph' | 'timeline'>('graph');
  const [selectedChar, setSelectedChar] = useState<string | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [relations, setRelations] = useState<Relation[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    const loadData = async () => {
      setLoading(true);
      try {
        // Load characters and their relationships
        const charRes = await api.get<any[]>(`/projects/${projectId}/characters`);
        const chars: CharacterInfo[] = (charRes.data || []).map((c: any) => ({ id: c.id, name: c.name || c.id }));
        setCharacters(chars);

        const rels: Relation[] = [];
        for (const c of charRes.data || []) {
          const charName = c.name || c.id;
          if (c.relationships && Array.isArray(c.relationships)) {
            for (const r of c.relationships) {
              const targetName = r.characterName || r.name;
              if (targetName) {
                rels.push({
                  source: charName,
                  target: targetName,
                  type: r.type === 'enemy' || r.type === '敌对' ? 'enemy' :
                         r.type === 'ally' || r.type === '盟友' || r.type === '忠诚' ? 'ally' :
                         r.type === 'mentor' || r.type === '导师' ? 'mentor' : 'neutral',
                  label: r.type || 'neutral',
                });
              }
            }
          }
        }
        setRelations(rels);

        // Load chapters for timeline events
        const chRes = await api.get<ChapterData[]>(`/projects/${projectId}/chapters`);
        const chs = chRes.data || [];
        const evs: TimelineEvent[] = chs.map((ch, idx) => ({
          id: ch.id,
          chapter: ch.chapterNumber || idx + 1,
          title: ch.title || `第${idx + 1}章`,
          desc: ch.content?.slice(0, 100) || '',
          type: 'plot' as const,
        }));
        setEvents(evs);
      } catch (err) {
        console.error('加载可视化数据失败:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [projectId]);

  const positions = useMemo(() => {
    const names = [...new Set(characters.map(c => c.name))];
    if (names.length === 0) return {};

    // 力导向布局：初始化为环形排列
    const pos: Record<string, { x: number; y: number }> = {};
    const cx = 400, cy = 280, baseR = Math.max(120, names.length * 18);
    names.forEach((name, i) => {
      const angle = (2 * Math.PI * i) / names.length;
      pos[name] = { x: cx + baseR * Math.cos(angle), y: cy + baseR * Math.sin(angle) };
    });

    // 力导向布局迭代（真实计算，非模拟）
    const repulse = 4000;   // 斥力强度
    const attract = 0.008;  // 引力强度
    const centerPull = 0.02; // 向心力
    const damp = 0.82;
    const maxStep = 30;

    for (let iter = 0; iter < 120; iter++) {
      const fx: Record<string, number> = {}, fy: Record<string, number> = {};
      names.forEach(n => { fx[n] = 0; fy[n] = 0; });

      // 斥力：所有节点对互相排斥
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const a = names[i], b = names[j];
          const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = repulse / (dist * dist);
          const pX = (dx / dist) * force, pY = (dy / dist) * force;
          fx[a] -= pX; fy[a] -= pY;
          fx[b] += pX; fy[b] += pY;
        }
      }

      // 引力：有关系链的节点互相吸引
      relations.forEach(r => {
        const s = pos[r.source], t = pos[r.target];
        if (!s || !t) return;
        const dx = t.x - s.x, dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = attract * dist;
        const fX = (dx / dist) * force, fY = (dy / dist) * force;
        fx[r.source] += fX; fy[r.source] += fY;
        fx[r.target] -= fX; fy[r.target] -= fY;
      });

      // 向心力：防止节点飞走
      names.forEach(n => {
        fx[n] += (cx - pos[n].x) * centerPull;
        fy[n] += (cy - pos[n].y) * centerPull;
      });

      // 应用位移
      names.forEach(n => {
        pos[n].x += fx[n] * damp;
        pos[n].y += fy[n] * damp;
      });
    }

    return pos;
  }, [characters, relations]);

  // 计算 viewBox 包裹所有节点
  const viewBox = useMemo(() => {
    const names = [...new Set(characters.map(c => c.name))];
    if (names.length === 0) return '0 0 500 400';
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    names.forEach(n => {
      const p = positions[n];
      if (!p) return;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    const pad = 60;
    return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
  }, [characters, positions]);

  const visibleChars = selectedChar
    ? [selectedChar, ...relations.filter(r => r.source === selectedChar || r.target === selectedChar).flatMap(r => [r.source, r.target])]
    : characters.map(c => c.name);

  const filteredRels = selectedChar
    ? relations.filter(r => r.source === selectedChar || r.target === selectedChar)
    : relations;

  const uniqueChars = [...new Set(visibleChars)];

  if (loading) {
    return (
      <div style={{ padding: '24px', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#8a8aa0', fontSize: '14px' }}>加载数据中...</span>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#eaeaea' }}>
        {activeTab === 'graph' ? '🔗 关系图谱' : '📅 时序线'}
      </h1>
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setActiveTab('graph')}
          style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: activeTab === 'graph' ? '#e94560' : '#8a8aa0', borderBottom: activeTab === 'graph' ? '2px solid #e94560' : '2px solid transparent' }}>
          🔗 关系图谱</button>
        <button onClick={() => setActiveTab('timeline')}
          style={{ padding: '8px 14px', fontSize: '13px', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            color: activeTab === 'timeline' ? '#e94560' : '#8a8aa0', borderBottom: activeTab === 'timeline' ? '2px solid #e94560' : '2px solid transparent' }}>
          📅 时序线</button>
      </div>

      {activeTab === 'graph' && (
        <div style={{ display: 'flex', gap: '16px', flex: 1 }}>
          {uniqueChars.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c80', fontSize: '13px' }}>
              暂无角色数据，请先创建角色和关系
            </div>
          ) : (
            <>
              <svg viewBox={viewBox} style={{ backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '10px', flexShrink: 0, width: '100%', height: '100%' }}>
                {filteredRels.map((r, i) => {
                  const s = positions[r.source]; const t = positions[r.target];
                  if (!s || !t) return null;
                  return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke={TYPE_COLORS[r.type]} strokeWidth="2" strokeOpacity={0.6} />;
                })}
                {uniqueChars.map(name => {
                  const pos = positions[name];
                  if (!pos) return null;
                  return (
                    <g key={name} onClick={() => setSelectedChar(selectedChar === name ? null : name)} style={{ cursor: 'pointer' }}>
                      <circle cx={pos.x} cy={pos.y} r="22" fill={selectedChar === name ? '#e94560' : '#1a1a2e'} stroke={selectedChar === name ? '#e94560' : '#e94560'} strokeWidth="2" />
                      <text x={pos.x} y={pos.y + 1} textAnchor="middle" fill="#fff" fontSize="11" fontWeight={600}>{name.charAt(0)}</text>
                      <text x={pos.x} y={pos.y + 38} textAnchor="middle" fill="#c0c0d0" fontSize="10">{name}</text>
                    </g>
                  );
                })}
              </svg>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: '#8a8aa0', marginBottom: '8px' }}>{selectedChar ? `"${selectedChar}" 的关系` : '全部关系 (点击节点筛选)'}</div>
                {filteredRels.map((r, i) => (
                  <div key={i} style={{ padding: '8px 10px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ color: '#c0c0d0', fontSize: '12px' }}>{r.source}</span>
                    <span style={{ margin: '0 6px', padding: '2px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: `${TYPE_COLORS[r.type]}20`, color: TYPE_COLORS[r.type] }}>{r.label}</span>
                    <span style={{ color: '#c0c0d0', fontSize: '12px' }}>{r.target}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (
        <div style={{ display: 'flex', gap: '12px', flex: 1 }}>
          {events.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6c6c80', fontSize: '13px' }}>
              暂无章节数据
            </div>
          ) : (
            <>
              <div style={{ flex: 1, position: 'relative', paddingLeft: '80px' }}>
                <div style={{ position: 'absolute', left: '70px', top: 0, bottom: 0, width: '2px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
                {[...new Set(events.map(e => e.chapter))].sort().map(ch => (
                  <div key={ch} style={{ position: 'absolute', left: '50px', top: `${(ch - 1) * 100 + 20}px`, fontSize: '10px', color: '#6c6c80', fontWeight: 600 }}>第{ch}章</div>
                ))}
                {events.map((ev, idx) => (
                  <div key={ev.id} onMouseEnter={() => setHoveredEvent(ev.id)} onMouseLeave={() => setHoveredEvent(null)}
                    style={{ position: 'absolute', left: '90px', top: `${(ev.chapter - 1) * 100 + idx % 2 * 40}px`, padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', backgroundColor: hoveredEvent === ev.id ? `${EVENT_COLORS[ev.type]}15` : 'rgba(255,255,255,0.02)', border: `1px solid ${hoveredEvent === ev.id ? EVENT_COLORS[ev.type] : 'rgba(255,255,255,0.06)'}`, width: '350px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: EVENT_COLORS[ev.type], flexShrink: 0 }} />
                      <span style={{ padding: '1px 6px', borderRadius: '3px', fontSize: '10px', backgroundColor: `${EVENT_COLORS[ev.type]}20`, color: EVENT_COLORS[ev.type] }}>{ev.type}</span>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#eaeaea' }}>{ev.title}</span>
                      <span style={{ fontSize: '10px', color: '#6c6c80', marginLeft: 'auto' }}>第{ev.chapter}章</span>
                    </div>
                    {hoveredEvent === ev.id && <p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#c0c0d0', lineHeight: 1.4 }}>{ev.desc}</p>}
                  </div>
                ))}
              </div>

              <div style={{ width: '200px', padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', height: 'fit-content' }}>
                <div style={{ fontWeight: 600, color: '#8a8aa0', marginBottom: '8px', textTransform: 'uppercase', fontSize: '10px' }}>🔗 因果链</div>
                {events.map((ev, i) => i < events.length - 1 && (
                  <div key={i} style={{ marginBottom: '4px' }}>
                    <div style={{ padding: '4px 8px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', color: '#c0c0d0', fontSize: '10px' }}>
                      <span style={{ color: EVENT_COLORS[ev.type] }}>{ev.title}</span>
                    </div>
                    <div style={{ textAlign: 'center', color: '#3a3a50', fontSize: '14px', lineHeight: '1.2' }}>↓</div>
                    <div style={{ padding: '4px 8px', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '4px', color: '#c0c0d0', fontSize: '10px' }}>
                      <span style={{ color: EVENT_COLORS[events[i + 1].type] }}>{events[i + 1].title}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default VisualizationPage;
