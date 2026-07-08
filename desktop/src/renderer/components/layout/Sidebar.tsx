import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppStore } from '../../stores/appStore';

interface NavItem {
  id: string;
  label: string;
  path: string | null;
  icon: React.ReactNode;
  requireProject?: boolean;
}

const SVG = (d: string, viewBox = '0 0 16 16') => (
  <svg viewBox={viewBox} className="w-4 h-4 fill-current" dangerouslySetInnerHTML={{ __html: d }} />
);

const ICONS: Record<string, React.ReactNode> = {
  project:   SVG('<rect x="1" y="2" width="6" height="5" rx="0.5"/><rect x="9" y="2" width="6" height="5" rx="0.5"/>'),
  dashboard: SVG('<path d="M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z"/>'),
  writing:   SVG('<path d="M2 13l0.5-2.5L10 3l2 2-7.5 7.5L2 13z"/>'),
  outline:   SVG('<line x1="2" y1="3" x2="14" y2="3"/><line x1="2" y1="7" x2="14" y2="7"/><line x1="2" y1="11" x2="10" y2="11"/><circle cx="13" cy="11" r="1.5"/>'),
  character: SVG('<circle cx="8" cy="4" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/>'),
  world:     SVG('<circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="3" ry="6"/><line x1="2" y1="8" x2="14" y2="8"/>'),
  orgMap:    SVG('<circle cx="5" cy="4" r="2"/><circle cx="11" cy="4" r="2"/><circle cx="8" cy="12" r="2"/><line x1="5.8" y1="5.6" x2="7.2" y2="10.4" stroke-width="1.2" fill="none"/><line x1="10.2" y1="5.6" x2="8.8" y2="10.4" stroke-width="1.2" fill="none"/>'),
  foreshadow:SVG('<circle cx="8" cy="3" r="1.5"/><line x1="8" y1="4.5" x2="8" y2="8"/><path d="M4 14l4-6 4 6"/>'),
  material:  SVG('<rect x="2" y="2" width="5" height="4" rx="0.5"/><rect x="9" y="2" width="5" height="4" rx="0.5"/><rect x="2" y="8" width="5" height="4" rx="0.5"/><rect x="9" y="8" width="5" height="4" rx="0.5"/>'),
  conflict:  SVG('<circle cx="8" cy="8" r="1.5"/><path d="M8 2v4M8 10v4M2 8h4M10 8h4M3.8 3.8l2.8 2.8M9.4 9.4l2.8 2.8M3.8 12.2l2.8-2.8M9.4 6.6l2.8-2.8" stroke-width="1.2" fill="none"/>'),
  importExport:SVG('<path d="M8 2v8M4 6l4-4 4 4M8 14V6M4 10l4 4 4-4"/>'),
  refinement:SVG('<path d="M3 3l2 2-1 4 4-1 2 2M13 13l-2-2 1-4-4 1-2-2"/>'),
  style:     SVG('<circle cx="5" cy="8" r="2.5"/><circle cx="11" cy="5" r="2.5"/><circle cx="11" cy="11" r="2.5"/>'),
  viz:       SVG('<circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><circle cx="8" cy="11" r="2"/><line x1="6.5" y1="6.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="6.5" x2="6.5" y2="9.5"/>'),
  state:     SVG('<circle cx="8" cy="8" r="6" fill="none" stroke-width="1.5"/><path d="M8 4v4l3 2" fill="none" stroke-width="1.5"/>'),
  version:   SVG('<line x1="3" y1="3" x2="13" y2="3"/><line x1="3" y1="7" x2="9" y2="7"/><circle cx="12" cy="10" r="2.5"/><path d="M11.5 9.5L14 12"/>'),
  tools:     SVG('<circle cx="5" cy="5" r="1.5"/><circle cx="11" cy="11" r="1.5"/><line x1="6.3" y1="9.7" x2="9.7" y2="6.3"/><path d="M3 3l3 3M10 10l3 3"/>'),
  inspiration:SVG('<path d="M8 1l1.5 4.5h4.5l-3.5 2.5 1.5 4.5L8 10l-3.5 2.5 1.5-4.5L2.5 5.5H7L8.5 1z"/>'),
  chain:     SVG('<rect x="1" y="4" width="5" height="3" rx="1"/><rect x="10" y="4" width="5" height="3" rx="1"/><line x1="6" y1="5.5" x2="10" y2="5.5"/><circle cx="3.5" cy="11" r="1.5"/><line x1="5" y1="11" x2="9" y2="11"/><circle cx="12.5" cy="11" r="1.5"/>'),
  titlecheck:SVG('<rect x="1" y="3" width="14" height="2" rx="0.5"/><rect x="1" y="7" width="14" height="2" rx="0.5"/><rect x="1" y="11" width="10" height="2" rx="0.5"/>'),
  news:      SVG('<rect x="1" y="2" width="14" height="12" rx="1"/><line x1="3" y1="5" x2="11" y2="5"/><line x1="3" y1="8" x2="13" y2="8"/><line x1="3" y1="11" x2="8" y2="11"/>'),
  settings:  SVG('<circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1.5 4.5l1.5 2.6M11 8.9l1.5 2.6M14.5 4.5l-1.5 2.6M5 8.9L3.5 11.5"/>'),
  timeline:  SVG('<line x1="2" y1="4" x2="14" y2="4" stroke-width="1.2" fill="none"/><line x1="2" y1="8" x2="10" y2="8" stroke-width="1.2" fill="none"/><line x1="2" y1="12" x2="12" y2="12" stroke-width="1.2" fill="none"/><circle cx="14" cy="4" r="1.5" fill="currentColor"/><circle cx="10" cy="8" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>'),
  continuity:SVG('<path d="M2 8a6 6 0 0 1 10.2-4.2"/><path d="M12 2v4H8"/><path d="M14 8a6 6 0 0 1-10.2 4.2"/><path d="M4 14v-4h4" fill="none" stroke-width="1.4"/>'),
};

const Sidebar: React.FC = () => {
  const { sidebarCollapsed, toggleSidebar } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();

  // 从 URL 提取当前项目 ID: /project/:id/xxx → id
  const pid = useMemo(() => {
    const match = location.pathname.match(/^\/project\/([^/]+)/);
    return match ? match[1] : null;
  }, [location.pathname]);

  // 仅项目功能 tab（非项目 tab 已移到顶部 Header）
  const projectItems: NavItem[] = pid ? [
    { id: 'dashboard', label: '首页', path: `/project/${pid}/dashboard`, icon: ICONS.dashboard },
    { id: 'writing', label: '写作', path: `/project/${pid}/writing`, icon: ICONS.writing },
    { id: 'outline', label: '大纲', path: `/project/${pid}/outline`, icon: ICONS.outline },
    { id: 'character', label: '角色', path: `/project/${pid}/characters`, icon: ICONS.character },
    { id: 'world', label: '世界观', path: `/project/${pid}/world`, icon: ICONS.world },
    { id: 'orgMap', label: '组织与地图', path: `/project/${pid}/organization-map`, icon: ICONS.orgMap },
    { id: 'foreshadow', label: '伏笔', path: `/project/${pid}/foreshadowing`, icon: ICONS.foreshadow },
    { id: 'timeline', label: '时间线', path: `/project/${pid}/timeline`, icon: ICONS.timeline },
    { id: 'continuity', label: '连续性驾驶舱', path: `/project/${pid}/continuity`, icon: ICONS.continuity },
    { id: 'state', label: '状态确稿', path: `/project/${pid}/state`, icon: ICONS.state },
    { id: 'material', label: '素材', path: `/project/${pid}/material`, icon: ICONS.material },
    { id: 'conflict', label: '冲突检测', path: `/project/${pid}/conflicts`, icon: ICONS.conflict },
    { id: 'importExport', label: '导入导出', path: `/project/${pid}/import-export`, icon: ICONS.importExport },
    { id: 'refinement', label: '精修', path: `/project/${pid}/refinement`, icon: ICONS.refinement },
    { id: 'version', label: '版本历史', path: `/project/${pid}/versions`, icon: ICONS.version },
    { id: 'tools', label: '工具', path: `/project/${pid}/tools`, icon: ICONS.tools },
  ] : [];

  const isActive = (item: NavItem): boolean => {
    if (!item.path) return false;
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path);
  };

  return (
    <aside
      className={`
        h-full bg-bg-secondary border-r border-border
        flex flex-col select-none
        sidebar-transition
        ${sidebarCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'}
      `}
    >
      <div className="h-header flex items-center justify-center border-b border-border px-3">
        {sidebarCollapsed ? (
          <span className="text-accent text-lg font-bold">AI</span>
        ) : (
          <span className="text-accent text-base font-bold tracking-wide truncate">
            AI 写作
          </span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {projectItems.map((item) => (
          <button
            key={item.id}
            onClick={() => item.path && navigate(item.path)}
            className={`
              w-full flex items-center gap-3 px-3 py-2.5 text-sm
              transition-colors duration-150
              ${sidebarCollapsed ? 'justify-center' : 'justify-start'}
              ${
                isActive(item)
                  ? 'bg-accent/10 text-accent border-r-2 border-accent'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }
            `}
            title={sidebarCollapsed ? item.label : undefined}
          >
            <span className="flex-shrink-0">{item.icon}</span>
            {!sidebarCollapsed && (
              <span className="truncate">{item.label}</span>
            )}
          </button>
        ))}
      </nav>

      {/* Collapse Toggle */}
      <div className="border-t border-border p-2">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 rounded-md
                     text-text-muted hover:text-text-primary hover:bg-white/5
                     transition-colors duration-150"
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          <svg
            viewBox="0 0 16 16"
            className={`w-4 h-4 fill-current transition-transform duration-250 ${
              sidebarCollapsed ? 'rotate-180' : ''
            }`}
          >
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
