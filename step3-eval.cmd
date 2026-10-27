@echo off
rem Gauntlet step 3: v0 (no guardrails) vs v1 (prompt policy) vs v2 (enforced defences).
rem Reuses the replies recorded in step2 for v1/v2, so only v0 runs live. Log: step3-eval.log
cd /d "%~dp0"
set LOG=%~dp0step3-eval.log
set GAUNTLET_REUSE=1
set GAUNTLET_CONCURRENCY=6
echo [%date% %time%] gauntlet eval v0 v1 v2 > "%LOG%"
echo Running the campaign (v0 live, v1/v2 replayed from step2). About 10 minutes...
call npm run eval -- v0 v1 v2 >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. Tell Claude.
pause
