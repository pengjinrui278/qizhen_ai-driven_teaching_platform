param(
    [ValidateSet("api","web")][string]$Service="api",
    [string]$Python="python",
    [int]$ApiPort=8010,
    [int]$WebPort=3010
)
$ErrorActionPreference="Stop"
$projectRoot=Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
if ($Service -eq "api") {
    New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null
    if (-not $env:MIRROR_DATABASE_URL) {
        $dbPath=(Join-Path $projectRoot "data/pilot.sqlite").Replace("\","/")
        $env:MIRROR_DATABASE_URL="sqlite:///$dbPath"
    }
    $env:PYTHONPATH=(Join-Path $projectRoot "apps/api/src")+[IO.Path]::PathSeparator+$env:PYTHONPATH
    & $Python -m mirror_api.bootstrap
    if ($LASTEXITCODE -ne 0) { throw "初始化失败，未启动API" }
    & $Python -m uvicorn mirror_api.main:app --host 127.0.0.1 --port $ApiPort
} else {
    $env:MIRROR_DEV_API_URL="http://localhost:$ApiPort"
    $env:NEXT_PUBLIC_API_BASE=""
    Set-Location -LiteralPath (Join-Path $projectRoot "apps/web")
    & node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port $WebPort
}
