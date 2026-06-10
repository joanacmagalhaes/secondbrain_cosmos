@echo off
echo Starting secondmind...

REM Backend
start "secondmind — backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && uvicorn main:app --reload"

REM Give the backend a moment to start before opening the browser
timeout /t 4 /nobreak > nul

REM Frontend
start "secondmind — frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

REM Open the app in the default browser
timeout /t 4 /nobreak > nul
start http://localhost:5173
