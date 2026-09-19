# 项目工作流

本仓库是参赛作品的主仓库（GitHub：<https://github.com/pengjinrui278/qizhen_ai-driven_teaching_platform>）。
**所有重大更新必须及时提交并推送到远程**，同步部署到生产 `http://124.220.5.87/`，并在 `docs/progress/进度日志.md` 追加记录。

## 分支策略

- `main` 为主干，始终保持可运行、可展示状态；
- 团队 ≤4 人且截止时间紧，日常开发直接提交到 `main`；
- 试验性大改动可开 `exp/<主题>` 分支，验证后合回 `main`。

## 提交规范

格式：`<type>: <简短中文描述>`（正文可补充“为什么”）

| type | 用途 |
|---|---|
| feat | 新功能（前后端、智能体链路） |
| data | 语料库、CoursePack、数据集变更 |
| eval | 评测用例、评测脚本与结果 |
| docs | 文档、申报书与提交材料 |
| fix | 缺陷修复 |
| chore | 构建、依赖、配置 |

一次提交只做一件事；提交信息说清改了什么、为什么。

## 生产同步（124.220.5.87）

展示用服务器：`ubuntu@124.220.5.87`，代码目录 `/home/ubuntu/app`（保留服务器上的 `.env` 与 `certbot/`）。

本机推送 `origin/main` 后执行：

```bash
ssh ubuntu@124.220.5.87 'bash /home/ubuntu/app/scripts/deploy-prod.sh'
```

脚本会 `git fetch && reset --hard origin/main`，`docker compose -f compose.prod.yml up -d --build`，再 `seed-profiles` + `import-all-coursepacks`。不要在服务器上改业务代码。

## 什么算“重大更新”（必须推送 + 上线 + 记进度日志）

1. 完成 `docs/development-roadmap.md` 中的一个阶段或里程碑；
2. 智能体/模型能力有实质变化（新链路、新 Harness、Eval 通过率显著变化）；
3. 数据语料库有批次性扩充；
4. 申报书、演示材料等提交物定稿或重要修订；
5. 任何影响评审展示效果的变更。

## 版本与快照

- 阶段里程碑打 tag：`phase-1`、`phase-2`……；
- 大赛提交时打 `submission` tag（对应 09-30 提交物的快照）；
- 决赛前打 `finals` tag。

## 目录职责

| 路径 | 内容 |
|---|---|
| `apps/` | 前后端代码（Next.js Web / FastAPI API） |
| `coursepacks/` | 课程语料库（CoursePack） |
| `docs/competition/` | 大赛通知、参赛指南、下载的官方模板 |
| `docs/progress/` | 进度日志 |
| `submission/` | 最终提交材料包（作品、说明文件等，按官网要求组织） |

## 禁止事项

- 不提交 `.env`、密钥、真实学生个人信息；
- 样例与提交语料不得包含教材原文或原书习题全文（版权约束，见 `docs/data-rights.md`）；
- 不把大文件（数据集原始文件、模型权重）直接推进仓库——先讨论存放方案（Release / 对象存储 / Git LFS）。
