# CLAUDE.md

## 项目概况

本仓库是**第二届全国高校“启真问智”教育教学人工智能大赛**（浙江大学主办）的参赛作品仓库：面向数学类课程的学习镜像平台（Learning Mirror，暂定名），含 Student Mirror / Course Mirror / Assignment Workspace 三大模块，覆盖学生端、课程建设端、教师/TA 端。

关键文档：

- **项目概况总览（了解项目先读这个）**：`docs/项目概况总览.md`
- 文档地图：`docs/README.md`
- 大赛通知与参赛指南：`docs/competition/`
- 开发路线（阶段 0–5）：`docs/development-roadmap.md`
- 架构与边界：`docs/architecture.md`、`docs/phase-0.md`
- 产品参照：`docs/MathMirror_产品角色与开发参照_v0.2.md`
- 数据权利约束：`docs/data-rights.md`
- 当前进度：`docs/progress/进度日志.md`
- 提交规范与流程：`WORKFLOW.md`

## 关键日期（2026）

- **09-15 前**：官网注册报名 + 申报书（<https://qzwz.mh.chaoxing.com>）
- **09-30 前**：上传参赛作品及说明文件
- 下半年：现场决赛（浙江大学，现场展示 + 答辩）

## 工作规则（每次会话都要遵守）

1. **重大更新必须推送**：里程碑完成、能力实质变化、语料批次扩充、申报材料定稿时，提交并推送到 `origin/main`，同时在 `docs/progress/进度日志.md` 追加条目。
2. 提交信息格式：`<type>: <中文简述>`（见 `WORKFLOW.md`）；一次提交只做一件事。
3. 版权红线：语料与样例不得包含教材原文或原书习题全文；数据来源与授权范围要可追溯（`docs/data-rights.md`）。
4. 不提交 `.env`、密钥、真实学生个人信息；大文件先讨论存放方案。
5. 文档与提交信息使用中文；代码标识符使用英文。
6. 阶段目标以 `docs/development-roadmap.md` 为准；最终展示必须同时覆盖三端与五门课程，不能只做数分问答 Demo。

## 本地运行

- 后端：`cd apps/api && python -m pip install -e ".[dev]" && uvicorn mirror_api.main:app --reload --port 8000`
- 前端：`pnpm install && pnpm dev:web`
- 基础设施：`docker compose up -d postgres redis minio`
