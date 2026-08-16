$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$agentVersion = "0.3.0"
$releaseTag = "instacart-agent-v$agentVersion"
$sourceUrl = "https://github.com/santitower/automated-health/archive/refs/tags/$releaseTag.zip"
$installDir = Join-Path $env:LOCALAPPDATA "NutriPlan\instacart-agent"
$runtimeDir = Join-Path $env:LOCALAPPDATA "NutriPlan\runtime"
$browserDir = Join-Path $env:LOCALAPPDATA "NutriPlan\playwright-browsers"
$logDir = Join-Path $env:LOCALAPPDATA "NutriPlan\logs"
$startupDir = [Environment]::GetFolderPath("Startup")
$startupFile = Join-Path $startupDir "NutriPlan Instacart Agent.cmd"
$temporaryDir = Join-Path ([System.IO.Path]::GetTempPath()) ("nutriplan-installer-" + [guid]::NewGuid())

try {
  New-Item -ItemType Directory -Force -Path $temporaryDir, $installDir, $runtimeDir, $browserDir, $logDir | Out-Null

  Write-Host "Downloading the NutriPlan Playwright companion..."
  $sourceArchive = Join-Path $temporaryDir "source.zip"
  Invoke-WebRequest -UseBasicParsing $sourceUrl -OutFile $sourceArchive
  Expand-Archive -Path $sourceArchive -DestinationPath (Join-Path $temporaryDir "source") -Force
  $sourceDir = Get-ChildItem (Join-Path $temporaryDir "source") -Directory | Select-Object -First 1 | ForEach-Object {
    Join-Path $_.FullName "instacart-agent"
  }
  if (-not $sourceDir -or -not (Test-Path (Join-Path $sourceDir "package.json"))) {
    throw "The downloaded NutriPlan source archive is incomplete."
  }

  foreach ($name in @("src", "test", "package.json", "package-lock.json", "README.md")) {
    $destination = Join-Path $installDir $name
    if (Test-Path $destination) { Remove-Item $destination -Recurse -Force }
    Copy-Item (Join-Path $sourceDir $name) -Destination $destination -Recurse -Force
  }

  Write-Host "Downloading NutriPlan's private Node.js runtime..."
  $nodeIndex = Invoke-RestMethod "https://nodejs.org/dist/index.json"
  $nodeVersion = ($nodeIndex | Where-Object { $_.version -match '^v22\.' } | Select-Object -First 1).version
  if (-not $nodeVersion) { throw "A compatible Node.js runtime could not be found." }

  $architecture = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString().ToLowerInvariant()
  if ($architecture -notin @("x64", "arm64")) { throw "This Windows architecture is not supported: $architecture" }
  $nodeArchiveName = "node-$nodeVersion-win-$architecture.zip"
  $nodeBaseUrl = "https://nodejs.org/dist/$nodeVersion"
  $checksums = (Invoke-WebRequest -UseBasicParsing "$nodeBaseUrl/SHASUMS256.txt").Content -split "`n"
  $checksumLine = $checksums | Where-Object { $_ -match ([regex]::Escape($nodeArchiveName) + '$') } | Select-Object -First 1
  if (-not $checksumLine) { throw "The Node.js security checksum could not be found." }
  $expectedChecksum = ($checksumLine.Trim() -split '\s+')[0].ToLowerInvariant()
  $nodeArchive = Join-Path $temporaryDir $nodeArchiveName
  Invoke-WebRequest -UseBasicParsing "$nodeBaseUrl/$nodeArchiveName" -OutFile $nodeArchive
  $actualChecksum = (Get-FileHash -Algorithm SHA256 $nodeArchive).Hash.ToLowerInvariant()
  if ($actualChecksum -ne $expectedChecksum) { throw "The downloaded Node.js runtime failed its security checksum." }

  $runtimeExtract = Join-Path $temporaryDir "runtime"
  Expand-Archive -Path $nodeArchive -DestinationPath $runtimeExtract -Force
  $runtimeSource = Get-ChildItem $runtimeExtract -Directory | Select-Object -First 1
  if (Test-Path $runtimeDir) { Remove-Item $runtimeDir -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
  Copy-Item (Join-Path $runtimeSource.FullName "*") -Destination $runtimeDir -Recurse -Force

  $nodePath = Join-Path $runtimeDir "node.exe"
  $npmCli = Join-Path $runtimeDir "node_modules\npm\bin\npm-cli.js"
  $env:PLAYWRIGHT_BROWSERS_PATH = $browserDir
  $env:PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT = "120000"

  Write-Host "Installing the private Chromium browser..."
  Push-Location $installDir
  & $nodePath $npmCli install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw "The NutriPlan dependencies could not be installed." }
  & $nodePath (Join-Path $installDir "node_modules\playwright\cli.js") install --no-shell chromium
  if ($LASTEXITCODE -ne 0) { throw "The private Chromium browser could not be installed." }
  Pop-Location

  $serverPath = Join-Path $installDir "src\server.js"
  $logPath = Join-Path $logDir "instacart-agent.log"
  @"
@echo off
set "PLAYWRIGHT_BROWSERS_PATH=$browserDir"
start "NutriPlan Instacart Agent" /min cmd /c "`"$nodePath`" `"$serverPath`" >> `"$logPath`" 2>&1"
"@ | Set-Content -Encoding ASCII $startupFile

  Start-Process -WindowStyle Minimized -FilePath "cmd.exe" -ArgumentList "/c", "`"$startupFile`""
  Write-Host "NutriPlan Instacart agent installed and set to start automatically."
  Write-Host "Return to NutriPlan and retry the connection."
}
finally {
  if (Test-Path $temporaryDir) { Remove-Item $temporaryDir -Recurse -Force }
}
