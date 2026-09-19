@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON=py -3"
) else (
  set "PYTHON=python"
)

if not exist ".venv\Scripts\python.exe" (
  echo [Learning Mirror] Creating local Python environment...
  %PYTHON% -m venv .venv || goto :error
)

echo [Learning Mirror] Installing or updating the local connector...
".venv\Scripts\python.exe" -m pip install -e . || goto :error
echo [Learning Mirror] Opening http://127.0.0.1:8765
".venv\Scripts\python.exe" -m learning_mirror_zju_connector
goto :eof

:error
echo.
echo Start failed. Please install Python 3.11 or newer and try again.
pause
exit /b 1
