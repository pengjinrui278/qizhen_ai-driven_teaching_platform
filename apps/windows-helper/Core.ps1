Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
function Get-ToolCatalog {
    $items = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'catalog.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $allowed = @{codex='OpenAI.Codex';claude='Anthropic.ClaudeCode';workbuddy='Tencent.WorkBuddy';ccswitch='farion1231.CC-Switch'}
    if ($items.Count -ne 4) { throw 'Invalid tool catalog' }
    foreach ($item in $items) {
        if (-not $allowed.ContainsKey($item.key) -or $allowed[$item.key] -cne $item.id -or $item.version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid package identity' }
    }
    return $items
}
function Get-SelectedTools([string]$Selection) {
    $keys = @($Selection.Split(',') | Select-Object -Unique)
    $catalog = @(Get-ToolCatalog)
    if (-not $Selection -or @($keys | Where-Object { $_ -cnotin $catalog.key }).Count) { throw 'Invalid selection' }
    return @($catalog | Where-Object { $_.key -cin $keys })
}
function Get-InstallArguments($Tool) {
    # Never use --force, --ignore-security-hash, --override, or a caller-provided package.
    $checked = @(Get-SelectedTools $Tool.key)[0]
    return @('install','--id',$checked.id,'--exact','--version',$checked.version,'--source','winget','--dependency-source','winget','--scope','user','--no-upgrade','--silent','--disable-interactivity','--accept-source-agreements','--accept-package-agreements')
}
function Assert-OfficialSource([string]$Json) {
    $source = $Json | ConvertFrom-Json
    $entries = if ($source.PSObject.Properties['Sources']) { @($source.Sources) } else { @($source) }
    $matching = @($entries | Where-Object { $_.Name -ceq 'winget' -and $_.Arg.TrimEnd('/') -ceq 'https://cdn.winget.microsoft.com/cache' -and $_.Type -ceq 'Microsoft.PreIndexed.Package' -and $_.Identifier -ceq 'Microsoft.Winget.Source_8wekyb3d8bbwe' })
    if ($matching.Count -ne 1) { throw 'WinGet source is not the expected Microsoft community source. No installation performed.' }
}
function Get-EnvironmentCheck {
    $arch = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE','Machine')
    $architecture = switch ($arch) { 'AMD64' {'x64'} 'ARM64' {'arm64'} default {'unsupported'} }
    $winget = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    $build = [int](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name CurrentBuildNumber).CurrentBuildNumber
    return [pscustomobject]@{architecture=$architecture;windowsBuild=$build;wingetPath=$(if($winget){$winget.Source}else{''});supported=($build -ge 19041 -and $architecture -ne 'unsupported')}
}
function Get-ExistingCommand($Tool) {
    if (-not $Tool.command) { return $false }
    $command = Get-Command $Tool.command -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $true }
    foreach ($relative in @('.local/bin', 'AppData/Roaming/npm')) {
        foreach ($extension in @('.exe','.cmd')) {
            if (Test-Path -LiteralPath (Join-Path (Join-Path $env:USERPROFILE $relative) ($Tool.command+$extension))) { return $true }
        }
    }
    return $false
}
function Invoke-WinGet([string]$Executable,[string[]]$Arguments,[int]$TimeoutSeconds=1800) {
    foreach ($argument in $Arguments) { if ($argument -notmatch '^[a-zA-Z0-9.+-]+$') { throw 'Unsafe WinGet argument' } }
    $info = New-Object Diagnostics.ProcessStartInfo
    $info.FileName=$Executable; $info.Arguments=$Arguments -join ' '; $info.UseShellExecute=$false; $info.CreateNoWindow=$true
    $info.RedirectStandardOutput=$true; $info.RedirectStandardError=$true
    $info.StandardOutputEncoding=[Text.Encoding]::UTF8; $info.StandardErrorEncoding=[Text.Encoding]::UTF8
    $process=New-Object Diagnostics.Process
    $process.StartInfo=$info
    try {
        if (-not $process.Start()) { throw 'Unable to start WinGet' }
        $stdout=$process.StandardOutput.ReadToEndAsync(); $stderr=$process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds*1000)) {
            # Do not kill an installer mid-write. Stop the batch and request manual inspection.
            throw 'WinGet timeout. The installer may still be running; inspect Task Manager before retrying.'
        }
        return [pscustomobject]@{exitCode=$process.ExitCode;output=$stdout.GetAwaiter().GetResult();error=$stderr.GetAwaiter().GetResult()}
    } finally { $process.Dispose() }
}
function Invoke-ToolStep($Tool,[string]$Architecture,[scriptblock]$Run,[switch]$CheckOnly) {
    if ($Architecture -notin $Tool.architectures) { return @{key=$Tool.key;state='unsupported';message='当前架构没有已核对安装包，已跳过。'} }
    if (Get-ExistingCommand $Tool) { return @{key=$Tool.key;state='existing';message='已检测到命令，保留现有安装；请自行运行版本命令核验。'} }
    $listArgs=@('list','--id',$Tool.id,'--exact','--source','winget','--disable-interactivity','--accept-source-agreements')
    $before=& $Run $listArgs
    if ($before.exitCode -eq 0) { return @{key=$Tool.key;state='existing';message='WinGet 检测到已安装，已跳过，不升级。'} }
    if ($before.exitCode -ne -1978335212) { throw ('无法确认 '+$Tool.name+' 安装状态，已停止。错误码 '+$before.exitCode) }
    if ($CheckOnly) { return @{key=$Tool.key;state='ready';message='尚未安装，可安装版本 '+$Tool.version} }
    $result=& $Run (Get-InstallArguments $Tool)
    if ($result.exitCode -ne 0) { throw ($Tool.name+' 安装未确认成功，错误码 '+$result.exitCode+'。请查看 WinGet 日志；若已部分安装，不要直接重试。') }
    $after=& $Run $listArgs
    if ($after.exitCode -ne 0) { throw ($Tool.name+' 安装返回成功，但未通过安装记录检查。请检查后再试。') }
    return @{key=$Tool.key;state='installed';message='安装记录已核验；仍需启动程序、登录并验证功能。'}
}
