# 生产部署指南

本指南用于把 Learning Mirror 部署到生产服务器 `124.220.5.87`，并通过 `learningmirror.cn` / `www.learningmirror.cn` 访问。

## 1. 服务器准备

- 一台 Linux 云主机（推荐 Ubuntu 22.04/24.04 LTS，x86_64）。
- 安装 Docker + Docker Compose v2。
- 安装 Git、Node.js 20+、pnpm 10+。
- 开放服务器安全组：TCP 80、443。

## 2. 域名解析

当前权威 DNS 为阿里云（`dns3.hichina.com` / `dns4.hichina.com`）。在阿里云「云解析 DNS」中添加：

```
@    A  124.220.5.87
www  A  124.220.5.87
```

解析线路选「默认」，TTL 可保持 10 分钟。不要再为同一主机记录配置冲突的 CNAME/AAAA 记录。

> 服务器位于腾讯云中国大陆节点。如本次 ICP 备案不是通过腾讯云完成，先在腾讯云完成「接入备案」，再解析到该 IP。

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

# 生产：由 Caddy 同域代理，CORS 来源留空
MIRROR_CORS_ORIGINS=

# 数据库密码建议修改
MIRROR_POSTGRES_PASSWORD=你的强密码

# MinIO 密码建议修改
MIRROR_MINIO_ROOT_PASSWORD=你的强密码

# 生产环境必填；教师/TA 注册用的私密邀请码
MIRROR_STAFF_INVITE_CODE=你的随机强邀请码

# 从备案成功通知原样复制；不要填示例值
MIRROR_ICP_NUMBER=你的准确ICP备案号

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
- <https://learningmirror.cn>
- <https://www.learningmirror.cn>
- <https://learningmirror.cn/api/health> 应返回 `{"status":"ok"}`

DNS 未生效时可用 <http://124.220.5.87> 做应急检查。这个 IP 入口仅用 HTTP，不用于正式登录。

## 7. 导入教材语料（可选）

教材已授权入库时执行：

```bash
cd /opt/learning-mirror/apps/api
python -m mirror_api.cli import-all-textbooks
```

导入前请先抽检 PDF 文本抽取质量，见 `import-textbook --help`。

## 8. HTTPS 与备案号

- Caddy 在 DNS 解析生效且 80/443 可从公网访问后，会自动申请、加载和续期证书，无需手动运行 certbot。
- 证书状态：`docker compose -f compose.prod.yml logs web`。
- 备案通过后，首页底部必须显示准确 ICP 备案号并链接到 <https://beian.miit.gov.cn/>。将原样备案号写入 `.env` 的 `MIRROR_ICP_NUMBER` 后重建 web 镜像。
- 网站开通后 30 日内办理公安备案，通过后再配置 `MIRROR_PUBLIC_SECURITY_NUMBER` 与 `MIRROR_PUBLIC_SECURITY_URL` 并重建 web 镜像。

## 9. 更新与维护

```bash
# 拉取代码更新
git pull
git lfs pull

# 重新构建前端
pnpm install
pnpm build:web

# 重建并重启全部服务（包括 Caddy 与自动 HTTPS）
docker compose -f compose.prod.yml up -d --build

# 查看日志
docker compose -f compose.prod.yml logs -f api
docker compose -f compose.prod.yml logs -f web
```

## 10. 安全提醒

- 不要将 `.env`、TLS 私钥、LLM API Key 提交到 Git。
- 生产环境不要在 `MIRROR_LLM_PROVIDER=openai_compatible` 时使用 `--reload`。
- 定期备份 `mirror_postgres` Docker volume。
