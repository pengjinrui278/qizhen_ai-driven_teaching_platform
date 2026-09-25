# 集成接口基线 v1

这是兼容性约定，不取代代码真实 schema；实现前阅读 domain.py、platform_api.py、course_stream.py 和消费者。若记录与代码不符，向主负责人报告，不按文档猜字段。

- 对话 POST /attempts/{aid}/messages 和 /messages/stream 保持兼容。request_id 用于幂等，同一次失败重试复用 ID；新问题新 ID。
- 当前 SSE 是实际阶段进度 + 校验后的完整回复，不是逐 token 输出。progress 有阶段信息，done 携带完整结果，error 为友好错误，另有 keepalive。不要把未校验答案直接发给学生。
- first_hint / next_hint / full_solution 保留传输兼容；课程模式 full_solution 只给有空缺框架，不能代答。七级提示耗尽状态不得无声重置。
- 引用保留来源与定位；只引用注入模型的可用资料。不能把词项检索称为语义向量检索，不能把扫描完成称为教材复核完成。
- 拍题关联使用 POST /textbooks/related 的 text 与 course_id；从题干提取概念，不只截取开头。正式使用须经学生确认文字，保留图片与确认文字共同提交仍需核验完整流程。
- LearningEvidence 的提示使用及自报解决是弱证据，不等于能力/正确性。学习反馈更正必须同步撤销/修正相关推断，不能只改 UI。
- 私人对话/笔记不向教师开放。教师 finding 需要确认/修改/否决；现状不能宣称提交后已自动完成预分析。
- AI 素养问答直接解释，不用引导层级，不参与学生能力评估，也不因作业创建临时工作区。

新增字段默认可选；移除/重命名字段、改变错误码、SSE 格式、鉴权、数据库结构须 CR，生产方与消费方成对测试后再合并。
