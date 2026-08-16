$ErrorActionPreference = "Stop"

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "NutriPlan needs Node.js 22 or newer. Install it from https://nodejs.org, then run this installer again."
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]").Trim())
if ($nodeMajor -lt 22) {
  throw "NutriPlan needs Node.js 22 or newer. Your version is $(node --version)."
}

$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1)) {
  throw "Google Chrome is required. Install Chrome, then run this installer again."
}

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA "NutriPlan\instacart-agent"
$logDir = Join-Path $env:LOCALAPPDATA "NutriPlan\logs"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "NutriPlan Instacart Agent.cmd"

New-Item -ItemType Directory -Force -Path $installDir, $logDir | Out-Null
Get-ChildItem $sourceDir -Force | Where-Object { $_.Name -notin @("node_modules", ".git") } | ForEach-Object {
  Copy-Item $_.FullName -Destination $installDir -Recurse -Force
}

Push-Location $installDir
npm install --omit=dev
Pop-Location

$serverPath = Join-Path $installDir "src\server.js"
$logPath = Join-Path $logDir "instacart-agent.log"
$nodePath = (Get-Command node).Source
@"
@echo off
start "NutriPlan Instacart Agent" /min cmd /c "`"$nodePath`" `"$serverPath`" >> `"$logPath`" 2>&1"
"@ | Set-Content -Encoding ASCII $startupFile

Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "`"$startupFile`""
Write-Host "NutriPlan Instacart agent installed and set to start automatically."
Write-Host "Return to NutriPlan and retry the connection."
