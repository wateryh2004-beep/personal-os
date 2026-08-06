# 安全、认证、RLS 与审计

## 身份与会话

- 采用 Supabase Auth + `@supabase/ssr` cookie 会话与 PKCE；根据当前施工提示，Phase 1 改为 owner-only 邮箱密码登录，不提供公开注册页面。
- `src/lib/supabase/server.ts` 只在服务端创建 cookie client；浏览器 client 使用 URL 和 publishable key。`proxy.ts` 刷新会话。
- 每次页面读取和 Server Action 都用 `auth.getClaims()` 验证身份并取得 `sub`。不得信任 `getSession()` 返回的 user，也不得读取/接受表单中的 `user_id`。
- 用户身份来自 session 后，应用层将其作为写入 `user_id`；数据库 RLS 是最终隔离边界。

## RLS 基线

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
- 浏览器公开变量仅限 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。service role 只允许部署端受控后台任务使用，不能进入 client bundle 或日志。
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
# Authentication boundaries

Private application routes are protected in four independent layers: `src/proxy.ts` performs an early redirect, the `(app)` server layout calls `requireOwner()` before rendering the application shell, every Server Action and private Route Handler checks the owner again, and Supabase RLS isolates rows by `auth.uid()`.

`/login` is the only public page route. API endpoints are not redirected by the Proxy because protocol clients need status responses; each private endpoint calls `requireOwner()` itself. OAuth callback paths are explicit protocol exceptions and must remain separately audited. Private HTML and authenticated login responses use `Cache-Control: private, no-store, max-age=0`; they are not eligible for shared CDN caching.

The root `/` performs the same server-side owner check as the private layout before redirecting to `/today`. A non-owner session is cleared by Proxy and redirected to `/login?error=not-authorized`; the configured owner email is never emitted to the client.
