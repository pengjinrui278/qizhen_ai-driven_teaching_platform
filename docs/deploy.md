# 生产部署指南

本指南用于把 Learning Mirror 部署到一台 Linux 云服务器，使组员可通过域名 `learningmirror.cn` / `learningmirror.xyz` 访问。

## 1. 服务器准备

- 一台 Linux 云主机（推荐 Ubuntu 22.04/24.04 LTS，x86_64）。
- 安装 Docker + Docker Compose v2。
- 安装 Git、Node.js 20+、pnpm 10+。
- 开放服务器安全组：TCP 80、443。

## 2. 域名解析

在域名控制台把以下记录指向服务器公网 IP：

```
learningmirror.cn     A  <服务器IP>
www.learningmirror.cn A  <服务器IP>
learningmirror.xyz    A  <服务器IP>
www.learningmirror.xyz A <服务器IP>
```

## 3. 克隆代码并构建前端

```bash
git clone https://github.com/pengjinrui278/qizhen_ai-driven_teaching_platform.git /opt/learning-mirror
cd /opt/learning-mirror

# 下载教材大文件（如尚未下载）
git lfs pull

# 安装前端依赖并构建静态站点
pnpm install
pnpm build:web
# 产物在 apps/web/dist/
```

## 4. 环境配置

复制示例环境变量并修改：

```bash
cp .env.example .env
```

至少修改以下项：

```bash
# 生产：前端使用相对路径，留空即可
NEXT_PUBLIC_API_BASE=

# 生产：由 nginx 同域代理，CORS 来源留空
MIRROR_CORS_ORIGINS=

# 数据库密码建议修改
MIRROR_POSTGRES_PASSWORD=你的强密码

# MinIO 密码建议修改
MIRROR_MINIO_ROOT_PASSWORD=你的强密码

# 模型网关：默认 stub；真实模型请填写 DeepSeek/通义/GLM 配置
MIRROR_LLM_PROVIDER=stub
# MIRROR_LLM_BASE_URL=https://api.deepseek.com
# MIRROR_LLM_API_KEY=sk-...
# MIRROR_LLM_MODEL=deepseek-v4-flash
```

`.env` 已加入 `.gitignore`，**严禁提交到 Git**。

## 5. 初始化数据库与课程资料

```bash
# 进入后端目录
cd apps/api

# 建表、写入课程注册表、导入 CoursePack
python -m mirror_api.cli init-db
python -m mirror_api.cli seed-profiles
python -m mirror_api.cli import-all-coursepacks
python -m mirror_api.cli seed-demo-workspace
python -m mirror_api.cli status
```

## 6. 启动生产服务

```bash
# 回到仓库根目录
cd /opt/learning-mirror

# 构建后端镜像并启动全部服务
docker compose -f compose.prod.yml up -d --build
```

访问：
- <http://learningmirror.cn> 或 <http://learningmirror.xyz>
- <http://learningmirror.cn/api/health> 应返回 `{"status":"ok"}`

## 7. 导入教材语料（可选）

教材已授权入库时执行：

```bash
cd /opt/learning-mirror/apps/api
python -m mirror_api.cli import-all-textbooks
```

导入前请先抽检 PDF 文本抽取质量，见 `import-textbook --help`。

## 8. HTTPS（建议上线前配置）

公网生产建议启用 HTTPS。最简单的方式：

1. 使用云厂商负载均衡或 CDN 的免费证书。
2. 或在服务器上通过 Let's Encrypt + certbot 获取证书，挂载到 nginx 容器。

compose.prod.yml 中 443 端口已预留，可按需替换 nginx.conf 中的证书路径。

## 9. 更新与维护

```bash
# 拉取代码更新
git pull
git lfs pull

# 重新构建前端
pnpm install
pnpm build:web

# 重建并重启后端
docker compose -f compose.prod.yml up -d --build

# 查看日志
docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs -f web
```

## 10. 安全提醒

- 不要将 `.env`、TLS 私钥、LLM API Key 提交到 Git。
- 生产环境不要在 `MIRROR_LLM_PROVIDER=openai_compatible` 时使用 `--reload`。
- 定期备份 `mirror_postgres` Docker volume。
