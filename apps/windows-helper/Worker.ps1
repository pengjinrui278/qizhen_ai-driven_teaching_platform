param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-z,]+$')][string]$Selection,
 [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$RunId,
 [ValidateSet('check','install')][string]$Operation='check',
 [switch]$Confirmed
)
. (Join-Path $PSScriptRoot 'Core.ps1')
$runRoot=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('LearningMirror/Installer/runs/'+$RunId)
New-Item -ItemType Directory -Path $runRoot -Force | Out-Null
$state=@{helperVersion='0.1.2';operation=$Operation;phase='starting';message='正在检查环境';items=@();finished=$false;success=$false;diagnosis=$null;activeTool='';lastCommandLog='';startedAt=[DateTimeOffset]::Now.ToString('o')}
$script:commandNumber=0
function Invoke-LoggedWinGet([string]$Executable,[string[]]$Arguments,[int]$TimeoutSeconds=1800){
    $script:commandNumber++
    $logName=('command-{0:D2}-{1}.log' -f $script:commandNumber,$Arguments[0].TrimStart('-'))
    $path=Join-Path $runRoot $logName
    $state.lastCommandLog=$logName;Save-State
    @('Time: '+[DateTimeOffset]::Now.ToString('o'),'Arguments: '+($Arguments -join ' ')) | Set-Content -LiteralPath $path -Encoding UTF8
    try{
        $result=Invoke-WinGet $Executable $Arguments $TimeoutSeconds
        @('ExitCode: '+$result.exitCode,'STDOUT:',$result.output,'STDERR:',$result.error) | Add-Content -LiteralPath $path -Encoding UTF8
        return $result
    }catch{('Process error: '+$_.Exception.Message) | Add-Content -LiteralPath $path -Encoding UTF8;throw}
}
function Save-State {
    $temp=Join-Path $runRoot 'status.tmp'
    $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temp -Encoding UTF8
    Move-Item -LiteralPath $temp -Destination (Join-Path $runRoot 'status.json') -Force
}
Save-State
$mutex=New-Object Threading.Mutex($false,'Local\LearningMirrorInstaller')
$held=$false
try {
    try { $held=$mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $held=$true }
    if (-not $held) { throw '另一个安装助手正在执行，请等待完成。' }
    if (-not $Confirmed) { throw '联网检查或安装需要明确确认。' }
    $tools=@(Get-SelectedTools $Selection)
    $environment=Get-EnvironmentCheck
    if (-not $environment.supported) { throw '首版支持 Windows 10 2004+ / Windows 11，x64 或 ARM64。' }
    if (-not $environment.wingetPath) { throw '未检测到 WinGet 入口。请在微软商店完成“应用安装程序”的安装或更新（仅下载安装包不够），再重新打开助手。若已安装，请检查 Windows 的应用执行别名中 WinGet 是否启用。无需自行在终端安装所选工具。' }
    $version=Invoke-LoggedWinGet $environment.wingetPath @('--version') 30
    if ($version.exitCode -ne 0 -or $version.output.Trim() -notmatch '^v?(\d+\.\d+\.\d+)') { throw '已找到 WinGet，但无法启动或读取版本。请在微软商店更新“应用安装程序”，再重新打开助手；此错误不表示没有下载。' }
    if ([version]$Matches[1] -lt [version]'1.12.0') { throw '请先通过微软 App Installer 更新 WinGet 至 1.12 或更高版本。' }
    $source=Invoke-LoggedWinGet $environment.wingetPath @('source','export','winget') 60
    if ($source.exitCode -ne 0) { throw '无法核对 WinGet 来源。' }
    Assert-OfficialSource $source.output
    $run={param($arguments) Invoke-LoggedWinGet $environment.wingetPath $arguments}
    foreach($tool in $tools) {
        if (Test-Path -LiteralPath (Join-Path $runRoot 'stop-requested')) { $state.phase='stopped';$state.message='已停止后续任务；已完成安装不自动卸载。';break }
        $state.activeTool=$tool.name
        $state.phase='working';$state.message=($tool.name+'：'+$(if($Operation -eq 'check'){'正在检查'}else{'正在安装或检查，可能需要数分钟'}));Save-State
        $result=Invoke-ToolStep $tool $environment.architecture $run -CheckOnly:($Operation -eq 'check')
        $state.items+=@($result);Save-State
    }
    if($state.phase -ne 'stopped'){
        $state.phase='complete'
        $state.success=(@($state.items | Where-Object state -eq 'unsupported').Count -eq 0)
        $state.message=if(-not $state.success){'部分工具因架构限制被跳过，请查看各工具结果。'}elseif($Operation -eq 'check'){'环境检查完成，本次没有安装软件。确认所选工具并勾选许可后，点击“安装所选工具”。'}else{'安装任务完成。请查看各工具结果，再按官方指引登录和配置接口。'}
    }
} catch {
    $state.phase='failed'
    $diagnosis=$_.Exception.Data['diagnosis']
    if(-not $diagnosis){
        $diagnosis=Get-InstallDiagnosis $(if($state.activeTool){$state.activeTool}else{'安装环境'}) '环境检查或进程执行'
        $diagnosis.title=$_.Exception.Message
        if(-not $state.activeTool){$diagnosis.impact='安装前检查未通过，本次尚未开始安装所选工具。'}
        if($_.Exception.Message -match 'timeout'){$diagnosis.impact='安装进程可能仍在运行。请打开任务管理器确认结束后再重试；助手不会强杀安装程序。'}
    }
    $state.diagnosis=$diagnosis
    $state.message=Format-InstallDiagnosis $diagnosis
}
finally {
    $state.finished=$true;Save-State
    if($held){$mutex.ReleaseMutex()};$mutex.Dispose()
}
if(-not $state.success){exit 1}
