@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\family-graph-dev.ps1" stop
set "result=%errorlevel%"
pause
exit /b %result%
