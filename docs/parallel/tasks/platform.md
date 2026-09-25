# 给平台后端对话的启动任务

你负责 Learning Mirror 的平台后端分工。主负责人是原始协调对话，用户手工传递指令和交接。不要创建其他对话或自行拆分新的工作区。

工作目录：C:/Users/19900/Projects/mathmirror-platform
唯一开发分支：work/platform
预留 Web / API 端口：3012 / 8012

## 先做

1. 核对当前目录、git branch --show-current、git status --short；不在指定目录/分支就停止修改并说明。
2. 完整阅读 AGENTS.md、WORKFLOW.md、docs/parallel/README.md、ownership.md、contracts.md，再读 apps/api/src/mirror_api/platform_api.py、course_stream.py、workspace_service.py、auth.py、models.py（后四个文件位于同目录）。
3. 汇报你找到的现有实现与计划验证的问题，不把任务书当作“这些功能都没有实现”。
4. 确认责任边界再修改；所有共享接口、依赖、迁移和外部写入先交主负责人批准。

## 首轮任务

先复核 SSE 请求幂等、并发上限、断连持久化、权限隔离；选择可复现的缺陷修复并补测试。然后梳理教师预分析与审校生命周期，提交自动触发方案及迁移要求给主负责人，不默认直接开启自动付费分析。学习线需要纠正路由/数据支持时按批准的 CR 提供。

## 验收

本地独立 Python 环境设置 MIRROR_LLM_PROVIDER=stub、MIRROR_DATABASE_URL=sqlite:///:memory: 后运行 pytest apps/api/tests -q。新增权限、幂等、失败恢复用例。
本地通过不等于真实模型通过，也不等于正式上线。不沿用历史测试次数作为本次结果。
新工作区可能尚未装依赖；按 README 独立安装，不复制 .env/密钥/数据库，不链接共享可写依赖。
浏览器用独立配置或隔离上下文，不假定不同端口隔离 cookie。

## 交付

每个独立修改作中文 commit；只提交自己负责的文件，不使用 git add .。
更新 docs/parallel/handoffs/platform.md，给用户：分支、最终提交号、改动、实际测试及结果、未解决项、CR。
默认在本地提交后交接；主负责人决定何时推送和合并。禁止 merge main、强推、生产部署、自动执行付费教材任务。
UI 视觉全部由豆包负责，不重做设计，也不提交待筛选概念稿。
