param([Parameter(Mandatory=$true)][string]$CorePath)
. $CorePath
$script:passed=0
function Assert($Condition,[string]$Message){if(-not $Condition){throw $Message}}
function Test-Case([string]$Name,[scriptblock]$Body){& $Body;$script:passed++;Write-Output ('PASS '+$Name)}
function Expect-Throw([scriptblock]$Body){$failed=$false;try{& $Body | Out-Null}catch{$failed=$true};Assert $failed 'Expected rejection'}
function Get-ExistingCommand($Tool){return $script:existing}
$script:existing=$false
Test-Case 'WinGet standard alias works without PATH' {
 & {
  function Get-Command { return $null }
  function Test-Path { param($LiteralPath,$PathType) return $LiteralPath.EndsWith('Microsoft\WindowsApps\winget.exe') -or $LiteralPath.EndsWith('Microsoft/WindowsApps/winget.exe') }
  Assert ([bool](Find-WinGet)) 'standard alias missing'
 }
}
Test-Case 'WinGet PATH fallback' {
 & {
  function Test-Path { return $false }
  function Get-Command { return [pscustomobject]@{Source='C:\fixture\winget.exe'} }
  Assert ((Find-WinGet) -eq 'C:\fixture\winget.exe') 'PATH fallback missing'
 }
}
Test-Case 'WinGet missing returns empty path' {
 & {
  function Test-Path { return $false }
  function Get-Command { return $null }
  Assert ((Find-WinGet) -eq '') 'missing command not handled'
 }
}
$catalog=@(Get-ToolCatalog);$tool=$catalog[0]
$official='{"Arg":"https://cdn.winget.microsoft.com/cache","Identifier":"Microsoft.Winget.Source_8wekyb3d8bbwe","Name":"winget","Type":"Microsoft.PreIndexed.Package"}'
Test-Case 'catalog identity' {Assert ($catalog.Count -eq 4) 'count';Assert ($catalog[0].id -eq 'OpenAI.Codex') 'id'}
Test-Case 'selection allowlist' {Expect-Throw {Get-SelectedTools 'codex,not-a-tool'};Expect-Throw {Get-SelectedTools 'codex;calc'};Expect-Throw {Get-SelectedTools ''}}
Test-Case 'unique selection' {Assert (@(Get-SelectedTools 'codex,codex').Count -eq 1) 'duplicate'}
Test-Case 'official source' {Assert-OfficialSource $official}
Test-Case 'reject altered source' {Expect-Throw {Assert-OfficialSource $official.Replace('cdn.winget.microsoft.com','attacker.invalid')};Expect-Throw {Assert-OfficialSource $official.Replace('Microsoft.Winget.Source_8wekyb3d8bbwe','fake')}}
Test-Case 'reject duplicate source' {Expect-Throw {Assert-OfficialSource ('['+$official+','+$official+']')}}
Test-Case 'safe fixed install arguments' {
 $a=Get-InstallArguments $tool
 Assert ('--exact' -in $a -and '--no-upgrade' -in $a -and '--scope' -in $a -and 'user' -in $a) 'flags'
 Assert ('--force' -notin $a -and '--ignore-security-hash' -notin $a -and '--override' -notin $a) 'unsafe flag'
 Assert ($tool.version -in $a -and $tool.id -in $a) 'pin'
}
function Mock-Run([int[]]$Codes){
 $script:codes=New-Object Collections.Queue
 foreach($code in $Codes){$script:codes.Enqueue($code)}
 $script:calls=New-Object Collections.ArrayList
 return {param($arguments) [void]$script:calls.Add(($arguments -join ' '));if(-not $script:codes.Count){throw 'Unexpected invocation'};return @{exitCode=$script:codes.Dequeue();output='';error=''}}
}
Test-Case 'check only never installs' {
 $run=Mock-Run @(-1978335212)
 $r=Invoke-ToolStep $tool 'x64' $run -CheckOnly
 Assert ($r.state -eq 'ready' -and $script:calls.Count -eq 1) 'check'
}
Test-Case 'skip existing package' {
 $run=Mock-Run @(0)
 $r=Invoke-ToolStep $tool 'x64' $run
 Assert ($r.state -eq 'existing' -and $script:calls.Count -eq 1) 'existing'
}
Test-Case 'skip existing command' {
 $script:existing=$true
 try{$run=Mock-Run @();$r=Invoke-ToolStep $tool 'x64' $run;Assert ($r.state -eq 'existing' -and $script:calls.Count -eq 0) 'command'}finally{$script:existing=$false}
}
Test-Case 'unsupported architecture never installs' {
 $run=Mock-Run @();$r=Invoke-ToolStep $catalog[2] 'arm64' $run
 Assert ($r.state -eq 'unsupported' -and $script:calls.Count -eq 0) 'arch'
}
Test-Case 'successful install verified' {
 $run=Mock-Run @(-1978335212,0,0);$r=Invoke-ToolStep $tool 'x64' $run
 Assert ($r.state -eq 'installed' -and $script:calls.Count -eq 3) 'install'
 Assert ($script:calls[1].StartsWith('install --id OpenAI.Codex --exact')) 'identity'
}
Test-Case 'unknown discovery failure stops' {$run=Mock-Run @(5);Expect-Throw {Invoke-ToolStep $tool 'x64' $run};Assert ($script:calls.Count -eq 1) 'stop'}
Test-Case 'installer failure stops' {$run=Mock-Run @(-1978335212,7);Expect-Throw {Invoke-ToolStep $tool 'x64' $run};Assert ($script:calls.Count -eq 2) 'stop'}
Test-Case 'verification failure not success' {$run=Mock-Run @(-1978335212,0,-1978335212);Expect-Throw {Invoke-ToolStep $tool 'x64' $run}}
Test-Case 'argument injection rejected' {Expect-Throw {Invoke-WinGet 'unused.exe' @('install','foo;calc')}}
Test-Case 'process execution and exit collection' {
 $r=Invoke-WinGet (Join-Path $PSHOME 'powershell.exe') @('-NoProfile','-Command','exit','7') 15
 Assert ($r.exitCode -eq 7) 'exit'
}
Write-Output ('Passed '+$script:passed+' tests; zero real installation commands.')
