/**
 * MapDetailCard - 地点详情卡片组件
 * 右侧面板，显示选中地点的详细信息（含富字段与关联名字解析）
 */
import React from 'react';
import type { MapPoint } from '@novel/shared';
import { splitToLines } from '../../lib/textList';

interface MapDetailCardProps {
  mapPoint: MapPoint | null;
  characterNameById?: Record<string, string>;
  chapterTitleById?: Record<string, string>;
  onUpdate: (id: string, data: Partial<MapPoint>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const LEVEL_LABELS: Record<string, string> = {
  world: '世界',
  region: '区域',
  country: '国家/政权',
  city: '城市',
  location: '地点',
  scene: '场景',
};

const Row: React.FC<{ label: string; children: React.ReactNode; hint?: string }> = ({ label, children, hint }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 14, fontWeight: 700, color: '#93c5fd', marginBottom: 4 }}>
      {label}
      {hint && <span style={{ fontSize: 14, color: '#6c6c80', fontWeight: 400, marginLeft: 6 }}>{hint}</span>}
    </div>
    <div style={{ fontSize: 14, color: '#c0c0d0', lineHeight: 1.7 }}>{children}</div>
  </div>
);

const EmptyHint: React.FC<{ text: string; action?: string }> = ({ text, action }) => (
  <div style={{ color: '#6c6c80', fontSize: 14, lineHeight: 1.5 }}>
    {text}
    {action && <div style={{ marginTop: 2, color: '#93c5fd' }}>{action}</div>}
  </div>
);

const BulletList: React.FC<{ value: string }> = ({ value }) => {
  const items = splitToLines(value);
  if (!items.length) return <span style={{ color: '#6c6c80' }}>暂无</span>;
  return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
};

const MapDetailCard: React.FC<MapDetailCardProps> = ({ mapPoint, characterNameById = {}, chapterTitleById = {}, onDelete, onClose }) => {
  if (!mapPoint) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8a8aa0', fontSize: 14 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🗺️</div>
        <div>选择地点查看详情</div>
      </div>
    );
  }
  const chapters = (mapPoint.linkedChapterIds || []).map(id => chapterTitleById[id] || `第${id.slice(0, 4)}章`).filter(Boolean);
  const characters = (mapPoint.linkedCharacterIds || []).map(id => characterNameById[id]).filter(Boolean);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#131b36', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#eaeaea' }}>地点详情</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#eaeaea', marginBottom: 6 }}>{mapPoint.name}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 14, color: '#e94560', backgroundColor: 'rgba(233,69,96,0.12)', border: '1px solid rgba(233,69,96,0.3)' }}>
              {LEVEL_LABELS[mapPoint.level] || mapPoint.level}
            </span>
            {mapPoint.type && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 14, color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>{mapPoint.type}</span>}
          </div>
        </div>
        <Row label="描述" hint="这个地点在故事中的作用和氛围">
          {mapPoint.description ? <div style={{ whiteSpace: 'pre-wrap' }}>{mapPoint.description}</div> : <EmptyHint text="还没有描述" action="点击左侧地点名称可以编辑" />}
        </Row>
        {mapPoint.climate && <Row label="气候/环境">{mapPoint.climate}</Row>}
        {mapPoint.resources && <Row label="资源/物产"><BulletList value={mapPoint.resources} /></Row>}
        {mapPoint.significance && <Row label="重要性与剧情意义">{mapPoint.significance}</Row>}
        {mapPoint.sensory_detail && <Row label="感官细节">{mapPoint.sensory_detail}</Row>}
        {mapPoint.coordinates && <Row label="坐标"><span style={{ fontFamily: 'monospace' }}>{mapPoint.coordinates}</span></Row>}
        <Row label={`关联章节 (${chapters.length})`} hint="哪些章节发生在这里">
          {chapters.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{chapters.map((c, i) => <span key={i} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 14, color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>{c}</span>)}</div>
          ) : (
            <EmptyHint text="还没有关联章节" action="在大纲或正文中引用此地点后会自动关联" />
          )}
        </Row>
        <Row label={`关联角色 (${characters.length})`} hint="哪些角色经常出现在这里">
          {characters.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{characters.map((c, i) => <span key={i} style={{ padding: '3px 8px', borderRadius: 4, fontSize: 14, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>{c}</span>)}</div>
          ) : (
            <EmptyHint text="还没有关联角色" action="在角色设定中关联此地点后会自动显示" />
          )}
        </Row>
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => onDelete(mapPoint.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>删除</button>
      </div>
    </div>
  );
};

export default MapDetailCard;
