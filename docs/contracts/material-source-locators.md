# 材料来源、连续整理与编辑事务

状态：本批实施契约。`61569c8` 精确十一条 SQL 已完成真实隔离 PostgreSQL 与独立产物复核；随后八条未部署 SQL 创建默认 ACL 修复尚待新 Native。界面修复已形成新候选但未通过统一真实浏览器验收，生产未发布，见[2026-10-28 候选记录](../verification/2026-10-28-continuous-workflows-v3.md)。范围见 [二十项升级](../specs/continuous-workflows-v3.md)，公共生命周期见 [连续性契约](workflow-continuity.md)。

## 不可变来源

Notes 来源 URL 仅含 note ID、`nv` 版本 UUID、`nr` 修订号、`sf/st` UTF-16 选文边界及 `sh` 选文 SHA-256；不放原文。`source-locator.ts` 严格解析完整参数集合、重复参数和范围，canonical backlinks 将合法来源定位归到同一实体。来源参数不是权限凭证。

选文操作先等待现有 autosave，验证 live document 没有变化，再由 `capture_note_source` 锁定普通、未归档、未删除且同 owner 的 note，核对 revision 与原文 SHA-256，创建或复用 `source_citation` 快照。该类版本的正文、标题、身份、修订、内容哈希、编号和创建时间不可修改或删除；归档元数据可变化。历史链接读取该版本的真实片段并核对选文哈希，当前正文已变化时明确提示，不猜测高亮当前相同文字。暗格、归档、版本不匹配与无权限均不能回显原文。

PDF 来源独立使用 `file/pdfPage/sourceVersion`，其中 `pdfPage` 为 1–500 的 PDF 页码，和 Files 列表分页 `page` 无关。PDF 只从当前授权原件的同一 unpdf bundle 加载 TextLayer，以 CSS viewport 对齐 canvas。每页最多 20000 个文字项、200000 字符；原有字节、页数、像素和超时预算保留。选文仅来自该页文字层，最多 10000 字符，换页/缩放/源变化后失效。无文字或文字层失败仍保留 canvas 阅读和原件下载，不假装已有 OCR 内容。

引用到旁边笔记需要明确可编辑目标，通过 live CodeMirror 单次事务插入，保留 undo；“已插入，待保存”与 canonical 保存分开。选文转任务先展示可编辑标题与真实 Microsoft To Do 清单，用户确认后才创建。

手机上参考笔记不活动时仍不得注册/写入隐藏编辑器。明确点击“到参考笔记确认摘录”可把当前合法 PDF 的不可变 sourceVersion/page 引用和已构造 Markdown 移交到单一 Workbench 内存意图；不超过既有20000字符预算、仅一条、30秒。关闭阅读器并激活精确参考区后，只有真实唯一 live reference editor 就绪且用户再次确认，才走原插入桥接/undo与自动保存。源 reader 在移交前仍核对 origin、render generation、选文与挂载 owner scope；合法移交后的 reader teardown 不等于撤回，但旧 owner 不能续租。routeKey、导航、目标、owner、Esc/Back/取消、卸载和期限失效均撤销意图并清正文，过期明确提示重新选取。确认同步认领，结果待核对不自动重发，“已插入”不冒称“已保存”。当前只是已冻结实现与局部组件证据，手机真实浏览器闭环仍待统一候选重验。


## Markdown 操作

Slash 仅在合法行首和折叠选区触发，代码、URL 和正文斜线不触发；补全仍写原始 Markdown。完整块边界来自 Lezer 顶层语法节点，代码、嵌套列表、表格、引用和 Setext 标题整体移动。不能安全移动的 HTML、链接定义及文档首 frontmatter 边界不提供移动入口。

独立 gutter 手柄提供拖动落点线、上/下移菜单与 Alt+方向键；触摸目标 44px。源文档变化、取消、移出和卸载释放拖动状态。移动只发一次事务，undo 恢复原始字节。AI 按完整语法块生成可选择的差异段，采纳之前再次核对 live baseline；冲突保留建议，不覆盖后续输入。标题建议也需显式确认。

## 收集箱与远端意图

连续队列仅在服务端刷新确认 `processed_at` 或归档后推进；失败留在当前条目。稍后只调整本轮队列，来源仍在 Inbox；回看不重新执行转换。项目资料是带 `notes.project_id` 的笔记，链接保存为明确的链接笔记，不自动抓取外部 URL。

`convert_inbox_note` 在一个事务内锁 Inbox、创建 note/初始版本、标记来源并审计。重复相同转换复用原目标；不同意图冲突，不能重复创建。项目转换验证 owner 和项目可用性。日记仍采用现有幂等 source marker/CAS；只有来源写回确认后推进。

To Do 创建由专门 `todo_creation_receipts` 保留真实发送意图、哈希与目标 ID，不复制正文或 token。Inbox 的请求键固定为 Inbox ID，同一来源跨标签页也只能认领同一意图；payload 不同返回冲突。状态 `prepared → processing → remote_committed → available`，未知远端结果转 `unknown` 后禁止自动重发。已创建但来源失败的重试只修复来源；终态和 create 审计由 service-only invoker RPC 原子确认。普通 owner 只读回执，不能伪造。该技术表在系统备份中排除，恢复不重放外部执行意图。

## 上传整理与任务执行

选文件先进入内存整理台，显示原名、独立显示名、目标文件夹、排除项和有界 SHA-256 重复检查；确认之前不创建 signed URL、document 或上传 session。检查失败明确未知，不声称没有重复。相同内容可保留两份，不能自动覆盖或删旧原件。

每个新上传计划拥有稳定 UUID。single 使用同一 document ID 重试并核对 checksum、原名、MIME、大小、文件夹和显示名；multipart identity 纳入计划 UUID，续传 GET 原 session，不重新创建计划。因此同批相同原件仍可分别入库，丢响应重试则仍指向同一计划。显示名不能通过构造新 File 改写原始 filename。跨页面执行由共享 registry 持有真实 runner；全标签页至多两个文件并行，每个 multipart 至多两片，保持既有内存预算。

封存核验返回才算原件入库；失败项可独立重试，已成功项不重发。OCR 的 worker 与 lease 保留既有原文哈希校验，离开页面/关闭弹层不取消已托管任务，关闭标签页仍会中断。退出登录与 owner 变化会取消并清理，旧回调不能更新新 owner。

## 迁移与回退

当前完整十一条迁移依序为 material sources → domain workflows → material receipts → inbox dispatch mutex → AI capture intents → practice intents → Scene state → Briefing judgment intents → agent run generations → Life request reconcile → production baseline，精确本地文件名与状态见[迁移登记](../verification/2026-10-28-continuous-workflows-v3.md#十一条迁移与生产版本登记)。`61569c8` 的十一条精确 SQL 已有真实隔离与独立产物证据，含末项 `20261027175718_continuous_production_baseline.sql` 对 completion 审计原子性的修复。随后第1/2/3/4/5/6/8/9条仅将 service_role 加入既有 REVOKE 名单以收紧创建默认的多余权限，正文/约束/RLS/并发逻辑、旧99条及第7/10/11条保持；该新候选和新增生产默认 ACL 场景尚待真实 Native，不能直接沿用615旧哈希的通过结论。它在缺失时补齐已证的复盘函数/项目搜索维护契约，并仅将匹配已知旧指纹/配置/ACL的 completion 前向升级为同事务正文、来源、版本与审计；已是新版保留，未知定义拒绝，其余健康定义与 ACL 保留，不重放旧 surface CHECK、旧文件或伪造 ledger。实际生产 87 条登记不等于本地 99 条完整旧基线。material receipts 的 task composite FK 依赖领域迁移创建的 owner 唯一索引，mutex 再依赖来源与回执；不能将本材料子集误作完整发布清单。

生产通过已连接 Supabase MCP 按上述顺序执行；接口不接受 version 参数，实际版本由迁移列表与 schema 核对。时间戳不同只对齐本地文件名、两份严格顺序清单与文档元数据，SQL 字节/哈希不变，不双写 history 或改用 CLI/REST 绕过。当前尚未应用生产。

新增 Scene JSON 需要兼容 reader，最早已登记检查点为 `93f88f9f127717cca3f8a6895b515ffd0b381357`；`a5803dda` 不能读取本批新格式，不能直接用作兼容回退。回退保留新增快照、原件与来源，不 down/delete，不重放未知 provider 操作；实际回退候选的构建/配置仍需核对。本文不代表生产已通过。

## Inbox 跨去向互斥补充

`20261027014745_inbox_dispatch_mutex.sql` 通过同 owner 的 Inbox 行锁统一笔记/项目/链接/日记与 To Do/Calendar 意图。外部派发前必须持久化专门回执或 Calendar create 草稿；创建意图的事务锁来源并检查既有目标和其他 provider 意图。锁不跨 HTTP，已提交意图在派发、结果未知、缓存或来源待修复期间持续占用。相同请求和哈希复用原记录；换标签页/表单 request ID 或归档操作都不能绕过已有占用。

Inbox 的 Calendar 创建请求也以 Inbox ID 定位，并通过 service-only preparation RPC 复用历史有来源的意图。日记追加改为 `convert_inbox_daily`：同一事务锁 Inbox、锁日记并校验 revision、保存旧版本、追加原始内容、完成来源、追加审计；失败回滚整个追加。旧客户端直接完成已创建任务来源仍兼容。旧 Calendar 草稿没有 `sourceInboxId` 时不推测关联、不自动补 claim、不自动派发；它们只按原队列规则确认或取消，不能声称已获得本批 Inbox 互斥。

仅未派发的 Task `prepared` 与 Calendar `pending_confirmation/queued` 且无 claimed/provider/commit 证据的意图可由用户点击“取消尚未发送的意图”释放。适配层能证明尚未派发，或收到结构化 Graph 单请求拒绝（400/401/403/404/405/413/415/422）时，Task 进入 `rejected`、Calendar 记录 `writeOutcome=not_written`。用户下一次明确创建可在同 Inbox 锁下重新准备新哈希，并追加前后哈希审计；这不是后台重试。408、409、429、5xx、网络丢响应、无效响应和已接受但缓存失败均不作为未写入证明。未知结果继续保留来源和输入，不允许改 ID 自动重发；已知目标的 Calendar/Task 来源失败仅修复本地来源和回执。归档与安全取消不删除意图历史；物理删除来源或回执不能成为绕过途径。

新增活跃 Task/Calendar claim 存在时，数据库同时限制直接写 `processed_at`、`converted_task_id`、`converted_todo_task_id`、`converted_note_id` 及来源身份：只有匹配同来源 Task 回执的 `remote_committed/available` 与实际同 owner 任务，或同来源 Calendar `succeeded` 才允许完成。不能用另一条同 owner 任务/日程冒充，不能清掉关联再换 ID。该约束覆盖新 claim 的原始 UPDATE 入口；没有新活跃 claim 的旧版 Inbox 整行编辑/直接来源完成仍沿继承权限，不将本批表述为已全面收紧旧 Inbox ACL。

以上回执仍属于执行状态，沿现有技术表备份排除规则；不新增业务表/字段，不新增恢复重放。本段互斥能力依赖完整发布清单中的前四条迁移；本批发布仍需待十一条完整候选通过后，按上节顺序执行并发布相应代码。旧代码滚动窗口未具备派发前 claim，不将该窗口或历史草稿称为完整并发保障。代码回退保留新增 migration 和外部意图，不重放或删除历史回执。

## 选文组合后的预算与替代操作

选文上限不等于可直接发送的正文上限。任务正文仍最多 10000 个 UTF-16 字符，含选文、分隔和来源链接；笔记单次插入仍最多 20000 个 UTF-16 字符，含每行引用前缀、分隔和来源标注。Notes 与 PDF 都先构造实际内容，再以组合后的长度检查，不截断原文或提高预算。

超限时显示实际字符数、对应上限和缩小选区的提示，保留原选文与已经确认的来源。Notes 不展示无法提交的任务确认表单，可明确选择“仅用来源创建任务”；多行笔记引用和 PDF 摘录可明确选择仅关联原文/本页来源。只用来源属于独立的手动选择，不是静默删掉选文。桥接层区分 `too-large`、目标不可用和内容冲突，预算错误不能提示成“请打开目标笔记”。目标笔记自身的总正文上限与冲突校验继续有效。

PDF 页面首次挂载时固定工作区租约，选文另绑定真实 PDF 实例、文件 ID、sourceVersion、页码和本次渲染 generation。完整摘录与仅关联来源都在调用目标插入桥接之前核对租约及选文身份；不允许点击旧按钮时获取新 scope 来续用旧原文。工作区/Vault 清理立即撤销选文、目标、结果及渲染回调，提示“工作区已变化，请重新打开 PDF 后选择文字”；同一页面实例不能通过重新选文恢复旧授权。换文件、版本、页码或重绘会废弃选文与目标，当前 scope 下必须重新选文、选择目标，来源链接随实际新页面生成。桥接层自身的目标 owner/scope 校验继续保留。
