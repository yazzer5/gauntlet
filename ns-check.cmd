@echo off
cd /d "%~dp0"
set LOG=%~dp0ns-check.log
echo [%date% %time%] nightshift check > "%LOG%"
curl -s -m 5 -o nul -w "nightshift /v1/models http %%{http_code}\n" http://127.0.0.1:8088/v1/models >> "%LOG%" 2>&1 || echo NIGHTSHIFT_UNREACHABLE >> "%LOG%"
call npm run nightshift:check >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. Tell Claude.
pause
