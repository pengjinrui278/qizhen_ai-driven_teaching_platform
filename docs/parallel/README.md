# 半自动并行开发入口

用户主要在主负责人对话提出新需求；对分工说明细节也可以，但涉及范围、接口、数据库或视觉方案的变化须同步主负责人。
主负责人不会自动读取其他对话消息；可以直接审阅本机 worktree 的文件和提交。用户只需传递任务书，结束时带回分工交接摘要/提交号。

## 工作区

|分工|分支|本机路径|Web / API 端口|
|---|---|---|---|
|主负责人|main|C:/Users/19900/Projects/mathmirror|3010 / 8010|
|功能前端|work/web|C:/Users/19900/Projects/mathmirror-web|3011 / 8011|
|平台后端|work/platform|C:/Users/19900/Projects/mathmirror-platform|3012 / 8012|
|课程智能体|work/agent|C:/Users/19900/Projects/mathmirror-agent|3013 / 8013|
|学习反馈|work/learning|C:/Users/19900/Projects/mathmirror-learning|3014 / 8014|

任务书：tasks/web.md、platform.md、agent.md、learning.md。各对话读取自己的任务书即可开始；不要切换主工作区分支。
不按学生/教师/助教再拆三组：它们共享权限和流程，按技术责任拆可减少文件竞争。
聊天界面归前端，prompt/RAG 归智能体，SSE/身份/存储归后端，通过 contracts.md 对齐。学习反馈拥有自己的前后端小范围，不能改共享数据模型。

## 安全启动

逐条启动命令见 local-development.md；本轮仅准备源码与协作边界，不预装四套依赖。

worktree 只隔离源码，不隔离操作系统环境、端口、数据库和浏览器 cookie。
每区自行 pnpm install --frozen-lockfile 和创建 .venv；不要把 node_modules、.next、.venv 链接到主工作区。
依赖安装需要网络，当前准备不代表四套依赖均安装完成。
使用独立 data 目录与 SQLite；不要拷贝主区 .env。免费离线检查默认 MIRROR_LLM_PROVIDER=stub。
API 使用本区 apps/api/src，前端代理变量以当前 next.config 和 .env.example 为准，务必设为本区 API 端口。
浏览器同主机不同端口仍共享 cookie，请使用独立浏览器配置/隔离上下文，不要在一个浏览器配置中同时登录不同分工。
不要运行共享清理任务、数据库迁移或付费批量教材任务。需要真实模型时先由主负责人分配密钥使用边界和费用。

## 交接和集成

分工填写 handoffs/<分工>.md；主负责人维护 board.md。每次交接必须提供分支、提交号、改动清单、实际执行的测试、未完成/风险、是否修改接口。
跨模块请求格式：CR-分工-序号；问题；生产方/消费方；字段/路由变化；兼容方案；验收用例；待批准事项。批准前留在交接文件，不擅自跨边界改文件。
主负责人先检查 git diff main...work/<分工> 和工作区脏文件，逐个集成、回归。不得同时让两个对话操作同一个 worktree。
Git 分支不等于权限隔离；当前未配置 GitHub 分支保护规则，约定需要每个对话遵守。
