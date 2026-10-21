@echo off
cd /d "%~dp0"
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Installation failed. Check the message above.
  pause
  exit /b 1
)
echo Setup complete. Open start_pi_dashboard.bat to start.
pause
