# Agent 合规修复与验收 · 2026-10-24

状态：11 项已实现并完成下列本地/隔离验证；未合并、未发布，生产尚未应用迁移。此记录不把本地检查写成生产通过。

基线为 `13521638d18cd7890f4d680414a8c9fdf0f0f922`，修复分支 `codex/agent-compliance-fixes`。原始问题、当时生产提交与规则依据见 [审查报告](2026-10-24-agent-compliance-audit.md)。保留原始审查结果，不降低安全、数据、AI 或质量规范。

## 11 项交付映射

| 项目 | 最终实现 | 实际验证 |
| --- | --- | --- |
| F01 / P1 隐私过滤 | 组织概览的所有笔记查询仅返回 normal、human 内容；关联图送入模型前也应用统一过滤 | 实际工具执行测试覆盖 normal / sensitive / never / AI-generated，禁止标题不出现在结果 |
| F02 / P1 记忆同意 | 初始工具集按 opt-in 选择；专用记忆工具、跨域搜索、上下文工具及公共执行包装器再次检查开关 | 关闭时实际工具不查询 memories/decisions；开启后嵌套返回的真实来源可追踪 |
| F03 / P1 历史恢复 | `mutate_note_atomic` 事务内锁定笔记、校验 expected revision、写入恢复前快照和恢复后的新版本，再记录活动/审计 | 真实 PostgreSQL 多连接 CAS/恢复竞争；隔离数据库验证 stale revision 拒绝、双方正文留存；Server Action 传递用户看到的 revision |
| F04 统一 AI 治理 | Today、Inbox、Briefing 的每次 SDK 调用进入统一额度预留/输出限制/调用审计；保留各模块更细的限制 | 治理执行器行为测试、真实 Today 调用边界测试、全量调用点核对；无真实模型付费调用 |
| F05 失败关闭/并发预算 | 统计错误拒绝；服务端 `reserve_ai_request` 在用户级事务锁下检查并预留；无完整用量的失败/取消保留估算预留 | 故障注入测试；真实 PostgreSQL 12 连接争夺 1 个额度只允许 1 次；零费用上限仍阻断 |
| F06 累计上下文 | 初始背景包以实际序列化长度缩减；整个请求的读取工具共享剩余额度，超限结果不交给模型；当前正文保持独立 | 两次真实读工具累计超限测试；直接编辑正文不被该检索预算截断；最终审计记录累计检索字符 |
| F07 来源退出授权 | citation ID 与 entity ID 分离；收集单篇/单文件/嵌套记忆来源；即时、历史、Notes 面板使用共享控件；禁止与审计同事务 | UI 行为测试、UUID 传输测试；390/1440 浏览器键盘、失败重试、成功禁用、横向溢出检查；数据库 owner 检查 |
| F08 冻结提案 | 数据库生成载荷/预览 hash，触发器拒绝内容改写；撤销 authenticated UPDATE；确认绑定 hash，service-only 状态 RPC 校验 owner、状态和到期 | 角色/ACL/触发器实测；错误 hash 与跨 owner 拒绝；8 连接确认仅 1 次取到执行权；客户端不能伪造 succeeded |
| F09 原子内容与真实结果 | 普通笔记、文件夹内笔记、日记新建，以及 Agent 新建/更新/移动、日记追加、Inbox 转笔记、历史恢复使用事务 RPC；Agent 新笔记以 action ID 幂等；状态回写失败显示结果待核对，不报成功或盲重试 | 注入 version 失败后 notes/versions/audit 整体回滚；幂等重复创建只有 1 版；确认函数终结失败不报 success |
| F10 来源计数 | 分别维护 usedChars 和 selectedCount | 两条各 200 字符候选在 12,000 字符预算内均保留，实际 Context Engine 测试通过 |
| F11 FORCE RLS | 新迁移逐表 ENABLE + FORCE public 普通/分区表；不更改已部署迁移、不开放额外策略 | 干净重放与已有数据升级；系统目录无漏启用/强制的表；匿名/跨 owner/暗格回归；生产只读检查确认表/definer owner 为 BYPASSRLS 的 postgres |

## 数据与运行变更

新增 [迁移](../../supabase/migrations/20261023163055_agent_compliance_boundaries.sql) 包含：

- authenticated + SECURITY INVOKER 的笔记、文件夹移动、Inbox 转换和禁止来源 RPC，保留现有 RLS。
- `agent_actions.payload_hash` 回填、不可变触发器、客户端权限收紧，以及 service-only + SECURITY INVOKER 的状态流转 RPC。service role 只推进经服务端 owner 验证的技术操作，普通笔记写入仍使用 session/RLS。
- `ai_request_audits.reserved_cost_usd` 与 service-only + SECURITY INVOKER 的额度预留 RPC。后台调用计入同一套全局预算；失败/取消未知费用保留预留，统计口径收紧。
- 对当前 public 表启用并强制 RLS；不改变原有 owner 策略，不删除原件、快照或业务记录。

本分支的原生隔离数据库有 122 张 public 表，全部 FORCE RLS；authenticated 不能执行额度预留或提案状态 RPC。生产审查时的 schema 有 125 张表，因此发布前仍须重核最新主分支与生产差异；逐表 FORCE 迁移会枚举目标当时的 public 表，不靠旧表名清单。

公开 schema 类型从一次性 PostgreSQL 的完整迁移重放结果通过 Supabase CLI 生成，未手写 RPC/schema 真相。备份允许清单同步保留新提案 hash 和费用预留字段；数据库测试核对这两列存在且为非空。

## 实际检查

| 检查 | 结果与限制 |
| --- | --- |
| `npm run typecheck` | 通过；包含最终生成类型与新增测试 |
| `npm run lint -- --quiet` | 全仓通过，无新增忽略或降级规则 |
| 全仓 Vitest | 320 个测试文件，2,104 项通过，8 项失败；失败均在固定原始提交复现，详见下表；不是全仓绿灯 |
| 新增行为测试 | 6 个文件、22 项通过；实际工具/上下文/预算/确认/恢复入口及来源界面，而非只匹配源码字符串 |
| `tests/agent-compliance-database.mjs` | 通过；真实 PostgreSQL 引擎 PGlite 中重放、升级、RLS/ACL、故障回滚、版本、owner、额度和禁止来源验证。Promise 队列竞争本身不冒充原生多连接 |
| `scripts/agent-compliance-sql-concurrency.py` | 在本机一次性 `postgres:17`（17.11）原生数据库实际通过：12 连接额度竞争、8 连接写入竞争、恢复与保存竞争、8 连接提案确认竞争 |
| `tests/vault-database.mjs` | 完整迁移重放通过；暗格读取、RLS/RPC/Storage 拒绝、版本/冲突、共享引用与备份分类回归通过 |
| `E2E_MOBILE_HARNESS=1 npm run build -- --webpack` | 优化生产构建、类型检查、静态页面生成、路由清单通过。默认 Turbopack 曾停在 compile 阶段被停止，不宣称它已通过；没有修改默认构建器或跳过编译检查 |
| `node scripts/check-runtime-closure.mjs` | 126 traces，25,580 checked paths；已知 CLI 告警链未进入加载/部署闭包；不是全部依赖安全证明 |
| `node scripts/system-standards-audit.mjs --check` | 721 个源文件的窄范围门禁通过；6 个原有 control-name-needs-trace 保持人工追踪项，不当作新增违规或完整可访问性证明 |
| 浏览器来源控制 | 最终生产模式构建，390/1440，Chrome 156，本机 localhost，减少动态效果，分别检查一次完整路径；即时和历史来源、Enter、失败重试、成功状态、44px 高度、无横向溢出均通过 |
| 文档与 diff | `node scripts/check-project-docs.mjs`、`git diff --check` 通过 |

新增行为测试为：`assistant-compliance-tools`（6）、`assistant-context-packing`（1）、`ai-governance-runtime`（7）、`assistant-source-controls`（4）、`assistant-confirmation-runtime`（3）、`notes-atomic-actions`（1）。CI 新增 `Agent compliance` 工作流重跑隔离数据库与原生并发；此工作流尚未在 GitHub 上触发，不能把本地结果写成远端 CI 已绿。

### 固定基线的 8 项存量失败

从 Git 基线 `1352163` 导出独立目录，复用同一 Node/依赖/系统环境，实际运行对应 3 个文件，得到完全相同的 8 项失败。没有删除断言、降低保护或修改这些模块绕过失败。

| 文件 | 失败数 | 当前环境表现 |
| --- | --- | --- |
| `files-ocr-control.test.ts` | 5 | Node WebCrypto / JSDOM ArrayBuffer realm 不兼容，recognize 未执行或摘要校验报类型错误 |
| `system-backup-artwork.test.ts` | 1 | 恢复工具拒绝含 symlink 的临时目录父路径 |
| `system-backup.test.ts` | 2 | 同上；保留 symlink 拒绝边界 |

原有两条与本次契约改动有关的断言已更新：来源按钮移入共享组件、formatter 增加真实 entityId；相应真实行为测试补齐，原要求没有被删减。

## 界面证据

全部为合成内容。浏览器拦截了 6 次 Server Action POST，也阻断了外部请求；没有对生产数据执行禁止或确认动作。浏览器中真实控件与请求编码得到验证，最终写入由独立数据库/RPC 测试验证，不能把拦截响应描述为真实 Supabase 调用成功。

- [手机：成功状态](evidence/2026-10-24-agent-compliance/blocked-390.png)
- [桌面：成功状态](evidence/2026-10-24-agent-compliance/blocked-1440.png)
- [手机：失败后可重试](evidence/2026-10-24-agent-compliance/retry-390.png)
- [桌面：失败后可重试](evidence/2026-10-24-agent-compliance/retry-1440.png)
- [手机连续录屏](evidence/2026-10-24-agent-compliance/source-controls-390.webm)
- [桌面连续录屏](evidence/2026-10-24-agent-compliance/source-controls-1440.webm)
- [结构化浏览器结果](evidence/2026-10-24-agent-compliance/evidence.json)

没有新增空间/路由动效；共享控件的等待、成功和错误状态按完整操作路径验证。没有声称真实设备性能、多端全站、实际模型质量或费用账单已经验收。

## 发布顺序与回退

1. 明确批准生产目标与发布范围后，重新核对 GitHub/Vercel head 和数据库迁移历史。当前生产仍是原始审查时确认的资源，本次没有向它应用迁移或部署；不能从旧快照永久推断当前 head。
2. 留存变更前可恢复的数据库备份及当前部署标识；检查新增版本号未冲突、现有 proposal/预算状态兼容。只应用这份新增 migration，不改写历史 migration。
3. 先应用 migration，再部署候选代码。权限收紧后旧页面的确认会失败关闭；提示用户刷新。迁移缺失时新代码不会回退到无事务/无预算写入。新旧前端并存期间不依赖旧提案确认入口。
4. 生产只读核对 public 表 FORCE RLS、RPC ACL、载荷 hash 回填、域名对应提交和日志错误码。涉及真实模型或业务写入的验收另限定精确测试对象；不以真实正文、密码或未知外部日程作默认测试数据。
5. 状态回写失败时保留 executing，核对权威结果再恢复，不能直接重新执行 Graph 写入。未知用量的费用预留仅由受控服务端核对后结算，不自动按零费用清除。

回退优先前向修复或限制相关功能，保留内容、版本、审计与迁移。不得恢复客户端提案 UPDATE、关闭 FORCE RLS、清空费用预留或删除迁移以回到较弱边界。回滚旧应用不能等同于撤销数据库/外部操作；迁移后的旧应用确认入口会失败关闭，不能把它作为正常可用的回退版本。

本次已具备可审查代码、迁移、测试和证据；本次创建的一次性 PostgreSQL 容器及本地浏览器测试服务已停止并清理。未创建/发送 PR，未推送、合并或发布。生产迁移与部署须在明确授权后执行。

## 后续发布推进 · 2026-10-24

上述段落保留修复交付时的状态。所有者随后明确授权推送 GitHub、按本报告执行生产迁移、上线和验证；发布正在推进，最终状态以本节后续记录为准。

- 已核对正式域名与 GitHub `main` 均对应 `f52a69ae2e01844f155c030cc0713fae74e85bb2`，部署 `dpl_6CY6CwAFN12q94LMJPRCEC3kEayd`。只把本批修复重放到该主分支，未带入原工作分支的无关职业改动。
- 整合后完整隔离 schema 为 125 张 public 表；重新通过 Supabase CLI 生成类型，包含生产已有的面试叙事三张表。备份清单保留其原有字段。
- 整合验证：全仓 lint、类型检查、Webpack 生产构建、PGlite 升级/权限/回滚、原生 PostgreSQL 多连接竞争、合成业务备份恢复通过。全仓 Vitest 为 319 个文件、2,112 项通过、8 项相同存量失败。文档检查 105 篇/417 链接；部署闭包 127 traces/25,793 paths；系统门禁 717 个源文件/63 页面/56 API，6 个原有人工追踪项。
- 迁移前业务快照通过生产现有 session 的显式系统导出下载到所有者本机，保存在 Git 忽略的 `work/private-backups/2026-10-24-agent-release/`。不提交快照、私人正文或任何凭据。匹配原生产提交的校验器确认 14,838 行业务记录及摘要/关系；Files 原件、暗格与认证秘密等原有排除项仍保留，不能称为完整物理灾备。
- 当前 Supabase CLI 是另一账号，读取该项目物理备份列表返回 403；未改账号权限或扩大数据访问。业务快照隔离 PostgreSQL 读回验证与生产发布检查继续执行。
- 真实业务快照的原生恢复演练被正确拒绝：缺少 598 份 Files 原件，31 个历史图关系端点无法解析。内容摘要与 114 项外键核对通过，62 份嵌入休闲图片对象通过校验；这不等于完整恢复通过。没有绕过恢复检查，生产迁移仍待可恢复备份核对。
- 发布前完整 RPC 串联验证捕获 `move_note_new_folder_atomic` 的变量/列名歧义，已在尚未部署的新 migration 中修正；增加可回滚的完整 RPC 核验脚本，覆盖新文件夹移动、Inbox 转换、版本恢复/冲突、来源退出、owner、冻结提案和预算。此路径进入原生 PostgreSQL CI。
