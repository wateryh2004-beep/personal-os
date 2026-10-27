# 连续工作流二十项升级：数据库候选验收与发布计划

记录日期：2026-10-28（Asia/Shanghai）。状态：**原十条迁移的隔离验收成立；第十一条生产基线前向兼容候选未验，界面远程检查仍有失败，生产尚未发布**。范围见[二十项规格](../specs/continuous-workflows-v3.md)与[连续性契约](../contracts/workflow-continuity.md)。本记录不是全批完成声明。

## 固定对象与证据

| 对象 | 实际值与边界 |
| --- | --- |
| 数据库检查点 | [`b271ae3023a11bf3870692776983aa3a5059d858`](https://github.com/wateryh2004-beep/personal-os/commit/b271ae3023a11bf3870692776983aa3a5059d858) |
| 检查点源码树 | `f27769750cd370646c3a5c2649bf23e501322305` |
| 已推送界面候选 | [`f2009acfc3268f556d63e3506102fdefad67d9a0`](https://github.com/wateryh2004-beep/personal-os/commit/f2009acfc3268f556d63e3506102fdefad67d9a0)，tree `0005a4796bed3218909e7e682e02a6b63ee96f64`；389 条任务修改精确提交，数据库 35 路径与 `b271ae3` 相同 |
| 工作分支与 PR | `codex/continuous-workflows-v3`；[PR #93](https://github.com/wateryh2004-beep/personal-os/pull/93) 当前保持 Draft，`f2009ac` 的远程检查不满足发布门槛 |
| 原生数据库工作流 | [Continuous workflows PostgreSQL，run 40547194361](https://github.com/wateryh2004-beep/personal-os/actions/runs/40547194361)，job `122340847978`；实际 checkout 为上述 `b271ae3` |
| 实际产物 | [该次工作流产物](https://github.com/wateryh2004-beep/personal-os/actions/runs/40547194361/artifacts/12751749603)：`continuous-workflows-postgres-evidence`，479,980 bytes，ZIP SHA-256 `e456b9f7189e550e1519b842c9f13ab113f6490d937bbd7ccd1f822e0d9cebf8` |
| 同批备份工作流 | [System backup recovery，run 40547194355](https://github.com/wateryh2004-beep/personal-os/actions/runs/40547194355)，job `122340848126` |
| 备份 checkout | 合成 merge `cc39f66bd7fe9a8430d7b4caa812a60da78f9652`；独立核对 Git tree 与 `b271ae3` 完全相同，commit 比较无文件差异，不把 merge SHA 冒充 PR head |
| 生产代码与数据库基线 | 代码仍为 `a5803dda30457ec3b3b712e80b885a8552353a3d`；实际 migration ledger 为 87 条，末项 `20261026073240_workbench_policy_fk_performance`，不能等同本地完整 99 条旧基线的最终对象；本批尚未执行生产迁移或部署 |

独立验收实际下载并核对了 ZIP 摘要、生成文件、catalog、并发结果和源码哈希，结论不只来自工作流的 SUCCESS。工作流产物有保留期限；后续候选如改变本批 SQL、类型、验证脚本或相关 schema，需重新核对并记录对应提交，不能直接沿用本次结论。

## 已完成的隔离数据库检查

| 检查 | 实际结果 |
| --- | --- |
| PostgreSQL 17 干净安装与旧行升级 | 全部 109 条 migration 重放通过；十条本批新增 SQL 的哈希、全量 migration 哈希及 35 个数据库冻结路径与验收对象一致 |
| 九组 SQL fixture | owner/非 owner/匿名、关联归属、来源不可变、CAS、重放、审计失败回滚等实际执行通过 |
| 官方类型生成 | 实际使用 `supabase/postgres-meta:v0.96.4`；image ID/digest、生成文件与 catalog 摘要均在产物中记录 |
| 类型语义比较 | 独立再次运行比较器，629 项通过：本批 10 张新增表的 Row/Insert/Update、34 个 RPC，以及相关变更字段、FK 顺序、默认值、nullable、enum 与不可变触发器 |
| 真实并发 | 21 组重叠事务均实际观察到第二 writer 等待锁，再验证陈旧写入拒绝、唯一插入/审计、序号、来源互斥或旧 generation 不再生效 |
| 备份恢复与重导出 | 同源码树的当批工作流实际恢复 118 张纳入备份的表、55 条合成记录，内容和关系一致；容器已销毁，未执行生产恢复 |

10 张新增表包含业务元数据、历史版本和 `todo_creation_receipts` 技术执行回执，不能统称为 10 张业务表。类型比较的 10 表/34 RPC 范围与备份清单的 118 表是不同统计职责；技术回执继续排除备份恢复与外部重放。官方产物 `actual-database.types.ts` 与候选映射比较通过，不等于将候选映射本身改称为官方生成文件，也不表示本次覆盖了数据库全部类型接口。

实际生成文件 SHA-256 为 `062412a7c741432e0b56760a0377eb89501aecb2a9f057824d3b5eaba88cdf72`；实际 catalog SHA-256 为 `1e3dbe0162797a4918c15f4d8b00552f90bfcea27fe34003d67b1709d61dbcea`。17 项 AST/catalog 负探针中 14 项拒绝、3 项等价通过；这些探针是合成检查，与真实 PostgreSQL 生成和 catalog 证据分开。

类型生成的实际隔离产物核对了 13 项条件：本次随机、自动销毁的官方 PostgreSQL 容器；`none` 网络；无主机端口、外部数据库 URL 或调用者挂载；仅镜像自动创建的精确本地匿名数据卷。生成器自身不挂载文件，只加入该容器的隔离网络命名空间。产物不保存卷名、主机路径、环境值或签名 URL。

此前真实检查发现的 SQL 分支闭合、空字符串 UTF-16 计数、变量名歧义、合成面试题型初始化和备份简报条目引用映射等问题，均通过修复实现或合成数据后重验；原失败记录保留。没有删除拒绝断言、关闭触发器、放宽 RLS/CAS 或把未知写入判为未写入。备份证据限本次合成 SQL 数据与逻辑恢复，不证明生产物理备份、真实私有原件恢复、RPO/RTO 或自动备份调度。

## 生产基线差异与第十一条候选

`b271ae3` 的 109 条重放是本地完整 99 条旧基线加本批原十条迁移。随后只读生产元数据发现，生产 ledger 为 87 条；另外十二个旧文件未登记，却不代表其中所有对象都缺失。多个旧定义已存在或被后续合法定义替代，不能重放这十二个文件、补造历史登记，或把本地干净安装/升级 PASS 等同为实际生产前置完全一致。这次检查只读取对象、签名、约束、ACL、选定函数 hash 与授权聚合，不是完整生产 schema clone 或生产功能验收。

确切待补缺口为复盘归属 helper `review_source_is_owned(text,uuid,uuid)`，以及实际调用的三个 RPC：`complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)`、`accept_review_proposal(uuid)`、`dismiss_review_proposal(uuid)`。这些函数在生产均不存在；所需复盘/版本/来源/候选及相关 Memory/Decision 表列已存在。另一缺口是当前搜索仍依赖的 `sync_project_search_document()` 及项目投影维护触发器；授权聚合为 **1 个有效项目、0 条项目搜索投影**，未读取项目 ID 或内容。

已建立单独可审查的第十一条前向兼容候选 `20261027175718_continuous_production_baseline.sql`。独立审查提出一项 P2：旧版 `complete_review_with_sources` 写入正文、版本和来源后返回，Action 再独立插入审计且忽略错误，无法在审计失败时回滚已提交内容。实际 Action 的合成依赖复现确认了这一错误成功路径；这不是真实 PostgreSQL 执行结果。缺少同事务审计的旧 completion 定义不符合现行[安全契约](../security.md#写入版本与审计)，不能称为应原样保留的健康定义。**修复方案已确定，仍待独立复审与新的 Native 验证，未执行生产**。

第十一条将仅对匹配已知旧 completion body 指纹、配置与 ACL 的定义做前向升级；缺失时创建同一新版 body，已是新版则保留，未知用户定义拒绝迁移并保留现场。函数签名与返回兼容，目标是在同一事务中写正文、`review_versions`、`review_sources` 及脱敏的 `review_complete`/`review_amend` 审计；新版 Action 移除外层重复审计。其余三个复盘函数（含 helper）和项目同步定义、ACL、投影仍按缺失补齐并保留健康既有对象，不重放旧 `agent_runs` surface CHECK，不回退当前 `notes-library` 等合法状态，不改写原 109 条历史 SQL 或 migration ledger，不删除原项目或其它域资料。项目派生回填与维护仍须校验 owner 和有效状态，不能将聚合读数冒充完整搜索流程通过。

迁移先于代码部署的旧 `a5803dda` 窗口中，调用新 completion RPC 已有权威同事务审计，但旧 Action 可能再写额外日志；不能宣称旧客户端恰一条审计。新版移除外层写入后须验证完成/修订成功各恰一条审计，以及两类审计失败时正文、来源、版本和审计全部回滚。不通过静默去重或删除既有日志处理该窗口，也不新增规则例外或审批。

四个复盘函数的候选类型参考 `b271ae3` 官方实际生成产物；该产物来自完整本地旧基线，不能证明生产已存在这些函数。包含第十一条的新顺序仍须重新执行实际类型生成/catalog 比较、干净安装、旧行升级、生产缺口模拟、已知旧 completion 升级、已是新版保留、未知定义拒绝及其余健康对象保留场景，并补齐 RPC/RLS/ACL、原子性/审计、并发、搜索与备份检查。新审计与回滚目标尚无实际新 Native 通过结果。缺口模拟只针对 metadata 已证的缺失对象，不称完整生产库克隆。当前不预填该候选最终 SQL 哈希或任何生产版本。

## 十一条迁移与生产版本登记

下列文件仍是**未应用生产的本地候选名**。前十条的依赖顺序与上述 `b271ae3` 隔离验收对应；第十一条在其后补齐实际生产基线缺口，当前未验。前三条建立来源、领域模型与回执；第四条加入 Inbox 互斥；第五至十条补齐捕捉、练习、Scene、判断、generation 与未知结果核对。

| 顺序 | 本地候选 migration | 生产实际版本 |
| --- | --- | --- |
| 1 | `20261027004214_continuous_material_sources.sql` | 未执行 |
| 2 | `20261027004226_continuous_domain_workflows.sql` | 未执行 |
| 3 | `20261027004853_continuous_material_receipts.sql` | 未执行 |
| 4 | `20261027014745_inbox_dispatch_mutex.sql` | 未执行 |
| 5 | `20261027073649_continuous_ai_capture_intents.sql` | 未执行 |
| 6 | `20261027073905_continuous_practice_intents.sql` | 未执行 |
| 7 | `20261027095503_continuous_scene_state.sql` | 未执行 |
| 8 | `20261027100142_continuous_briefing_judgment_intents.sql` | 未执行 |
| 9 | `20261027112137_continuous_agent_run_generations.sql` | 未执行 |
| 10 | `20261027132428_continuous_life_request_reconcile.sql` | 未执行 |
| 11 | `20261027175718_continuous_production_baseline.sql` | 未执行；新前向兼容候选未验 |

发布时沿已有授权，通过已连接 Supabase MCP 逐条执行已审 SQL，并核对目标项目、前置 schema、实际版本与 RLS/ACL。MCP `apply_migration` 不接受 `version` 参数，不能把本地时间戳预填为生产已执行版本。每条执行后读取迁移列表与实际 schema；结果不明时先核对，不盲目重复应用。

登记“本地候选名 → 实际 version/name → SQL SHA-256”。如果平台分配不同时间戳，仅对齐仓库文件名、两份严格顺序清单及发布文档等元数据，SQL 原字节和哈希保持不变，再完成相应校验与必要 CI。不得改写已部署 SQL、手写迁移 history 双记账，或改用 CLI/REST 绕过生产 MCP。

## 已推送界面候选的实际检查

`f2009ac` 已精确提交并正常推送，1865 个 canonical 文件的内容摘要为 `6a262a1ad493d208e619be42baf4220971368a717ee899edb6388ff65b3669e4`，与提交 blob 清单一致。本地固定候选的七个 CLI 均通过：完整 TypeScript、447 文件/3062 测试、完整 lint 零错误/警告、system standards、项目文档、UI 提示审计和 diff/空白检查。UI 审计保留 108 条提示/547 处计数，不能写成全部视觉合规。这些结果只属于已测提交内容，不自动覆盖此后修复或第十一条迁移候选。

该候选的 13 个远程工作流均已结束：**7 成功、6 失败**，没有满足发布门槛。部分旧专项浏览器已有实际截图/录像，但新 canonical 二十项流程尚未执行，具体界限如下：

| 远程检查 | 实际结果与当前修复边界 |
| --- | --- |
| [Canonical ordinary-build 门禁](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321664) | 精确 checkout/head/tree 已核；普通构建成功，但测试专用 route 返回 307 登录跳转而应为 404。fixture build 与 5 个 suite 被跳过，二十项基础动作实际执行数为 **0**；须修拒绝路径，不放宽 404 或启用条件 |
| [文件阅读专项](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321585)与[全局界面专项](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321537) | 分别遇到 PDF locator 误选辅助 canvas、旧“取消”按钮文案选择器与实际“稍后继续”语义不一致；按真实渲染对象和续写行为修测试，保留页码、重开、输入与焦点断言 |
| [OCR 专项](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321695) | 真实中英图片/扫描 PDF 识别通过，但关闭 dialog 后残留 2 个 worker、预期 0；正在修关闭/重开清理边界，不能仅延长等待掩盖 |
| [视觉与动效专项](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321573) | editorial/planning/shell 子项成功；file preview 在 360×600 的入口中间帧 bottom 为 624、落定 600，违反完整轨迹边界。正在修短屏几何，不能只以最终截图判断通过 |
| [Verify](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321555) | 实际 447 文件/3062 测试、Next build、部分协议/闭包/地图检查通过；投资 preview 因 Vite 无法解析 `server-only` 边界出现错误 overlay，后续主步骤被跳过。保留生产 server-only 保护，修隔离 preview 边界 |

独立审阅已下载并核对本次相关合成媒体与摘要。旧 Workbench 等专项实际 checkout 为合成 merge `09fd654e681064b623d0becaa29aeab205df78da`，不能把 artifact 的 PR head 标签直接当作真实 checkout。桌面 Workbench 截图命中交换/resize 运动窗口，不能据此宣称持久终态遮挡；源 owner 正补动画结束后的 DOM bounds、命中与中间帧诊断。上传步骤成功、某张 PNG 或脚本存在均不能代替相应执行断言。以上修复仍待新候选实际重验，原失败日志与媒体保留。

## 二十项界面与发布待办

20 项基础驱动已落；以下表格是最终完整候选仍需结算的证据，不把本次 canonical 执行数 0 改写成二十项已通过。已有单元/组件、原十条数据库或旧专项浏览器结果分别引用其真实范围。

| # | 体验主题 | 最终候选仍需记录的界面证据 |
| --- | --- | --- |
| 1 | 真实后台托盘 | 上传/OCR/导出/AI 跨路由、取消及失败项重试 |
| 2 | 未完成输入恢复 | 实际恢复焦点、保存期间续写、scope/卸载撤权与冲突 |
| 3 | Inbox 连续整理 | 三条连续去向、终态后推进、回看与未知结果核对 |
| 4 | 来时路径 | 原过滤、选择、滚动、PDF/笔记位置及返回中断 |
| 5 | 今日容量 | 实际容量展示、未知估时与覆盖失败状态 |
| 6 | 空档排程 | 键盘/触摸、预览取消、重复确认与晚到状态 |
| 7 | 笔记选段操作 | 真实选区、输入法合成事件边界、引用/任务与来源回跳 |
| 8 | PDF 摘录 | 中英/旋转/无文字页、文字层对齐、相邻引用和页码返回 |
| 9 | Markdown 块操作 | 完整块键盘/指针移动、拖动中断及 undo 字节还原 |
| 10 | 上传前整理 | 确认前零写、原名/显示名、查重、独立副本及部分失败 |
| 11 | 项目下一步 | 真实任务关联、保存期间续写与版本冲突 |
| 12 | 材料核对 | 人工核验、仅改备注、来源修订变化和不可用提示 |
| 13 | 同题续练 | 原历史展开、父项范围、独立新记录与缺失父项 |
| 14 | 复盘证据 | 所选来源插入、原手写内容、过滤/选择与返回位置 |
| 15 | 简报事件 | 原文版本对照、判断历史与未知保存核对 |
| 16 | 投资解释 | 同一计算快照、原账簿定位、decimal/void/unknown 边界 |
| 17 | 购后资料 | 实际 DATE、私有票据、保存/撤销及来源往返 |
| 18 | 旅行现场 | 地图/时间线、按日、重排取消、相机与返回历史 |
| 19 | 闲暇时长 | 已知剩余、自定空闲、未知/零进度与来源返回 |
| 20 | AI 与快捷交互 | 子集采纳、冲突、重连前后输入焦点及长按取消/键盘替代 |

浏览器记录应区分 360/390/768/1440px、200% 文字、减少动态效果、forced colors、键盘/触摸及正常/失败/中断路径，保留完整录屏和实际 checkout SHA。现有 Microsoft 原地重连组件合成边界检查不等于真实 OAuth 浏览器授权；仅断网再联网也不能据此宣称 OAuth 重连已验。DOM composition 事件不冒充操作系统输入法实测。扩展分支需逐项注明使用本候选的单元、组件、数据库或浏览器证据，未执行的仍列未验证。

| 交付阶段 | 本记录状态 |
| --- | --- |
| 原十条数据库隔离门槛 | `b271ae3` 源码树通过，109/629/21 与 118 表55行的证据范围如上 |
| 第十一条前向兼容候选 | 独立审查发现 completion 审计原子性 P2，修复待复审与新 Native；不得用原完整 99 条本地旧基线代替实际生产 87 条 ledger 的前置核对 |
| 已推送 UI 候选与本地全仓检查 | `f2009ac` 七 CLI、447 文件/3062 测试通过；后续修改仍需对应冻结与检查 |
| 完整浏览器、截图与动效录屏 | `f2009ac` 远程 7 成功/6 失败；canonical 5 suite 跳过、二十项动作执行 0，旧专项媒体不能代替完整验收 |
| 生产迁移 | 未执行；待完整十一条候选通过后按顺序登记实际版本 |
| GitHub 合并与代码部署 | 未完成；记录实际 merge SHA、部署及域名对应关系 |
| 生产验证 | 未执行；匿名协议、版本、数据权限和可自动完成的受保护流程分别记录，不要求所有者手动测试 |

## 回退边界

Schema 以扩展为主，但新 Scene JSON 格式并非任意旧代码都能解析。当前最早已登记的兼容 reader 检查点为 [`93f88f9f127717cca3f8a6895b515ffd0b381357`](https://github.com/wateryh2004-beep/personal-os/commit/93f88f9f127717cca3f8a6895b515ffd0b381357)；生产基线 `a5803dda` 不能作为读取本批新 Scene 的兼容回退候选。实际回退部署仍需核对该候选构建、配置与运行状态，不把代码检查点当作已经就绪的生产回退部署。

回退保留新版本、原件、引用、购后资料、审计和 provider 意图，不通过 down migration 或删除真实资料恢复旧界面；不重发未知外部操作。浏览器关闭后的后台任务仍可能中断，不能把托管托盘称为跨浏览器持久执行服务。遵循[运行手册](../release-operations.md)与[系统备份](../system-backup.md)，本记录不建立额外审批、备份承诺或规则例外。
