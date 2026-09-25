# 安装助手 0.1.2

- WinGet 官方清单中 WorkBuddy 5.5.6 预期 SHA-256：B1C61B8A0550012C3E9E2CCE4B2D566FB5BDB3283E97146B8808C3DCB1A571F4。
- 用户本机失败缓存实测 SHA-256：6E5DEB2769D8B5D4E0313AA7A5D4E00CCE45F556068CCE769162F2CAD647748E；Authenticode 为 Valid，签发对象为 Tencent Technology (Shenzhen) Company Limited。但签名不能代替哈希匹配，未运行该文件。
- 从腾讯官方清单地址重新下载 5.6.2，实测 SHA-256：627E5A565436D0876740AF69C2747759648662C52958D2A5DF1BA330A82C3025，与微软清单一致；腾讯签名 Valid。助手固定版本改为 5.6.2，不绕过哈希检查。下载核验不等于实机安装及登录完成。
- 清单：https://raw.githubusercontent.com/microsoft/winget-pkgs/master/manifests/t/Tencent/WorkBuddy/5.6.2/Tencent.WorkBuddy.installer.yaml
- 诊断展示失败工具、环节、十六进制与十进制错误码、是否可能已有部分安装、处理步骤；覆盖哈希错误、网络、拒绝访问、磁盘空间、取消和未知失败。
- 每次 WinGet 调用记录参数、输出与错误码，仅保留本机。界面提供打开任务日志、WinGet 日志、复制故障摘要；提醒分享前检查个人信息。
- 未执行软件安装、未修改系统安全策略、未部署到正式网站。
