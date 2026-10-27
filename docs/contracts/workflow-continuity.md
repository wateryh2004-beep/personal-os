# 工作流连续性契约

状态：本批实施契约。范围与验收见 [二十项升级](../specs/continuous-workflows-v3.md)。不替代各领域授权、数据、并发或性能规则。

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

持久边界以不拦截的document capture监听观察正常同标签页、同origin anchor意图，先取消旧capture，再由Next的原onClick/onNavigate决定是否导航；监听不调用preventDefault/stopPropagation。SourceLink在之后的onNavigate建立新epoch，不被自身bubbling再次取消。修饰键、新标签、download和外站链接不取消当前标签页待完成的来源导航。程序入口沿用`personal-os:navigation-start`或壳导航意图，Back/popstate与边界卸载也取消；capture另核对原location，防未声明的地址替换后晚到回调生效。取消保存保护的原Link不会被旧capture绕过。

`navigation-intent.ts`是不依赖router、cache和业务模块的共用意图边界。笔记返回/搜索快捷键/新建后跳转、详情选择与模式切换等明确用户入口在push/replace或异步导航动作开始前声明意图；不能只等URL commit。异步复盘保存和旅行创建在用户提交时冻结lease，回复仅在lease、scope与挂载状态仍有效时导航，不把旧回复再次宣布为新意图。日历异步对账收起详情不是新的用户导航，和用户明确开关详情分开。`router.refresh()`、prefetch、后台发布通知与数据canonicalization不自动提升用户导航epoch。

## 相邻笔记写入

`note-insertion.ts/registerNoteInsertionTarget`登记当前可编辑实例的noteId、短label、main/reference role、canEdit、live insert和可选flush；unmount/inactive/scope清除。插入请求显式目标优先，否则仅当唯一reference（或唯一可编辑main）时执行；同篇双编辑器/多个候选不猜目标。

`insertIntoAdjacentNote`仅传用户明确选取的有界Markdown（最多20000字符），由目标live编辑器单事务应用并返回applied/inactive/conflict/stale。applied仅表示“已插入，待保存”，canonical autosave后才是“已保存”。来源选文flush、不可变版本、页码/sourceVersion、目标owner与权限由Notes/Files契约另核对，bridge本身不是授权凭证。

## 部分采纳、重连与长按

AI所选action ID沿既有逐项审核/expiry/CAS/审计执行，未选保持proposed；notes.move仍逐篇目标与理由确认。段落采纳核对原baseline/selection，不拼坏结构；review保留用户手改字段。此功能不扩大模型输入或工具执行权。

Microsoft原地重连仍由用户在官方Microsoft页面授权，短期device cookie与refresh token不进浏览器。成功仅在服务器connected后刷新相关owner资源，不location.reload；已打开工作区和草稿保持挂载。连接成功与同步新鲜度分别表达，旧owner回调不改新数据。

长按只touch/pen主pointer的行空白处，450ms进入多选；移动超过8px、滚动、cancel、blur、Esc、unmount取消候选。控件、链接、编辑器、拖动手柄保留原行为。显式checkbox/“选择多项”菜单与Shift+Space为替代，Esc退出；不跨group混选、不绕过批量操作条数/CAS限制。
