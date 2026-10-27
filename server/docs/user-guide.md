# 使用指南

本文件只说明怎么使用项目，不维护第二套执行规则。

## 启动

从仓库根目录分别打开两个终端。后端独立启动：

```powershell
cd server
npm ci
npm run start:dev
```

桌面端独立启动：

```powershell
cd desktop
npm ci
npm run dev
```

桌面端命令启动 Vite 与 Electron 窗口，**不会自动拉起或重启后端**；后端需要在自己的终端单独启动。后端默认地址：`http://127.0.0.1:3100`。

## 主要入口

- `/discover`：灵感发现与创建小说的唯一入口。
- `/projects`：项目列表。
- `/project/:id/dashboard`：项目工作台。
- `/project/:id/outline`：小说架构与章节规划。
- `/project/:id/writing`：正文写作。
- `/project/:id/writing-quality`：质量与一致性检查。
- `/module-standards`：查看当前执行标准的代码镜像。

## 模型配置

在设置页配置灵感、架构、正文、润色/质检和日常场景的模型。未配置对应模型时，系统应明确停止并提示，不静默降级到其它模型。

## 执行标准

小说业务与质量规则的唯一来源是 `server/shared/src/执行标准.ts`；`QUALITY_EXECUTION.md` 仅保留旧链接兼容，不维护独立规则。本指南不重复篇幅、平台阈值、质量 Gate、AI 痕迹或修复规则。

## 本地验收

在应用已经运行并完成真实生成后，从仓库根目录执行：

```powershell
node verify-local.mjs --project <项目ID>
```

需要同时执行仓库测试：

```powershell
node verify-local.mjs --project <项目ID> --full
```

需要再执行 E2E：

```powershell
node verify-local.mjs --project <项目ID> --full --e2e
```

每次验收覆盖生成：

- `verification/latest.json`
- `verification/latest.md`

`verification/` 已加入 `.gitignore`，只保存当前本机最新验收状态；历史由 Git、CI 与数据库运行记录承担。
