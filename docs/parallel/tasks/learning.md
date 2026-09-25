# 给学习诊断与反馈对话的启动任务

你负责 Learning Mirror 的学习诊断与反馈分工。主负责人是原始协调对话，用户手工传递指令和交接。不要创建其他对话或自行拆分新的工作区。

工作目录：C:/Users/19900/Projects/mathmirror-learning
唯一开发分支：work/learning
预留 Web / API 端口：3014 / 8014

## 先做

1. 核对当前目录、git branch --show-current、git status --short；不在指定目录/分支就停止修改并说明。
2. 完整阅读 AGENTS.md、WORKFLOW.md、docs/parallel/README.md、ownership.md、contracts.md，再读 apps/api/src/mirror_api/memory.py、apps/api/tests/test_learning_process.py、apps/web/src/lib/LearningFeedback.tsx；只读 mirror_service.py 与 platform_api.py 的证据接口。
3. 汇报你找到的现有实现与计划验证的问题，不把任务书当作“这些功能都没有实现”。
4. 确认责任边界再修改；所有共享接口、依赖、迁移和外部写入先交主负责人批准。

## 首轮任务

优先复核学生更正/撤回反馈后，Observation、LearningEvidence 与薄弱点建议是否一致；避免只改显示文字。先提供证据流审查和失败用例，涉及共享 DB/路由/智能体采集时提交 CR。能力推断不能仅来自提问次数或提示级别；保留不确定性和出处，支持纠正和删除，教师不可读取私人记录。图表只用真实记录，无记录时显示空态。

## 验收

隔离 stub pytest 测试，新增学习证据更正/删除/重复提交/跨用户隔离用例；改前端则构建并验证无数据、少量数据、撤回后的显示。
本地通过不等于真实模型通过，也不等于正式上线。不沿用历史测试次数作为本次结果。
新工作区可能尚未装依赖；按 README 独立安装，不复制 .env/密钥/数据库，不链接共享可写依赖。
浏览器用独立配置或隔离上下文，不假定不同端口隔离 cookie。

## 交付

每个独立修改作中文 commit；只提交自己负责的文件，不使用 git add .。
更新 docs/parallel/handoffs/learning.md，给用户：分支、最终提交号、改动、实际测试及结果、未解决项、CR。
默认在本地提交后交接；主负责人决定何时推送和合并。禁止 merge main、强推、生产部署、自动执行付费教材任务。
UI 视觉全部由豆包负责，不重做设计，也不提交待筛选概念稿。
