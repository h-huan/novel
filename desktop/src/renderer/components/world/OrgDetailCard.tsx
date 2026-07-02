/**
 * OrgDetailCard - 组织详情卡片组件
 * 右侧面板，显示选中组织的详细信息
 */
import React from 'react';
import type { Organization } from '@novel/shared';

interface OrgDetailCardProps {
  organization: Organization | null;
  allOrganizations: Organization[];
  onUpdate: (id: string, data: Partial<Organization>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  regime: '政权',
  faction: '势力',
  army: '军队',
  sect: '门派',
  camp: '阵营',
  organization: '组织',
  other: '其他',
};

const OrgDetailCard: React.FC<OrgDetailCardProps> = ({
  organization, allOrganizations, onUpdate, onDelete, onClose,
}) => {
  if (!organization) {
    return (
      <div className="h-full flex items-center justify-center bg-bg-secondary border-l border-border">
        <div className="text-center text-text-muted text-xs">
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚔️</div>
          <div>选择组织查看详情</div>
        </div>
      </div>
    );
  }

  const parentOrg = allOrganizations.find(o => o.id === organization.parentId);
  const childOrgs = allOrganizations.filter(o => o.parentId === organization.id);

  return (
    <div className="h-full flex flex-col bg-bg-secondary border-l border-border">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-text-primary text-xs font-medium">组织详情</span>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary transition-colors"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px' }}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        <div>
          <label className="text-text-muted text-xs block mb-1">名称</label>
          <div className="text-text-primary text-sm font-medium">{organization.name}</div>
        </div>

        <div>
          <label className="text-text-muted text-xs block mb-1">类型</label>
          <span className="px-2 py-1 rounded bg-accent/10 text-accent text-xs">
            {TYPE_LABELS[organization.type] || organization.type}
          </span>
        </div>

        {organization.description && (
          <div>
            <label className="text-text-muted text-xs block mb-1">描述</label>
            <div className="text-text-secondary text-xs leading-relaxed">{organization.description}</div>
          </div>
        )}

        {parentOrg && (
          <div>
            <label className="text-text-muted text-xs block mb-1">上级组织</label>
            <div className="text-text-secondary text-xs">{parentOrg.name}</div>
          </div>
        )}

        {childOrgs.length > 0 && (
          <div>
            <label className="text-text-muted text-xs block mb-1">下属组织 ({childOrgs.length})</label>
            <div className="flex flex-wrap gap-1">
              {childOrgs.map((child) => (
                <span key={child.id} className="px-1.5 py-0.5 rounded bg-bg-primary text-text-muted text-xs">
                  {child.name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-2 border-t border-border/50">
          <div className="text-text-muted text-xs">
            创建: {new Date(organization.createdAt).toLocaleDateString('zh-CN')}
          </div>
          <div className="text-text-muted text-xs">
            更新: {new Date(organization.updatedAt).toLocaleDateString('zh-CN')}
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border flex gap-2">
        <button
          onClick={() => onDelete(organization.id)}
          className="flex-1 px-3 py-1.5 rounded text-xs text-accent border border-accent/30 hover:bg-accent/5 transition-colors"
          style={{ background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          删除
        </button>
      </div>
    </div>
  );
};

export default OrgDetailCard;
