# Microsoft Calendar 集成

## 数据和信任边界

Outlook Calendar 是唯一权威来源。`calendar_events` 仅保存未来 14 天、由 Mac
Companion 回传的日程缓存；`calendar_operations` 保存待确认及已执行命令。两张表都
有 `user_id` 与 RLS。Microsoft access token、refresh token 和 MSAL cache 只保留在
macOS Keychain（或原有的私有 Application Support 回退目录），不会写入 Supabase、
Vercel、Git 或浏览器。

网页不会直连 Graph：它只创建草稿、展示确认按钮和读取缓存。操作确认后的流程是：

```text
确认 → queued → Mac bridge 领取 → Microsoft Graph 成功 → 缓存 / 审计回写
```

写入失败时操作显示 `failed`；系统不会先修改缓存再声称 Outlook 已成功。

## 一次性部署设置

1. 先运行本仓库根目录的 `supabase db push`，确认目标项目是
   `rurzksvjefwjvswjgiup`。这会创建 `calendar_connections`、`calendar_events`、
   `calendar_operations`、RLS 与状态机触发器。
2. 在 Vercel Production 和 Preview 配置现有的
   `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`、`OWNER_EMAIL`，
   再增加两个**服务器专用**变量：
   - `SUPABASE_SECRET_KEY`：Supabase Dashboard 的 Secret Key；只供受 bearer token
     保护的 Companion Route Handler 使用。
   - `CALENDAR_COMPANION_BRIDGE_TOKEN`：自行生成的随机值；不要使用 Microsoft、
     Supabase 或登录密码。
3. 重新部署 Vercel。不要将这两个变量加 `NEXT_PUBLIC_` 前缀，也不要放进 Git。
4. 登录 `/calendar` 并点击“启用连接”。页面会显示一个 connection ID。

## 启动 Mac bridge

在 `tools/microsoft-calendar-companion` 目录中，先完成现有的 `npm run login` 和
`npm run verify`。然后在**仅本机终端环境**配置以下值（不要写入仓库 `.env`）：

```bash
export PERSONAL_OS_CALENDAR_BASE_URL='https://你的-vercel-域名'
export PERSONAL_OS_CALENDAR_BRIDGE_TOKEN='与 Vercel 完全相同的随机值'
export PERSONAL_OS_CALENDAR_CONNECTION_ID='Calendar 页面显示的 UUID'
npm run bridge
```

`npm run bridge:once` 只执行一次领取检查，适合排错；`npm run bridge` 默认每 5 秒
轮询一次，且没有入站端口。可用 `PERSONAL_OS_CALENDAR_POLL_MS` 设置 1000–60000ms
间隔。将来若需自动启动，应使用本机受限 LaunchAgent，而不是 Vercel Cron。

## 验收顺序

1. 在专用测试日历中创建一条无敏感信息的测试日程，并点击 `/calendar` 的刷新。
2. 确认它出现在未来日程列表，且桥接在线时间更新。
3. 从网页创建一个日程草稿；确认它在 `pending_confirmation` 时 Outlook 没有变化。
4. 点击“确认执行”；bridge 执行后应显示 `succeeded`，并且 Outlook 与缓存都有新日程。
5. 用专用测试日历验证更新和删除协议，再删除所有测试事件。
6. 重启 bridge 后执行 `npm run verify` 和刷新，确认 Keychain 会话恢复。

## 当前限制

- 网页第一版只提供读取、刷新和创建；更新/删除的安全队列协议已预留，尚未暴露按钮。
- 不同步历史全量日程、不处理附件、邀请回复、分类、邮件或 Tasks。
- Graph 返回不带 offset 的非 UTC 日期时，bridge 会拒绝同步，避免悄悄把日程移动到错误时区。
