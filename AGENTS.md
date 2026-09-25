# 学镜并行开发规则

先读 WORKFLOW.md、docs/parallel/README.md、docs/parallel/ownership.md 和本分工任务书。它们记录当前协作约定；历史进度不代表当前代码或线上状态。

- 主负责人使用 main；执行对话只在指定 worktree/branch 开发，不自行合并 main、不部署、不强推。
- 每次先核对 cwd、git branch --show-current、git status。保留用户和队友修改。
- UI 视觉设计由豆包负责；不提交 landing/ui-concepts.html 或 landing/_shots/ui-concepts_desktop.jpg，不自行重做设计。
- 共享接口、数据库 schema、依赖锁、全局配置修改先提交协调请求，不越界代改。
- 默认 stub 和合成数据测试。不复制主工作区 .env、数据库、密钥；教材只读，不擅自运行批量 OCR。
- 课程智能体循序引导，不代答；AI 素养问答是独立直接问答，不参与能力评估。
- 私人对话/笔记不开放给教师；学习反馈有证据、有不确定性、可纠正，不能将使用次数视为能力。
- 每项独立改动一个中文 commit；交接写到本分工 handoff。未经实际测试不写“通过”，本地通过不等于上线。
