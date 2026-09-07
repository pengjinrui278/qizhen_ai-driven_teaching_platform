# Railway 部署指南

本指南说明如何把 Learning Mirror 部署到 [Railway](https://railway.app/)，并绑定自定义域名 `learningmirror.cn` / `learningmirror.xyz`。

## 架构

- **单一容器服务**：`Dockerfile.railway` 构建前端静态站点，并在容器内同时运行 nginx 与 uvicorn，nginx 把 `/api` 转发给本机后端。
- **Railway 托管 Postgres**：使用 Railway 的 **pgvector 模板**（Railway 官方提供，支持 `vector` 扩展）。
- 不单独运行 Redis / MinIO：当前后端尚未使用它们，部署时无需创建。

## 前提

1. 注册/登录 [Railway](https://railway.app/)。
2. 将本仓库授权给 Railway（Dashboard → New Project → Deploy from GitHub repo）。
3. 域名 `learningmirror.cn` / `learningmirror.xyz` 已注册，并拥有修改 DNS 解析的权限。

## 创建服务

### 1. 创建 Postgres（pgvector）

在 Railway 项目里：

1. **New** → **Database** → **Add PostgreSQL** 不要用默认模板，而是搜索并选择 **pgvector** 模板（Railway 模板市场有 `pgvector` 专用模板）。
2. 创建后，服务名保持默认或改名为 `Postgres`。
3. 进入该服务 → **Variables**，确认有 `DATABASE_URL`。

### 2. 创建主应用服务

1. **New** → **GitHub Repo** → 选择 `qizhen_ai-driven_teaching_platform`。
2. Railway 会自动读取根目录 `railway.json`，使用 `Dockerfile.railway` 构建。
3. 服务创建后，进入 **Settings** → 改名为 `learning-mirror`（可选，便于识别）。

### 3. 设置环境变量

在主应用服务的 **Variables** 中添加：

| 变量名 | 值 | 说明 |
|---|---|---|
| `MIRROR_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | 引用 pgvector 服务的连接串；后端会自动把 `postgresql://` 改写成 `postgresql+pg8000://` |
| `MIRROR_CORS_ORIGINS` | 留空 | 同域部署，关闭跨域 |
| `MIRROR_LLM_PROVIDER` | `openai_compatible` | 如需真实模型 |
| `MIRROR_LLM_BASE_URL` | 你的模型服务商地址 | 如 DeepSeek |
| `MIRROR_LLM_API_KEY` | 你的 API 密钥 | 不要泄露 |
| `MIRROR_LLM_MODEL` | 模型名 | 如 `deepseek-v4-flash` |

若服务名不是 `Postgres`，则 `${{Postgres.DATABASE_URL}}` 中的 `Postgres` 改为实际服务名。

### 4. 初始化数据库与导入课程包

主应用首次部署后，在 Railway 容器内执行一次性初始化命令：

```bash
# 进入 Railway 容器 Console
python -m mirror_api.cli init-db
python -m mirror_api.cli seed-profiles
python -m mirror_api.cli import-all-coursepacks
python -m mirror_api.cli status
```

教材语料（PDF）需要上传到容器持久存储或先下载到本地再导入；目前 Railway 单容器无持久卷，建议把教材 PDF 作为构建上下文的一部分放到 `materials/教材/` 目录，或在 Console 中手动 `wget` 下载后执行 `import-all-textbooks`。

### 5. 绑定自定义域名

1. 进入主应用服务 → **Settings** → **Domains** → **Generate Domain** 会获得一个 `*.railway.app` 临时域名。
2. 点击 **Custom Domain** → 添加 `learningmirror.cn` 和 `learningmirror.xyz`。
3. Railway 会提示需要添加的 DNS 记录（通常是 CNAME 到 `xxx.railway.app`）。
4. 去域名服务商控制台添加对应 CNAME 记录，等待 DNS 生效（通常几分钟到几小时）。
5. Railway 自动完成 HTTPS（Let's Encrypt）证书签发。

### 6. 验证

```bash
curl https://learningmirror.cn/health
curl https://learningmirror.cn/api/v1/courses
```

浏览器打开 `https://learningmirror.cn/student` 和 `https://learningmirror.cn/teacher` 即可使用。

## 维护

- **重新部署**：每次 `git push origin main`，Railway 会自动重新构建并滚动部署。
- **查看日志**：Railway Dashboard → 主应用服务 → **Logs**。
- **数据库**：Railway pgvector 模板提供自动备份，也可在 **Backups** 中手动创建。
- **费用**：Railway 按服务与资源计费；pgvector 模板与主应用服务都会产生费用，请留意免费额度与账单。

## 已知限制

- 单容器同时跑 nginx + uvicorn，适合演示与内测；流量大时建议拆分为独立 Web / API 服务。
- 教材 PDF 体积大（~500 MB），不建议直接提交到 Git；生产环境建议把 PDF 放到对象存储或 Railway Volume，再按需下载到容器内导入。
