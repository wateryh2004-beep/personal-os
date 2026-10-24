# Agent 规范与网站实现审查 · 2026-10-24

状态：只读审查记录，不是修复完成声明或全站验收。时区：Asia/Shanghai。

后续实现与验证见 [合规修复验收](2026-10-24-agent-compliance-fixes.md)；下文保留原始审查时的发现，不代表修复分支仍有相同实现。

## 范围与基线

- 规则入口：[AGENTS.md](../../AGENTS.md)、[项目治理](../project-governance.md)、[开发 Agent 工作规范](../agent-workflow.md)。开发 Agent 的过程规则与应用内 AI 的行为规则分别判断。
- 应用内规则：[AI 治理](../ai-governance.md)、[工具契约](../contracts/agent-capabilities.md)、[上下文契约](../contracts/ai-context.md)、[安全](../security.md)、[数据](../data-governance.md)。同时核对工程、设计、交互、文案、动效和质量规范。
- 本地分支：`feat/career-opportunity-workspace`，提交 `13521638d18cd7890f4d680414a8c9fdf0f0f922`；审查开始时工作树干净。
- Vercel 正式域名 `personal-os-kappa-nine.vercel.app` 在本次查询时指向生产部署 `dpl_6CY6CwAFN12q94LMJPRCEC3kEayd`，提交 `f52a69ae2e01844f155c030cc0713fae74e85bb2`，分支 `main`。
- 通过 GitHub 连接按该生产提交读取 22 个关键文件，并与本地 Git blob SHA 比对，全部一致。包括本报告涉及的 runtime、工具、预算、提案执行、笔记操作、来源面板及 AI/安全规范。因此下列代码偏差存在于该生产部署对应源码中；没有在生产中触发隐私外发、故障或并发写入来验收。
- 数据库：`rurzksvjefwjvswjgiup`。仅查询系统目录、策略、权限和触发器；没有读取私人正文、密钥或恢复答案，没有业务写入。

## 已确认的 11 项偏差

P1 表示优先修复的隐私或内容丢失风险；P2 表示明确的控制、完整性或行为偏差。严重度不表示已发生泄漏或事故。

### F01 · P1 · 笔记整理工具绕过 AI 隐私过滤

- 规则：AI 治理第 10 行要求只有 `normal` 可进入模型工具或背景上下文，`sensitive` / `never` 在服务端过滤。
- 位置：[tools/notes.ts](../../src/features/assistant/tools/notes.ts#L220)，特别是 `recentTitled` 和 `rootResult` 查询。
- 行为：`listNoteOrganization` 返回文件夹代表性标题、根目录笔记标题/ID，但这些查询未筛选 `ai_visibility`，也未调用正文检索使用的 `excludeAiGeneratedNotes`。RLS 的 owner 限制不能替代 AI 隐私过滤。
- 触发：笔记库助手整理笔记时，禁止发送的笔记只要仍是 active，就可能以标题形式进入工具结果。这里证实的是标题/元数据路径，不是正文泄漏。
- 证据：合成 `never` 笔记标题被实际工具函数返回；没有调用模型。
- 修复方向：所有返回笔记信息的工具共享服务端可见性过滤，覆盖标题、组织概览、正文和提案预览。

### F02 · P1 · 关闭长期记忆后，工具仍能读取记忆

- 规则：AI 治理第 9 行明确“关闭时不参与上下文”。
- 位置：[tools/memory.ts](../../src/features/assistant/tools/memory.ts#L18)、[tools/search.ts](../../src/features/assistant/tools/search.ts#L24)、[runtime.ts](../../src/features/assistant/runtime.ts#L240)。
- 行为：Context Engine 检查 `longTermMemoryOptIn`，但 `searchMemory`、`getRelevantMemories` 和跨域搜索的 memory 分支没有检查该开关。runtime 构建工具时也没有按开关移除或拒绝这些读能力。
- 触发：全局助手处理个人画像、近期思考等问题，路由开放 memory 读工具后，背景开关不能保证阻断工具读取。
- 证据：合成数据库配置 opt-in 为 false，实际记忆工具仍返回记录，且未查询该配置。静态调用链确认没有外层开关保护。
- 修复方向：在工具选择和实际执行两处落实同一授权边界；用户明确要求临时使用记忆时也应定义独立、可见的授权语义。

### F03 · P1 · 恢复笔记历史版本会覆盖并发新保存

- 规则：数据规范要求旧 revision 不能覆盖新状态，并发冲突保留双方内容；安全规范要求恢复保留版本。
- 位置：[notes/actions.ts](../../src/features/notes/actions.ts#L87)，`restoreNoteVersion`。
- 行为：读取当前笔记，保存旧正文快照，再按 `id` 更新历史正文；最后更新没有 `eq(revision, expectedRevision)`，也没有事务内锁。其 revision 来自最初读取的旧值。
- 触发：另一标签页在最初读取和最后更新之间保存。恢复动作可能覆盖这个新正文，且恢复前快照没有包含它。
- 证据：对实际函数做合成并发注入，revision 3 读取后插入 revision 4 新保存；最终被历史正文覆盖，revision 仍为 4，快照只保留旧正文。
- 修复方向：事务内校验/锁定版本，恢复使用 CAS，冲突时保留用户新内容并明确拒绝覆盖。

### F04 · P2 · 三类 AI 调用绕过统一预算与调用审计

- 规则：AI 治理第 16 行要求每次调用写 `ai_request_audits`，第 24 行要求调用前检查预算。
- 位置：[Today](../../src/features/today/ai-synthesis.ts#L22)、[Inbox](../../src/features/inbox/classify.ts#L153)、[Briefing](../../src/features/briefing/ai.ts#L107)。
- 行为：这些路径直接调用 `generateText` / `generateObject`，没有统一 `assertAiBudget` / `auditAiRequest`。Today 的普通 `audit_logs` 事件和 Briefing 自己的 token 预算不等同于统一调用审计与 Settings 的全局上限。
- 影响：设置里的每日/月调用或费用上限不能覆盖这些调用；聚合用量、费用和调用历史不完整。
- 证据：核对模型调用点、调用者及 provider 创建函数；不存在统一包裹层。未为验证而发起真实付费调用。
- 修复方向：所有模型入口接入统一治理执行器；保留 Briefing 自己更细的预算作为额外限制。

### F05 · P2 · 预算查询失败时放行

- 规则：AI 治理要求超过预算停止；工程规范要求区分服务失败与空结果，不能吞掉失败后视为正常。
- 位置：[ai/governance.ts](../../src/features/ai/governance.ts#L88)。
- 行为：`assertAiBudget` 忽略两次查询的 `error`，将 `data: null` / `count: null` 当作零费用/零次数并返回 allowed。
- 证据：合成数据库统计失败，实际函数返回 `{ allowed: true }`。此外当前“读取统计→另行插入审计”不是原子额度预留，临界额度并发也没有严格保证；本次没有生产并发测试。
- 修复方向：统计不可用明确拒绝或安全降级，并用数据库原子预留定义并发预算边界。

### F06 · P2 · 工具读取不受单次上下文设置约束

- 规则：AI 治理第 24 行提供单次上下文上限。
- 位置：[tools/notes.ts](../../src/features/assistant/tools/notes.ts#L94)、[tools/index.ts](../../src/features/assistant/tools/index.ts#L148)、[runtime.ts](../../src/features/assistant/runtime.ts#L240)。
- 行为：Context Engine 对初始背景包限额，但读取工具不接收治理设置。`readNotesBatch` 单次可返回最多 32,000 字符，工具包装器只做去重与来源收集，之后直接返回完整结果；多轮调用还能累加。
- 影响：例如设置 12,000 字符并不能约束工具检索正文。当前直接编辑文本另有上下文契约，本项只判断背景/工具检索，不把用户明确提交的正文混作检索。
- 证据：调用链和 schema 静态核对，未将真实文档发送给模型。
- 修复方向：为整个请求维护累计检索预算，在每次工具结果进入模型前执行，并让审计反映实际发送量。

### F07 · P2 · 来源面板的“不再使用”存在不可执行路径

- 规则：AI 治理第 10 行要求实际使用的笔记/文件可在来源面板直接设为 never；第 8 行要求来源范围可追踪。
- 位置：[context/engine.ts](../../src/features/context/engine.ts#L515)、[runtime.ts](../../src/features/assistant/runtime.ts#L216)、[agent-sources.tsx](../../src/components/assistant/agent-sources.tsx#L20)、[ai/actions.ts](../../src/features/ai/actions.ts#L35)。
- 行为：上下文来源的 `id` 为 `S1` 等展示编号，runtime 把该编号保存到来源，表单将其用作 `source_id`；服务端要求 UUID，因此直接拒绝。流式来源类型又只保留 title/domain/href，其面板没有禁止按钮。
- 相关缺口：工具来源收集器只处理部分顶层数组，遗漏 `readNote` 返回的 `note`、`readFileText` 返回的 `file`、记忆工具的 `profileAndWorking/currentDecisions`，导致实际使用范围可能少报。
- 证据：用真实 `blockAiSource` 提交 `S1`，在任何数据库操作前得到“来源信息无效”。其余路径经源码核对。
- 修复方向：分开 citationId 与 entityId，贯通所有工具输出、即时面板、持久化来源与退出授权动作。

### F08 · P2 · “冻结提案”在数据库中仍可改写

- 规则：AI 治理要求冻结提案与明确确认边界；工程规范要求不信任客户端输入，并定义并发状态。
- 位置：[Agent migration](../../supabase/migrations/20260808181945_agent_layer_v1.sql#L104)、[assistant/actions.ts](../../src/features/assistant/actions.ts#L42)。
- 行为：authenticated 对自己 `agent_actions` 整行有 UPDATE 权限，策略只核对 owner。生产权限确认 `payload_json`、`preview_json`、`action_type`、`status`、`approved_at` 均可更新；该表唯一自定义触发器只更新 updated_at，没有冻结校验。
- 影响：持有合法 owner 会话的客户端可以改写自己提案的内容/预览/状态；确认函数只接受 actionId，没有绑定用户看到的 payload 版本。这是确认完整性缺口，不是跨用户越权，也不能据此宣称模型已有直接执行工具。
- 证据：生产系统目录只读查询 ACL、RLS 和触发器；没有尝试篡改真实提案。
- 修复方向：数据库层约束不可变载荷，状态迁移走受控服务端事务/RPC；确认绑定提案版本或 hash。

### F09 · P2 · 笔记、版本和结果状态未原子提交

- 规则：安全规范第 45 行要求 mutation、必要版本及审计在一个事务中。
- 位置：[assistant/executor.ts](../../src/features/assistant/executor.ts#L211)、[notes/actions.ts](../../src/features/notes/actions.ts#L20)、[assistant/actions.ts](../../src/features/assistant/actions.ts#L74)。
- 行为：Agent 新建笔记先独立 INSERT notes，再 INSERT note_versions；后一步失败只抛错，不回滚前一步。常规新建笔记亦同类。提案执行与 succeeded/审计回写也分步，部分回写忽略 error。
- 影响：界面显示失败时笔记可能已经存在但没有初始版本；重新生成新提案重试可重复创建，业务内容和提案/审计状态可能分离。
- 证据：实际执行器的合成故障注入确认先写 notes、后写 version 失败后退出，未执行补偿；生产 notes 触发器目录也没有代替该事务的版本写入机制。未在生产注入故障。
- 修复方向：本地业务写入、版本与审计使用事务；外部写入采用明确的幂等操作与可恢复状态，而非假定跨服务事务成立。

### F10 · P2 · 上下文来源计数与字符数混用

- 规则：工程规范要求明确类型与正确边界；AI 规范要求引用可追踪证据、缺失资料不冒充完整证据。
- 位置：[context/engine.ts](../../src/features/context/engine.ts#L507)。
- 行为：`used` 累加 content.length，却同时比较 `used >= limits.items`，其中 items 为 64。第一条正文达到 64 字符后，后续来源全部被过滤；这是字符和条数的单位混用。
- 影响：即使上下文字符额度充足，多来源分析也可能只拿到一条背景来源；后续工具能否补足取决于实际路由，不能保证。
- 证据：调用实际 Context Engine，提供两条各 200 字符的合成候选，默认额度 12,000；候选数 2、最终仅 1 条、发送内容计数 200。
- 修复方向：分别记录 usedChars 与 selectedCount，按各自单位执行上限；验证多来源综合场景。

### F11 · P2 · 数据库未完全落实 FORCE RLS 要求

- 规则：安全规范第 34 行要求 public 业务表“启用并强制 RLS”。
- 证据：生产系统目录查询共 125 张 public 普通/分区表，125 张启用 RLS，10 张 FORCE RLS，115 张没有 FORCE RLS。未强制表包含 notes、documents、experience_facts、audit_logs、agent_actions 等业务表。
- 影响：这是已确认的规范差距；普通角色仍受现有 RLS 策略约束，不能把它描述为 115 张表公开可读。FORCE RLS 也不能约束具有 BYPASSRLS 的 service_role，不能作为 service-role 权限治理的替代。
- 修复方向：逐表区分技术表与业务表，评估 owner/SECURITY DEFINER 依赖，在隔离数据库验证后用新 migration 落实；本次未修改策略。

## 验证记录与限制

| 检查 | 实际结果 | 能证明的范围 |
| --- | --- | --- |
| `node scripts/system-standards-audit.mjs --check --json=/tmp/personal-os-audit-20261024.json` | 退出 0；717 个源文件；62 页面、56 API；6 个名称需人工追踪项 | 窄范围静态门禁通过，不证明隐私、预算、数据正确性或全站视觉合规 |
| 7 个现有治理/提案/工具/上下文测试文件 | 26 项通过 | 既有断言通过；部分治理测试仅匹配源码字符串，未覆盖上述绕过路径 |
| 临时合成复现测试 | 7 项通过 | 实际函数复现 F01、F02、F03、F05、F07、F09、F10；“通过”表示复现成功，不是修复通过 |
| Vercel + GitHub | 核对生产部署提交、22 文件 blob SHA 全部一致 | 已发现的代码偏差属于被查生产提交；未执行完整浏览器验收 |
| Supabase 系统目录 | 核对 RLS/ACL/触发器 | F08、F11 的部署权限现状；不是跨用户攻击验证 |

临时复现入口为 `/tmp/personal-os-compliance.test.ts` 与 `/tmp/personal-os-compliance-vitest.config.mjs`，执行 `./node_modules/.bin/vitest run --config /tmp/personal-os-compliance-vitest.config.mjs`。所有数据库响应及并发/失败均为合成替身，不调用供应商模型，不产生费用或外部写入。临时文件不是长期测试资产。

静态门禁的 6 个 control-name-needs-trace 项经源码追踪均可找到 Field/label 包裹或关联，未直接列成违规。没有以静态通过宣称手机触控、实际对比度、字体、连续动效、键盘或完整页面流程已验收。

未检查 Git 全历史秘密、全部文件原件、所有生产数据归属、所有第三方同步并发，也未进行已登录浏览器全站回归。没有本次证据支持“已经发生跨用户泄漏”“全部业务表无 RLS”“已确认密钥泄漏”或“全站无问题”等结论。不能从网站现状反推历史开发 Agent 每次是否读过规范、获得过授权或真实运行过检查。

## 修复顺序建议

先处理 F01/F02 的隐私和授权边界、F03 的内容覆盖风险，再处理来源退出授权、统一 AI 治理和笔记事务；最后补齐提案不可变约束、上下文计数与逐表 RLS 加固。每项修复需独立验证失败、并发和兼容，不通过降低主规范消除问题。

本次仅新增审查记录与索引，没有修改业务实现、数据库结构、生产配置或数据，没有发布。
