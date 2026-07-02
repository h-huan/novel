/**
 * 组织/势力 共享类型
 */

/** 组织类型 */
export type OrganizationType =
  | 'regime' // 政权/朝廷/政府
  | 'faction' // 势力/派系
  | 'army' // 军队/武装力量
  | 'sect' // 门派/宗派/学院
  | 'camp' // 阵营/联盟
  | 'organization' // 组织/机构/公司
  | 'other'; // 其他

export interface Organization {
  id: string;
  projectId: string;
  name: string;
  type: OrganizationType;
  description: string;
  parentId?: string | null;
  level?: string;
  createdAt: string;
  updatedAt: string;
}

/** 树状节点（含子组织） */
export interface OrganizationTreeNode extends Organization {
  children: OrganizationTreeNode[];
}
