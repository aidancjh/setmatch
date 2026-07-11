@echo off
REM Double-click this file to start Vybe locally (API + website together).
REM It adds Node to PATH for this window, then runs the dev servers.

title Vybe
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%PATH%"

echo ============================================
echo   Starting Vybe...
echo   When you see "web" ready, open your browser to:
echo.
echo        http://localhost:5173
echo.
echo   Leave this window open while using the app.
echo   Close it (or press Ctrl+C) to stop the servers.
echo ============================================
echo.

call npm run dev

echo.
echo Vybe stopped. Press any key to close this window.
pause >nul
