@echo off
cd /d "%~dp0"
set LOG=%~dp0diag.log
echo [%date% %time%] diag > "%LOG%"
call npx tsx scripts/zetaris-diag.ts >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. Tell Claude.
pause
