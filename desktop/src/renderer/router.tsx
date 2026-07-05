import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';

// Pages
import ProjectListPage from './pages/ProjectListPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import WritingPage from './pages/WritingPage';
import CharacterPage from './pages/CharacterPage';
import WorldPage from './pages/WorldPage';
import OutlinePage from './pages/OutlinePage';
import ForeshadowingPage from './pages/ForeshadowingPage';
import MaterialPage from './pages/MaterialPage';
import DiscoveryWizardPage from './pages/DiscoveryWizardPage';
import PromptChainPage from './pages/PromptChainPage';
import ConflictDashboard from './pages/ConflictDashboard';
import ImportExportPage from './pages/ImportExportPage';
import RefinementPage from './pages/RefinementPage';
import StyleWritingPage from './pages/StyleWritingPage';
import QualityStandardsPage from './pages/QualityStandardsPage';
import ProjectDashboard from './pages/ProjectDashboard';
import VisualizationPage from './pages/VisualizationPage';
import StatePage from './pages/StatePage';
import VersionHistoryPage from './pages/VersionHistoryPage';
import NewsPage from './pages/NewsPage';
import ToolsPage from './pages/ToolsPage';
import TitleCheckPage from './pages/TitleCheckPage';
import DictionaryPage from './pages/DictionaryPage';
import HelpPage from './pages/HelpPage';
import ImmersiveView from './pages/ImmersiveView';
import WeeklySummaryPage from './pages/WeeklySummaryPage';
import TimelinePage from './pages/TimelinePage';
import OrganizationMapPage from './pages/OrganizationMapPage';
import IdeaLabPage from './pages/IdeaLabPage';

const AppRouter: React.FC = () => {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/project/:id" element={<ProjectDetailRedirect />} />
        <Route path="/project/:id/dashboard" element={<ProjectDashboard />} />
        <Route path="/project/:id/writing" element={<WritingPage />} />
        <Route path="/project/:id/characters" element={<CharacterPage />} />
        <Route path="/project/:id/world" element={<WorldPage />} />
        <Route path="/project/:id/organization-map" element={<OrganizationMapPage />} />
        <Route path="/project/:id/outline" element={<OutlinePage />} />
        <Route path="/project/:id/foreshadowing" element={<ForeshadowingPage />} />
        <Route path="/project/:id/timeline" element={<TimelinePage />} />
        <Route path="/project/:id/material" element={<MaterialPage />} />
        <Route path="/project/:id/conflicts" element={<ConflictDashboard />} />
        <Route path="/project/:id/import-export" element={<ImportExportPage />} />
        <Route path="/project/:id/publish" element={<ImportExportPage />} />
        <Route path="/project/:id/refinement" element={<RefinementPage />} />
        <Route path="/project/:id/style-writing" element={<StyleWritingPage />} />
        {/* 状态和可视化已嵌套到各功能页内，保留路由以兼容直接 URL 访问 */}
        <Route path="/project/:id/state" element={<StatePage />} />
        <Route path="/project/:id/visualization" element={<VisualizationPage />} />
        <Route path="/project/:id/quality-standards" element={<QualityStandardsPage />} />
        <Route path="/project/:id/wizard" element={<ProjectDetailRedirect />} />
        <Route path="/project/:id/weekly-summary" element={<WeeklySummaryPage />} />
        <Route path="/project/:id/versions" element={<VersionHistoryPage />} />
        <Route path="/project/:id/editor/:chapterId/immersive" element={<ImmersiveView />} />
        <Route path="/project/:id/tools" element={<ToolsPage />} />
        <Route path="/discover" element={<DiscoveryWizardPage />} />
        <Route path="/inspiration" element={<Navigate to="/discover" replace />} />
        <Route path="/prompt-chains" element={<PromptChainPage />} />
        <Route path="/style-writing" element={<StyleWritingPage />} />
        <Route path="/news" element={<NewsPage />} />
        <Route path="/title-check" element={<TitleCheckPage />} />
        <Route path="/settings" element={<Navigate to="/" replace />} />
        <Route path="/dictionary" element={<DictionaryPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/idea-lab/:draftId" element={<IdeaLabPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppLayout>
  );
};

// 项目重定向：/project/:id → /project/:id/dashboard
const ProjectDetailRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/project/${id}/dashboard`} replace />;
};

export default AppRouter;
