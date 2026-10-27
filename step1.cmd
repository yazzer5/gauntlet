@echo off
rem Gauntlet step 1: start the enterprise DB (with canaries + roles), install deps, build data,
rem run Meterless conformance tests, register the two Zetaris datasources, and verify the
rem control boundary. Double-click this; when it says DONE, tell Claude. Log: step1.log
cd /d "%~dp0"
set LOG=%~dp0step1.log
echo [%date% %time%] gauntlet step1 > "%LOG%"

where node >> "%LOG%" 2>&1 || (echo NODE_MISSING >> "%LOG%" & echo Node.js not found - install from nodejs.org & pause & exit /b 1)
node -v >> "%LOG%" 2>&1

echo Building synthetic data (customers/transactions/tickets + canaries)...
echo === build-data >> "%LOG%"
if not exist node_modules ( call npm install --no-audit --no-fund >> "%LOG%" 2>&1 )
call npm run data:build >> "%LOG%" 2>&1

echo Starting Gauntlet enterprise database (Docker)...
echo === db up >> "%LOG%"
docker compose up -d >> "%LOG%" 2>&1

echo Seeding Postgres (schema, canaries, roles, masked views) - about 1 min...
set /a n=0
:wait
timeout /t 5 /nobreak > nul
docker logs gauntlet-db 2>&1 | findstr /C:"gauntlet-db seeded" >nul && goto seeded
docker logs gauntlet-db 2>&1 | findstr /C:"database system is ready to accept connections" >nul
set /a n+=1
if %n% lss 36 goto wait
echo DB_SEED_TIMEOUT >> "%LOG%"
:seeded
echo === db logs (tail) >> "%LOG%"
docker logs --tail 25 gauntlet-db >> "%LOG%" 2>&1

echo === conformance tests (Meterless engines) >> "%LOG%"
call npm run test:engines >> "%LOG%" 2>&1

echo Registering the two datasources in Zetaris (crm_analyst, crm_admin)...
echo === zetaris register >> "%LOG%"
call npm run zetaris:register >> "%LOG%" 2>&1

echo Verifying the control boundary (analyst masked, admin full, no vip canary reachable)...
echo === zetaris check >> "%LOG%"
call npm run zetaris:check >> "%LOG%" 2>&1

echo DONE >> "%LOG%"
echo.
echo ============================================================
echo  DONE. Tell Claude so it can read step1.log and continue.
echo ============================================================
pause
