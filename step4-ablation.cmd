@echo off
rem Gauntlet step 4: one defence at a time (ablation) on top of the no-guardrails agent,
rem plus v0/v1/v2. Recorded replies are reused; only new configs run live. Log: step4-ablation.log
cd /d "%~dp0"
set LOG=%~dp0step4-ablation.log
set GAUNTLET_REUSE=1
set GAUNTLET_CONCURRENCY=6
echo [%date% %time%] gauntlet ablation > "%LOG%"
echo Running each defence on its own. About 10-15 minutes...
call npm run eval -- v0 only-scoping only-spotlight only-dlp only-memq v1 v2 >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. Tell Claude.
pause
