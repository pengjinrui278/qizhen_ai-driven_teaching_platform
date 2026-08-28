# Learning Mirror Platform（暂用仓库名）

这是 Student Mirror、Course Mirror 与 Assignment Workspace 的比赛版工程骨架。产品正式名称尚未确定；仓库名只用于开发，不代表品牌决策。

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

启动后访问 `http://localhost:3000/student` 进入学生端演示页（选题 → 渐进提示 → 完整解答 → 知识点答疑，回答全程经过质检与证据落库）。

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
python -m mirror_api.cli status                  # 核对各表计数
```

阶段 1 的 API：

- `POST /api/v1/course-mirror/requests`：统一课程请求管线（检索→提示→质检→证据落库，按 `request_id` 幂等）
- `GET /api/v1/problems?course_id=...&course_profile_id=...`：学生端选题（仅运行时授权题目，含提示阶梯级数）
- `GET /api/v1/coursepacks`：已导入课程包列表

模型网关默认使用确定性占位实现（无需密钥）；接入国内通用大模型（DeepSeek/通义/GLM 等 OpenAI 兼容接口）见 `.env.example`，本机已用 `deepseek-v4-flash` 验证可用。

## 重要约束

1. Course Mirror 保存课程知识与课程经验。
2. Student Mirror 保存学生与知识之间的关系。
3. Assignment Workspace 只保存某班某次教学任务的临时上下文。
4. 教材上传、检索、评测、训练是四种不同授权范围。
5. 样例 CoursePack 不包含教材原文或原书习题全文。

进一步说明见 `docs/`。

