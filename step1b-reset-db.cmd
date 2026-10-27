@echo off
rem Gauntlet: the DB volume was seeded once, so Postgres won't re-run the fixed schema until the
rem volume is recreated. This drops ONLY the gauntlet-db volume (NOT Zetaris), re-seeds with the
rem corrected schema (admin_raw + fixed grants), then re-registers the two datasources and verifies.
rem Safe: gauntlet-db is a separate compose project from Zetaris. Log: step1b.log
cd /d "%~dp0"
set LOG=%~dp0step1b.log
echo [%date% %time%] gauntlet reset-db > "%LOG%"

echo Rebuilding synthetic data...
call npm run data:build >> "%LOG%" 2>&1

echo Recreating the Gauntlet database from scratch (gauntlet-db only)...
echo === down -v (gauntlet-db only) >> "%LOG%"
docker compose down -v >> "%LOG%" 2>&1
echo === up >> "%LOG%"
docker compose up -d >> "%LOG%" 2>&1

echo Seeding (schema + canaries + roles + masked views) - about 1 min...
set /a n=0
:wait
timeout /t 5 /nobreak > nul
docker logs gauntlet-db 2>&1 | findstr /C:"gauntlet-db seeded" >nul && goto seeded
set /a n+=1
if %n% lss 36 goto wait
echo DB_SEED_TIMEOUT >> "%LOG%"
:seeded
echo === db logs (tail) >> "%LOG%"
docker logs --tail 30 gauntlet-db >> "%LOG%" 2>&1

echo Registering the two datasources in Zetaris...
echo === zetaris register >> "%LOG%"
call npm run zetaris:register -- --reset >> "%LOG%" 2>&1
echo === zetaris check >> "%LOG%"
call npm run zetaris:check >> "%LOG%" 2>&1

echo DONE >> "%LOG%"
echo.
echo ============================================================
echo  DONE. Tell Claude so it can read step1b.log.
echo ============================================================
pause
