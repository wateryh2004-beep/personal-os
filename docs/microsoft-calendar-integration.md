# Microsoft Calendar 云端集成

## 运行模型

Outlook Calendar 与 Microsoft To Do 是日程和任务的权威执行层。Personal OS 在
Supabase 保留只读私有缓存，并在用户点击“对齐”或每日计划任务运行后，向
append-only `microsoft_sync_backups` 写入完整快照。快照不会因为 Microsoft 删除、断连
或切换平台而被浏览器覆盖；它可作为未来导出、迁移到自建服务器或恢复功能的基础。

Vercel 在用户点击手动对齐、确认写入时直接调用 Microsoft Graph；每日低频同步则由
Vercel Cron 在云端执行，不依赖 Hang 的 Mac 是否开机。

```text
浏览器（owner session） → Vercel Server Action / OAuth Route
                            ↓
                  Supabase command queue + encrypted credential
                            ↓
                   Microsoft Graph ↔ Outlook / To Do（权威执行层）
                            ↓
               Supabase 私有副本 + append-only 备份快照
```

Microsoft 授权采用 Softeria 上游项目使用的公共 OAuth client 的 Device Code 流程。
这避免了个人 Microsoft 帐户必须自行注册 Entra App 的门槛，也不需要 Client Secret 或
Redirect URL。公共 client ID 不是秘密；它只在 server-only adapter 内使用。未来若获得
自己的 Entra 租户，可迁移到独立 client ID，而不改变日历缓存与操作队列模型。

## 凭据与安全边界

- Device Code 只以加密、HttpOnly、短期 Cookie 暂存，浏览器 JavaScript 读不到原始
  `device_code`。
- Refresh Token 在 Vercel 服务端使用 AES-256-GCM 加密后写入已有、已启用 RLS 的
  `calendar_connections.oauth_refresh_token_ciphertext`。浏览器角色只能访问自己的行，
  且无法取得用于解密的 Vercel server-only 密钥；明文 token 不写入 PostgreSQL。
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
3. 在 Vercel Production 环境增加 `CRON_SECRET`：使用密码管理器生成一段随机字符串。
   它只用于 Vercel 每天 03:15（中国标准时间）的云端同步请求，绝不能使用
   `NEXT_PUBLIC_` 前缀。
4. 重新部署后，登录 `/calendar`，点击“连接 Outlook”。Calendar 2.0 的 Device Code scope
   包含 `MailboxSettings.ReadWrite`。旧连接的 refresh token 不会自动获得新增权限，页面会
   明确要求重新授权，并以 `oauth_scope_version = 2` 记录迁移状态。Microsoft 页面会要求输入
   一次性代码；完成后返回本页点击“我已完成授权，检查连接”。
5. 点击“对齐”读取 Outlook Event、Master Categories 与 To Do，并将一份独立快照保存到 Supabase。
   新建日程始终先进入待确认队列，确认后才发送到 Outlook。

## Calendar 2.0 分类模型

- Outlook `masterCategories` 保存分类名称和 `preset0…preset24` 颜色；Personal OS 的
  `calendar_categories` 只是 owner-only 只读缓存。
- Outlook `Event.categories` 保存事件真实分类；`calendar_events.categories`、`importance`
  与 `show_as` 均由 Graph 同步，不使用独立的本地颜色字段。
- Personal OS 只会在用户点击“初始化分类”后创建稳定 managed taxonomy。已有 Outlook
  分类作为 `external` 原样保留，系统不会自动删除、改名或重新着色。
- 只改时间或标题时，PATCH 不携带未指定分类；即使 Graph 返回部分对象，缓存回写也使用
  原值兜底。未分类日程只能逐条预览并确认，不进行静默批量整理。

无需设置 Microsoft Client ID、Client Secret、Redirect URL、Mac bridge 或桥接 token。

## 验收与限制

使用专用测试日历验证：刷新读取、创建草稿不写入、确认后创建成功、刷新仍显示、断开
浏览器会话后再次登录仍可刷新。完成后删除测试日程。

- 每日同步是低频备份机制，不是实时双向协作；紧急变更可使用手动“立即对齐并备份”。
- 快照保留日程和 To Do 文本、时间、状态与列表信息，但不保存 Microsoft Refresh Token。
- 第一版尚不提供从快照直接恢复写回 Microsoft 的按钮；数据仍可通过 Supabase 导出/迁移。
- 此模式依赖上游公共 client 持续可用。若 Microsoft 或上游策略改变，应注册自己的
  Entra App 并迁移 client ID。
