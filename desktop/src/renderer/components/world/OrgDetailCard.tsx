/**
 * OrgDetailCard - 组织详情卡片组件
 * 右侧面板，显示选中组织的详细信息（含富字段与关联名字解析）
 */
import React from 'react';
import type { Organization } from '@novel/shared';
import { splitToLines } from '../../lib/textList';

const TYPE_LABELS: Record<string, string> = {
  regime: '政权', faction: '势力', army: '军队', sect: '门派', camp: '阵营', organization: '组织', other: '其他',
};

interface OrgDetailCardProps {
  organization: Organization | null;
  allOrganizations: Organization[];
  characterNameById?: Record<string, string>;
  onUpdate: (id: string, data: Partial<Organization>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 10 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', marginBottom: 3 }}>{label}</div>
    <div style={{ fontSize: 12, color: '#c0c0d0', lineHeight: 1.6 }}>{children}</div>
  </div>
);

const BulletList: React.FC<{ value: string }> = ({ value }) => {
  const items = splitToLines(value);
  if (!items.length) return <span style={{ color: '#6c6c80' }}>暂无</span>;
  return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
};

const OrgDetailCard: React.FC<OrgDetailCardProps> = ({
  organization, allOrganizations, characterNameById = {}, onDelete, onClose,
}) => {
  if (!organization) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8a8aa0', fontSize: 12 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚔️</div>
        <div>选择组织查看详情</div>
      </div>
    );
  }

  let relationships: Array<{ name?: string; type?: string; description?: string; target?: string }> = [];
  if (typeof organization.relationships_json === 'string') {
    try { relationships = JSON.parse(organization.relationships_json); } catch {}
  } else if (Array.isArray(organization.relationships_json)) {
    relationships = organization.relationships_json;
  }
  const parentOrg = allOrganizations.find(o => o.id === organization.parentId);
  const childOrgs = allOrganizations.filter(o => o.parentId === organization.id);
  const leaderName = organization.leader ? (characterNameById[organization.leader] || organization.leader) : '';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#131b36', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#eaeaea' }}>组织详情</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: '#8a8aa0', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#eaeaea', marginBottom: 4 }}>{organization.name}</div>
        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, color: '#a855f7', backgroundColor: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.3)' }}>
          {TYPE_LABELS[organization.type] || organization.type}
        </span>
        {organization.description && <Row label="描述">{organization.description}</Row>}
        {leaderName && <Row label="领袖">{leaderName}</Row>}
        {organization.strength_level && <Row label="实力等级">{organization.strength_level}</Row>}
        {organization.territory && <Row label="领地/范围"><BulletList value={organization.territory} /></Row>}
        {organization.characteristics && <Row label="特点"><BulletList value={organization.characteristics} /></Row>}
        {organization.signature_equipment && <Row label="标志性装备/手段"><BulletList value={organization.signature_equipment} /></Row>}
        {relationships.length > 0 && (
          <Row label={`关系 (${relationships.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {relationships.map((r, i) => (
                <div key={i} style={{ padding: 7, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <strong style={{ color: '#a78bfa' }}>{r.name || r.target || '?'}</strong>
                  {r.type && <span style={{ color: '#8a8aa0', marginLeft: 6 }}>{r.type}</span>}
                  {r.description && <div style={{ marginTop: 2, color: '#c0c0d0' }}>{r.description}</div>}
                </div>
              ))}
            </div>
          </Row>
        )}
        {parentOrg && <Row label="上级组织">{parentOrg.name}</Row>}
        {childOrgs.length > 0 && (
          <Row label={`下属组织 (${childOrgs.length})`}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{childOrgs.map(c => <span key={c.id} style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, color: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.2)' }}>{c.name}</span>)}</div>
          </Row>
        )}
      </div>
      <div style={{ padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <button type="button" onClick={() => onDelete(organization.id)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>删除</button>
      </div>
    </div>
  );
};

export default OrgDetailCard;
