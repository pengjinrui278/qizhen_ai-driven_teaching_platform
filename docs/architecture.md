# 技术骨架

## 部署形态

比赛阶段采用模块化单体：一个 Next.js Web、一个 FastAPI API、一个异步 Worker，共享 PostgreSQL、Redis 和对象存储。模块边界稳定后再按负载或治理需求拆服务。

```text
Student UI     Course Builder     Teacher / TA UI
      \              |              /
                  Web API
                     |
        Learning Intelligence Kernel
       /             |               \
Student Mirror   Course Mirror   Assignment Workspace
       \             |               /
             Learning Evidence
                     |
      Hypothesis / Personalization / Insight
```

## 后端模块边界

- `identity`：身份、角色、授权范围。
- `course_mirrors`：统一协议、注册表、课程适配器。
- `coursepacks`：教材 Profile、来源、版本、结构化课程知识。
- `tutoring`：当前答疑和提示阶梯。
- `harnesses`：课程专用验证。
- `evidence`：不可变学习事件与结构化证据。
- `student_mirror`：个人长期状态、假设、趋势。
- `assignment_workspace`：作业周期内班级聚合，带到期时间。
- `teacher_insights`：TA 校准、班级现象和行动建议。
- `evaluations`：离线 Eval 与发布门禁。
- `governance`：来源、版权、保留、导出和删除。

## 数据责任

Course Mirror 只能接收 `MinimalStudentContext`，不能持有完整个人画像。Learning Evidence 同时流向 Student Mirror；若属于当前作业，再以引用方式进入 Assignment Workspace。课程长期资产只能接收去身份化、聚合且经人工审核的经验。

## 阶段 1 基座实现映射（`apps/api/src/mirror_api/`）

| 模块边界 | 当前实现 |
|---|---|
| `course_mirrors` | `mirror_service.py` 统一请求管线（协议校验→检索→提示级别决策→生成→Harness→落库）；`domain.py` 请求/响应契约 |
| `coursepacks` | `coursepack.py` 导入管道（校验、引用完整性、授权字段、幂等覆盖）；`models.py` 中 coursepacks/knowledge_nodes/problems/problem_hints 表 |
| `tutoring` | 提示阶梯按历史事件递增、封顶于题目提示最大级；`retrieval.py` 精确定位与关键词检索 |
| `harnesses` | 平台级 `answer_leakage`（提示泄露）与 `citation_presence` 真实执行；课程登记的其他 Harness 标记为 `not_run`，随阶段 1 深链路逐个实现 |
| `evidence` | `mirror_events`（按 `request_id` 幂等）+ `learning_evidence`（草稿证据，不打分） |
| `governance` | 检索/运行时双门控：`allowed_for_rag` / `allowed_for_runtime`；授权字段随条目原样保存 |
| 模型网关 | `llm.py`：`stub` 确定性实现（离线可测）+ `openai_compatible`（国内通用大模型接入位），模型不允许绕过管线 |

数据库以 SQLAlchemy 模型为单一事实来源（`create_all` 建表）；向量检索（pgvector）与发布/回滚版本链分别在嵌入接入后与阶段 3 引入。驱动用 `pg8000`（纯 Python，ARM64 Windows 无 psycopg 可用轮子）。

