# 文件责任与变更门禁

原则：未列出的共享文件先问主负责人，不凭“任务需要”扩大范围。任何跨界修改在 handoff 中先提出 CR。

|分工|可以修改|不能直接修改|
|---|---|---|
|web|apps/web/src 的功能页面、导航、CourseChat.tsx、数学渲染、对应前端测试；但不包含下列学习反馈文件|LearningFeedback.tsx 及其专用样式；API；全局视觉重设计；配置/锁文件|
|platform|apps/api/src/mirror_api 下 auth.py、platform_api.py、db.py、models.py、platform_models.py、sandboxes.py、workspace_service.py、course_stream.py、upload_service.py、governance.py；对应后端测试|智能体策略、memory.py、domain.py；schema 变更须先协调并制定迁移|
|agent|mirror_service.py、retrieval.py、retrieval_terms.py、llm.py、model_transport.py、agent_policy.py、teaching_scaffold.py、context_budget.py、verification.py、registry.py、profiles/、ai_learning.py、coursepack.py、textbook_*.py、ai_textbook_*.py；对应测试|路由/认证/DB/schema；前端；原教材或教材原文入 Git；自动花费 API 预算|
|learning|memory.py、新增 learning_*.py、LearningFeedback.tsx、独立 learning-feedback 样式、新增 test_learning_*.py 与已有 test_learning_process.py|mirror_service.py 的事件采集、platform_api.py 的路由、共享 DB 模型；这些由相应负责人按 CR 提供|
|主负责人|domain.py、main.py、config.py、依赖/锁、构建/CI/部署、安装助手、根规则、collaboration docs、全局样式协调|不在分工开发过程中直接覆盖其未提交代码|

以上后端短文件名均相对 apps/api/src/mirror_api，前端组件相对 apps/web/src/lib。
测试与源文件归同一责任方；conftest.py/共享 fixtures 由主负责人协调。已有跨模块大测试先协调，新增测试用分工前缀避冲突。
分工可写自己的任务交接文件，不能修改其他分工任务、board 或责任规则。跨页面共用 CSS 改动先协调；新功能复用现有设计。
