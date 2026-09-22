param([string]$PythonExe, [string]$NodeExe)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
if (-not $PythonExe) {
    $PythonExe = @((Join-Path $projectRoot '.venv/Scripts/python.exe'), (Join-Path $env:USERPROFILE 'Desktop/learning-mirror-platform/.venv/Scripts/python.exe')) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $NodeExe) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCommand) { $NodeExe = $nodeCommand.Source } else { $NodeExe = Join-Path $runtimeRoot 'node/bin/node.exe' }
}
if (-not $PythonExe -or -not (Test-Path -LiteralPath $PythonExe)) { throw 'Python missing. Supply -PythonExe with the project virtual environment executable.' }
if (-not (Test-Path -LiteralPath $NodeExe)) { throw 'Node missing. Supply -NodeExe.' }
& $NodeExe (Join-Path $projectRoot 'scripts/build-windows-helper.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Windows helper packaging failed.' }
$nextCli = Join-Path $projectRoot 'apps/web/node_modules/next/dist/bin/next'
if (-not (Test-Path -LiteralPath $nextCli)) { throw 'Install apps/web dependencies first.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Project .env missing. Configure locally before starting.' }
$logRoot = Join-Path $projectRoot 'data/preview'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
function Test-Ready([string]$Url) {
    try { return (Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 4).StatusCode -eq 200 } catch { return $false }
}
function Wait-Ready([string]$Url) {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-Ready $Url) { return }
        Start-Sleep -Milliseconds 500
    }
    throw "Service not ready: $Url. Check $logRoot"
}
$apiUrl = 'http://127.0.0.1:8010/health'
$webUrl = 'http://127.0.0.1:3010/student/ai/tools'
if (-not (Get-NetTCPConnection -LocalPort 8010 -State Listen -ErrorAction SilentlyContinue)) {
    $env:PYTHONPATH = (Join-Path $projectRoot 'apps/api/src') + ';' + (Join-Path $projectRoot 'data/runtime-deps')
    $env:PYTHONIOENCODING = 'utf-8'
    Start-Process -FilePath $PythonExe -ArgumentList '-m uvicorn mirror_api.main:app --host 127.0.0.1 --port 8010' -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'api.log') -RedirectStandardError (Join-Path $logRoot 'api-error.log') | Out-Null
}
Wait-Ready $apiUrl
if (-not (Get-NetTCPConnection -LocalPort 3010 -State Listen -ErrorAction SilentlyContinue)) {
    $env:MIRROR_DEV_API_URL = 'http://127.0.0.1:8010'
    Start-Process -FilePath $NodeExe -ArgumentList @(('"' + $nextCli + '"'), 'dev', '--hostname', '127.0.0.1', '--port', '3010') -WorkingDirectory (Join-Path $projectRoot 'apps/web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'web.log') -RedirectStandardError (Join-Path $logRoot 'web-error.log') | Out-Null
}
Wait-Ready $webUrl
Write-Host "Preview ready: $webUrl"
Write-Host 'Student login: http://127.0.0.1:3010/student'
Write-Host "Logs: $logRoot"
