@echo off
rem Compatibility launcher. The server stays hidden in the background.
start "" wscript.exe "%~dp0start_pi_dashboard_silent.vbs"
exit /b 0
