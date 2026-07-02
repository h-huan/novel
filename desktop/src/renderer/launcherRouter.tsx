/**
 * LauncherRouter - 引导窗口路由
 *
 * 路由表：
 *   /              → 项目列表（欢迎页）
 *   /discover      → 灵感发现向导
 *   /settings      → 设置
 */
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LauncherLayout from './components/layout/LauncherLayout';
import ProjectListPage from './pages/ProjectListPage';
import DiscoveryWizardPage from './pages/DiscoveryWizardPage';
import SettingsPage from './pages/SettingsPage';

const LauncherRouter: React.FC = () => {
  return (
    <LauncherLayout>
      <Routes>
        <Route path="/" element={<ProjectListPage />} />
        <Route path="/discover" element={<DiscoveryWizardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </LauncherLayout>
  );
};

export default LauncherRouter;
