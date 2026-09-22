param([string]$RenderPreview)
. (Join-Path $PSScriptRoot 'Core.ps1')
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$catalog=@(Get-ToolCatalog)
$chosen=@('codex')
if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'selection.json')){
 $chosen=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'selection.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 [void](Get-SelectedTools ($chosen -join ','))
}
$form=New-Object Windows.Forms.Form
$form.Text='学镜 · Windows 安装助手'
$form.Size=New-Object Drawing.Size(800,760)
$form.MinimumSize=$form.Size
$form.StartPosition='CenterScreen'
$form.Font=New-Object Drawing.Font('Microsoft YaHei UI',10)
$form.BackColor=[Drawing.Color]::FromArgb(246,249,254)
$layout=New-Object Windows.Forms.TableLayoutPanel
$layout.Dock='Fill';$layout.Padding=New-Object Windows.Forms.Padding(24)
$layout.ColumnCount=1;$layout.RowCount=7
foreach($height in @(55,175,65,46,48,0,72)){
 $style=New-Object Windows.Forms.RowStyle
 if($height){$style.SizeType='Absolute';$style.Height=$height}else{$style.SizeType='Percent';$style.Height=100}
 [void]$layout.RowStyles.Add($style)
}
$form.Controls.Add($layout)
$title=New-Object Windows.Forms.Label
$title.Text='选择工具，一次安装';$title.Font=New-Object Drawing.Font('Microsoft YaHei UI',18,[Drawing.FontStyle]::Bold);$title.Dock='Fill'
$layout.Controls.Add($title,0,0)
$list=New-Object Windows.Forms.CheckedListBox
$list.Dock='Fill';$list.CheckOnClick=$true;$list.BorderStyle='FixedSingle';$list.BackColor=[Drawing.Color]::White
foreach($tool in $catalog){[void]$list.Items.Add(($tool.name+'  ·  '+$tool.version),($tool.key -in $chosen))}
$layout.Controls.Add($list,0,1)
$notice=New-Object Windows.Forms.Label
$notice.Dock='Fill';$notice.Padding=New-Object Windows.Forms.Padding(0,10,0,0)
$notice.Text='支持 Windows 10 2004+ / 11。保留已有安装，不升级、不改写模型配置。安装可能需要系统授权；账号与密钥由你在工具中配置。'
$layout.Controls.Add($notice,0,2)
$consent=New-Object Windows.Forms.CheckBox
$consent.Dock='Fill';$consent.Text='我确认所选工具，并同意其许可及 WinGet 源条款（可在下方查看）'
$layout.Controls.Add($consent,0,3)
$buttons=New-Object Windows.Forms.FlowLayoutPanel
$buttons.Dock='Fill'
function Add-Button([string]$Text,$Panel){
 $button=New-Object Windows.Forms.Button;$button.Text=$Text;$button.AutoSize=$true;$button.Height=36;$button.Padding=New-Object Windows.Forms.Padding(8,0,8,0);[void]$Panel.Controls.Add($button);return $button
}
$check=Add-Button '检查环境' $buttons
$install=Add-Button '安装所选工具' $buttons
$stop=Add-Button '停止后续任务' $buttons;$stop.Enabled=$false
$install.BackColor=[Drawing.Color]::FromArgb(37,99,220);$install.ForeColor=[Drawing.Color]::White
$layout.Controls.Add($buttons,0,4)
$output=New-Object Windows.Forms.TextBox
$output.Multiline=$true;$output.ReadOnly=$true;$output.ScrollBars='Vertical';$output.Dock='Fill';$output.BackColor=[Drawing.Color]::White
$output.Text='点击“检查环境”可先确认本机条件。检查可能联系 WinGet 官方源，但不会安装工具。'
$layout.Controls.Add($output,0,5)
$links=New-Object Windows.Forms.FlowLayoutPanel
$links.Dock='Fill';$links.WrapContents=$true
$guide=Add-Button '所选工具官方指引' $links
$requirements=Add-Button '获取 WinGet' $links
$license=Add-Button 'WinGet 条款' $links
$logs=Add-Button '本地任务记录' $links
$layout.Controls.Add($links,0,6)
$script:worker=$null;$script:runFolder='';$script:lastStatus=''
$timer=New-Object Windows.Forms.Timer;$timer.Interval=500
function Start-Task([string]$Operation){
 if($script:worker -and -not $script:worker.HasExited){return}
 $keys=@();foreach($index in $list.CheckedIndices){$keys+=@($catalog[$index].key)}
 if(-not $keys.Count){[void][Windows.Forms.MessageBox]::Show('请至少选择一个工具。');return}
 if($Operation -eq 'check'){
  $answer=[Windows.Forms.MessageBox]::Show('检查会连接微软 WinGet 源并接受源条款，不安装任何工具。是否继续？','确认检查','YesNo','Question')
  if($answer -ne 'Yes'){return}
 }
 if($Operation -eq 'install'){
  if(-not $consent.Checked){[void][Windows.Forms.MessageBox]::Show('请先阅读官方指引及许可条款，并勾选确认。');return}
  $names=(@($catalog | Where-Object key -in $keys).name -join '、')
  $answer=[Windows.Forms.MessageBox]::Show(('即将安装：'+$names+'。WinGet 可能安装必要依赖并请求系统授权。已有工具将跳过；失败时停止后续任务。是否继续？'),'确认安装','YesNo','Question')
  if($answer -ne 'Yes'){return}
 }
 $id=[guid]::NewGuid().ToString('N')
 $script:runFolder=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) ('LearningMirror/Installer/runs/'+$id)
 New-Item -ItemType Directory -Path $script:runFolder -Force | Out-Null
 $arguments=@('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+(Join-Path $PSScriptRoot 'Worker.ps1')+'"'),'-Selection',($keys -join ','),'-RunId',$id,'-Operation',$Operation)
 $arguments+='-Confirmed'
 $script:worker=Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:runFolder 'worker.log') -RedirectStandardError (Join-Path $script:runFolder 'worker-error.log')
 $list.Enabled=$false;$check.Enabled=$false;$install.Enabled=$false;$consent.Enabled=$false;$stop.Enabled=$true
 $output.Text='正在启动任务…';$script:lastStatus='';$timer.Start()
}
$check.Add_Click({try{Start-Task 'check'}catch{$output.Text=$_.Exception.Message}})
$install.Add_Click({try{Start-Task 'install'}catch{$output.Text=$_.Exception.Message}})
$stop.Add_Click({
 if($script:runFolder){New-Item -ItemType File -Path (Join-Path $script:runFolder 'stop-requested') -Force | Out-Null;$stop.Enabled=$false;$output.AppendText([Environment]::NewLine+'已请求停止。正在执行的安装会继续到结束，避免中断写入。')}
})
$timer.Add_Tick({
 try{
  $path=Join-Path $script:runFolder 'status.json'
  if(Test-Path -LiteralPath $path){
   $raw=Get-Content -LiteralPath $path -Raw -Encoding UTF8
   if($raw -ne $script:lastStatus){
    $state=$raw | ConvertFrom-Json;$script:lastStatus=$raw
    $lines=@($state.message,'')
    foreach($item in $state.items){$tool=$catalog | Where-Object key -eq $item.key;$lines+=($tool.name+'：'+$item.message)}
    if($state.finished){$lines+='';foreach($tool in $catalog | Where-Object key -in @($state.items | ForEach-Object { $_.key })){$lines+=($tool.name+'：'+$tool.next)};$lines+='';$lines+='卸载：Windows 设置 → 应用 → 已安装的应用。个人配置不会由助手删除。'}
    $output.Text=$lines -join [Environment]::NewLine
   }
  }
  if($script:worker.HasExited){
   $timer.Stop();$list.Enabled=$true;$check.Enabled=$true;$install.Enabled=$true;$consent.Enabled=$true;$stop.Enabled=$false
   if(-not $script:lastStatus){$output.Text='助手未正常启动，请查看本地任务记录中的 worker-error.log。'}
  }
 }catch{$output.Text='无法读取任务状态，请查看本地任务记录。'}
})
$guide.Add_Click({$index=$list.SelectedIndex;if($index -lt 0){$index=0};Start-Process $catalog[$index].docs})
$requirements.Add_Click({Start-Process 'https://apps.microsoft.com/detail/9nblggh4nns1'})
$license.Add_Click({Start-Process 'https://github.com/microsoft/winget-pkgs/blob/master/README.md'})
$logs.Add_Click({if($script:runFolder){Start-Process explorer.exe -ArgumentList ('"'+$script:runFolder+'"')}else{$output.Text='尚未执行任务，没有本地记录。'}})
$form.Add_FormClosing({param($sender,$event)
 if($script:worker -and -not $script:worker.HasExited){$event.Cancel=$true;[void][Windows.Forms.MessageBox]::Show('任务仍在进行，请使用“停止后续任务”并等待当前步骤结束。')}
})
if($RenderPreview){
 $form.Opacity=0;$form.ShowInTaskbar=$false;$form.Show();[Windows.Forms.Application]::DoEvents();$form.PerformLayout()
 $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height)
 try{$form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)));$bitmap.Save($RenderPreview)}finally{$bitmap.Dispose();$form.Dispose()}
}else{[void]$form.ShowDialog();$timer.Dispose();$form.Dispose()}
