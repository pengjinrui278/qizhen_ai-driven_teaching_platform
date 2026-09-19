# CampusOS—ZJU 数据集成可行性评估

> 核查日期：2026-09-19  
> 核查对象：[Harry-Linner/CampusOS](https://github.com/Harry-Linner/CampusOS)，固定到提交 [`58e9474`](https://github.com/Harry-Linner/CampusOS/tree/58e9474e2ee480170eb6e38b7ef2a785f774eeac)。  
> 结论性质：技术与合规预评估，不替代浙江大学信息技术中心、教务部门或法律顾问的书面意见。

## 一句话结论

**功能思路可以借鉴，CampusOS 的“本机代用户登录并读取网页内部接口”方案不能原样搬到 `learningmirror.cn` 的云端。**

- 从技术上看，CampusOS 已证明课表、考试、成绩、学在浙大 DDL/提交状态、课件、智云课堂入口等数据可以由学生的已认证会话读取。
- 但它是 Electron 本地客户端：浙大密码由用户电脑的 OS 安全存储保护，CAS/业务 Cookie 和研究生 `X-Access-Token` 主要留在本机主进程内；若照搬到云端，`learningmirror.cn` 将集中接收可直接登录学校系统的明文密码、Cookie 和大量学业数据，风险与责任完全不同。
- 官方公开资料只确认“统一身份认证应用接入”的申请流程，没有公开授予上述教务/学在浙大内部接口的第三方调用权。**统一认证解决“你是谁”，不等于自动取得课表、成绩、作业数据权限。**
- 当前平台部署在校外腾讯云。浙大现行公开管理办法明确：涉及学校基础数据、师生个人信息或敏感信息的系统不得部署在校外；确需校外开办还要向信息技术中心备案。因此，在获得学校书面同意、数据接口授权和部署方案确认前，不应上线自动抓取。

## 1. CampusOS 实际如何实现

### 1.1 统一认证不是官方 OAuth 授权，而是本地模拟 CAS 登录

CampusOS 代码会：

1. 请求 `https://zjuam.zju.edu.cn/cas/login`，解析页面中的 `execution`；
2. 请求 `/cas/v2/getPubKey`；
3. 用返回公钥加密用户密码，并把账号、加密后的密码、`execution` 直接提交到 CAS 登录页；
4. 以 `iPlanetDirectoryPro` Cookie 是否出现判断是否建立 SSO 会话；验证码、限流及协议变化会作为错误退出。

来源：[`zjuAuthConfig.ts` L9-L21](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuAuthConfig.ts#L9-L21)、[`zjuUnifiedAuth.ts` L178-L293](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuUnifiedAuth.ts#L178-L293)。

这是一种“用户把统一认证密码交给客户端，客户端代用户登录”的实现，而不是学校向第三方应用签发的、带作用域和撤销能力的标准授权令牌。

### 1.2 本科教务数据

拿到 CAS 会话后，代码用 `service=` 跳转到本科教务网，取得教务侧 `JSESSIONID` 与 `route`，再调用教务网页自身使用的接口：

- 课表：`/jwglxt/kbcx/xskbcx_cxXsKb.html`
- 考试：`/jwglxt/xskscx/kscx_cxXsgrksIndex.html`
- 成绩：`/jwglxt/cxdy/xscjcx_cxXscjIndex.html`
- 主修成绩：`/jwglxt/zycjtj/xszgkc_cxXsZgkcIndex.html`

来源：[`zjuAuthConfig.ts` L12-L21](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuAuthConfig.ts#L12-L21)、[`zjuUndergraduateApi.ts` L39-L80](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuUndergraduateApi.ts#L39-L80)、[`zjuUndergraduateApi.ts` L110-L176](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuUndergraduateApi.ts#L110-L176)。

### 1.3 学在浙大：作业、课程、提交状态与课件

代码消费 CAS 到 `courses.zju.edu.cn` 的跳转，取得该业务域签发的 `session` Cookie，然后读取：

- `/api/todos`
- `/api/my-semesters`
- `/api/my-courses`
- 每门课的 `/activities`
- 作业 submission status、考试及 submitted-exams
- 课件 reference/upload blob

CampusOS 将待办与课程 activity 合并、去重，形成 DDL；课件下载携带学在浙大业务 Session，并支持重试和 Range 续传。来源：[`zjuLearningApi.ts` L85-L159](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuLearningApi.ts#L85-L159)、[`zjuLearningApi.ts` L212-L324](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuLearningApi.ts#L212-L324)、[`zjuLearningApi.ts` L326-L380](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuLearningApi.ts#L326-L380)、[README 的实现说明](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/README.md#L216-L217)。

### 1.4 其他功能

- 研究生教务：CAS ticket 换业务 `X-Access-Token`，读取课表、考试、成绩；仓库明确说真实研究生账号尚未验收。
- 智云课堂：经 CMC 登录桥建立课堂业务态，再读取课程/回放信息。
- 素拓二课、官方校历和公开校园资讯也有独立连接器。
- UI 将课程、考试、DDL、个人日程统一映射成日历事件；这套“标准化事件模型 + 来源 provenance + 缓存后后台刷新”的产品思路非常值得复用。

来源：[`zjuAuthConfig.ts` L24-L58](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuAuthConfig.ts#L24-L58)、[CampusOS README L211-L226](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/README.md#L211-L226)。

## 2. CampusOS 的凭据与会话安全模型

### 2.1 它为什么适合本地客户端

- 密码通过 Electron `safeStorage` 加密后写到用户电脑，目录/文件权限分别设为 `0700`/`0600`；系统安全存储不可用时拒绝保存。来源：[`academicCredentialStore.ts` L29-L91](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/academicCredentialStore.ts#L29-L91)、[`academicCredentialService.ts` L189-L266](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/academicCredentialService.ts#L189-L266)。
- Electron 官方说明，Windows 上 `safeStorage` 使用 DPAPI，通常只有同一 Windows 登录用户才能解密；它保护的是“本机存储”。[Electron safeStorage 官方文档](https://www.electronjs.org/docs/latest/api/safe-storage)
- CAS 会话和各业务 Cookie/Token 由主进程内的 Map/CookieJar 管理，CAS 活跃缓存仅设为 2 分钟，并区分 CAS、教务和学在浙大业务会话。来源：[`zjuAuthConfig.ts` L69-L70](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuAuthConfig.ts#L69-L70)、[`zjuUnifiedAuth.ts` L296-L324](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuUnifiedAuth.ts#L296-L324)、[`zjuAuthCookies.ts` L191-L264](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuAuthCookies.ts#L191-L264)。
- 连接/注销会清空服务 Session；业务凭据不下放给普通页面或插件。来源：[`zjuUnifiedAuth.ts` L369-L379](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/packages/core/src/main/zjuUnifiedAuth.ts#L369-L379)、[README 的沙箱与能力说明](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/README.md#L206-L221)。

这并不表示方案没有风险：恶意的同用户进程、被攻陷的主进程或本机仍可能取得凭据；但爆炸半径主要是单台电脑、单个账号。

### 2.2 为什么不能直接搬到 learningmirror.cn

`learningmirror.cn` 是公网云端 FastAPI/PostgreSQL 应用。把相同逻辑放在服务器意味着：

1. 用户必须把浙大统一认证的**可复用明文密码**提交给我们的服务器；CAS 前端公钥加密并不能改变“我们的后端能看到原密码”这一事实。
2. 服务器必须集中保存或反复接触密码、CAS Cookie、教务 Cookie、学在浙大 Session；一次服务端、数据库、日志、备份或运维账号泄露可能影响所有学生。
3. 云服务器没有可按每个学生 Windows 登录身份隔离的 DPAPI。即使数据库字段做服务器端加密，只要自动刷新还需要解密，攻击者拿到运行时和密钥就能批量还原，安全边界不同。
4. 集中轮询未公开网页接口会放大频率和来源 IP，可能触发验证码、封禁或给学校系统造成负载；接口结构也没有稳定性承诺。
5. 这会把课程、作业、成绩、GPA、课件等个人学业数据集中落到校外腾讯云，直接进入学校制度与个人信息保护义务的高风险区。

因此，**不能把“本地加密存密码 + 本地模拟登录”简单改成“云端加密存密码 + 云端模拟登录”**。

## 3. 许可证与可复用边界

- CampusOS 仓库自身是 MIT License，允许使用、复制、修改和再发布，但复制或 substantial portions 时必须保留版权与许可声明。[固定提交的 LICENSE](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/LICENSE)
- README 明确第三方媒体另有许可；其实现仅“行为参考”GPL-3.0 的 Celechron，并提示若代码级复用要先做许可证评审。[README L236-L241](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/README.md#L236-L241)
- MIT 只授权 CampusOS 代码版权，**不授权**浙江大学账号、数据、商标、内部接口或绕过访问控制。
- 建议优先重写“标准化事件/数据模型、来源追踪、刷新状态、错误边界”而非复制连接器；若复制 MIT 源码，建立 NOTICE/第三方许可证清单并记录固定提交。

## 4. 浙江大学官方接入要求

### 4.1 统一身份认证应用接入

浙江大学信息技术中心当前公开的“应用接入申请（含统一身份认证）”面向**单位用户**。办理路径为：

1. 登录“浙大服务” `service.zju.edu.cn`；
2. 页面底部进入“应用接入”，以统一身份认证登录开发者平台；
3. 在个人空间创建应用；
4. 下载《浙江大学应用系统接入管理规范》压缩包，填写其中 **5 份文档**，签字盖章后扫描；
5. 准备 `108×108` 的 JPG/PNG 应用图标，在线填表并上传附件、提交。

该页面列出的受理部门为应用开发部，联系人楼老师，电话 `87951551`，邮箱 `loulingyun@zju.edu.cn`，承诺时限为 1 个工作日。来源：[浙江大学信息技术中心：应用接入申请（含统一身份认证）](https://itc.zju.edu.cn/tysfrzyyjrsq/list.htm)。另一个官方服务页也说明统一身份认证接入需创建应用、上传签章材料，由信息技术中心受理：[统一身份认证服务页](https://zuits.zju.edu.cn/_s146/tysfrzyyjr/list.psp)。

**关键点：目前公开页面没有说明个人学生项目可直接自助获得生产接入，也没有公开课表、成绩、学在浙大作业的 API scope。** 应先确定一个校内主办单位/指导教师/信息化负责人，由单位提交。

### 4.2 认证接入不等于数据接入

学校对统一认证的官方描述包括身份校验、应用授权和统一接入管理。[统一身份认证平台简介](https://zuits.zju.edu.cn/13897/)。这支持一个明确判断：正式接入后，我们可以让用户在学校页面登录并返回已核验身份，但课表/成绩/作业仍需要各数据主管部门另行授权。

申请材料与会谈中应逐项提出：

- 本科教务：课表、考试、成绩/GPA的最小只读字段、学期范围和刷新频率；
- 研究生教务：同上；
- 学在浙大：课程、DDL、提交状态、资料下载；
- 智云课堂：课程/回放深链或只读元数据；
- 素拓二课：记录的只读字段；
- 数据存放地点、保存期限、删除/导出机制、日志、应急联系人和安全测评要求。

任何非公开网页端点在未获数据主管部门书面许可前，都应视为“实现观察”，而不是可用于生产的开放 API。

### 4.3 校外部署是当前硬约束

《浙江大学网络与信息安全管理办法》规定“谁主管谁负责、谁主办谁负责、谁使用谁负责”；涉及学校基础数据、师生个人信息或敏感信息的信息系统不得部署在校外，确需在校外开办的单位应到信息技术中心办理备案；同时禁止擅自收集、使用个人电子信息。[浙江大学网络与信息安全管理办法](https://itc.zju.edu.cn/2017/0930/c90629a3170090/page.htm)

`learningmirror.cn` 当前在校外腾讯云，因此必须在申请中主动披露域名、云厂商、地域、网络拓扑、数据表和备份位置，请学校书面确认是：

- 允许校外部署并完成备案；或
- 改到浙大云/校内托管；或
- 仅把身份结果和最小必要数据同步到云端，其余数据在校内网关或用户端处理。

## 5. 法律与安全底线

- 《个人信息保护法》要求合法、正当、必要、诚信，最小范围，公开透明；基于同意处理时要充分告知并允许撤回，变更目的/方式/种类需重新取得同意。[全国人大：中华人民共和国个人信息保护法](https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html)
- 2025 年起施行的《网络数据安全管理条例》要求在网络安全等级保护基础上采用加密、备份、访问控制、安全认证等措施；个人信息规则应说明处理者、目的、方式、种类、保存期限和查阅/删除/注销途径。[中国政府网：网络数据安全管理条例](https://app.www.gov.cn/govdata/gov/202409/30/520076/article.html)

对本项目而言，用户“同意”并不能替代学校对其系统与数据接口的授权；学校授权也不能替代对用户的清晰告知与数据最小化，两者都需要。

## 6. 推荐的两阶段方案

### 阶段一：现在即可做的低风险产品层（不收浙大密码）

目标是先验证“每天真正有用的信息桌面/首页”价值，不碰校内账号托管。

1. 建立统一的 `AcademicEvent`/`Course`/`Assignment`/`Exam`/`MaterialLink` 数据模型，所有记录带 `source`、`source_id`、`fetched_at`、`confidence`、原始链接和更新时间。
2. 支持用户手工创建、CSV/ICS 导入、截图/文件解析后逐条确认；AI 只产生日程候选，未经确认不写入。
3. 提供官方系统的深链：教务、学在浙大、智云课堂、素拓入口；DDL 可由用户手工/导入维护。
4. 做“今日桌面”：今日课表、最近 DDL、考试倒计时、个人日程、校园公开资讯和提醒。
5. 成绩/GPA先做**本地或用户主动导入后计算**，默认不上传原始成绩；课件先保存官方链接或由用户主动上传。
6. 同时由校内主办单位启动统一身份认证与数据接口申请；完成隐私政策、数据清单、保存期限、注销删除和安全事件预案。

这一阶段可直接借鉴 CampusOS 的产品结构、日历聚合与 provenance 思想，不复制其凭据抓取器。

### 阶段二：审批后的官方集成

1. **身份接入**：浏览器重定向到浙大官方登录页；本站只接收学校返回的 code/ticket/assertion 和获批的最小身份属性，永不接收浙大密码。
2. **数据接入**：仅调用学校书面批准、提供文档和测试环境的接口；按 scope 拆分“课表、作业、成绩、课件”，逐项授权，默认只读。
3. **架构**：优先采用校内数据网关/浙大云；如获准校外部署，使用每用户独立、可撤销的短期令牌，密钥进入专用密钥管理系统，不把令牌写日志，不在客户端暴露。
4. **同步**：增量同步、合理退避、明确刷新按钮和最后成功时间；遵守官方频率，不做 60 秒级全员轮询。
5. **数据最小化**：首页只存展示必需字段；课件尽量按需直达，不建立无必要的全量副本；成绩/GPA单独开关、单独告知。
6. **用户控制**：提供断开浙大绑定、撤回授权、删除同步数据、导出、查看最近同步与授权 scope；平台账号注销时同步撤销凭据。
7. **上线门槛**：书面接口授权、校外部署/备案确认、威胁建模、渗透测试、备份恢复测试、最小权限审查和应急联系人齐备后再开放。

## 7. 明确不可做事项

在获得书面许可之前：

- 不在 `learningmirror.cn` 页面要求或代收浙大统一认证密码；
- 不在云端数据库、Redis、环境变量、日志或备份中保存 ZJU 密码、CAS Cookie、教务 Cookie、学在浙大 `session`、研究生 `X-Access-Token`；
- 不把 CampusOS 的模拟登录连接器直接改成服务端批量代理；
- 不绕过验证码、MFA、限流、访问控制或反自动化措施；
- 不把观察到的网页内部接口当成“开放 API”，不承诺其稳定性；
- 不批量下载、长期保存或二次分发学生课件；
- 不以“用户已同意”为由跳过学校的数据接口审批、校外部署备案和主办单位责任；
- 不复制 CampusOS 的第三方素材；复制 MIT 源码时不得遗漏版权和许可证。

## 8. 下一步执行清单

1. 确定浙江大学校内主办单位、负责人和技术联系人。
2. 通过“浙大服务 → 应用接入”下载并填写 5 份材料，准备 108×108 图标。
3. 在申请/咨询邮件中附：`learningmirror.cn`、腾讯云位置、数据流图、字段清单、保存期限、删除流程、安全措施和阶段性功能表。
4. 向信息技术中心确认统一认证协议、回调域名、测试环境、可返回身份属性。
5. 分别向本科生院/研究生院/学在浙大平台主管部门申请最小只读数据接口及刷新频率；要求书面确认能否在校外处理。
6. 在回复到达前，只开发阶段一的手工导入、日历聚合、公开资讯和官方深链。
7. 若学校不给数据 API，但允许客户端个人使用，可再评估“开源本地伴侣”方案；本地伴侣只向云端同步标准化后的最小数据，并仍须取得学校和用户对同步行为的明确授权，不能假定 CampusOS 的存在等于学校许可。

## 主要来源

- [CampusOS 固定提交 README](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/README.md)
- [CampusOS 固定提交 LICENSE](https://github.com/Harry-Linner/CampusOS/blob/58e9474e2ee480170eb6e38b7ef2a785f774eeac/LICENSE)
- [浙江大学：应用接入申请（含统一身份认证）](https://itc.zju.edu.cn/tysfrzyyjrsq/list.htm)
- [浙江大学：统一身份认证服务页](https://zuits.zju.edu.cn/_s146/tysfrzyyjr/list.psp)
- [浙江大学网络与信息安全管理办法](https://itc.zju.edu.cn/2017/0930/c90629a3170090/page.htm)
- [全国人大：中华人民共和国个人信息保护法](https://www.npc.gov.cn/npc/c2/c30834/202108/t20210820_313088.html)
- [中国政府网：网络数据安全管理条例](https://app.www.gov.cn/govdata/gov/202409/30/520076/article.html)
- [Electron：safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
