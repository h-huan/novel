/**
 * LauncherApp - 欢迎引导窗口根组件
 *
 * 类似 IntelliJ IDEA 的欢迎窗口：
 * - 项目列表（点击进入主窗口）
 * - 新建项目
 * - 灵感发现（跳转灵感发现向导）
 * - 最近项目快捷入口
 *
 * 没有侧边栏，没有主窗口 Header 菜单，极简设计。
 */
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import LauncherRouter from './launcherRouter';

const LauncherApp: React.FC = () => {
  return (
    <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <LauncherRouter />
    </MemoryRouter>
  );
};

export default LauncherApp;
