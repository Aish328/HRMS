@echo off
REM Meridian HRMS - one-click start for Windows
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo [1/4] Installing server dependencies (first run only)...
cd server
if not exist node_modules call npm install --no-audit --no-fund
if not exist .env copy .env.example .env >nul

if not exist data\hrms.db (
  echo [2/4] Loading sample data...
  call npm run seed
) else (
  echo [2/4] Existing data found - keeping it.
)

echo [3/4] Building the app (first run only)...
cd ..\client
if not exist node_modules call npm install --no-audit --no-fund
if not exist dist call npm run build

echo [4/4] Starting Meridian HRMS...
echo.
echo   Open http://localhost:4000 in your browser.
echo   Admin sign-in: admin@company.com / admin123
echo   Keep this window open. Close it to stop the system.
echo.
cd ..\server
call npm start
pause
