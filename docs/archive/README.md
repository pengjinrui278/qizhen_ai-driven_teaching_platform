# 归档说明

本目录归档项目选题与实施阶段的两份关键过程文档。**2026-08-27 归档，原文未作改动**（与 `C:\Users\微软\Downloads` 下原文件逐一比对一致）。

| 文件 | 内容 |
|---|---|
| `chatgpt-export_AI学业诊断与辅导.md` | ChatGPT 选题探索记录（约 4200 行）：从最初"AI 学业诊断与辅导"的想法，逐步收敛到 MathMirror / Learning Mirror 产品概念——三大对象（Student Mirror / Course Mirror / Assignment Workspace）、"假设—证据—更新"方法论、双通道证据、"1+4"课程策略、选定陈纪修《数学分析》第 3 版教材，直至生成《MathMirror 产品角色与开发参照 v0.2》（即本仓库 `docs/MathMirror_产品角色与开发参照_v0.2.md`）。 |
| `交流记录.md` | 与 Codex 实施助手的开发交流记录（约 3300 行）：阶段 0 骨架 → 阶段 1 通用 Course Mirror 协议 → 阶段 2 数据库与数据摄入管道 → 阶段 3 教材入库与 PaddleOCR → v5 比赛演示闭环（合成数据）→ v6 真实内测系统（匿名参与码、授权分离、幂等事件、默认不存草稿、TA/教师审计链），含各阶段测试与验收结果。 |

**注意**：记录中的开发在另一台机器的本地目录（`C:\Users\19900\learning-mirror-platform`）进行，其中阶段 1–3 与 v5、v6 的代码、数据库迁移、CoursePack 试点成果**尚未汇入本仓库**。现状梳理与任务清单见 `docs/progress/进度整理-2026-08-27-现状与下阶段任务.md`。
