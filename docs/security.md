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

## 本机 Microsoft Calendar Companion

- Microsoft access token、refresh token、MSAL token cache 不得进入 Vercel、Supabase、
  Git、`.env.local` 或日志；Device Code 仅由用户在 Microsoft 官方页面完成。
- `tools/microsoft-calendar-companion` 固定上游包版本，强制 `calendar` preset 与
  `User.Read Calendars.ReadWrite offline_access` 白名单。Mail、Files、Contacts、
  Tasks 和组织级权限不属于当前验证范围。
- 个人账户使用 `consumers` authority。Token 优先保存在 macOS Keychain；只有 Keychain
  不可用时才以私有目录、0600 权限回退到 Application Support 文件。
- 任何未来写入 Outlook 的操作都必须先由 Personal OS 服务端验证，并取得用户确认；
  不得让 AI、浏览器或 Vercel Function 直接持有 Microsoft Token。

## 安全验证清单

在引入首个模块前验证：未认证重定向、伪造 `user_id` 无效、用户 A 不能读写用户 B 的各类记录、归档记录默认不可见、私有导出不可猜测访问、审计不可篡改、生产日志不含 Markdown 私密内容或 token。

## Career 与私有文件

Career 的每张表和 `documents`、`entity_links` 均启用 RLS，并为 SELECT/INSERT/UPDATE/DELETE 设定 `authenticated` + `auth.uid() = user_id` 策略；事实版本只允许 SELECT/INSERT。普通 Server Actions 首先执行 `requireOwner()`，随后进行 Zod 校验及关联对象所有权检查。`credential_number` 不写入审计的 `after_data`，也不出现在默认导出。

`private-files` 必须在 Dashboard 创建为私有 bucket。Storage object policy 同时限制 bucket 名称及首个路径段等于 `auth.uid()`；浏览器不拥有 service role，文件元数据写失败时会删除刚上传的对象。正式签名 URL 下载界面仍待后续实现。
