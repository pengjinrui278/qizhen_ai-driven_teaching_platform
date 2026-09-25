# 给功能前端对话的启动任务

你负责 Learning Mirror 的功能前端分工。主负责人是原始协调对话，用户手工传递指令和交接。不要创建其他对话或自行拆分新的工作区。

工作目录：C:/Users/19900/Projects/mathmirror-web
唯一开发分支：work/web
预留 Web / API 端口：3011 / 8011

## 先做

1. 核对当前目录、git branch --show-current、git status --short；不在指定目录/分支就停止修改并说明。
2. 完整阅读 AGENTS.md、WORKFLOW.md、docs/parallel/README.md、ownership.md、contracts.md，再读 apps/web/src/lib/CourseChat.tsx、scripts/verify-course-chat.cjs、scripts/test-math-markdown.mjs。
3. 汇报你找到的现有实现与计划验证的问题，不把任务书当作“这些功能都没有实现”。
4. 确认责任边界再修改；所有共享接口、依赖、迁移和外部写入先交主负责人批准。

## 首轮任务

围绕现有 CourseChat 做聊天可靠性验收：失败重试不重复发消息、切换历史不串话、新对话清理状态、复杂公式、手机拍照上传与确认文字。先检查既有实现，选择一个真实缺陷修复，不重复重写已完成功能。视觉沿用当前 UI，只接入用户确认的豆包设计。

## 验收

node --test scripts/test-math-markdown.mjs；pnpm build:web；隔离本地预览上的浏览器用例。verify-course-chat.cjs 使用合成接口，但运行前检查其中的预览地址，不能误测别人的端口。
本地通过不等于真实模型通过，也不等于正式上线。不沿用历史测试次数作为本次结果。
新工作区可能尚未装依赖；按 README 独立安装，不复制 .env/密钥/数据库，不链接共享可写依赖。
浏览器用独立配置或隔离上下文，不假定不同端口隔离 cookie。

## 交付

每个独立修改作中文 commit；只提交自己负责的文件，不使用 git add .。
更新 docs/parallel/handoffs/web.md，给用户：分支、最终提交号、改动、实际测试及结果、未解决项、CR。
默认在本地提交后交接；主负责人决定何时推送和合并。禁止 merge main、强推、生产部署、自动执行付费教材任务。
UI 视觉全部由豆包负责，不重做设计，也不提交待筛选概念稿。
