# R3：PDF教材目录与AI学习UI（用户已授权开始）

## 用户最新范围（优先于下文历史安排）
用户最新决定：本轮新增教材仅处理 electronic_circuits / circuits-alexander-sadiku-6e（Fundamentals of Electric Circuits 第六版）。Python、大学英语、心理学教材全部暂停：不继续解压、索取密码、付费、解析、OCR或导入；保留已下载文件与现有配置，不删除成果。此前投递的python-user-17p仅是暂停的入库候选，不能因它存在于intake.json就批量导入或展示为可读教材。平台按电路resource_id显式白名单入库，前端只展示真实可用条目；其余课程不宣称教材已就绪。资源书目搜索/PDF阅读及AI聊天UI的既有要求仍保留，优先以电路一书跑通链路。本条覆盖下方旧任务中同时处理多本教材的要求。
2026-09-26，主负责人维护。此批取代资源中心“正文片段阅读/顶部全文搜索”的旧方向，保持智能体RAG工具兼容。不代表已发布，不自动部署或付费OCR。
用户要求：学生默认看原版PDF；资源卡有真实封面、书名/版次/标签；首页课程按真实注册配置显示；顶部搜索书目而不是正文；后续真题同类整合。AI学习聊天也要同步B视觉，独立直答策略不变。

## 已核实的原件
python程序设计.pdf：17页、无加密、实际封面为Python程序设计，完整性待核对；不标完整覆盖，作者/年份未确证不猜。
Fundamentals_of_Electric_Circuits_6th.pdf：990页、无加密；第六版，Charles K. Alexander / Matthew N. O. Sadiku，已核对书名页和封面；出版年份另核对。
大学英语：新编大学英语综合教程4PDF目录外层ZIP可读，内含加密ZIP，PDF尚未提取；等待用户密码/解压文件，不执行附带HTML、不破解。
普通心理学第六版：只有.downloading文件，不移动、导入、哈希或扫描。课程可有空态，不放虚假封面。
主负责人将两本可读PDF、封面和本地清单投递platform的data/resource-intake/R3；只读原件、不提交Git、不公开分发。

## 冻结最小目录接口v1（允许platform实施、web消费）
新GET /api/v2/material-library：q（书名/作者/ISBN/标签的字面词项匹配）、course_id、kind(textbook/exam)、year、tag、page>=1、page_size 1..50。未知年份null，不把版次当年份。无q列目录，筛选AND，稳定title/resource_id排序；权限过滤后分页与total。
响应 {items:[{resource_id,course_id,kind,title,authors:[],edition:null,volume:null,publication_year:null,exam_year:null,tags:[],cover_url:null,pdf_url:null,page_count:null,completeness:"unverified|partial|complete",availability:"ready|pending|restricted",role:"primary|supplementary|unassigned"}],total,page,page_size}。
resource_id服务端生成不含路径，文件名不当授权；无证据字段null。role来自明确课程绑定，不能第一本默认主书。没有考试资料无需假记录。
GET /api/v2/material-library/{id}/pdf 与 /cover：都要会话鉴权、资源授权、文件路径根目录约束；未登录401，不可见/未知404，已可见但文件未就绪409。PDF Content-Type application/pdf，inline、安全文件名，支持Range/206/416或经验证框架实现，private/no-store；封面同授权，禁止公开public教材目录。响应不得泄露本机路径。
PDF页数与教材内容复核状态分开：有文件不等于完整/已审校。遇非PDF/LFS指针、损坏/加密只登记问题，不读成教材。
v1允许独立本地JSON目录/权利清单adapter，不要求修改公共DB/schema；新增resource_library.py及platform_api.py路由获准。清单存data忽略目录，通过固定服务端配置读取，不让客户端上传路径。真实原件仅本地审看，正式站访问需授权清单审阅，不把“下载得到”视为公开许可。
旧/textbooks、/textbooks/search、/textbooks/related等保留供agent兼容；新UI不调用全文搜索。目录不能再依赖TextbookChunk计数，删除不可靠的陈纪修默认书名逻辑应单独兼容测试，不删除片段库。

## 前端行为
ResourceCenter默认封面卡→同源授权PDF阅读区（原生PDF嵌入/新页）；手机无法内嵌提供“打开PDF”真实按钮，鉴权过期/无文件/受限有反馈。不默认转为chunk，不额外开发全文OCR搜索，不禁止浏览器原生查找。
顶栏“搜索教材”书目搜索，可说明书名/作者/标签；教材/试卷分区，课程/标签/年份与真实API联动，分页可用，不摆假过滤器。输入安全、取消旧请求、返回列表保留条件。
封面用真实PDF封面，未有封面才用明确占位；不生图伪造书封。AI教材可沿用同目录能力，AI对话应用B系消息/输入/引用/移动样式但不接入课程七级、能力画像或作业空间。
首页保留全部已注册课程，不硬编码8门；由agent新增4课profile、platform提供真实/courses，web渲染。不把PDF ready混作LLM ready或训练完成。
新增心理学未有教材可以显示课程及“教材待补充”（必须后端提供真实状态依据），不藏掉现有拓扑/AI等课程。
真题元数据：课程、学年、学期、期中/期末、卷别、是否有答案、原页；与教材出版年份分别处理。已有9份物理卷先盘点，后来新增沿同一入口，原题解析不是本批发布前提。

## 分工和先后
platform：本批开始可直接做目录与授权PDF/封面接口、独立本地清单导入、分页/安全测试；R2已批准AI历史隔离/证据修复仍保留，交接明确次序不混commit。
agent：立即做4课注册profile与配对教学策略，source_refs只指真实登记来源；无教材不虚构。不必等整套ReAct完成才能交课程配置。检索继续使用片段但不强迫UI显示片段。
web：先补AI学习聊天样式，再以冻结v1接口合成用例开发目录/PDF阅读并等platform交付联调；保留用户认可B版。教学行为/权限不因换UI变更。
所有负责人每阶段更新自己的handoff并聊天反馈，报告确切文件、测试、未解决/素材需求、待代提交。主负责人投递跨区代码，不自行越界读取。
验收：新书无需chunk可查；不同版次可区分；权限过滤计数不泄漏；路径穿越/任意ID/未登录禁止；Range正确；坏PDF/缺封面/加密待解压不装成功；搜索课程/年/标签和分页稳定；桌面1440手机390 PDF和返回列表可用；AI直答隔离及原聊天回归。禁止生产部署、复制密钥/DB、自动付费调用。
