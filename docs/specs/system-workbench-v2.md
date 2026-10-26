# 全系统工作台与连续操作 · 十项升级

状态：已实现的行为契约，2026-10-26 完成本地验证。基线 `a389799df612d85ea1fc20ca97721e21912d6ea5`。本规格固定十项交付与验收边界；远程 CI、实际迁移版本、部署与生产范围另记于本批 PR 和交付证据，不把本规格、脚本或演示入口当作生产通过证明。

依据：[产品](../product-spec.md)、[设计](../design-system.md)、[交互](../design/interaction-clarity.md)、[动效](../design/motion.md)、[工程](../engineering-standards.md)、[数据](../data-governance.md)、[安全](../security.md)、[性能](../performance.md)、[资源所有权](../performance/navigation-resource-ownership.md)、[质量](../quality-standards.md)、[发布](../release-operations.md)。

## 十项验收账本

| # | 功能与真实入口 | 必须完成的操作路径 |
| --- | --- | --- |
| 1 | 应用顶栏工作台、记录菜单“放到参考区” | 主区保留真实 Next 路由；副区独立选择/切换实体。PDF/JD 在一侧，笔记/经历编辑在另一侧；可交换视觉位置、调整宽度。手机切换两侧保留位置和未提交输入，隐藏重型阅读器暂停工作。不能 iframe 整套 AppShell 或伪造多个 Router。 |
| 2 | 笔记/文件/任务的拖动柄、触摸可达的“关联/安排”菜单 | 笔记/文件拖到项目或职业实体，预览“建立关联”后确认；原件不移动。任务拖到日历进入排程预览。空目标/无权限/失败/已有关系如实显示；取消无写入。 |
| 3 | 工作台“保存现场/恢复现场” | 保存有名称的布局、两侧合法内部地址/实体引用、筛选、可序列化滚动/源行/PDF页码；恢复后分别读取受保护权威数据。跨 owner、失效对象、冲突草稿安全处理。不得持久化正文、JD、原件、签名URL、DOM或完整读模型。 |
| 4 | 列表可见预览按钮、记录选择后的空格 | 笔记、文件、机会、购物等支持只读速览；上下按当前筛选排序连续浏览，Esc 关闭恢复焦点/列表位置。输入、按钮、链接、IME 内不劫持 Space。PDF 速览不自动写阅读进度。 |
| 5 | 日历“待安排”栏 | 真实未完成 To Do 拖到时间格，修改时长、标题与日期，明确时区/冲突；点击确认才进入现有 Outlook 管道。任务归属和状态服务端重读，重复确认/丢响应不重复创建。现有日程移动/缩放也先显示变更预览。 |
| 6 | 领域列表的字段按钮与多选操作条 | 任务日期/重要性、购物数量单位、旅行时间/天数、笔记归属可就地修改；选择一批先预览影响再提交。数据库批次事务化或明确逐项结果；provider 批次逐项成功/冲突/未知/失败，保留失败项与输入，不整体伪造回滚。 |
| 7 | 全局反馈条与最近操作面板 | 对有明确逆操作的重命名、归属、归档、完成、改期等显示撤销，记录名称、状态和可撤销条件；只提交服务端收据ID。后续修改拒绝旧收据，重复撤销幂等。远端撤销是明确确认的补偿，不承诺恢复永久删除或重建同provider对象。 |
| 8 | 现有 CmdK 命令入口 | 支持“周五15点模拟面试45分钟”“把选中任务移到明天”等受控参数命令，显示可修改预览后确认；复用同一排程/批处理管道。解析/输入不写入，不为确定性命令制造AI run，时区/DST严格遵循既有契约。 |
| 9 | 列表多选“比较”、工作台比较入口 | 同类型2–4个购物候选、职业机会、旅行方案、投资记录并排；差异、缺失、来源及截至时间明确。职业薪资保留原文；投资原币/实盘模拟/口径区分，精确十进制不转float，不编评分排名或估算价格。 |
| 10 | 旅行/购物/闲暇“现在用”模式 | 旅行显示用户选择的当前/下一站、真实时刻/坐标地图与Files票据；采购显示去重大字清单、已保存数量和既有购买资格；闲暇选择正在进行内容并保存用户明确填写的页/集/分钟进度。主动进入退出，不GPS追踪、不按时钟伪造完成，不自动支付或交易。 |

## 发现的现状与允许模式

- 单Router边界：`src/components/layout/app-shell.tsx`、安装版 Next 16.3.8 的 `parallel-routes` / `use-router` / `linking-and-navigating` 指南。副区采用显式实体/位置props和领域viewer，不把 `presentationPathname` 当独立Router，不开启全局 cacheComponents 捷径。
- owner与缓存：复制 `workspace-resource-cache.ts` 的 scope lease / abort / private response 模式；保持 `WorkspaceIdentityBoundary` 的首屏 gate、401/403清理和旧owner拒绝。正文仅使用有界内存资源；现场是经过校验的UI偏好，不是业务副本。
- 笔记：复制 `getNoteDocument` / document GET 和 `noteDocumentCache`；保持 autosave/CAS、草稿、undo history、输入法、source anchor。双编辑器不得重复DOM id，不允许同笔记的两个独立自动保存器互相覆盖。
- 文件：复制 `FilePdfPreview` 的字节/大小/页数/渲染预算与卸载清理；抽出可内嵌且能暂停/禁用进度写入的viewer，保留私有原件鉴权。同一文档的正文/PDF页签切换保留已访问阅读器的有界暖会话、当前画布和页码，不重复请求；未访问PDF仍懒加载。外层工作台区域 inactive、owner变化或真正离开文档才销毁该会话/代理/画布，保留有限数值位置供恢复；这两层生命周期不得混为同一隐藏状态。
- 关系：复用 `entity_links.related/manual` 和数据库两端owner trigger；不使用 Markdown 的 `reference/system` 命名空间，不撤销原本已存在的链接。
- 本地并发：复制 Leisure feedback 原子RPC的owner/revision/审计与冲突状态。新增shopping/travel/metadata写入使用单调revision或可靠CAS；禁止复制Travel两条独立UPDATE换序或仅error为空就声称成功。
- 外部执行：复制 Calendar `pending_confirmation → queued → processing → remote_committed/reconciliation_required` 与 transactionId；创建增加稳定逻辑request key。所有provider更新只提交本次字段，执行前实时读取并拒绝已观察冲突；超时/丢响应为unknown，只读核对，不盲重发。
- Microsoft公开GET示例返回ETag，但ToDo/Event更新参考未明确保证If-Match。不能将GET比较称为原子CAS，也不增加未经证实的header或移除条件后重试。外部显式补偿沿用既有写权限/确认，文档保留GET与PATCH间的并发窗口；本地事务CAS与外部快照检查分开验收，不伪造provider能力。
- 真实缺口：shopping quantity/unit、travel地点现场标记/票据、leisure结构化progress须兼容扩展；顺带修复Shopping创建返回string却读created.id、Travel跨天顺序与原子排序等影响本次流程的现存问题。

## 实施阶段与文件所有权

### Phase 0 · 发现（已完成）

三路只读报告确认上述实际函数/类型、安装版Next文档、Graph官方文档及领域约束。明确缺口而不编造API。官方依据包含 Microsoft Graph todoTask/event get/update 与 errors、SDK headers；仅声明文档能支持的事实。

### Phase 1 · 共用能力和真实领域数据

- Workspace 实施：`src/features/workbench/{contracts,entity-queries,scenes,...}`、受保护只读API、共用Provider/记录入口、双区/速览/比较/现场、AppShell与owner上下文；scene migration独立文件。先发布共享类型与接入合同。
- Operations 实施：`src/features/workbench/operation*`、专用收据表/helper与undo、现有Graph关系/Notes/Files metadata边界、Calendar任务排程与Tasks批次、CmdK参数命令和统一反馈历史。操作白名单，不接受任意table/patch/inverse。
- Life 实施：Shopping/Travel/Leisure的兼容字段、领域原子RPC/Actions/现场与inline/multiselect UI；同步所有数据库类型及backup schema分类。与Operations按固定收据合同衔接，不重写其文件。
- 三路同一任务分支，文件职责互斥；共享类型、生成类型、迁移顺序由协调者确认。现有用户修改保留，不静默跳过任一十项入口。

### Phase 2 · 跨模块接通

核对每个列表的记录引用/排序队列、可见预览/副区/比较入口、拖放源和目标、触摸替代操作、批次与反馈、命令到预览到真实Actions。不能只做公共面板却没有领域入口。检查Notes/Folders、Files、Career、Projects、Tasks、Calendar、Shopping、Travel、Leisure、Investment的具体路径。

### Phase 3 · 独立验证与审查

Verification、Anti-pattern、Code-quality三个子任务独立检查；失败回实施修复后重验。覆盖匿名/非owner/伪造ref/跨owner缓存、关联两端归属、重试幂等、并发/ABA、receipt伪造、partial/unknown、草稿/焦点/输入与取消。真实PostgreSQL重放/升级/恢复，不用SQLite替代；备份schema准确分类新列/表，临时运行状态恢复不重放。

GUI验证由Agent完成：360/390/768/1440、短屏、实际200%文字、键盘/触摸、forced-colors、动态偏好运行中改变、快速反向、返回与网络失败；使用合成数据和阻断生产写入的环境。提供截图与连续录屏。局部测试不得冒充全仓或生产owner流程。

### Phase 4 · 提交、发布与生产核对

仅在对应阶段验证和审查通过后提交；通过任务PR推送并观察最终head检查。兼容schema扩展先于依赖代码发布，保留已部署迁移不改写；不执行旧PR86的独立迁移。无新增费用、外部共享或认证权限。按真实schema确定恢复方案，不将旧任务物理备份要求泛化为每次additive迁移的新授权。

生产核对项目/迁移版本/部署SHA/正式域名/协议/资源，明确未验证owner流程；不要求用户手测，不修改真实密码验收。代码回退保留兼容新字段，不能逆向删除用户内容、原件或历史。

## UI运动与状态

双区从主内容边缘展开，宽度变化有界、320–420ms；交换仅改变视觉顺序，主编辑器不卸载。速览由被选对象进入，主体/遮罩协同360ms、退出220ms；上下切换保留壳、内容短淡入，网络等待显示真实状态。比较列进入/移除协调布局220–320ms；批次操作条与undo反馈120–180ms立即响应，成功只跟随确认结果。现场模式在同模块内连续转换，保留来源/返回位置。拖动预览跟手，释放后到确认面板，取消回归；请求不等动画结束才开始。

所有转换可快速反向、Esc/外点/返回关闭、卸载取消旧监听/定时器/请求。减少动态效果取消缩放/位移采用即时状态或短淡入，功能与真实完成路径不变。移动目标≥44px、输入≥16px；边界和焦点使用未分层窄组件规则及共享变量，不能只加无效utility。避免transition-all、每帧全文扫描、全局持久will-change、大面积blur与复制私人DOM。


## 本批数据库发布与恢复边界

无新增环境变量、外部权限或付费服务。正式库只执行本批六份兼容扩展及第七份性能跟进，按以下依赖顺序；Supabase 工具分配的实际版本须与源码文件名和交付报告一致，SQL 正文不在部署后改写。

1. `workspace_action_receipts`：临时收据、原件证明及辅助边界。
2. `workbench_core_metadata`：本地元数据 CAS、历史保护、收据可见性和 Notes 列表 revision。
3. `workbench_calendar_request_keys`：可空稳定请求标识及唯一约束，兼容旧执行队列。
4. `life_field_operations`：数量、旅行现场/票据、闲暇进度及领域原子操作。
5. `workspace_scenes`：有限现场偏好、验证器和幂等保存。
6. `workbench_undo_dispatch`：在所有固定领域逆操作可用后安装统一分派。
7. `workbench_policy_fk_performance`（平台实际版本 `20261026073240`）：Scene owner SELECT 策略使用请求级身份 InitPlan；为原件证明的 document/user 级联外键补两个前缀索引。角色、RLS/FORCE、谓词含义和服务端专属权限不变。

性能跟进不改写前六份已部署 SQL。`trip_documents` 的 `(user_id,trip_id)` 与 `trip_id` 前缀索引已可定位旅行关联；`trips` 的复合当前/下一站外键包含唯一 `id`，已有主键可先定位单行后核验其余条件，因此不为消除索引列序提示添加重复索引。隔离 PostgreSQL 验证这些实际候选路径和 Scene InitPlan，候选路径检查不等于生产耗时基准。代码回退可保留新增索引与等价策略；无需删除资料或反向变更权限。

旧 Notes/Files 写入同样推进 mutation revision；旧闲暇反馈保留新进度字段。历史购物数量不推断为 1。新增 Calendar 请求列可空，旧代码仍可处理原有操作。现场与票据关系进入可迁移备份；临时收据及原件证明明确排除恢复，恢复后不会重放外部操作。

代码回退保留新增字段、表、资料和版本，不执行反向删除迁移。原部署 `a389799df612d85ea1fc20ca97721e21912d6ea5` 是本批开始时的代码回退参考；正式回退时仍需核对当前数据/队列兼容性和部署身份。发现新增边界问题优先前向修复，不能为回退清除用户数量、进度、现场或原件。

验证证据分别记录数据库、合成 UI、远端 CI、部署协议和生产 owner 流程；部署 READY 或匿名 401 不代表已登录流程通过。
