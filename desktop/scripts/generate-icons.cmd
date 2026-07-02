@echo off
REM =====================================================
REM AI写作平台 - 图标生成脚本
REM 依赖: Python 3 with Pillow library
REM 用法: generate-icons.cmd
REM =====================================================

echo [AI写作平台] 正在生成应用程序图标...
echo.

REM 检查 Python
python --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [错误] 未找到 Python，请安装 Python 3.8+
    exit /b 1
)

REM 检查 Pillow
python -c "from PIL import Image; print('Pillow OK')" >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [信息] 正在安装 Pillow...
    pip install Pillow
)

set SCRIPT_DIR=%~dp0
set BUILD_DIR=%SCRIPT_DIR%..\build

REM 生成 256x256 PNG 图标
echo [1/3] 生成 icon.png (256x256)...
python -c ^
"from PIL import Image, ImageDraw; ^
img = Image.new('RGBA', (256, 256), (59, 130, 246, 255)); ^
draw = ImageDraw.Draw(img); ^
draw.ellipse([16, 16, 240, 240], fill=(255, 255, 255, 40)); ^
draw.rectangle([96, 64, 160, 192], fill=(255, 255, 255, 200)); ^
draw.rectangle([64, 96, 192, 128], fill=(255, 255, 255, 200)); ^
draw.rectangle([64, 144, 192, 160], fill=(255, 255, 255, 200)); ^
img.save('%BUILD_DIR%\icon.png'); ^
print('  icon.png 生成成功')"

if %ERRORLEVEL% NEQ 0 (
    echo [错误] icon.png 生成失败
    exit /b 1
)

REM 生成 icon.ico (多尺寸)
echo [2/3] 生成 icon.ico (256x256, 48x48, 32x32, 16x16)...
python -c ^
"from PIL import Image; ^
img = Image.open('%BUILD_DIR%\icon.png'); ^
sizes = [(256,256), (48,48), (32,32), (16,16)]; ^
icons = [img.resize(s, Image.LANCZOS) for s in sizes]; ^
img.save('%BUILD_DIR%\icon.ico', format='ICO', sizes=sizes); ^
print('  icon.ico 生成成功')"

if %ERRORLEVEL% NEQ 0 (
    echo [错误] icon.ico 生成失败
    exit /b 1
)

REM 生成 icon.icns (macOS)
echo [3/3] 生成 icon.icns (macOS)...
python -c ^
"from PIL import Image; ^
img = Image.open('%BUILD_DIR%\icon.png'); ^
img.save('%BUILD_DIR%\icon.icns', format='ICNS'); ^
print('  icon.icns 生成成功')"

if %ERRORLEVEL% NEQ 0 (
    echo [警告] icon.icns 生成失败，macOS 打包需要使用 macOS 系统生成
) else (
    echo  icon.icns 生成成功
)

echo.
echo [完成] 所有图标已生成至: %BUILD_DIR%
echo.
echo 如需生成 macOS ICNS 图标，请在 macOS 上运行:
echo   python generate-icons.cmd
echo 或在 macOS 上使用 iconutil:
echo   iconutil -c icns icon.iconset -o build/icon.icns
echo.
pause
