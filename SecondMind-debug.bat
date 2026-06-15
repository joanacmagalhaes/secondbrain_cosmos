@echo off
cd /d "%~dp0"
title SecondMind

:: Add common Node.js install locations to PATH so npm works even from desktop shortcuts
set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\nvm\current;%LOCALAPPDATA%\nvm\current"

:: Check npm is available
where npm >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERROR: npm not found.
    echo  Install Node.js from https://nodejs.org then restart your computer.
    echo.
    pause
    exit /b 1
)

:: Install root dependencies if missing (electron, concurrently, wait-on)
if not exist "node_modules" (
    echo  Installing desktop app dependencies...
    npm install
    if errorlevel 1 (
        echo.
        echo  ERROR: npm install failed. See above for details.
        echo.
        pause
        exit /b 1
    )
)

:: Install frontend dependencies if missing
if not exist "frontend\node_modules" (
    echo  Installing frontend dependencies...
    npm install --prefix frontend
    if errorlevel 1 (
        echo.
        echo  ERROR: Frontend npm install failed.
        echo.
        pause
        exit /b 1
    )
)

:: Check backend venv exists
if not exist "backend\venv\Scripts\python.exe" (
    echo.
    echo  ERROR: Python virtual environment not found.
    echo  Run these commands first:
    echo.
    echo    cd backend
    echo    python -m venv venv
    echo    venv\Scripts\pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

:: All good — launch the app
echo  Starting SecondMind...
npm run dev
