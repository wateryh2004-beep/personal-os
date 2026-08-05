# Microsoft Calendar 云端集成

## 运行模型

Outlook Calendar 是唯一权威来源。Personal OS 在 Supabase 的
`calendar_events` 只保存近期缓存，`calendar_operations` 保存明确确认过的写入请求。
Vercel 在用户点击“刷新日历”或确认创建日程时，直接调用 Microsoft Graph；它不是常驻
进程，因此不依赖 Hang 的 Mac 是否开机。

```text
浏览器（owner session） → Vercel Server Action / OAuth Route
                            ↓
                  Supabase command queue + encrypted credential
                            ↓
                   Microsoft Graph → Outlook（权威来源）
```

Microsoft 授权采用 Softeria 上游项目使用的公共 OAuth client 的 Device Code 流程。
这避免了个人 Microsoft 帐户必须自行注册 Entra App 的门槛，也不需要 Client Secret 或
Redirect URL。公共 client ID 不是秘密；它只在 server-only adapter 内使用。未来若获得
自己的 Entra 租户，可迁移到独立 client ID，而不改变日历缓存与操作队列模型。

## 凭据与安全边界

- Device Code 只以加密、HttpOnly、短期 Cookie 暂存，浏览器 JavaScript 读不到原始
  `device_code`。
- Refresh Token 在 Vercel 服务端使用 AES-256-GCM 加密后写入
  `private.calendar_oauth_credentials`。该表不在 `public` schema，不会通过 PostgREST
  暴露给浏览器。
- 加密密钥由 Vercel server-only `SUPABASE_SECRET_KEY` 派生；它不能使用
  `NEXT_PUBLIC_` 前缀，也不得进入日志、Git 或客户端 bundle。
- 每次图表请求前以 Refresh Token 向 Microsoft 换取短期 Access Token；续期后的
  Refresh Token 会重新加密保存。系统不记录 token、完整 Graph 错误或私人日程正文到日志。
- 所有入口都先校验 Supabase session 和 `OWNER_EMAIL`。浏览器不能提交 `user_id`。
  `calendar_events` 对用户只读；状态机仅允许草稿确认/取消，服务端执行器才可写入
  `processing`、`succeeded` 与 `failed`。

## 一次性部署设置

1. 应用 Calendar migrations 到已链接的 Supabase 项目。
2. 在 Vercel 的 Production 与 Preview 环境设置：
   `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`OWNER_EMAIL`、
   `SUPABASE_SECRET_KEY`。
3. 重新部署后，登录 `/calendar`，点击“连接 Outlook”。Microsoft 页面会要求输入
   一次性代码；完成后返回本页点击“我已完成授权，检查连接”。
4. 点击“刷新日历”读取未来日程。新建日程始终先进入待确认队列，确认后才发送到 Outlook。

无需设置 Microsoft Client ID、Client Secret、Redirect URL、Mac bridge 或桥接 token。

## 验收与限制

使用专用测试日历验证：刷新读取、创建草稿不写入、确认后创建成功、刷新仍显示、断开
浏览器会话后再次登录仍可刷新。完成后删除测试日程。

- 第一版仅提供读取、刷新和创建；更新/删除的安全队列协议已预留，尚未开放按钮。
- 手动刷新与确认操作是实时云端执行；定时后台同步不在本阶段范围。未来如启用 Vercel
  Cron，仍不需要 Mac。
- 此模式依赖上游公共 client 持续可用。若 Microsoft 或上游策略改变，应注册自己的
  Entra App 并迁移 client ID。
