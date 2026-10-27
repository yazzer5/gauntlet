@echo off
rem Pushes Gauntlet to https://github.com/yazzer5/gauntlet (uses your Windows git login). Log: push.log
cd /d "%~dp0"
set LOG=%~dp0push.log
echo [%date% %time%] push > "%LOG%"
if not exist .git ( git init -b main >> "%LOG%" 2>&1 )
git config core.autocrlf true >> "%LOG%" 2>&1
git config user.name >nul 2>&1 || git config user.name "Yasser"
git config user.email >nul 2>&1 || git config user.email "smyasser2004@gmail.com"
git add -A >> "%LOG%" 2>&1
echo === files staged >> "%LOG%"
git status --short >> "%LOG%" 2>&1
git diff --cached --quiet || git commit -F .commitmsg >> "%LOG%" 2>&1
git remote get-url origin >nul 2>&1 || git remote add origin https://github.com/yazzer5/gauntlet.git
git push -u origin main >> "%LOG%" 2>&1
echo === check .env not tracked >> "%LOG%"
git ls-files .env >> "%LOG%" 2>&1
echo DONE >> "%LOG%"
echo Done. Tell Claude.
pause
