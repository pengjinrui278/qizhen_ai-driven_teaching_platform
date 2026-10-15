# 平台负责人指令
批次：LM-20260926-R2；工作区 mathmirror-platform；分支 work/platform。
先读 docs/parallel/control/R2-product.md、inbox/learning-R1.md、inbox/agent-R1.md（均在本区）。
R1 状态：060e8a9 队列积压修复已交接；主负责人已读记录，尚未独立验收，不重写它。

## 1. 批准 CR-agent-001，最高优先
历史 ai_literacy Attempt 普通消息/SSE/反馈写入口禁止新增课程证据。普通返回410；SSE 允许在流开始前返回410（前端须兼容 HTTP 410），已打开流则 error.status=410；沿用既有错误结构。保留本人历史读取/导出。先完成归属校验，再给410，跨用户仍404。独立 /ai/sessions 不受影响。
批准修改 platform_api.py 及自己的测试；源测试快照在 inbox/test_agent_ai_isolation.py，仅供参考，生产测试原件由 agent 负责。不要删除线上历史证据，先出只读核查方案。

## 2. 批准 CR-learning-001/002 最小无 schema 修复
同ID同完整语义正文幂等；不同 account/course/attempt/outcome/theme/text 返回409，保留原归属防泄露。
首次反馈有合法既有事件才创建派生证据；没有事件时保留独立 Observation，之后重试不得补挂“后来最新事件”。延后挂接原提案不批准，测试需按此修订。
disputed=True 同事务移除精确关联的自报派生行；保留撤回观察与不含正文的原事件关联审计。恢复只按保存的原事件ID重新鉴权、核对 account/attempt/course/type/oid，并从原 Observation 派生；找不到可信出处不伪造。恢复/撤回/重试幂等，事务回滚安全，不删除 hint/help 等事实。
批准在平台自有文件提取私有辅助函数；不改 memory.py 或共享 schema。审计关联必须在账号删除时同步清除，不把正文复制到审计。学习线的原始测试快照在 inbox/test_learning_corrections.py；按新决定编写平台测试，学习线收到代码后独立复测。
CR-learning-003 单条删除需求认可，但 tombstone、保留期和错误契约未冻结；本批先出最小契约/隐私设计，不先实现硬删除路由。

## 3. 资源与试卷
完成本区9份物理卷盘点与已入库比对，记录真实文件/指针、哈希、待审校元数据、权限和缺口。只读原件，无付费 OCR；内容需要人工审校的不要标完成。新增 apps/api/src/mirror_api/resource_catalog.py 及自己 test_platform_resource_* 获准；metadata 模式先在独立测试库，不改生产。
交付统一资源搜索/分页、课程主辅教材绑定、上传解析任务的 API/schema 草案与合成 JSON；批准后再落共享 DB/路由。旧 /exams 保持兼容，先审计资源访问授权。

## 4. CR-platform-001/002
自动预分析：只批准图式状态机原型、离线测试和持久化设计；新增 ta_review_workflow.py 获准。模型节点由 agent 契约提供，等待人工决定必须是真状态，不自动写结论。
自动开启、worker/schema/新预算未批准。CR-platform-002 本轮“4槽”为每进程现状，不宣称全服务4槽；提交多进程/PostgreSQL验收计划，生产扩容先等待全局方案。
依赖优先顺序：AI隔离→反馈一致性→资源契约/真题盘点→TA图原型。每块独立提交。

## 控制与交接
此文件仅主负责人编辑；业务/测试提交不包含 COORDINATOR.md、docs/parallel/control/、docs/parallel/inbox/。读取完成先在 docs/parallel/handoffs/platform.md 追加本批分析，用户明确开始后执行上列已批准任务。新增共享接口仍须CR，未批准项只做设计。

## R2补充：每次任务结束必须反馈（2026-09-26）
每次结束在自己的 handoff 追加任务/批次、完成内容、修改文件、实际测试及失败、未验证项、CR和所需决定、当前HEAD、是否存在未提交修改；同时在自己的聊天框给用户简短摘要，不能只改文件而不反馈。
严格区分“分析完成”“实现完成”“测试通过”“待主负责人提交”“已提交”“已集成”“已部署”。本轮分析回执未提交，不能拿R1的HEAD当R2提交号。
若共享 .git/worktrees 索引写入被拒，停止重复 git add/commit；不要提升目录权限。报告“待主负责人代提交”、准确文件列表和建议中文提交说明，保留文件即可。主负责人核对差异后再提交并回填确切SHA；没有SHA时如实写未提交。
此补充不自动批准未冻结的资源、提纲、TA等共享接口，也不把分析阶段改成开始开发。用户明确开始后按既有获批范围执行。
