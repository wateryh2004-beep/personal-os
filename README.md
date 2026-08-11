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

## Files（Cloudflare R2）

Files 的对象正文存于私有 Cloudflare R2 bucket `life-of-hang-files-prod`；文件名、文件夹、大小、归属和归档状态存于 Supabase `documents` 与 `file_folders`，并由 RLS 隔离。R2 Bucket 不开启 Public Development URL 或自定义公开域名。

在 Vercel 的 Production/Preview 配置以下 server-only 环境变量：`R2_ENDPOINT`、`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` 与 `R2_BUCKET_NAME`。它们绝不能使用 `NEXT_PUBLIC_` 前缀。已有部署若已使用 Cloudflare Dashboard 风格的 `AccessKeyID`、`SecretAccessKey`（以及 `BucketName`）也可直接使用，应用会兼容读取。网页先经 owner 身份校验取得 5 分钟有效的单对象 PUT/GET URL，再直接与 R2 通信；R2 密钥不会下发到浏览器。还须在 R2 CORS 中仅允许实际应用域名和 `http://localhost:3000`。

```json
[
  {
    "AllowedOrigins": [
      "https://ACTUAL-PRODUCTION-DOMAIN",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

`AllowedOrigins` 必须与浏览器的 `window.location.origin` **精确匹配**：不能带结尾 `/`、`/files` 或其他 path。Vercel Preview 部署和 Production 域名属于不同 Origin，需要分别加入。可在登录后访问 `GET /api/files/storage-health` 区分服务器到 R2 的连接问题与浏览器 CORS 问题；该接口不会返回密钥、账户 ID、签名 URL 或供应商响应正文。

应用 Files migration 后可上传、下载、重命名、移动和归档文件。归档不删除 R2 对象；未来本地服务器迁移可通过替换 Storage Adapter 完成。R2 不是唯一备份，重要文件仍应定期导出至受控副本。

## Microsoft Calendar 与 To Do（权威执行层 + 私有备份）

Outlook Calendar 与 Microsoft To Do 是日程和任务的权威执行层。Personal OS 不建立平行
数据源；当前只读缓存与不可变备份快照保存在你的 Supabase 私有数据库中。`/calendar` 的“对齐”会同步两者并
生成一份本地云端快照。Vercel 每日会在云端低频执行同样的任务，不需要 Mac 常开。
在 Vercel Production 设置一个随机、server-only 的 `CRON_SECRET` 后才会启用计划任务。
`OWNER_USER_ID` 固定为唯一所有者的 Supabase Auth UUID，供不带浏览器会话的窄后台任务解析 owner；Cron 不接受请求参数中的用户 ID，也不会扫描 Auth 用户猜测 owner。

## RSS-first Briefing

`/briefing` 从服务器抓取并解析 RSS/Atom，按来源优先级、时效与显式关注主题进行确定性筛选，每日最多保留 8 条。系统不抓文章网页、不建立无限新闻流、不把 Feed Items 混入 Global Search 或 Proactive Engine。Vercel Cron 每天 `23:00 UTC`（北京时间 07:00）刷新最多 20 个订阅并生成当日 Briefing；必须同时配置 `CRON_SECRET`、`OWNER_EMAIL` 与 `OWNER_USER_ID`。

用户通过 Microsoft Device Code 在官方页面授权；Calendar 2.0 需要
`MailboxSettings.ReadWrite` 读取和维护 Outlook Master Categories。旧连接必须在“分类设置”
中重新授权一次，系统会记录 scope version，不会在后台重复请求并循环产生 403。Refresh Token 会在服务端加密后保存至
Supabase，短期 Access Token 不落库。日程创建仍采用明确确认队列。配置和验收步骤见
[`docs/microsoft-calendar-integration.md`](docs/microsoft-calendar-integration.md)。

## Calendar AI（DeepSeek）

在 Settings 的 **AI · DeepSeek** 中粘贴自己的 DeepSeek API Key。密钥在服务端加密后
保存，之后不会回显；不需要新增 Vercel 环境变量。Calendar 的对话框可查询已同步日程、
整理自然语言日程提案并从稳定 taxonomy 建议分类；分类、重要性和占用状态都会显示在冻结
提案中。只有用户确认后，确定性执行器才把它写入 Outlook Event，包括真实的
`Event.categories`。对话与必要的日历查询结果会发送到 DeepSeek，请不要向 AI 输入不必要的敏感内容。

## 故障排查

- 登录提示未配置：检查 `.env.local` 的两个 `NEXT_PUBLIC_SUPABASE_*` 变量与 `OWNER_EMAIL`。
- 登录后被拒绝：确认 Auth 用户邮箱精确匹配 `OWNER_EMAIL`（忽略大小写）。
- migration 无法连接：确认当前目录 `supabase link --project-ref rurzksvjefwjvswjgiup` 已成功，并在本机输入数据库密码。
