@echo off
setlocal EnableExtensions DisableDelayedExpansion
title DocuScan Pro - Complete Release Publisher
set "ZIP_PATH="
if not "%~1"=="" set "ZIP_PATH=%~f1"
if not defined ZIP_PATH (
  for /f "delims=" %%F in ('dir /b /a-d /o-d "%~dp0DocuScan_Pro_v*.zip" 2^>nul') do if not defined ZIP_PATH set "ZIP_PATH=%~dp0%%F"
)
if not defined ZIP_PATH (
  for /f "delims=" %%F in ('dir /b /a-d /o-d "%~dp0docuscan-pro-v*.zip" 2^>nul') do if not defined ZIP_PATH set "ZIP_PATH=%~dp0%%F"
)
if not defined ZIP_PATH (echo ERROR: No release ZIP next to this BAT.& goto :fail)
if not exist "%ZIP_PATH%" (echo ERROR: ZIP not found: "%ZIP_PATH%"& goto :fail)
where git >nul 2>&1 || (echo ERROR: Install Git for Windows.& goto :fail)
where powershell >nul 2>&1 || (echo ERROR: PowerShell required.& goto :fail)
echo.
echo ============================================================
echo  DocuScan Pro - FULL Release Publisher
echo  ZIP: "%ZIP_PATH%"
echo  Repository: https://github.com/mlanza-pixel/scan2pdf.git
echo  Branch: main
echo  Publishes: app, docs, tests, fixtures, GitHub workflows
echo  Preserves: existing GitHub workflows and repository history
echo ============================================================
choice /c YN /n /m "Publish this release? [Y/N]: "
if errorlevel 2 (echo Canceled.& goto :success)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Publish_DocuScan_Pro.ps1" -ZipPath "%ZIP_PATH%"
if errorlevel 1 goto :fail
echo.
echo Published. Check GitHub Actions for test results.
:success
pause
exit /b 0
:fail
echo.
echo Publication was NOT confirmed. No force push was attempted.
pause
exit /b 1
