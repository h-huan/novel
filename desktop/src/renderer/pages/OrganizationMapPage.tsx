import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useOrganizationStore } from '../stores/organizationStore';
import { useMapPointStore } from '../stores/mapPointStore';
import { useCharacterStore } from '../stores/characterStore';
import { api } from '../lib/api';
import MapTreeView from '../components/world/MapTreeView';
import MapDetailCard from '../components/world/MapDetailCard';
import OrgTreeView from '../components/world/OrgTreeView';
import OrgDetailCard from '../components/world/OrgDetailCard';
import { clampSidebar } from '../components/common/LayoutKit';
import { LocationKnowledgePanelV2 as LocationKnowledgePanel } from '../components/world/LocationKnowledgePanelV2';

type WorkbenchTab = 'map' | 'organization';

const OrganizationMapPage: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('map');
  const [selectedMapPointId, setSelectedMapPointId] = useState<string | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const { characters, fetchCharacters } = useCharacterStore();
  const [chapterMap, setChapterMap] = useState<Record<string, string>>({});

  const {
    mapPoints,
    tree: mapTree,
    fetchMapPoints,
    fetchTree: fetchMapTree,
    createMapPoint,
    updateMapPoint,
    deleteMapPoint,
    loading: mapLoading,
  } = useMapPointStore();

  const {
    organizations,
    tree: orgTree,
    fetchOrganizations,
    fetchTree: fetchOrgTree,
    createOrganization,
    updateOrganization,
    deleteOrganization,
    loading: orgLoading,
  } = useOrganizationStore();

  useEffect(() => {
    if (!projectId) return;
    fetchMapPoints(projectId);
    fetchMapTree(projectId);
    fetchOrganizations(projectId);
    fetchOrgTree(projectId);
    fetchCharacters(projectId);
    api.get(`/projects/${projectId}/outlines/tree`).then((res: any) => {
      const data = (res as any).data ?? res;
      const map: Record<string, string> = {};
      const walk = (nodes: any[]) => nodes.forEach(n => {
        if (n?.title) map[n.id] = n.title;
        if (Array.isArray(n.children)) walk(n.children);
      });
      if (Array.isArray(data)) walk(data);
      setChapterMap(map);
    }).catch(() => {});
  }, [projectId, fetchMapPoints, fetchMapTree, fetchOrganizations, fetchOrgTree, fetchCharacters]);

  const characterNameById = Object.fromEntries((characters || []).map((c: any) => [c.id, c.name]));

  const selectedMapPoint = mapPoints.find((mp) => mp.id === selectedMapPointId) || null;
  const selectedOrg = organizations.find((org) => org.id === selectedOrgId) || null;
  const isLoading = activeTab === 'map' ? mapLoading : orgLoading;
  const countBy = (rows: any[], key: string) => rows.reduce<Record<string, number>>((acc, row) => {
    const value = row?.[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
  const mapLevelCounts = countBy(mapPoints as any[], 'level');
  const orgLevelCounts = countBy(organizations as any[], 'level');
  const mapLevelLabels: Record<string, string> = {
    world: '世界/大陆',
    region: '国家/区域',
    city: '城市/据点',
    location: '具体地点',
    scene: '临时场景',
    unknown: '未分层',
  };
  const orgLevelLabels: Record<string, string> = {
    world: '世界级势力',
    global: '全书级组织',
    region: '区域级组织',
    local: '地点级组织',
    squad: '小队/暗线',
    temporary: '临时团体',
    unknown: '未分层',
  };

  const refreshMap = async () => {
    if (!projectId) return;
    await fetchMapPoints(projectId);
    await fetchMapTree(projectId);
  };

  const refreshOrg = async () => {
    if (!projectId) return;
    await fetchOrganizations(projectId);
    await fetchOrgTree(projectId);
  };

  if (!projectId) {
    return <div style={styles.emptyPage}>请先选择项目</div>;
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>地点与势力</h1>
          <p style={styles.subtitle}>管理势力层级、地点层级和故事空间关系。</p>
        </div>
        <div style={styles.tabs}>
          <button
            type="button"
            style={{ ...styles.tab, ...(activeTab === 'map' ? styles.tabActive : null) }}
            onClick={() => setActiveTab('map')}
          >
            地图 ({mapPoints.length})
          </button>
          <button
            type="button"
            style={{ ...styles.tab, ...(activeTab === 'organization' ? styles.tabActive : null) }}
            onClick={() => setActiveTab('organization')}
          >
            组织 ({organizations.length})
          </button>
        </div>
      </header>

      {isLoading && <div style={styles.loading}>加载中...</div>}

      <section style={styles.overview}>
        {(activeTab === 'map'
          ? Object.entries(mapLevelLabels).map(([key, label]) => ({ key, label, count: mapLevelCounts[key] || 0 }))
          : Object.entries(orgLevelLabels).map(([key, label]) => ({ key, label, count: orgLevelCounts[key] || 0 }))
        ).filter(item => item.count > 0 || item.key !== 'unknown').map(item => (
          <div key={item.key} style={styles.overviewItem}>
            <span style={styles.overviewLabel}>{item.label}</span>
            <strong style={styles.overviewCount}>{item.count}</strong>
          </div>
        ))}
      </section>

      {activeTab === 'map' ? (
        <section style={styles.workbench}>
          <aside style={styles.leftPane}>
            <MapTreeView
              tree={mapTree}
              selectedId={selectedMapPointId}
              onSelect={(id) => setSelectedMapPointId(id)}
              onCreateChild={async (parentId) => {
                const name = window.prompt('请输入子地点名称');
                if (!name?.trim()) return;
                const parent = mapPoints.find((mp) => mp.id === parentId);
                await createMapPoint({
                  projectId,
                  name: name.trim(),
                  parentId,
                  level: parent?.level || 'location',
                });
                await refreshMap();
              }}
              onDelete={async (mapPointId) => {
                await deleteMapPoint(mapPointId, projectId);
                if (selectedMapPointId === mapPointId) setSelectedMapPointId(null);
                await refreshMap();
              }}
            />
          </aside>
          <aside style={styles.rightPane}>
            <MapDetailCard
              mapPoint={selectedMapPoint}
              characterNameById={characterNameById}
              chapterTitleById={chapterMap}
              onUpdate={async (mapPointId, data) => {
                await updateMapPoint(mapPointId, projectId, data);
                await refreshMap();
              }}
              onDelete={async (mapPointId) => {
                await deleteMapPoint(mapPointId, projectId);
                setSelectedMapPointId(null);
                await refreshMap();
              }}
              onClose={() => setSelectedMapPointId(null)}
            />
            {selectedMapPointId && <LocationKnowledgePanel projectId={projectId} mapPointId={selectedMapPointId} />}
          </aside>
        </section>
      ) : (
        <section style={styles.workbench}>
          <aside style={styles.leftPane}>
            <OrgTreeView
              tree={orgTree}
              selectedId={selectedOrgId}
              onSelect={(id) => setSelectedOrgId(id)}
              onCreateChild={async (parentId) => {
                const name = window.prompt('请输入子组织名称');
                if (!name?.trim()) return;
                await createOrganization({
                  projectId,
                  name: name.trim(),
                  parentId,
                });
                await refreshOrg();
              }}
              onDelete={async (organizationId) => {
                await deleteOrganization(organizationId, projectId);
                if (selectedOrgId === organizationId) setSelectedOrgId(null);
                await refreshOrg();
              }}
            />
          </aside>
          <main style={styles.orgPane}>
            <OrgDetailCard
              organization={selectedOrg}
              allOrganizations={organizations}
              characterNameById={characterNameById}
              onUpdate={async (organizationId, data) => {
                await updateOrganization(organizationId, projectId, data);
                await refreshOrg();
              }}
              onDelete={async (organizationId) => {
                await deleteOrganization(organizationId, projectId);
                setSelectedOrgId(null);
                await refreshOrg();
              }}
              onClose={() => setSelectedOrgId(null)}
            />
          </main>
        </section>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--color-bg-primary)',
  },
  header: {
    minHeight: 72,
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'var(--color-bg-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  title: {
    margin: 0,
    fontSize: 18,
    lineHeight: 1.3,
    color: 'var(--color-text-primary)',
    fontWeight: 700,
  },
  subtitle: {
    margin: '4px 0 0',
    fontSize: 14,
    color: 'var(--color-text-dim)',
  },
  tabs: {
    display: 'flex',
    gap: 6,
    padding: 4,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  tab: {
    minWidth: 92,
    padding: '7px 12px',
    border: '1px solid transparent',
    borderRadius: 6,
    backgroundColor: 'transparent',
    color: 'var(--color-text-dim)',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
  },
  tabActive: {
    backgroundColor: 'rgba(233,69,96,0.14)',
    borderColor: 'rgba(233,69,96,0.34)',
    color: 'var(--color-accent)',
  },
  loading: {
    padding: '8px 20px',
    color: 'var(--color-text-dim)',
    fontSize: 14,
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  overview: {
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    padding: '10px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.1)',
    overflowX: 'auto',
  },
  overviewItem: {
    minWidth: 92,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  overviewLabel: {
    display: 'block',
    fontSize: 14,
    color: 'var(--color-text-dim)',
    whiteSpace: 'nowrap',
  },
  overviewCount: {
    display: 'block',
    marginTop: 3,
    fontSize: 18,
    color: 'var(--color-text-primary)',
  },
  overviewHint: {
    minWidth: 180,
    flex: 1,
    padding: '8px 10px',
    color: 'var(--color-text-dim)',
    fontSize: 14,
    lineHeight: 1.5,
  },
  workbench: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
  },
  leftPane: {
    ...clampSidebar(220, 22, 320),
    borderRight: '1px solid rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.08)',
    overflow: 'auto',
  },
  rightPane: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(0,0,0,0.08)',
    overflow: 'auto',
  },
  orgPane: {
    flex: 1,
    minWidth: 0,
    padding: 16,
    overflow: 'auto',
  },
  emptyPage: {
    padding: 40,
    color: 'var(--color-text-dim)',
    textAlign: 'center',
  },
};

export default OrganizationMapPage;
