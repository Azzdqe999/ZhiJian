@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "E:\NovelReader\app"
"E:\NovelReader\app\node_modules\electron\dist\electron.exe" "E:\NovelReader\app\scripts\e2e-smoke.cjs"
echo [exit] %ERRORLEVEL%
