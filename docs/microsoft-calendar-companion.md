# Microsoft Calendar Companion（技术验证）

## 决策

Life of HANG 的 Vercel 应用不直接运行 Microsoft 365 MCP，也不保存
Microsoft Refresh Token。Calendar 的权威来源仍是 Outlook。当前先验证一个
**本机、仅 Calendar、最小权限**的 Companion；尚未把它接入 Personal OS 的
页面、Supabase 或 AI。

使用的上游项目是 [Softeria/ms-365-mcp-server](https://github.com/softeria/ms-365-mcp-server)，
固定 npm 版本为 `0.136.0`，并由
`tools/microsoft-calendar-companion/package-lock.json` 锁定。

## 当前边界

```text
Mac 本机
  └─ Microsoft Calendar Companion
      └─ MSAL Device Code + Microsoft Graph
          └─ Outlook Calendar（权威来源）

Vercel / Supabase / GitHub
  └─ 不保存 Microsoft access token、refresh token 或 token cache
```

- 只启用 `calendar` preset。
- 有效 Microsoft Graph 委派权限仅为 `User.Read` 和 `Calendars.ReadWrite`；
  `offline_access` 仅用于本机会话续期。
- 不申请 Mail、Files、Contacts、Teams 或组织级权限。
- 个人 Microsoft 账户强制使用 authority `consumers`。上游项目在 2026 年
  的说明指出，其内置公共客户端在 `common` authority 下刷新令牌可能失败。
- Token 优先存入 macOS Keychain。Keychain 不可用时，才退回
  `~/Library/Application Support/Life of HANG/microsoft-calendar/` 中的私有文件。

## 已验证

- Node.js `v22.13.0` 满足上游项目要求。
- 上游 package 已固定为 `0.136.0`。
- 通过 `--preset calendar --allowed-scopes 'User.Read Calendars.ReadWrite offline_access'`
  检查到 Calendar 工具面仅保留 Calendar 和 User 相关操作。
- 需要 `MailboxSettings.Read` / `MailboxSettings.ReadWrite` 的 Outlook 分类工具
  被权限白名单自动禁用。

## 仍需人工完成

Device Code 登录必须由账户本人在 Microsoft 官方页面完成。登录后才可安全
验证以下内容：读取未来七天、在专用测试日历创建/更新/删除测试事件、重启后
静默恢复、撤销授权后的失效表现。不得在默认生产日历上进行无确认的写入测试。

## 后续集成门槛

只有技术验证全部成功后，才建立下一层：Personal OS 的确认式操作队列、
本机 Companion 拉取器、Graph Event ID 回写、审计以及缓存。该阶段应保持：

```text
用户确认 → 受校验的操作请求 → 本机 Companion → Graph 成功 → 缓存/审计更新
```

不能先写 Supabase 缓存再假装 Outlook 已成功；不能让 AI 或网页直接持有
Microsoft Token。
