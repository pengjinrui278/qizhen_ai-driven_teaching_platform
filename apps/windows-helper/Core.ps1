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
function Find-WinGet {
    # Resolve the standard alias even when WindowsApps is missing from PATH.
    # Never change persistent PATH or search arbitrary downloaded executables.
    $alias = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Microsoft/WindowsApps/winget.exe'
    if (Test-Path -LiteralPath $alias -PathType Leaf) { return $alias }
    $command = Get-Command winget.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    return ''
}
function Get-EnvironmentCheck {
    $arch = [Environment]::GetEnvironmentVariable('PROCESSOR_ARCHITECTURE','Machine')
    $architecture = switch ($arch) { 'AMD64' {'x64'} 'ARM64' {'arm64'} default {'unsupported'} }
    $winget = Find-WinGet
    $build = [int](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -Name CurrentBuildNumber).CurrentBuildNumber
    return [pscustomobject]@{architecture=$architecture;windowsBuild=$build;wingetPath=$winget;supported=($build -ge 19041 -and $architecture -ne 'unsupported')}
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
function Get-InstallDiagnosis([string]$ToolName,[string]$Stage,[Nullable[int]]$ExitCode=$null) {
    $code=if($null -ne $ExitCode){'0x{0:X8}' -f ([long]$ExitCode -band 4294967295L)}else{'未提供'}
    $title='任务未完成，需核对原因'
    $impact=if($Stage -eq '检查安装状态'){'尚未开始安装本工具。'}else{'无法确认是否已有部分安装，请先检查 Windows 设置中的“已安装的应用”。'}
    $steps=@('点击“WinGet 日志”，按修改时间找到本次任务对应的日志。','点击“本次详细记录”查看 command 日志或 worker-error.log；不要反复点击安装。','点击“复制故障摘要”发给维护人员。完整日志可能含本机路径等信息，分享前请检查。')
    switch($code){
        '0x8A150011' {
            $Stage='下载后的完整性校验'
            $title='安装包完整性校验失败'
            $impact='WinGet 已下载文件，但文件指纹与软件清单不一致，因此未运行本工具安装程序。'
            $steps=@('不要强制安装，也不要关闭哈希验证、杀毒或系统防护。','先使用最新版学镜助手；如果仍失败，请将故障摘要发给维护人员核对官方安装包和清单。','维护人员确认版本一致后再重试。仅凭数字签名有效也不能忽略哈希不一致。')
        }
        '0x80072EE7' {$title='无法解析下载服务器地址';$steps=@('确认浏览器可以访问所选工具官网，检查网络连接。','若使用代理或校园网络，请核对网络配置或联系管理员；不要关闭安全防护。','网络恢复后先点“检查环境”，再尝试安装。')}
        '0x80072EFD' {$title='无法连接下载服务器';$steps=@('打开所选工具官网确认连接是否正常。','核对代理、校园网络或组织网络策略；不要随意关闭防火墙。','连接恢复后先检查安装状态，再重试。')}
        '0x80072EE2' {$title='网络请求超时';$steps=@('检查网络是否稳定，稍后再试。','先检查任务管理器中的安装进程是否已经结束；未结束时不要重复安装。','重复超时请发送故障摘要及对应时间日志。')}
        '0x80070005' {$title='访问被拒绝';$steps=@('检查是否拒绝了系统授权窗口，或电脑受学校、单位策略管理。','不要关闭安全功能或盲目使用管理员运行；请联系设备管理员确认权限。','使用“WinGet 日志”确认被拒绝的是哪个文件或步骤。')}
        '0x80070070' {$title='磁盘空间不足';$steps=@('打开 Windows 设置 → 系统 → 存储，检查系统盘和目标盘剩余空间。','仅清理你确认不需要的文件，保留项目、配置和密钥。','腾出空间后确认旧安装进程已结束，再重试。')}
        '0x00000642' {$title='安装被取消';$steps=@('确认是否主动关闭了安装或授权窗口。','先在 Windows“已安装的应用”确认当前状态。','如仍需要安装，重新运行助手并确认系统提示。')}
    }
    return @{tool=$ToolName;stage=$Stage;exitCode=$ExitCode;hexCode=$code;title=$title;impact=$impact;steps=$steps}
}
function New-ToolFailure($Tool,[string]$Stage,[int]$ExitCode) {
    $diagnosis=Get-InstallDiagnosis $Tool.name $Stage $ExitCode
    $errorObject=New-Object System.InvalidOperationException ($Tool.name+'：'+$diagnosis.title+'（'+$diagnosis.hexCode+'）')
    $errorObject.Data['diagnosis']=$diagnosis
    return $errorObject
}
function Format-InstallDiagnosis($Diagnosis) {
    $lines=@(('工具：'+$Diagnosis.tool),('失败环节：'+$Diagnosis.stage),('原因：'+$Diagnosis.title),('错误码：'+$Diagnosis.hexCode+' / '+$Diagnosis.exitCode),'',('当前状态：'+$Diagnosis.impact),'','建议处理：')
    $number=1;foreach($step in $Diagnosis.steps){$lines+=($number.ToString()+'. '+$step);$number++}
    $lines+='';$lines+='查看日志：点击下方“WinGet 日志”或“本次详细记录”。按失败时间找到对应日志；可先复制故障摘要，不必发送完整日志。'
    return $lines -join [Environment]::NewLine
}
function Invoke-ToolStep($Tool,[string]$Architecture,[scriptblock]$Run,[switch]$CheckOnly) {
    if ($Architecture -notin $Tool.architectures) { return @{key=$Tool.key;state='unsupported';message='当前架构没有已核对安装包，已跳过。'} }
    if (Get-ExistingCommand $Tool) { return @{key=$Tool.key;state='existing';message='已检测到命令，保留现有安装；请自行运行版本命令核验。'} }
    $listArgs=@('list','--id',$Tool.id,'--exact','--source','winget','--disable-interactivity','--accept-source-agreements')
    $before=& $Run $listArgs
    if ($before.exitCode -eq 0) { return @{key=$Tool.key;state='existing';message='WinGet 检测到已安装，已跳过，不升级。'} }
    if ($before.exitCode -ne -1978335212) { throw (New-ToolFailure $Tool '检查安装状态' $before.exitCode) }
    if ($CheckOnly) { return @{key=$Tool.key;state='ready';message='尚未安装，可安装版本 '+$Tool.version} }
    $result=& $Run (Get-InstallArguments $Tool)
    if ($result.exitCode -ne 0) { throw (New-ToolFailure $Tool '下载、校验或安装' $result.exitCode) }
    $after=& $Run $listArgs
    if ($after.exitCode -ne 0) { throw (New-ToolFailure $Tool '安装后的记录核验' $after.exitCode) }
    return @{key=$Tool.key;state='installed';message='安装记录已核验；仍需启动程序、登录并验证功能。'}
}
