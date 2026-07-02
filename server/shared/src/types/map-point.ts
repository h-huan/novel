/**
 * 地图地点 共享类型
 */

/** 地点层级 */
export type MapLevel =
  | 'world' // 世界
  | 'region' // 区域（替代"大陆"，更贴合中国地理叙事：华北/东北等）
  | 'country' // 国家/政权
  | 'city' // 城市
  | 'location' // 地点
  | 'scene'; // 场景

/**
 * 地点类型 —— 自由字符串（如 city / mountain / river / dungeon 等），
 * 这里仅提供常见预设值供前端下拉参考，后端不强制校验。
 */
export type MapPointType = string;

export interface MapPoint {
  id: string;
  projectId: string;
  name: string;
  type: MapPointType;
  description: string;
  parentId?: string | null;
  level: MapLevel;
  coordinates?: string; // "x,y" 格式
  linkedChapterIds: string[];
  linkedCharacterIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** 树状节点（含子地点） */
export interface MapPointTreeNode extends MapPoint {
  children: MapPointTreeNode[];
}
