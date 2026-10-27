@echo off
rem Gauntlet step 2: run the FULL evaluation live (Zetaris + Nemotron), recording cassettes so
rem sample mode can replay it. Requires step1.cmd to have finished green. Log: step2-eval.log
cd /d "%~dp0"
set LOG=%~dp0step2-eval.log
echo [%date% %time%] gauntlet eval (live) > "%LOG%"
echo Running the attack campaign on Nemotron: ~20 attacks x 2 configs + 12 benign tasks.
echo This takes several minutes (Lightning may 502 and retry - that is expected).
echo === eval v1 vs v2 >> "%LOG%"
call npm run eval -- v1 v2 >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo.
echo ============================================================
echo  DONE. Tell Claude so it can read step2-eval.log + runs\latest.json
echo ============================================================
pause
