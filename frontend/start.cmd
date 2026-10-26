@echo off
setlocal
rem Existing VS Code terminals may not have the PATH set by the Node installer.
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js LTS and restart VS Code.
  exit /b 1
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Reinstall Node.js LTS with npm enabled.
  exit /b 1
)
cd /d "%~dp0"
call npm.cmd run dev
exit /b %errorlevel%
