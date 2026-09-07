# Learning Mirror（学镜）

面向数学类课程的个性化学习智能体平台：Student Mirror / Course Mirror / Assignment Workspace 三端协同的比赛版工程。

## 快速了解

- **项目概况总览（进度、目标、下一步，先读这个）**：`docs/项目概况总览.md`
- 文档地图：`docs/README.md`

## 参赛信息

- 赛事：第二届全国高校“启真问智”教育教学人工智能大赛（浙江大学主办，官网 <https://qzwz.mh.chaoxing.com>）
- 大赛通知与参赛指南：`docs/competition/`
- 关键日期：**2026-09-15 前**报名与申报书；**2026-09-30 前**提交作品及说明文件
- 工作流程与提交规范：`WORKFLOW.md`
- 进度跟踪：`docs/progress/进度日志.md`

## 阶段 0 已覆盖

- 模块化单体的前后端目录；
- Student Mirror / Course Mirror / Assignment Workspace 边界；
- Course Mirror 统一请求、响应与 Learning Evidence 协议；
- 数分、高代、大物、点拓、常微分五门课程 Profile；
- 陈纪修《数学分析》第 3 版教材 Profile 与第一章自建语料（11 个团队转述知识节点 + 10 道全自编题，不含教材原文与原书习题）；
- 学生端、课程建设端、教师/TA 端页面骨架；
- PostgreSQL + pgvector、Redis、MinIO 本地基础设施配置；
- 数据来源、版权范围、证据可追溯和临时 Workspace 生命周期字段。

## 本地运行

后端（无需数据库即可查看阶段 0 协议和课程注册表）：

```powershell
cd apps/api
python -m pip install -e ".[dev]"
uvicorn mirror_api.main:app --reload --port 8000
```

前端：

```powershell
pnpm install
pnpm dev:web
```

启动后访问 `http://localhost:3000/student` 进入学生端演示页（选题 → 渐进提示 → 完整解答 → 知识点答疑，回答全程经过质检与证据落库；浏览器本地生成匿名参与码，输入教师加入码即可把求助挂到作业）。

访问 `http://localhost:3000/teacher` 进入教师/TA 端（创建作业工作区 → 查看班级聚合 → 生成 AI 候选现象 → TA 三选一校准 → 教师最终决定 → 周报只呈现教师接受的现象；教师端只见聚合统计，不见学生对话内容）。

基础设施：

```powershell
docker compose up -d postgres redis minio
```

国内网络提示（本机已验证可用）：

- pip 慢或失败时改用清华镜像：`python -m pip install -e ".[dev]" -i https://pypi.tuna.tsinghua.edu.cn/simple`；
- pnpm 慢时设置：`pnpm config set registry https://registry.npmmirror.com`；
- Docker Hub 拉不动时在 `~/.docker/daemon.json` 加 `"registry-mirrors"`（如 `https://docker.m.daocloud.io`），重启 Docker Desktop。

阶段 0 的 API：

- `GET /health`
- `GET /api/v1/courses`
- `GET /api/v1/courses/{course_id}`
- `POST /api/v1/course-mirror/preview`

阶段 1 初始化（需要 PostgreSQL 已启动）：

```powershell
python -m mirror_api.cli init-db                 # 建表
python -m mirror_api.cli seed-profiles           # 写入五门课程注册表
python -m mirror_api.cli import-all-coursepacks  # 导入 coursepacks/ 全部课程包
python -m mirror_api.cli seed-demo-workspace     # 播种演示作业工作区（8 名学生模拟求助，--stub 不耗模型调用）
python -m mirror_api.cli status                  # 核对各表计数
```

阶段 1 的 API：

- `POST /api/v1/course-mirror/requests`：统一课程请求管线（检索→提示→质检→证据落库，按 `request_id` 幂等；可携带匿名参与码与工作区归属）
- `GET /api/v1/problems?course_id=...&course_profile_id=...`：学生端选题（仅运行时授权题目，含提示阶梯级数）
- `GET /api/v1/coursepacks`：已导入课程包列表
- 作业工作区（教师/TA 端，仅聚合、不返回学生回答内容）：
  `POST /api/v1/workspaces`（创建）、`GET /api/v1/workspaces`（列表）、`POST /api/v1/workspaces/join`（学生加入）、
  `POST /api/v1/workspaces/{id}/close`、`GET /api/v1/workspaces/{id}/overview`（聚合总览）、
  `POST /api/v1/workspaces/{id}/insights/generate`（AI 候选现象）、`GET /api/v1/workspaces/{id}/findings`、
  `POST /api/v1/findings/{id}/ta-decision`（TA 三选一）、`POST /api/v1/findings/{id}/teacher-decision`（教师最终决定）、
  `GET /api/v1/workspaces/{id}/report`（周报，仅教师接受项）

模型网关默认使用确定性占位实现（无需密钥）；接入国内通用大模型（DeepSeek/通义/GLM 等 OpenAI 兼容接口）见 `.env.example`，本机已用 `deepseek-v4-flash` 验证可用。

## 生产部署

### 方式一：Railway（推荐快速上线）

项目已配置 `railway.json` + `Dockerfile.railway`，可一键部署到 Railway 并绑定 `learningmirror.cn` / `learningmirror.xyz`：

1. 在 [Railway](https://railway.app/) 创建项目，从本 GitHub 仓库部署；
2. 添加 Railway 的 **pgvector 模板** 作为数据库；
3. 在主应用服务中设置环境变量：
   - `MIRROR_DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `MIRROR_CORS_ORIGINS=`（留空，同域）
   - 可选：`MIRROR_LLM_PROVIDER`、`MIRROR_LLM_BASE_URL`、`MIRROR_LLM_API_KEY`、`MIRROR_LLM_MODEL`
4. 首次部署后在 Console 执行：
   ```powershell
   python -m mirror_api.cli init-db
   python -m mirror_api.cli seed-profiles
   python -m mirror_api.cli import-all-coursepacks
   ```
5. 在 Railway Dashboard 的 Domains 中添加 `learningmirror.cn` 与 `learningmirror.xyz`，按提示配置 DNS CNAME 记录；Railway 会自动签发 HTTPS 证书。

详细步骤与常见问题见 `docs/railway.md`。

### 方式二：自有云服务器（Docker Compose）

项目已配置 `compose.prod.yml` + `nginx.conf`，可一键部署到 Linux 云服务器，通过域名 `learningmirror.cn` / `learningmirror.xyz` 访问。

```powershell
# 1. 服务器上安装 Docker、Node.js、pnpm
# 2. 域名 A 记录指向服务器 IP
# 3. 构建前端静态站点
pnpm install
pnpm build:web

# 4. 复制 .env.example 为 .env，按需修改密码和模型配置
# 5. 启动生产服务
docker compose -f compose.prod.yml up -d --build
```

详细步骤、HTTPS 配置与维护命令见 `docs/deploy.md`。

## 教材语料入库（已授权 PDF）

```powershell
# 批量导入已登记的 7 本授权教材（数分上下册、高代上下册、大物上册、拓扑、常微分）
python -m mirror_api.cli import-all-textbooks

# 或导入单个 PDF
python -m mirror_api.cli import-textbook </path/to/book.pdf> \
  --course-id mathematical_analysis \
  --source-id textbook-chen-jixiu-3e-vol1 \
  --license-note "团队已获授权用于 RAG 检索"
```

导入前建议先用 `--chunk-size 800` 抽检数分第一章，确认公式/符号抽取质量。

## 重要约束

1. Course Mirror 保存课程知识与课程经验。
2. Student Mirror 保存学生与知识之间的关系。
3. Assignment Workspace 只保存某班某次教学任务的临时上下文。
4. 教材上传、检索、评测、训练是四种不同授权范围。
5. 样例 CoursePack 不包含教材原文或原书习题全文。

进一步说明见 `docs/`。

