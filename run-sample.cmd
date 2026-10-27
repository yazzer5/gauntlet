@echo off
rem Gauntlet SAMPLE MODE: replays recorded Nemotron + Zetaris runs. No stack, no credentials.
cd /d "%~dp0"
set LOG=%~dp0run-sample.log
echo [%date% %time%] gauntlet eval (sample replay) > "%LOG%"
if not exist node_modules ( call npm install --no-audit --no-fund >> "%LOG%" 2>&1 )
call npm run data:build >> "%LOG%" 2>&1
set SAMPLE_MODE=true
call npm run eval -- v1 v2 >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. See run-sample.log and runs\latest.json
pause
