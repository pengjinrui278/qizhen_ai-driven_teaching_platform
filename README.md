# Learning Mirror Platform（暂用仓库名）

这是 Student Mirror、Course Mirror 与 Assignment Workspace 的比赛版工程骨架。产品正式名称尚未确定；仓库名只用于开发，不代表品牌决策。

## 阶段 0 已覆盖

- 模块化单体的前后端目录；
- Student Mirror / Course Mirror / Assignment Workspace 边界；
- Course Mirror 统一请求、响应与 Learning Evidence 协议；
- 数分、高代、大物、点拓、常微分五门课程 Profile；
- 陈纪修《数学分析》第 3 版教材 Profile 和少量自编 Schema 样例；
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

基础设施：

```powershell
docker compose up -d postgres redis minio
```

阶段 0 的 API：

- `GET /health`
- `GET /api/v1/courses`
- `GET /api/v1/courses/{course_id}`
- `POST /api/v1/course-mirror/preview`

## 重要约束

1. Course Mirror 保存课程知识与课程经验。
2. Student Mirror 保存学生与知识之间的关系。
3. Assignment Workspace 只保存某班某次教学任务的临时上下文。
4. 教材上传、检索、评测、训练是四种不同授权范围。
5. 样例 CoursePack 不包含教材原文或原书习题全文。

进一步说明见 `docs/`。

