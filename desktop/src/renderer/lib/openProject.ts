/**
 * 打开项目 - 统一入口
 *
 * 在引导窗口（launcher）中调用时：通过 IPC 通知主进程关闭引导窗口并打开主窗口
 * 在主窗口中调用时：直接通过路由导航
 */

export async function openProject(
  projectId: string,
  projectTitle: string,
  navigate?: (path: string) => void,
): Promise<void> {
  // 如果 electronAPI 存在且有 open-project 通道，说明在引导窗口中
  if (window.electronAPI?.invoke) {
    try {
      await window.electronAPI.invoke('open-project', { projectId, projectTitle });
      // IPC 成功后引导窗口会被主进程关闭，不需要后续操作
      return;
    } catch (ipcErr) {
      // IPC 失败：可能是主进程异常或已在主窗口中
      console.warn('[openProject] IPC 调用失败，尝试路由回退:', ipcErr);
    }
    // IPC 失败后的回退：launcher 没有 dashboard 路由，回到首页让用户手动选择
    navigate?.('/');
    return;
  }

  // 浏览器环境或主窗口：直接路由导航（HashRouter 支持 hash 路径）
  navigate?.(`/project/${projectId}/dashboard`);
}
