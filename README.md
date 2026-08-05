# Personal OS

私人、可迁移的个人数据与决策系统。当前分支提供 Phase 1 应用壳、密码登录保护、Supabase SSR 基础和可审查的数据库 migration，以及 Career Module Phase 1 的职业档案、经历、事实、成果、表达、技能、证书与私有证明材料。

## 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 填写 Supabase Project URL、publishable key 和唯一允许登录的 `OWNER_EMAIL`。不要写入或提交 service-role key、数据库密码或 `.env.local`。

## Supabase 与 Migration

本项目已关联 Project Reference `rurzksvjefwjvswjgiup`。先在 Supabase Auth Dashboard 手动创建 OWNER_EMAIL 对应的密码用户（关闭公开注册），再确认 migration SQL 后运行：

```bash
supabase db push
supabase migration list
```

迁移文件位于 `supabase/migrations/`；Career migration 新增 Career 数据表、通用 `documents`、`entity_links` 与 Storage RLS 策略。创建 migration 后，须在 Supabase Dashboard 的 Storage 新建**私有** bucket `private-files`（不要选择 Public），再执行 migration；`note_versions` 和 `experience_fact_versions` 均为 append-only。

## 质量与 Git 工作流

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

在功能分支开发，所有 migration 先进入 Git 再在正确项目应用。不要直接推送 main；创建 PR 前运行上述检查。

## 安全与导出

服务端通过 Supabase `getClaims()` 检查会话和 OWNER_EMAIL；浏览器传入的 user_id 不被信任，数据库 RLS 再次隔离数据。Career 导出使用 `GET /api/exports/career`，默认不包含证书编号或文件原件；文件只在私有 bucket 中通过受授权的会话访问。绝不使用 service-role key 作为应用运行依赖。

## Notes Workspace

Notes 的当前正文权威存储在 Supabase PostgreSQL `notes.body_markdown`，版本在 `note_versions.body_markdown`；新建笔记不会在 Mac 或 Vercel 文件系统中生成一个 `.md` 文件。你在 `/notes` 左侧看到的列表就是数据库中已保存的笔记；需要普通 Markdown 文件时，在笔记页点击“下载 Markdown”。Notes Workspace 使用 CodeMirror 直接编辑 Markdown，自动保存采用 revision 乐观并发控制。文件夹、Tags 和 Wiki Links 同样进入 PostgreSQL；附件继续使用私有 `private-files` Storage。单篇/全量 `.md` 导出与 Obsidian ZIP 导入将在 Notes Phase 2 的后续提交完成。

## Microsoft Calendar Companion（本机技术验证）

Outlook Calendar 仍是未来日历功能的唯一权威来源。为避免将 Microsoft
Token 放进 Vercel 或 Supabase，本仓库提供一个独立的本机 Companion：
[`tools/microsoft-calendar-companion`](tools/microsoft-calendar-companion)。它固定
`@softeria/ms-365-mcp-server@0.136.0`、仅启用 Calendar、只请求
`User.Read` 与 `Calendars.ReadWrite`，并优先使用 macOS Keychain 保存 Token。

它目前只是经过权限验证的本机桥接层，尚未接入网页、Supabase、AI 或 Tasks。
首次 Device Code 授权与专用测试日历的读写验证必须由账户本人完成；完整流程见
[`docs/microsoft-calendar-companion.md`](docs/microsoft-calendar-companion.md)。

## 故障排查

- 登录提示未配置：检查 `.env.local` 的两个 `NEXT_PUBLIC_SUPABASE_*` 变量与 `OWNER_EMAIL`。
- 登录后被拒绝：确认 Auth 用户邮箱精确匹配 `OWNER_EMAIL`（忽略大小写）。
- migration 无法连接：确认当前目录 `supabase link --project-ref rurzksvjefwjvswjgiup` 已成功，并在本机输入数据库密码。
