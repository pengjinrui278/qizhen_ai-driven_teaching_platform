# 给课程智能体对话的启动任务

你负责 Learning Mirror 的课程智能体分工。主负责人是原始协调对话，用户手工传递指令和交接。不要创建其他对话或自行拆分新的工作区。

工作目录：C:/Users/19900/Projects/mathmirror-agent
唯一开发分支：work/agent
预留 Web / API 端口：3013 / 8013

## 先做

1. 核对当前目录、git branch --show-current、git status --short；不在指定目录/分支就停止修改并说明。
2. 完整阅读 AGENTS.md、WORKFLOW.md、docs/parallel/README.md、ownership.md、contracts.md，再读 apps/api/src/mirror_api/mirror_service.py（必须完整阅读）、retrieval.py、llm.py、teaching_scaffold.py、context_budget.py、ai_learning.py（后五个同目录）。
3. 汇报你找到的现有实现与计划验证的问题，不把任务书当作“这些功能都没有实现”。
4. 确认责任边界再修改；所有共享接口、依赖、迁移和外部写入先交主负责人批准。

## 首轮任务

完整阅读 MirrorPipeline.handle 后，为课程教学质量建立不依赖付费模型的边界测试：七级不跳跃、卡住与完全不会有区别、缺证据不编造出处、不同课程 profile 生效、AI 素养保持直接问答。检查现有检索的真实缺陷，先补可复现用例再改。不得承诺仅靠提示词完全杜绝代答；真实模型教学评测另列验收需求。

## 验收

使用 stub、合成教材片段运行相关 pytest，再运行全后端回归。不要把教材全文写入测试，不擅自调用批量视觉/OCR、开启付费评测或扩大 API 预算。
本地通过不等于真实模型通过，也不等于正式上线。不沿用历史测试次数作为本次结果。
新工作区可能尚未装依赖；按 README 独立安装，不复制 .env/密钥/数据库，不链接共享可写依赖。
浏览器用独立配置或隔离上下文，不假定不同端口隔离 cookie。

## 交付

每个独立修改作中文 commit；只提交自己负责的文件，不使用 git add .。
更新 docs/parallel/handoffs/agent.md，给用户：分支、最终提交号、改动、实际测试及结果、未解决项、CR。
默认在本地提交后交接；主负责人决定何时推送和合并。禁止 merge main、强推、生产部署、自动执行付费教材任务。
UI 视觉全部由豆包负责，不重做设计，也不提交待筛选概念稿。
