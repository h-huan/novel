@echo off
echo Starting novel-ai-platform...
echo.

echo [1/2] Starting API Server on port 3100...
start "Novel-AI-Server" cmd /c "cd /d %~dp0server && node dist/src/main.js"
timeout /t 6 /nobreak >nul

echo [2/2] Starting Desktop App...
cd /d %~dp0desktop
call npm run dev
