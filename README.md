# Personal OS

私人、可迁移的个人数据与决策系统。当前分支提供 Phase 1 应用壳、密码登录保护、Supabase SSR 基础和可审查的数据库 migration；Career、Investing、Files、Photos、Reviews 仅为导航占位。

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

迁移文件位于 `supabase/migrations/`；它创建 profiles、areas、projects、notes、note_versions、tasks、inbox_items、activity_events、audit_logs，并为所有业务表启用 RLS。`note_versions` 是 append-only。

## 质量与 Git 工作流

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

在功能分支开发，所有 migration 先进入 Git 再在正确项目应用。不要直接推送 main；创建 PR 前运行上述检查。

## 安全与导出

服务端通过 Supabase `getClaims()` 检查会话和 OWNER_EMAIL；浏览器传入的 user_id 不被信任，数据库 RLS 再次隔离数据。数据导出、Markdown 笔记版本、自动保存和 CRUD Server Actions 仍待后续提交完成；绝不使用 service-role key 作为应用运行依赖。

## 故障排查

- 登录提示未配置：检查 `.env.local` 的两个 `NEXT_PUBLIC_SUPABASE_*` 变量与 `OWNER_EMAIL`。
- 登录后被拒绝：确认 Auth 用户邮箱精确匹配 `OWNER_EMAIL`（忽略大小写）。
- migration 无法连接：确认当前目录 `supabase link --project-ref rurzksvjefwjvswjgiup` 已成功，并在本机输入数据库密码。
