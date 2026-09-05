/**
 * LauncherRouter - 引导窗口路由
 *
 * 路由表：
 *   /                   → 创作质量看板（落地页＝唯一数据驾驶舱：紧凑创建入口 + 范围筛选 + 质量KPI + 质量画像/每日变化/返工与效率三视图；不再另设独立数据看板页，无 Hero/最近作品/系统状态行/创作进度漏斗）
 *   /projects           → 项目管理（搜索/筛选/新建/删除；/projects?new=1 自动打开新建弹窗）
 *   /discover           → 灵感发现向导
 *   /module-standards   → 最新执行标准（唯一参与执行）
 *   /standards-history  → 标准发展历程（只读回顾）
 *   /settings           → 设置
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LauncherLayout from './components/layout/LauncherLayout';
import WorkbenchPage from './pages/WorkbenchPage';
import ProjectListPage from './pages/ProjectListPage';
import DiscoveryWizardPage from './pages/DiscoveryWizardPage';
import PlatformStandardsPage from './pages/PlatformStandardsPage';
import StandardsHistoryPage from './pages/StandardsHistoryPage';
import SettingsPage from './pages/SettingsPage';

const LauncherRouter: React.FC = () => {
  return (
    <LauncherLayout>
      <Routes>
        <Route path="/" element={<WorkbenchPage />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/discover" element={<DiscoveryWizardPage />} />
        <Route path="/module-standards" element={<PlatformStandardsPage />} />
        <Route path="/standards-history" element={<StandardsHistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LauncherLayout>
  );
};

export default LauncherRouter;
