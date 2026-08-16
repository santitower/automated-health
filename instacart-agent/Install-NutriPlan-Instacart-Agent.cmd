@echo off
setlocal
set "INSTALLER_URL=https://github.com/santitower/automated-health/releases/download/instacart-agent-v0.3.0/Install-NutriPlanInstacartAgent.ps1"
set "INSTALLER=%TEMP%\Install-NutriPlanInstacartAgent.ps1"
set "EXPECTED_SHA256=b794edfecffdc6cbbce12fb78f1c27b3afc5741cbb4d4c5f46a25d865570a799"
echo Downloading the NutriPlan automatic installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%INSTALLER_URL%' -OutFile '%INSTALLER%'"
if errorlevel 1 goto :failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if ((Get-FileHash -Algorithm SHA256 '%INSTALLER%').Hash.ToLowerInvariant() -ne '%EXPECTED_SHA256%') { Write-Error 'Installer checksum mismatch.'; exit 1 }"
if errorlevel 1 goto :failed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALLER%"
if errorlevel 1 goto :failed
echo.
echo NutriPlan is installed and running. You can close this window.
pause
exit /b 0

:failed
echo.
echo NutriPlan could not finish installation. Keep this window open and share the error above.
pause
exit /b 1
