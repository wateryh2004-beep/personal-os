# 连续工作流二十项升级：数据库候选验收与发布计划

记录日期：2026-10-28（Asia/Shanghai）。状态：**`61569c8` 精确 SQL 的真实隔离验收与独立复核成立；随后八条未部署 SQL 默认 ACL 与界面修复已形成新候选，尚待稳定全仓、新 Native 和真实浏览器验证。生产尚未迁移或部署**。范围见[二十项规格](../specs/continuous-workflows-v3.md)与[连续性契约](../contracts/workflow-continuity.md)。本记录不是全批完成声明。

## 已提交615候选的固定对象与证据

| 对象 | 实际值与边界 |
| --- | --- |
| 已推送候选 | [`61569c892097349233d7c7834ceb12b754bfbd1e`](https://github.com/wateryh2004-beep/personal-os/commit/61569c892097349233d7c7834ceb12b754bfbd1e)，tree `e0dc9a386cb17680df80b1c5b9ba65bd7fd7a97c` |
| 提交内容 | 1879 个 canonical 文件逐 blob 与本地验证清单一致；内容摘要 `700827ca1981edf49bb9f2984832dc3bd65da9252cf0bb7fcb01bea0370ff465`，提交后工作树干净；此后修复不由该结论自动覆盖 |
| 工作分支与 PR | `codex/continuous-workflows-v3`；[PR #93](https://github.com/wateryh2004-beep/personal-os/pull/93) 保持 Draft，界面检查未达到发布门槛 |
| 原生数据库工作流 | [Continuous workflows PostgreSQL，run 40563600833](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600833)，job `122398856931`；实际 checkout 为上述 `61569c8`，事件合成 merge 为 `8c8de8f6d0b65b9335192976dc07cf8db3c992eb`，两者分别记录 |
| 数据库产物 | [artifact 12762490425](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600833/artifacts/12762490425)，ZIP SHA-256 `451e0b661fee9b0d2dd9c33bb0c99091f70c6127769138c36c89fbddc809b88b`；该次全部 110 条迁移与 46 个数据库冻结路径和615提交、生成记录均零哈希漂移；后续8条 SQL 的新哈希不在此结论内 |
| 同批备份工作流 | [System backup recovery，run 40563600860](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600860)，job `122398856856`；实际 checkout 为合成 merge `8c8de8f6d0b65b9335192976dc07cf8db3c992eb`，不把它冒称 PR head |
| 生产代码与数据库基线 | 代码仍为 `a5803dda30457ec3b3b712e80b885a8552353a3d`；实际 migration ledger 87 条，末项 `20261026073240_workbench_policy_fk_performance`；本批十一条迁移及代码部署均未执行 |

独立验收实际下载并核对 ZIP 摘要、逐 entry 文件、生成文件、catalog、并发实现/结果和源码哈希，结论不只来自工作流 SUCCESS。后续 SQL、类型、验证脚本或相关 schema 如改变，必须记录新候选的实际对应证据，不能直接沿用本次结论。独立复核记录为 `review-615-native-semantic.md/json`；工作流产物有保留期限。

## 615之后的未提交修复候选

只读生产 `pg_default_acl` 元数据进一步证实，public 新表默认授予 anon/authenticated/service_role 全部 `arwdDxtm` 表权限、函数 EXECUTE。615 Native 的原 bootstrap 默认比生产窄，因此它的通过不证明该默认环境下的有效最小权限。没有为排障改生产默认，也不把这一差异写成规则例外。

已冻结 `repair-615-default-acl` 的13个归属路径、49个数据库冻结路径：第1/2/3/4/5/6/8/9条未部署 SQL 仅在已有 REVOKE 名单的36处加入 service_role，反向替换可逐字恢复615；函数正文、RLS、约束、并发和审计逻辑不变，旧99条与第7/10/11条保持字节。service-only 回执/准备/取消 RPC 和明确共享 Scene helper 的正向授权保留。`todo_creation_receipts` 的 service 仅 SELECT/INSERT/UPDATE，`briefing_judgment_versions` 不给 service 直接表权限，owner RPC/内部 helper 不继承无关默认 EXECUTE；实际调用方已核 owner/admin 边界。

新 Native 接线保留原 clean/upgrade、baseline缺口/已知旧升级/幂等/未知指纹拒绝、官方类型、24真实并发与审计回滚。在原容器销毁后，单独创建同样隔离的官方 PG17 容器，使用既有白名单 `restored_fixture`：完整旧99条及合成行 → 安装元数据已观察到的创建默认 → 真 probe 硬证全部授权 → 原十一顺序与九组 fixture → 再执行Review/Project缺口及原子审计。三场景核10新表×3角色×8权限=240项，以及55函数ACL、PUBLIC显式授权、RLS/FORCE RLS、既有三个Scene函数ACL保持和10条真实角色拒绝。拒绝使用合成已登录sub，不能以函数体未登录错误冒充EXECUTE拒绝。此为创建默认模拟，不是完整生产克隆，未更改固定数据库/容器隔离守卫、全局bootstrap或旧99迁移。

上述新增 Native **尚未实际执行**。作者11项 Python 验证器单测（8新3旧）、8文件/40 Vitest、编译与workflow解析等局部检查通过；独立审查 `review-615-default-acl` 已完成，49路径前后哈希匹配，11项Python、7个额外synthetic负探针及4文件/11 Vitest通过，未发现阻断进入新Native的源码问题。这些纯验证器/组件/静态结果均不冒称Native。成功产物必须来自新精确提交，不能引用615旧110哈希替代。第11 SQL SHA仍为下文记录值。

界面三组修复已冻结：forms v2的12路径、Settings/Career的5路径、Source/空间/PDF/Notes的25路径。前两组及前一五文档共22路径曾通过独立复审 `review-615-browser-repairs-v2`，仅证明对应冻结内容；本次文档再同步需按新哈希核对。空间组已完成独立源码/反模式/React复审 `review-615-spatial-final`：25路径前后哈希一致，独立12文件/154测试、23路径lint、2 CSS解析和4 CJS语法检查通过，仅允许进入统一候选远程重验。完整候选CLI、修复后真实浏览器/截图/录屏尚未执行，不把作者 typecheck/定向测试当稳定全仓或新浏览器通过。

## 已完成的隔离数据库检查

以下仅属于已提交 `61569c8` 的精确迁移与runner；不自动覆盖上一节新ACL候选。

| 检查 | `61569c8` 的实际结果 |
| --- | --- |
| PostgreSQL 17 干净安装与旧行升级 | 110 条迁移重放通过；旧行升级从完整本地 99 条旧基线加合成行开始，再依序执行本批十一条 |
| 九组 SQL fixture 与 Scene matrix | owner/非 owner/匿名、关联归属、来源不可变、CAS、重放与审计失败回滚等实际执行通过 |
| 第十一条兼容控制 | 两个隔离数据库分别验证已知旧 completion 的精确 body/config/ACL 升级、新 body 再执行幂等、未知 body/search_path/匿名 ACL 改动均以精确 `55000` 拒绝；其余函数、trigger、owner/ACL/config 与项目投影保持 |
| 生产缺口模拟 | 真正移除四个 Review 函数及项目投影函数/trigger，再应用实际第十一条，核对补齐与回填；原项目、工作流版本及非项目投影保持，不称完整生产克隆 |
| 官方类型与 catalog | 实际 `supabase/postgres-meta:v0.96.4` 生成，image ID/digest 与运行来源可追溯；候选映射的 633 字段、38 RPC 比较通过（含四个复盘函数） |
| 真实并发 | 24 组重叠均通过独立 psql session 实际观察第二 writer 等待锁后放行；新增 accept/accept、dismiss/dismiss、completion 同 owner/key 版本递增，保留原 21 组 |
| 审计与原子性 | 完成/修订审计失败及版本失败，实际比较 review/version/source/audit 全部 JSON 指纹确认回滚；完成/修订内容、版本、来源及脱敏审计在同一事务 |
| 同批备份恢复与重导出 | 118 张纳入备份的表、55 条合成记录，计数、内容和关系一致；隔离容器已销毁，未执行生产恢复 |

本批 10 张新增表包括业务元数据、历史版本和 `todo_creation_receipts` 技术执行回执，不能统称业务表。技术回执继续排除备份恢复与外部重放。类型门禁的覆盖范围与备份清单的 118 表是不同统计职责，不表示覆盖数据库全部类型接口。

实际生成文件 SHA-256 为 `062412a7c741432e0b56760a0377eb89501aecb2a9f057824d3b5eaba88cdf72`；实际 catalog SHA-256 为 `6a1117c10e64d365e2e737638d6a7483926e21ff676c06cad91621325db8d62d`。候选映射比较通过不等于将手写映射改称官方生成文件。23 项 AST/catalog 探针为 **20 项预期拒绝、3 项合法通过**，明确为 synthetic，不冒称 23 项 Native 执行。

实际类型生成隔离为随机、自动销毁的官方 PostgreSQL 17 容器，`none` 网络、无主机端口/外部数据库 URL/调用者挂载；唯一数据卷是官方镜像自动创建并自动销毁的精确匿名卷。生成器不挂载文件，只加入该隔离网络命名空间。未放宽为任意 mount，产物不保存卷名、主机路径、环境值或签名 URL。

这些是合成 SQL 数据与逻辑恢复的证据，不证明生产物理备份、真实私有原件恢复、RPO/RTO 或自动备份调度。生产 87 条 ledger 的对象状态仍须发布前新鲜核对。

## 生产基线差异与第十一条候选

生产 ledger 为 87 条，本地旧基线为 99 条；十二个旧文件未登记不代表其对象都缺失。多个旧定义已存在或被后续合法定义替代，不能重放这十二个文件、补造历史登记，或把干净安装/旧行升级 PASS 等同实际生产前置完全一致。只读预检仅涉及对象、签名、约束、ACL、选定函数 hash 与授权聚合，没有取得完整生产 schema/data clone。

确切缺口为 helper `review_source_is_owned(text,uuid,uuid)` 和实际调用的三个 RPC：`complete_review_with_sources(text,text,text,date,date,text,jsonb,boolean,jsonb)`、`accept_review_proposal(uuid)`、`dismiss_review_proposal(uuid)`。它们在所查生产基线均不存在，所需表列已存在。另一缺口是 `sync_project_search_document()` 及其投影维护 trigger；授权聚合为 **1 个有效项目、0 条项目搜索投影**，没有读取项目 ID 或内容。

第十一条 `20261027175718_continuous_production_baseline.sql` 的已验 SQL SHA-256 为 `3277cdf414d1dfb7d064fd03ee6c961fd92c86d97af9245747612f537b3f94c2`，加入第11条的615提交中原109条SQL字节未变；当前默认ACL候选另改八条未部署SQL，旧99条保持。原独立审查发现 P2：旧 completion 返回后 Action 独立写审计并忽略错误，无法在审计失败时回滚业务写入，违反[安全契约](../security.md#写入版本与审计)。修复及独立复审已完成，并由本次真实 Native 证明，不再沿用最初仅合成依赖的复现作为最终证据。

迁移仅前向升级精确已知旧 completion body MD5 `72426d437364e96e3596d8c9c0424215`、`public` search_path 与预期 ACL 的组合；新版 body MD5 `01d9d71c10f6e5eaae96beed1dd9f685`、空 search_path 再执行保持不变，未知 body/config/ACL 拒绝。缺失时创建相同新版。新版先取得 owner/review_key 事务锁，再在同事务写正文、不可变版本、来源及 `review_complete`/`review_amend` 审计，Action 移除外层重复写入。其余三个复盘函数（含 helper）和项目同步定义、ACL、投影按缺失补齐并保留健康既有对象，不重放旧 `agent_runs` surface CHECK、不回退 `notes-library` 等合法状态、不改生产 history 或删除资料。

迁移先于代码部署的旧 `a5803dda` 窗口中，新 completion RPC 的权威审计已在事务内，但旧 Action 仍可能额外追加日志；不能宣称旧客户端恰一条审计，不静默去重或删除日志。新 Action 的完成/修订各一次审计、失败全回滚已在隔离候选验证；生产仍须相应核对。缺口模拟只针对 metadata 已证对象，不称完整生产克隆，也不证明生产已存在这些函数。

## 十一条迁移与生产版本登记

以下仍是**未应用生产的本地候选名**。同名十一条的615精确旧字节已隔离执行；当前八条ACL修复后的新字节尚待新Native，不能按文件名相同继承通过。生产均未执行；前三条建立来源、领域模型与回执，第四条加入 Inbox 互斥，第五至十条补齐捕捉、练习、Scene、判断、generation 与未知结果核对，最后补生产基线缺口及审计原子性。

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
| 11 | `20261027175718_continuous_production_baseline.sql` | 未执行 |

发布时沿已有授权，通过已连接 Supabase MCP 逐条执行已审 SQL，并核对目标项目、前置 schema、实际版本及 RLS/ACL。`apply_migration` 不接受 `version` 参数，不能预填生产版本；每条执行后读回列表与 schema，结果不明先核对，不盲目重复应用。

登记“本地候选名 → 实际 version/name → SQL SHA-256”。平台时间戳不同只对齐仓库文件名、两份严格顺序清单与发布文档等元数据，SQL 原字节/哈希保持不变，再完成校验及必要 CI。不改写已部署 SQL、不手写 history 双记账，不改用 CLI/REST 绕过生产 MCP。

## 已推送候选的本地与远程界面检查

`61569c8` 的本地固定内容七 CLI 全部通过：完整 TypeScript、**452 文件/3092 测试**、完整 lint 零错误/警告、system standards、项目文档、UI 提示审计与 diff/空白检查；额外 Python 3 项边界检查是合成检查。完整 suite 后显式冻结 1448 个编译 root（包含 work/test-results 中实际生成类型）并顺序复查 TypeScript/lint，前后无漂移。UI 审计保留 108 条提示/547 处计数，不能写成全视觉合规。随后 UI 修复须再冻结和验证。

13 个远程工作流全部结束，**9 成功、4 失败**。Canonical 实际 checkout 为 `61569c8`；旧专项 UI 工作流实际 checkout 为合成 merge `8c8de8f6d0b65b9335192976dc07cf8db3c992eb`，不能只按 artifact 的 PR head 标签命名实际 checkout。

| 远程检查 | 实际结果与未通过边界 |
| --- | --- |
| [Canonical，run 40563600872](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600872) | ordinary Next 构建、严格 404 拒绝门禁和 fixture 构建通过；5 suite 各 7 配置共 35 配置实际执行，均因流程中的失败结束。55 条已尝试 case 记录中 20 PASS/35 FAIL，仅编号 05/06/07/14 有至少一次完整动作及 capture 成功。**20 是重复配置成功记录数，绝不是二十项功能通过**，后续未执行项不推定通过 |
| Canonical 首失败 | runtime 上传 input 不唯一；domains 原文匹配不唯一及 390px/200% Review 宽 406px；sources 无来时路径；materials 参考区/来源点击被遮挡；planning 手机未知时长预览被关闭、桌面 Project label 未关联；materials/planning 的 normal 字体基线也被放大。保留原始 trace、媒体和失败断言 |
| [Verify，run 40563600734](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600734) | 452 文件/3092 测试、Next 构建、投资及 Notes startup/editor/drawer/motion/200%/forced 实际通过；Settings 的“存储空间”heading 不可见而失败，后续 Today/mobile 步骤跳过 |
| [Workbench browser，run 40563601139](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563601139) | 768px/both 的真实运动帧 main.left 185.28125 小于 nav.right 216；焦点与命中可用不能抵消几何侵入，不能只等落定截图掩盖 |
| [Visual motion，run 40563600740](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600740) | editorial/planning/shell 通过；file preview 的 360/390/768 正常、reduced、forced 共 9 配置轨迹通过，但 1440×900 正常中断采样在观察 running 后下一次采样已不 moving，真实 Escape 中断验收未过，不能直接称纯 flaky |
| [Document continuity，run 40563600742](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600742) | 三 job 实际通过，含实际 PDF、multipart 和 SQL |
| [Private OCR，run 40563600904](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600904) | 两 job 实际通过；关闭显示后同 operation 继续、重开与真实 Stop 按原 300ms worker 关闭门槛执行，不再把关闭面板等同取消后台任务 |
| [System standards，run 40563600741](https://github.com/wateryh2004-beep/personal-os/actions/runs/40563600741) | 实际通过，含 Project“稍后继续”、焦点、Escape、动效与 runtime closure |

独立 QA 已下载并核对原始 artifact 摘要，实际查看代表 PNG、用 ffprobe 核连续 webm 并抽帧查看，未篡改媒体。原始证据与逐配置 ledger 位于 `remote-ui-candidate-61569c892097349233d7c7834ceb12b754bfbd1e.md/json` 及其 `remote-ui-615` 目录；不能因存在媒体就称后续动作执行完成。

后续作者局部记录与独立审查分开：`repair-615-canonical-forms-v2` 保留原12路径，补Review coverage/summary/state/AI来源的显式相对1.6行高及同名dialog实例的Back交接回归；v1的10文件/84测试与v2的8文件/61测试不相加冒称总量。真实生产组件加当前Tailwind/PostCSS编译核对五段落，属于分支/声明证据，不是浏览器computed layout。`repair-615-settings` 的5路径局部2文件/13测试与无listen Vite模块图通过，仅替身Server Function I/O，保留生产server-only。严格字体2倍、computed行高至少1.4倍与overflow断言保留。对应17代码/测试/驱动路径及前一五文档共22路径独立复审通过，仅限当时冻结哈希。

`repair-615-spatial` 冻结25路径，作者局部17文件/239测试、typecheck/归属lint/CSS解析/CJS检查通过；独立源码/反模式/React复审另以12文件/154测试及归属静态检查通过，25路径前后哈希一致，两组测试不相加冒称全仓。实现包括：保存保护事件以prepare阶段避开壳提前提交；标准Portal与active surface释放隐藏菜单/Inspector锁而保留草稿；窗口resize同步结算壳几何但保留用户折叠动效；真实trusted Escape capture核中断而不延长duration或等待；手机PDF显式移交一条30秒、有源版本/页码/精确参考目标的意图，激活唯一live reference后再次确认走原bridge，inactive guard保持；Notes按实际pane宽收目录、保留同一editor/输入/选区/偏好及Sheet入口焦点。原报告保留几何根因/关闭仍待新远程证据的限制，不将本地诊断直接称浏览器已修好。

canonical驱动仍实际关闭/恢复Inspector、编辑同一参考实例、点击真实来源链接，手机确认前零写/确认后等canonical保存并核sourceVersion/page与返回，768检查窄pane目录入口；没有force click、盲first、放宽边界或增加超时。三组实现仍须新精确提交的稳定全仓与实际浏览器矩阵、完整截图/录屏验证。

## 历史检查点与原失败保留

- 原十条数据库检查点 [`b271ae3023a11bf3870692776983aa3a5059d858`](https://github.com/wateryh2004-beep/personal-os/commit/b271ae3023a11bf3870692776983aa3a5059d858)，tree `f27769750cd370646c3a5c2649bf23e501322305`：[Native run 40547194361](https://github.com/wateryh2004-beep/personal-os/actions/runs/40547194361)，job `122340847978`、artifact `12751749603`，ZIP SHA `e456b9f7189e550e1519b842c9f13ab113f6490d937bbd7ccd1f822e0d9cebf8`，实际 109 迁移、629 字段、34 RPC、21 组并发；17 探针/14 拒绝/3 合法是合成层。该时点 catalog SHA `1e3dbe0162797a4918c15f4d8b00552f90bfcea27fe34003d67b1709d61dbcea` 与当前 catalog 不同，不能混用。此前 SQL 分支闭合、UTF-16 空计数、变量歧义、题型 fixture 与备份引用映射错误均保留原失败后修复重验。
- [原备份 run 40547194355](https://github.com/wateryh2004-beep/personal-os/actions/runs/40547194355)，job `122340848126` 的 checkout 为 merge `cc39f66bd7fe9a8430d7b4caa812a60da78f9652`，当时独立核对 tree 与 `b271ae3` 一致，118 表/55 行内容关系相同；不是生产恢复。
- 前一 UI 候选 [`f2009acfc3268f556d63e3506102fdefad67d9a0`](https://github.com/wateryh2004-beep/personal-os/commit/f2009acfc3268f556d63e3506102fdefad67d9a0)，tree `0005a4796bed3218909e7e682e02a6b63ee96f64`，1865 文件内容摘要 `6a262a1ad493d208e619be42baf4220971368a717ee899edb6388ff65b3669e4`。本地七 CLI、447 文件/3062 测试通过；远程 7 成功/6 失败。[Canonical run 40554321664](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321664) 的专用 route 307 而应 404，导致 fixture/五 suite 跳过，二十项基础动作实际 0；615 已实际通过该门禁，不能改写旧失败为通过。
- f200 的[Document run 40554321585](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321585) PDF canvas locator、[System standards run 40554321537](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321537) 旧关闭按钮语义、[OCR run 40554321695](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321695) 关闭 UI/后台任务边界、[Visual run 40554321573](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321573) 360×600 中间帧 bottom 624、[Verify run 40554321555](https://github.com/wateryh2004-beep/personal-os/actions/runs/40554321555) 投资 preview server-only 解析失败的日志与媒体保留。旧 UI 实际 checkout 是 merge `09fd654e681064b623d0becaa29aeab205df78da`；运动窗口截图不能独自证明持久终态遮挡。

## 二十项界面与发布待办

20 项基础驱动已落；以下表格仍需按最终统一候选结算，不把 615 的 20 条重复配置成功记录改写为二十项功能通过。已有单元、组件、数据库与专项浏览器分别按其真实范围引用。

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

浏览器记录应区分 360/390/768/1440px、200% 文字、减少动态效果、forced colors、键盘/触摸与正常/失败/中断路径，保留完整录屏及实际 checkout SHA。Microsoft 原地重连的合成组件检查不等于真实 OAuth 浏览器授权；断网再联网也不能称 OAuth 重连已验。DOM composition 事件不冒充操作系统输入法实测；390px viewport 不冒充物理手机。扩展分支逐项注明本候选单元、组件、数据库或浏览器证据，未执行的列未验证。

| 交付阶段 | 本记录状态 |
| --- | --- |
| 历史数据库隔离门槛 | `61569c8` 精确 SQL 的真实 PG17/独立复核通过，110迁移/633字段/38RPC/24并发；合成备份118表/55行，不覆盖当前八SQL新哈希 |
| 新默认ACL候选 | 13归属/49DB路径已冻结，作者与独立源码/验证器审查通过；新Native、生产默认场景和原全部门槛尚未实际执行 |
| 生产前置 | 87 条 ledger 与完整本地 99 旧基线不等价，仍须发布前新鲜 schema/fingerprint 核对；缺口场景不是生产克隆 |
| 已推送候选的本地全仓 | `61569c8` 七CLI、452文件/3092测试通过；当前Source/forms/Settings/ACL与文档新组合尚无稳定全仓结果 |
| 完整浏览器、截图与动效录屏 | `61569c8` 远程 9 成功/4 失败；canonical 35 配置均未完整成功，后续修复仍待真实重验 |
| 生产迁移 | 十一条均未执行，待完整候选通过后按顺序登记实际版本 |
| GitHub 合并与代码部署 | 未完成，后续记录实际 merge SHA、部署及域名对应关系 |
| 生产验证 | 未执行；匿名协议、版本、数据权限和可自动完成的受保护流程分别记录，不要求所有者手动测试 |

## 回退边界

Schema 以扩展为主，但新 Scene JSON 并非任意旧代码都能解析。最早已登记的兼容 reader 检查点为 [`93f88f9f127717cca3f8a6895b515ffd0b381357`](https://github.com/wateryh2004-beep/personal-os/commit/93f88f9f127717cca3f8a6895b515ffd0b381357)；生产基线 `a5803dda` 不能作为读取本批新 Scene 的兼容回退候选。实际回退部署仍须核对构建、配置与运行状态，不把代码检查点当作已就绪生产回退部署。

回退保留版本、原件、引用、购后资料、审计和 provider 意图，不通过 down migration 或删除真实资料恢复旧界面，不重发未知外部操作。浏览器关闭后后台任务仍可能中断，不能将托盘称为跨浏览器持久执行服务。遵循[运行手册](../release-operations.md)与[系统备份](../system-backup.md)，本记录不建立额外审批、备份承诺或规则例外。
