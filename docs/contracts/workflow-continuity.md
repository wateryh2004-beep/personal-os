# 工作流连续性契约

状态：本批实施契约。`61569c8` 精确 SQL 的真实隔离验证成立；随后默认 ACL 修复改变八条未部署 SQL，需新 Native。浏览器检查仍有失败，后续交互修复已冻结且完成独立源码/反模式复审，仍待统一候选真实重验，生产未发布。范围见 [二十项升级](../specs/continuous-workflows-v3.md)，精确证据与限制见[候选验收](../verification/2026-10-28-continuous-workflows-v3.md)。不替代各领域授权、数据、并发或性能规则。

## 生命周期与后台执行

`features/workflow-continuity/background-operations.ts`是同标签页owner-scope技术协调层，有限40条元数据；`upload | ocr | export | assistant`各自领域runner保有File、worker、stream和AbortController。shell托盘订阅同一真实执行状态，不创建第二个业务任务库。

`startBackgroundOperation({kind,label,href,run,retry?,cancellable?})`返回`id/completion/cancel`；runner收到`signal/current/report`，只报告真实bytes/pages/items或实际阶段。无法测量时无百分比。`retry`仅在领域可以核对幂等状态后登记；未知provider结果必须先reconcile，不盲目重发。已提交权威结果优先于晚到abort，停止请求不等同未执行。

切换路由/关闭显示面板不卸载已托管执行器；退出登录、owner替换、scope失效会abort并清除元数据、回调及业务运行句柄。关闭浏览器、刷新或系统挂起无法保证上传/浏览器OCR/流式AI继续。重新进入按已有session/job/run/receipt读回实际状态，原始File需重新选择；下载只标“已发起/待核对”，不能宣称磁盘保存或备份校验成功。

## 未保存草稿

`drafts.ts/useWorkflowDraft`接受有限kind、稳定领域id、resumeHref、短label、initialValue和领域parse函数；返回live value/setValue、精确clear(expectedValue)、restored及recoveryUnavailable。普通恢复载荷只在当前标签页内存，15分钟；Notes继续既有24小时session恢复/自动保存，不建平行保存器。保留既有安全恢复策略，不新增localStorage正文、DOM/FormData全表抓取或云端万能draft表。

恢复目录最多60项、单载荷400000字符，只有明确schema白名单可登记，Vault/密码/密钥/恢复答案/连接token不登记。达到预算、格式失败或TTL过期只影响离开后的恢复，**不能阻止当前输入或将挂载表单重置为旧initialValue**。界面标“本标签页·未保存”；成功仅清同一提交载荷，后续输入保留。冲突由领域baseline/revision保护，不因恢复而覆盖当前远端版本。用户丢弃只清本地草稿，和业务删除分开。

同一个挂载表单切换记录时，每次key转换生成新的实例lease；setValue、clear与commit同时核对owner scope、当前live key和lease，再读取配置、内容或baseline。A→B→A也不能让第一次A的异步回调重新生效。新实例可恢复同key的有效草稿，但旧提交不得改写它的输入或revision。

## 来时路径

`source-trail.ts`保存最多16个同scope内部来源：净化href、数值位置、有限typed view state和参考区元数据，不保存正文或DOM。使用显式`SourceLink`/`useSourceNavigation`连接真实跨域来源入口；保留Next Link修饰键、新标签、原onClick/onNavigate取消与既有脏表单保护，不全局劫持所有点击。相同pathname不同文件/过滤参数也可追踪。

返回使用现有Workbench一次性restore和中断规则，不替换原生history。旧异步capture、owner切换、下一次导航不能重路由。直接进入没有来源时沿用领域返回列表。合法query由各域明确白名单；来源定位、canonical实体身份和权限分别验证，URL不含选文正文或签名URL。

持久边界以不拦截的document capture监听观察正常同标签页、同origin anchor意图，先取消旧capture，再由Next的原onClick/onNavigate决定是否导航；监听不调用preventDefault/stopPropagation。SourceLink在之后的onNavigate建立新epoch，不被自身bubbling再次取消。修饰键、新标签、download和外站链接不取消当前标签页待完成的来源导航。程序入口沿用`personal-os:navigation-start`或壳导航意图；前置保存保护明确发送`phase:prepare`，壳命令监听不接管此阶段，监听者仍可取消，只有调用者在全部保存/冲突保护通过后提交来源导航。普通导航命令保持原语义。Back/popstate与边界卸载也取消；capture另核对原location，防未声明的地址替换后晚到回调生效。取消保存保护的原Link不会被旧capture绕过。

`navigation-intent.ts`是不依赖router、cache和业务模块的共用意图边界。笔记返回/搜索快捷键/新建后跳转、详情选择与模式切换等明确用户入口在push/replace或异步导航动作开始前声明意图；不能只等URL commit。异步复盘保存和旅行创建在用户提交时冻结lease，回复仅在lease、scope与挂载状态仍有效时导航，不把旧回复再次宣布为新意图。日历异步对账收起详情不是新的用户导航，和用户明确开关详情分开。`router.refresh()`、prefetch、后台发布通知与数据canonicalization不自动提升用户导航epoch。

## 活动区域、弹层与窄工作区

SidePanel 的可见 surface 是逻辑 open 与 Workbench active 的交集，使用标准 Radix Portal。切到另一 pane 时释放旧 surface 的 modal/pointer/拖动和手机返回层，保留原领域 open 与草稿；返回活动区可恢复。菜单也随实际 active 关闭，不能让隐藏 main 留下 body 点击锁。焦点只回到仍连接、未隐藏/非 inert 的合法来源，不从新活动区夺取输入。

同 URL 从时长选择/PDF 阅读到明确继任弹层时使用现有手机 Back entry 的显式 handoff；继任 replace 接管而不是额外 push，原 surface 清理不再竞争 Back。取消与普通关闭仍沿原返回规则。此机制不替代路由历史或绕过 dirty/提交保护。

Notes 目录按实际 pane clientWidth 与首选目录宽度加必要正文空间判断收起，不只按整窗断点。保留同一编辑器 DOM、输入、选区/滚动和目录宽度偏好，收起后仍有文件 Sheet 入口。仅原焦点被隐藏时移交入口，不夺正文光标；宽度变化不擅自关闭用户已打开的 Sheet，关闭时按同 URL 合法 launcher 恢复焦点。

## 相邻笔记写入

`note-insertion.ts/registerNoteInsertionTarget`登记当前可编辑实例的noteId、短label、main/reference role、canEdit、live insert和可选flush；unmount/inactive/scope清除。插入请求显式目标优先，否则仅当唯一reference（或唯一可编辑main）时执行；同篇双编辑器/多个候选不猜目标。

`insertIntoAdjacentNote`仅传用户明确选取的有界Markdown（最多20000字符），由目标live编辑器单事务应用并返回applied/inactive/conflict/stale。applied仅表示“已插入，待保存”，canonical autosave后才是“已保存”。来源选文flush、不可变版本、页码/sourceVersion、目标owner与权限由Notes/Files契约另核对，bridge本身不是授权凭证。

手机 PDF 所在 main 活动而参考编辑器 inactive 时，原 bridge 仍不注册或写入隐藏目标。用户可明确选择“到参考笔记确认摘录”，由单一 Workbench 内存状态暂存一条有界意图：当前合法 PDF sourceVersion/page 引用和最多20000字符的实际 Markdown，30秒内有效。先核原 reader 的 origin/generation/选文与挂载 scope，再关闭 PDF、显式激活原参考区；唯一 live reference target 注册后，用户再确认才调用同一个桥接事务，不静默插入。

意图绑定精确 note、routeKey、owner/workspace scope、导航 lease 与期限；取消、Esc、Back、目标/路由/owner变化、卸载或过期均清除，过期提示重新选取，不建持久正文缓存。合法交接后的 reader 卸载不错误撤销意图，但旧 scope 不得续租。确认同步认领，双击或旧回调不能再次插入；`applied` 仅“已插入，等待笔记自动保存”，`stale` 明确待核对并不自动重发。现有预算、inactive、冲突、owner与 sourceVersion/page 校验保持，后续浏览器/录屏验证仍需新候选证据。

## 部分采纳、重连与长按

AI所选action ID沿既有逐项审核/expiry/CAS/审计执行，未选保持proposed；notes.move仍逐篇目标与理由确认。段落采纳核对原baseline/selection，不拼坏结构；review保留用户手改字段。此功能不扩大模型输入或工具执行权。

Microsoft原地重连仍由用户在官方Microsoft页面授权，短期device cookie与refresh token不进浏览器。成功仅在服务器connected后刷新相关owner资源，不location.reload；已打开工作区和草稿保持挂载。连接成功与同步新鲜度分别表达，旧owner回调不改新数据。

长按只touch/pen主pointer的行空白处，450ms进入多选；移动超过8px、滚动、cancel、blur、Esc、unmount取消候选。控件、链接、编辑器、拖动手柄保留原行为。显式checkbox/“选择多项”菜单与Shift+Space为替代，Esc退出；不跨group混选、不绕过批量操作条数/CAS限制。
