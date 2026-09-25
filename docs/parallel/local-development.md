# 分工本地运行（PowerShell）

先进入自己的 worktree；下面以 web 分工为例，其他分工替换路径及端口（见 README 表格）。
这些命令是开发人员操作，不是面向学生的网站说明。不要使用固定 3010/8010 的 scripts/start-preview.ps1 启动分工区。

## 安装独立依赖

```powershell
Set-Location C:/Users/19900/Projects/mathmirror-web
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "apps/api[dev]"
pnpm install --frozen-lockfile
```

需要网络与可用的 Python/Node/pnpm，失败时如实报告，不去更改主区依赖。安装依赖会执行仓库已有生命周期脚本，应先阅读 package.json。

## 终端一：离线后端

```powershell
Set-Location C:/Users/19900/Projects/mathmirror-web
New-Item -ItemType Directory -Force data | Out-Null
$env:PYTHONPATH="$PWD/apps/api/src"
$env:MIRROR_DATABASE_URL="sqlite:///$($PWD.Path.Replace('\','/'))/data/lane.sqlite"
$env:MIRROR_LLM_PROVIDER="stub"
$env:MIRROR_ALLOW_STUB_LEARNING="false"
$env:MIRROR_CORS_ORIGINS="http://127.0.0.1:3011"
.\.venv\Scripts\python.exe -m uvicorn mirror_api.main:app --host 127.0.0.1 --port 8011
```

默认不开放占位学习回答。若需要合成演示，明确标注离线测试并仅在本区把 MIRROR_ALLOW_STUB_LEARNING 设为 true；不冒充真实 LLM。
数据库初始化/合成种子请先检查当前 CLI 和 bootstrap，不得导入生产数据或未经授权教材。
若本区已有 .env，先检查其配置来源而不打印密钥；不使用复制来的主区 .env。

## 终端二：前端

```powershell
Set-Location C:/Users/19900/Projects/mathmirror-web
$env:MIRROR_DEV_API_URL="http://127.0.0.1:8011"
node scripts/build-windows-helper.cjs
Set-Location apps/web
pnpm exec next dev --hostname 127.0.0.1 --port 3011
```

平台线用 3012/8012，智能体用 3013/8013，反馈用 3014/8014。
用独立浏览器配置打开对应地址；访问失败先检查两端端口和日志，不修改其他工作区进程。
以上是准备指引，不能当作四个独立服务已经启动的验收记录。
