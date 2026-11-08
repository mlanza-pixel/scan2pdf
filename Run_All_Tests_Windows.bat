@echo off
setlocal
cd /d "%~dp0"
echo DocuScan Pro 7.75.0 Test Build 1
where python >nul 2>nul
if errorlevel 1 goto missing
where npm >nul 2>nul
if errorlevel 1 goto missing
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
call npx playwright install chromium
if errorlevel 1 goto failed
call npm test
if errorlevel 1 goto failed
call npm run test:workflows
if errorlevel 1 goto failed
echo Completed. Reports and screenshots are in testsesults7.75.0
pause
exit /b 0
:missing
echo Install Python and Node.js, then run this file again.
pause
exit /b 1
:failed
echo A test failed. Keep the console output and testsesults folder.
pause
exit /b 1
