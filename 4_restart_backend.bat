@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\family-graph-dev.ps1" restart-backend
set "result=%errorlevel%"
if not "%result%"=="0" pause
exit /b %result%
