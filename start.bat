@echo off
chcp 65001 >nul
echo ================================
echo  AI 写作平台 - 一键启动
echo ================================
echo.

:: 1. 清理端口
echo [1/4] 清理端口...
for %p in (3100 3101 3102 3103 3104 3105 3106 3107 3108 3109 3110) do (
  for /f "tokens=5" %a in ('netstat -ano ^| findstr :%p') do (
    taskkill /F /PID %a >nul 2>&1
  )
)
for %p in (5173 5174 5175 5176 5177) do (
  for /f "tokens=5" %a in ('netstat -ano ^| findstr :%p') do (
    taskkill /F /PID %a >nul 2>&1
  )
)
echo    端口清理完成。
echo.

:: 2. 编译后端
echo [2/4] 编译后端...
cd /d "%~dp0server"
call npx tsc
if errorlevel 1 (
  echo    ❌ 编译失败！
  pause
  exit /b 1
)
echo    编译完成。
echo.

:: 3. 启动后端
echo [3/4] 启动后端...
start "后端" cmd /k "node dist/src/main.js"
timeout /t 5 >nul

:: 4. 启动前端
echo [4/4] 启动前端...
cd /d "%~dp0desktop"
start "前端" cmd /k "npx vite --host 0.0.0.0 --port 5173"
timeout /t 3 >nul

:: 5. 打开浏览器
start http://localhost:5173/
echo.
echo ✅ 启动完成！浏览器已打开。
echo    后端: http://localhost:3100/
echo    前端: http://localhost:5173/
echo.
pause
