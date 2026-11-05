@echo off
setlocal
cd /d "%~dp0"
echo Running DocuScan Pro v7.7 static and package checks...
python scripts\test_v77_static.py
if errorlevel 1 echo STATIC TEST FAILED
python scripts\test_release_integrity_v77.py
if errorlevel 1 echo INTEGRITY TEST FAILED
echo Browser tests require a local web server, Python Playwright, and Chromium.
echo In a second terminal: python -m http.server 8765
echo Then: python scripts\universal_capture_v77.py http://127.0.0.1:8765/
echo Then: python scripts\test_stress_v77.py http://127.0.0.1:8765/
echo Node regression tests require: npm install; npm test
pause
