# 阶段 0：协议与边界冻结（初稿）

## 已冻结的第一版协议

1. 五门 Course Mirror 共用 `CourseMirrorRequest` 和 `CourseMirrorResponse`。
2. 每次专业响应必须返回引用、Harness 结果、不确定性和 Learning Evidence 草稿。
3. Evidence 只陈述本次观察，不直接给学生贴长期标签。
4. Student Mirror 根据证据更新假设；Course Mirror 不执行长期学生建模。
5. Workspace 必须关联课程、班级、任务、时间窗口和 `expires_at`。
6. 所有课程资产必须声明来源和使用许可范围。

## 比赛范围

- 数分：完整课程链路的旗舰样板。
- 高代、大物、点拓、常微分：同步建设课程 Profile、代表性知识、题目、Hint、Harness 与 Eval。
- 学生端：答疑、学习证据、学习观察、课程切换。
- 课程建设端：CoursePack、知识结构、题目与提示、Harness、Eval。
- 教师/TA 端：作业预分析、人工校准、班级现象、教学建议和数据限制。

## 下一阶段进入条件

- Schema 评审通过；
- 数分样例可以通过统一协议返回；
- 五门课程都能被注册表发现；
- 版权字段不会在数据导出时被绕过；
- 测试覆盖跨课程协议一致性。

