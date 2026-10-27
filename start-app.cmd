@echo off
rem Starts the Gauntlet UI on http://localhost:5178
cd /d "%~dp0"
start "" http://localhost:5178
set GAUNTLET_REUSE=1
call npm start
pause
