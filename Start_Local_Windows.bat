@echo off
cd /d "%~dp0"
where py >nul 2>nul
if errorlevel 1 goto python
start "" http://localhost:8080
py -m http.server 8080
exit /b
:python
where python >nul 2>nul
if errorlevel 1 goto missing
start "" http://localhost:8080
python -m http.server 8080
exit /b
:missing
echo Python is required for this local preview. Install Python or publish to GitHub Pages.
pause
