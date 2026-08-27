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

