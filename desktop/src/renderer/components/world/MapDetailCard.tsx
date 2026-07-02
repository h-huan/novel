/**
 * MapDetailCard - 地点详情卡片组件
 * 右侧面板，显示选中地点的详细信息
 */
import React from 'react';
import type { MapPoint } from '@novel/shared';

interface MapDetailCardProps {
  mapPoint: MapPoint | null;
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

const MapDetailCard: React.FC<MapDetailCardProps> = ({ mapPoint, onUpdate, onDelete, onClose }) => {
  if (!mapPoint) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-secondary border-l border-border">
        <div className="text-center text-text-muted text-xs">
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🗺️</div>
          <div>选择地点查看详情</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-secondary border-l border-border">
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-text-primary text-xs font-medium">地点详情</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          ×
        </button>
      </div>

      {/* 详情内容 */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {/* 名称 */}
        <div>
          <label className="text-text-muted text-xs block mb-1">名称</label>
          <div className="text-text-primary text-sm font-medium">{mapPoint.name}</div>
        </div>

        {/* 层级 */}
        <div>
          <label className="text-text-muted text-xs block mb-1">层级</label>
          <span className="px-2 py-1 rounded bg-accent/10 text-accent text-xs">
            {LEVEL_LABELS[mapPoint.level] || mapPoint.level}
          </span>
        </div>

        {/* 类型 */}
        {mapPoint.type && (
          <div>
            <label className="text-text-muted text-xs block mb-1">类型</label>
            <div className="text-text-secondary text-xs">{mapPoint.type}</div>
          </div>
        )}

        {/* 描述 */}
        <div>
          <label className="text-text-muted text-xs block mb-1">描述</label>
          <div className="text-text-secondary text-xs leading-relaxed">
            {mapPoint.description || <span className="text-text-muted italic">暂无描述</span>}
          </div>
        </div>

        {/* 坐标 */}
        {mapPoint.coordinates && (
          <div>
            <label className="text-text-muted text-xs block mb-1">坐标</label>
            <div className="text-text-secondary text-xs font-mono">{mapPoint.coordinates}</div>
          </div>
        )}

        {/* 关联章节 */}
        {mapPoint.linkedChapterIds && mapPoint.linkedChapterIds.length > 0 && (
          <div>
            <label className="text-text-muted text-xs block mb-1">
              关联章节 ({mapPoint.linkedChapterIds.length})
            </label>
            <div className="flex flex-wrap gap-1">
              {mapPoint.linkedChapterIds.map((cid) => (
                <span key={cid} className="px-1.5 py-0.5 rounded bg-bg-primary text-text-muted text-xs">
                  Ch{cid.slice(0, 4)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 关联角色 */}
        {mapPoint.linkedCharacterIds && mapPoint.linkedCharacterIds.length > 0 && (
          <div>
            <label className="text-text-muted text-xs block mb-1">
              关联角色 ({mapPoint.linkedCharacterIds.length})
            </label>
            <div className="flex flex-wrap gap-1">
              {mapPoint.linkedCharacterIds.map((cid) => (
                <span key={cid} className="px-1.5 py-0.5 rounded bg-bg-primary text-text-muted text-xs">
                  {cid.slice(0, 4)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 时间信息 */}
        <div className="pt-2 border-t border-border/50">
          <div className="text-text-muted text-xs">
            创建: {new Date(mapPoint.createdAt).toLocaleDateString('zh-CN')}
          </div>
          <div className="text-text-muted text-xs">
            更新: {new Date(mapPoint.updatedAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="px-3 py-2 border-t border-border flex gap-2">
        <button
          onClick={() => onDelete(mapPoint.id)}
          className="flex-1 px-3 py-1.5 rounded text-xs text-accent border border-accent/30 hover:bg-accent/5 transition-colors"
          style={{ background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          删除
        </button>
      </div>
    </div>
  );
};

export default MapDetailCard;
