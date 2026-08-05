# Personal OS：架构与数据模型

## 形态与技术选择

采用可迁移的模块化单体：一个 Next.js 应用、一个 Supabase PostgreSQL 项目、一个 Supabase Storage 桶。按领域分模块，而不是拆微服务。

- Next.js App Router、TypeScript `strict`、Tailwind CSS、shadcn/ui（明确选择 Radix primitives）。
- Server Components 为默认读取层；Client Components 仅用于编辑器、命令面板、交互状态等浏览器能力。
- Server Actions 处理正常表单写入；Route Handlers 仅处理 `/auth/callback`、将来的 webhook/OAuth 回调和导出文件下载等 HTTP 边界。
- Supabase 使用 `@supabase/ssr` 的 cookie SSR 客户端、PKCE、`proxy.ts` 会话刷新。服务端鉴权使用 `getClaims()`，不以 `getSession()` 的 user 对象作授权依据。
- 所有第三方连接放入 Adapter；当前无外部业务 Adapter 实现。

### 本机 Microsoft Calendar Companion（技术验证）

Microsoft Graph 的 Device Code 与 MSAL token cache 不适合放入 Vercel 的无状态
运行时。当前使用仓库中的独立 Node 工具
`tools/microsoft-calendar-companion` 对固定版本的 Microsoft 365 MCP 做本机、最小
权限验证：

```text
Mac 本机 Companion → Microsoft Graph → Outlook Calendar（权威来源）
```

它不连接 Supabase，不开 HTTP 端口，也不将 Token 交给 Next.js。只有其测试通过后，
才会添加明确的 Adapter 和确认式命令队列；届时仍必须保持 Outlook 为权威来源，
不能由本地缓存独立产生或覆盖事件。

当前官方依据：Next.js App Router 页面和布局默认是 Server Components，Server Actions 用于变更；Supabase 的 Next.js SSR 指南要求 server/browser 两类客户端以及 Proxy 刷新 cookie；shadcn 的 Next.js CLI 支持选择 Radix。见 [Next.js App Router](https://nextjs.org/docs/app)、[Next.js Server Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)、[Supabase SSR](https://supabase.com/docs/guides/auth/server-side/nextjs) 和 [shadcn Next.js](https://ui.shadcn.com/docs/installation/next)。

## 建议目录

```text
.
├── docs/                         # 受版本控制的产品与工程决策
├── supabase/
│   ├── migrations/                # 唯一的 schema 演进来源
│   ├── seed.sql                   # 仅本地开发数据，禁止真实个人数据
│   └── config.toml
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (app)/{today,inbox,areas,projects,tasks,notes,settings}/
│   │   ├── auth/callback/route.ts
│   │   └── api/exports/[id]/route.ts
│   ├── components/{ui,layout,shared}/
│   ├── features/
│   │   ├── inbox/                 # actions, queries, schemas, components
│   │   ├── areas/
│   │   ├── projects/
│   │   ├── tasks/
│   │   ├── notes/
│   │   ├── activity/
│   │   └── exports/
│   ├── lib/{supabase,auth,adapters,utils}/
│   └── types/database.ts          # Supabase 生成类型；不手写 schema 真相
├── tests/{unit,integration,e2e}/
├── public/
└── .env.example                   # 仅变量名与说明
```

`features/<domain>` 是领域边界；跨域 UI 放 `components/shared`。`app` 只承担路由、布局与页面组合，防止页面文件变成业务逻辑仓库。

## Phase 1 表与关系

所有下列表位于 `public` schema，均含 `id uuid primary key default gen_random_uuid()`、`user_id uuid not null references auth.users(id)`（除非另有说明）、`created_at timestamptz not null default now()`、`updated_at timestamptz not null default now()`。业务删除使用 `archived_at timestamptz null`；查询默认排除已归档数据。

| 表 | 核心字段 | 关系与说明 |
| --- | --- | --- |
| `profiles` | `user_id`（PK）、`display_name`、`timezone`、`locale` | auth 用户的应用资料；注册触发器创建。 |
| `areas` | `name`、`description`、`sort_order`、`archived_at` | 一个 Area 有多个 Projects/Tasks。 |
| `projects` | `area_id nullable`、`name`、`description`、`status`、`target_date`、`completed_at`、`archived_at` | `status`: active/on_hold/completed/cancelled；可没有 Area。 |
| `tasks` | `area_id nullable`、`project_id nullable`、`title`、`notes_markdown`、`status`、`priority`、`due_date`、`planned_for_date`、`completed_at`、`sort_order`、`archived_at` | `status`: inbox/next/in_progress/waiting/completed/cancelled；约束 project 和 area 若同时存在时必须属于同一用户。 |
| `inbox_entries` | `content_markdown`、`source`、`processed_at`、`converted_task_id nullable`、`converted_note_id nullable`、`archived_at` | 原始捕捉不可被“移动”丢失；转换后保留来源与处理时间。 |
| `notes` | `title`、`body_markdown`、`excerpt`、`pinned_at`、`archived_at` | 正文唯一权威格式是 Markdown；`excerpt` 可由服务端派生。 |
| `note_versions` | `note_id`、`version_no`、`title`、`body_markdown`、`change_summary`、`created_by` | 不可变快照；`unique(note_id, version_no)`，恢复会创建新版本。 |
| `activity_events` | `event_type`、`entity_type`、`entity_id`、`occurred_at`、`metadata jsonb` | 用户可读时间线；metadata 是事件附加信息，不作业务字段或 EAV 查询。 |
| `audit_logs` | `actor_user_id`、`action`、`entity_type`、`entity_id`、`before jsonb`、`after jsonb`、`request_id`、`created_at` | 追加写、不可由普通用户更新/删除；敏感凭证永不写入。 |
| `export_jobs` | `status`、`requested_at`、`completed_at`、`expires_at`、`storage_path`、`format`、`error_code` | 导出作业元数据；文件在私有 `exports` bucket。 |

关系概览：`profiles 1—N {areas, projects, tasks, inbox_entries, notes, activity_events, audit_logs, export_jobs}`；`areas 1—N {projects,tasks}`；`projects 1—N tasks`；`notes 1—N note_versions`；`inbox_entries` 可选指向一个转换后的 task 或 note。所有外键使用显式索引（至少 `user_id`、常用状态/日期联合索引、外键列）。`updated_at` 由统一触发器维护。

不创建 `items`、`entities`、`properties` 或把 Notes/Tasks/Projects 压入 JSONB 的表。JSONB 仅用于审计/事件的非查询元数据。

实施时将 Inbox 表命名为 `inbox_items`，字段以 `content_markdown`、`processed_at` 和转换后的实体引用表达；这是明确的捕捉领域表，而非万能 items 表。

## 数据导出

导出是明确的领域能力：Server Action 创建 `export_jobs`；后台/受控执行器生成含 `manifest.json`、每个业务表 JSON/CSV、Notes 的 `.md`、版本记录及 Storage 文件清单的 ZIP，写至私有 bucket。下载通过经验证的短时签名 URL 或受鉴权的 Route Handler；文件到期删除，作业记录保留审计痕迹。首版不要求跨库实时复制。

## Career Module Phase 1

Career 使用独立、可迁移的标准关系表：`career_profiles`、`career_directions`、`experiences`、`experience_facts`、`experience_fact_versions`、`experience_outputs`、`experience_bullets`、`bullet_fact_links`、`skills`、`experience_skills`、`certifications`。通用 `profiles.display_name` 不复制到 Career Profile。`documents` 和 `entity_links` 位于 Core 层，供现有和未来模块复用；多态链接由受控枚举限制实体类型，并在 Server Action 中校验双方所有权。

Fact 的初始内容与每次更新均由数据库触发器追加到 `experience_fact_versions`；版本表不允许 UPDATE/DELETE。文件元数据进 `documents`，对象在私有 Storage 的 `{user_id}/career/.../{uuid}.{extension}` 路径；原始文件名仅做元数据。导出目前为经鉴权的 JSON Route Handler，默认脱敏 `credential_number` 并仅输出文件清单。
