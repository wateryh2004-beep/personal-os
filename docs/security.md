# 安全、认证、RLS 与审计

状态：有效安全规则与带日期的发布记录。维护日期：2026-10-14。通用生命周期见 [数据规范](data-governance.md)，操作顺序见 [运行手册](release-operations.md)。认证实现以 `src/lib/supabase/proxy.ts`、`src/lib/auth/require-owner.ts` 和各独立端点为依据；历史段落不自动代表最新运行状态。

## 身份与会话

- 采用 Supabase Auth + `@supabase/ssr` cookie 会话与 PKCE；根据当前施工提示，Phase 1 改为 owner-only 邮箱密码登录，不提供公开注册页面。
- `src/lib/supabase/server.ts` 只在服务端创建 cookie client；浏览器 client 使用 URL 和 publishable key。`proxy.ts` 刷新会话。
- 每个私有读取/写入边界通过 owner guard 验证身份。当前 Proxy 调用 `auth.getClaims()` 后清理并重建仅限本次请求的身份头，guard 可以复用该可信结果；无可信桥接时重新核对 claims。不得信任浏览器提交的身份头、`getSession()` 返回的 user 或表单 `user_id`。
- 用户身份来自 session 后，应用层将其作为写入 `user_id`；数据库 RLS 是最终隔离边界。

## 可选的问题找回密码

- 登录页的“找回密码”进入 `/forgot-password`。启用后填写两个英语单词（按顺序、忽略大小写和首尾空格）及两次新密码；答对直接重置，无需邮件。邮箱找回保留为备用入口。
- 此方式把问题答案作为唯一恢复凭据。常见单词可能被猜中；共享限流不能防止已经知道答案的人接管账户。它比邮箱验证弱，不能视为第二因素认证。
- 实际答案不写入源码、测试、日志或浏览器。服务端环境变量 `PASSWORD_RECOVERY_ANSWER_HASH` 保存随机盐的 scrypt 校验值；用 `node scripts/hash-recovery-answer.mjs` 在本地生成，仅复制输出到部署端秘密配置。生成器会在本地终端显示输入，勿录屏或提交输出。
- 复用现有服务端 `SUPABASE_SECRET_KEY`、`OWNER_USER_ID` 与 `OWNER_EMAIL`。上线前应用 `20261014082638_question_password_recovery.sql` 并确认固定 UUID 和邮箱对应同一所有者。缺少配置或数据库限流不可用时拒绝问题重置；Vercel Preview 始终禁用此方式。
- 限流是账户级共享计数：每个 15 分钟窗口最多 5 次有效表单尝试（成功也计数），不依赖浏览器 Cookie、IP 或实例内存。攻击者可以耗尽这 5 次，邮箱找回仍可用。`question_recovery_attempts` 是只含一个计数行的技术表，不保存任何业务内容或答案；启用并强制 RLS，无匿名/用户策略，仅 service_role 有最低读写权限。RPC 为 SECURITY INVOKER，仅 service_role 可执行。
- 通过固定 UUID 查询 Auth 用户，核对所有者邮箱；仅在服务端生成并消费一次性 recovery token，经普通 `updateUser` 修改密码。令牌与临时会话不进入返回值、URL 或 Cookie，不直接使用 admin 修改任意账户密码，不关闭 MFA。成功后请求全局退出，撤销刷新会话；已有 access JWT 仍可能有效至到期。如果退出请求失败，明确告知密码已更新但旧会话退出未完成。
- 发布顺序：先在隔离数据库验证迁移权限和计数，再审查并应用迁移，最后设置仅 Production 的校验值并部署。不要在生产中通过自动化修改真实所有者密码验收；使用独立测试项目验证 Supabase 完整重置流程，再由所有者进行实际验收。
- 回退：删除部署端 `PASSWORD_RECOVERY_ANSWER_HASH` 并重新部署，恢复纯邮箱找回；技术计数表可保留，不需要回滚或改动业务数据。
- 回归入口：`tests/question-recovery*.test.ts` 检查校验和授权；`tests/question-recovery-database.mjs` 在隔离 PGlite 检查 SQL 权限与计数；构建后 `python3 scripts/question-recovery-http-smoke.py` 使用虚构本地 Auth 服务验证真实 Next Server Action 和 SDK HTTP 调用，不等同于真实 Supabase 项目的验收。

### 2026-10-14 发布验收

独立 Supabase 验证项目已用临时虚构账户完成真实 Auth SDK 验收：创建账户、原密码登录、固定 ID 查询、生成并消费 recovery token、修改密码、全局退出、拒绝旧密码与旧刷新会话、新密码登录，以及数据库共享限流。临时账户已删除，临时测试入口已停用，验证项目恢复暂停状态。生产真实所有者密码未改动。

生产已应用限流迁移，权限检查确认匿名与普通用户不能读取计数或执行限流 RPC。管理 API 生成的实际迁移版本为 `20261014082638`，仓库文件和隔离测试入口按此版本对齐；未直接改写生产迁移历史。

初次配置曾被自动审查阻止。随后所有者于 2026-10-14 明确授权将先前指定答案作为生产恢复凭据，并确认知道答案的人能够重置密码；Production 专用配置及重新部署已完成，答题入口已确认可见，邮箱备用保留。该记录来自 [PR #66](https://github.com/wateryh2004-beep/personal-os/pull/66) 的发布与启用验收；真实所有者密码未为测试修改。后续可用性须核对实际配置与部署，不能从静态记录永久推断。

## RLS 基线

### 搜索协议与受限只读恢复

`/api/search` 使用 `requireOwnerApi()`，再把同一个已验证 owner 交给领域查询；空查询也经过认证。匿名/无效会话返回 JSON 401，非 owner 返回 403，参数错误返回 400，真实服务故障保持 503；全部响应使用 private/no-store，不把页面重定向捕获成服务故障。Data API 持续返回 JWT 验证拒绝（PGRST301/303）时保留 401，不冒充空结果。

服务端客户端按请求创建。对已由 Proxy 验证为 owner 的请求，Data API 出现 PGRST303 时，先对实际发出的同一 JWT 重新验签、检查有效期/相同 user ID/owner 邮箱，并通过 Auth `getUser(jwt)` 核对；成功才允许对同一读取和同一凭据重放一次。并发失败只共享本请求、本客户端的核对 Promise，不跨请求缓存身份。未通过核对、缺少可信桥接或持续失败均保留拒绝。

仅允许 Data API GET 与经过审查、当前函数体只有 SELECT 的 `list_notes_workspace`、`search_personal_os` RPC；未知 RPC、其他 POST、PATCH、DELETE、403/42501、非目标 origin 和非 PGRST303 错误不自动重放。RPC 加入写入或外部副作用前必须移出该允许列表并复核契约，不能以“RPC 使用 POST”或“原来可重试”推导写入重试权限。

刷新令牌仍只由可写回 Cookie 的 Proxy 等认证边界负责；页面渲染中的只读恢复不旋转 refresh token、不使用 service role、不忽略过期/签名检查。Proxy 将刷新后的请求 Cookie、响应 Cookie 以及 SDK 的 Cache-Control/Pragma/Expires 一起传递，重建响应或重定向时不能丢失。实现及实际验证见 [搜索与认证恢复记录](verification/2026-10-25-search-auth-recovery.md)。

每张 `public` 业务表（包括 versions、events、audit、export jobs）启用并强制 RLS。标准策略为：

```sql
using (user_id = auth.uid())
with check (user_id = auth.uid())
```

对 `note_versions` 使用以父 `notes.user_id` 的 `exists` 策略或冗余 `user_id` + 一致性触发器；建议冗余 `user_id`，让审计和 RLS 更直接。对 `audit_logs`：允许所属用户 `select`，仅由受控 Server Action/数据库函数 `insert`，禁止客户端 `update/delete`。所有表同时定义显式 `grant`；迁移测试应验证跨用户查询、写入、外键猜测均失败。

## 写入、版本与审计

- 每个 mutation 在一个事务中：认证 → Zod 输入验证 → 业务写入 → 必要时版本快照 → `activity_events` → `audit_logs`。
- Notes 每次显式保存产生 `note_versions`（首版可不做草稿自动保存）。恢复历史版本通过复制为当前正文并新增版本完成，绝不改旧快照。
- Projects/Tasks/Areas/Inbox/Notes 的 archive/restore 与关键状态变更必须写 audit。审计记录为 append-only，`before`/`after` 只记录允许的业务字段。
- 软删除不等于安全擦除；未来加入“永久删除”前需单独的数据保留策略与确认机制。

## 秘密、Storage 与运行环境

- `.env.local`、Supabase service-role key、数据库 URL、OAuth secret 永不提交。提供 `.env.example` 仅列变量名。
- 浏览器仅接收明确可公开的配置，Supabase 凭据仅限 URL 与 publishable key；service role/secret key 只在受保护的 server-only 适配层或后台任务中以最小职责使用，不能进入 client bundle、返回值或日志。
- `exports` bucket 为私有；对象路径以经过验证的 user UUID 开头；Storage policy 和签名 URL 都检查所有权。导出 URL 短期有效。
- Vercel、Supabase、GitHub 的密钥由各自 secrets/env 管理，不写入 migration、文档示例或测试 fixture。

## 云端 Microsoft Calendar

- Device Code 只由用户在 Microsoft 官方页面完成。临时 `device_code` 使用加密、
  HttpOnly、短期 Cookie，不返回浏览器 JavaScript。
- Refresh Token 只作为 AES-256-GCM 密文保存在有 RLS 的 `calendar_connections` 行；
  解密密钥只存在于 Vercel server-only 环境变量。短期 Access Token 不落库。
- `SUPABASE_SECRET_KEY` 是 Vercel server-only 变量，用于创建受保护的 admin client
  与派生加密密钥；绝不进入 client bundle、日志或 Git。无需 Microsoft Client Secret。
- 所有 Graph 操作均先检查 session 与 `OWNER_EMAIL`；任何写入 Outlook 的操作仍必须
  先经过明确确认。AI、浏览器和未认证 route 不会持有或获得 Microsoft Token。
- `calendar_events` 对用户 RLS 为只读；`calendar_operations` 的数据库触发器只允许
  草稿 → 已确认/取消、已确认 → 取消。`processing`、`succeeded`、`failed` 只可由
  service role 的受保护执行器写入，因此网页不能伪造 Outlook 已执行。

## DeepSeek Calendar AI

- DeepSeek API Key 只在 Settings 表单提交时出现；使用独立的 AES-256-GCM 密钥材料加密
  后保存到 `ai_provider_settings.api_key_ciphertext`，不回显、不写审计内容、不写日志。
- AI Route Handler 必须先执行 `requireOwner()`；Key 的读取使用 server-only admin client。
  浏览器只获得流式回复与受限工具结果，不能取得明文 Key。
- 发送到 DeepSeek 的仅是本轮对话和经工具查询、当前用户允许的日历缓存。模型没有访问
  Supabase、Graph、Notes、Files 或环境变量的能力。
- AI 只能产生日程提案；用户点击创建草稿及操作队列最终确认都是独立的人类确认步骤。

## 安全验证清单

在引入首个模块前验证：未认证重定向、伪造 `user_id` 无效、用户 A 不能读写用户 B 的各类记录、归档记录默认不可见、私有导出不可猜测访问、审计不可篡改、生产日志不含 Markdown 私密内容或 token。

## Career 与私有文件

Career 的每张表和 `documents`、`entity_links` 均启用 RLS，并为 SELECT/INSERT/UPDATE/DELETE 设定 `authenticated` + `auth.uid() = user_id` 策略；事实版本只允许 SELECT/INSERT。普通 Server Actions 首先执行 `requireOwner()`，随后进行 Zod 校验及关联对象所有权检查。`credential_number` 不写入审计的 `after_data`，也不出现在默认导出。

`private-files` 必须在 Dashboard 创建为私有 bucket。Storage object policy 同时限制 bucket 名称及首个路径段等于 `auth.uid()`；浏览器不拥有 service role，文件元数据写失败时会删除刚上传的对象。正式签名 URL 下载界面仍待后续实现。

## Files 与 Cloudflare R2

`life-of-hang-files-prod` 保持私有，不启用 Public Development URL 或公开自定义域名。R2 Access Key 与 Secret 仅存在于 Vercel 的 server-only 环境变量；它们不使用 `NEXT_PUBLIC_` 前缀，不进入 Git、日志、Supabase 或浏览器。

Files 的每次签名、上传确认与下载都调用 `requireOwnerApi()`；查询 `documents` 时 RLS 限定 `auth.uid()`。上传 URL 限定一个由服务端生成的对象路径、一个 PUT 方法、指定 Content-Type 和五分钟期限；下载 URL 同样限单对象、五分钟。CORS 仅允许实际 Personal OS 域名和本地开发地址。客户端无法指定 R2 路径或 user_id；文件夹归属触发器阻止将文件附着到其他用户的 Folder。
# Authentication boundaries

Private application routes are protected in four independent layers: `src/proxy.ts` performs an early redirect, the `(app)` server layout calls `requireOwner()` before rendering the application shell, every Server Action and private Route Handler checks the owner again, and Supabase RLS isolates rows by `auth.uid()`.

Public authentication pages include `/login` and `/forgot-password`; public manifest/static resources and explicit OAuth protocol callbacks are separately scoped. `/update-password` still requires the valid recovery/session path. API endpoints are not redirected by the Proxy because protocol clients need status responses; each private endpoint uses its owner/API guard. Private HTML and authenticated login responses use `Cache-Control: private, no-store, max-age=0`; they are not eligible for shared CDN caching. The exact public allowlist lives in `src/lib/supabase/proxy.ts`, and static exclusions in `src/proxy.ts`; adding a route requires an explicit boundary review.

The root `/` performs the same server-side owner check as the private layout before redirecting to `/today`. A non-owner session is cleared by Proxy and redirected to `/login?error=not-authorized`; the configured owner email is never emitted to the client.

## 短期工作区恢复

未提交的 Notes 草稿与 Calendar、Tasks、Inbox 的 AI 对话使用浏览器当前标签页的
`sessionStorage` 做 15 分钟恢复，解决在私人模块之间切换时 Client Component 卸载造成的
内容丢失。它不是云端权威存储、不会跨设备同步，也不会发送给第三方；确认保存后的业务数据
仍写入其受 RLS 保护的云端表。恢复窗口到期、关闭标签页或主动退出登录后，应用会清除这些
临时快照。流式 AI 请求在离开页面时不声称仍在后台运行，而是保留已生成内容并提示用户已暂停。

