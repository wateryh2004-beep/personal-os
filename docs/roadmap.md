# Phase 1 施工路线图

## 0. 已完成：规划基线

- 确认当前目录为空且非 Git 工作树；未发现冲突代码。
- 确认本机 Node 22.13.0、npm 10.9.2、pnpm、Supabase CLI、Git、GitHub CLI 和 ripgrep 可用。
- 完成本套规范；未初始化项目、未建表、未部署、未推送。

## 1. 初始化工程与质量门（已完成于 `codex/phase-1-foundation`）

1. 在目标 Git 工作树中用 `pnpm create next-app` 初始化 TypeScript strict、App Router、Tailwind、`src/` 与 `@/*` alias；生成 lockfile。
2. 配置 ESLint、Prettier（如团队需要）、Vitest/Playwright 的最小质量门与 `.env.example`、`.gitignore`。
3. 用 shadcn CLI 初始化并选择 Radix；只添加 Phase 1 实际使用的 UI 组件。
4. 初始化 Supabase CLI，本地 config 与首个空 migration；生成类型的命令进入 package scripts。

## 2. 数据库、安全与认证（基础 migration 已应用）

1. 新建 migration：profiles、Areas/Projects/Tasks、Inbox、Notes/Versions、活动/审计、导出作业、枚举/检查约束、索引和 `updated_at` 触发器。
2. 在同一 migration 启用并测试 RLS，建立 profile 创建触发器与受控 audit 写入方案。
3. 配置 Supabase Auth 的 redirect URL、Magic Link SMTP 策略与 Vercel 环境变量；实现 SSR clients、proxy 与 `/auth/callback`。
4. 先写跨用户 RLS integration tests，再编写业务 UI。

## 3. 应用壳与设计令牌（基础壳已完成）

1. 实现 Root/Auth/App layouts、受保护路由、导航、响应式壳、基础 token 和可访问性基线。
2. 实现 Command Palette 与 Quick Capture 的界面骨架，不接 AI、不做全文搜索承诺。
3. 建立通用表单、空状态、详情栏与 activity UI 原语。

## 4. 领域模块（按顺序）

1. Inbox：捕捉、列表、处理/归档与转换来源。
2. Areas 与 Projects：CRUD、状态、归档。
3. Tasks：创建、分组、状态、日期、项目/Area 关联，所有普通写入用 Server Actions。
4. Today：聚合今日任务、待处理 Inbox、活动；以读模型查询而非重复数据表实现。
5. Notes：Markdown 编辑、版本保存/查看/恢复、归档。
6. Settings：profile、时区/语言、导出作业状态。

## 5. 导出、验证与发布准备

1. 实现导出 job、私有 Storage、manifest、ZIP 与受保护下载；明确过期规则。
2. 完成关键路径 E2E、RLS、Server Action 验证、移动端与键盘可访问性检查。
3. 在独立的部署任务中连接 Vercel/Supabase、设置 secrets、迁移生产库、预览验收。此阶段才考虑部署。

## Career Module Phase 1（进行中）

- 已创建 `codex/career-foundation` 分支和可审查 migration；远端尚未应用该 migration。
- 已实现职业档案、方向、经历、Facts/Outputs/Bullets、技能、证书、核心文件/关联表、私有文件上传、Career 搜索和脱敏 JSON 导出骨架。
- 待完成：迁移远端应用与双用户 RLS 验证、体验级编辑/归档界面、私有签名下载、全模块搜索与 CSV/ZIP 导出。

## Notes Workspace Phase 2（进行中）

- Notes 已从占位页迁移为真实 PostgreSQL 读取和 Markdown 编辑基础；自动保存、revision 冲突提示、GFM 安全预览、文件夹与 Wiki Link 解析已进入功能分支。
- 已修复基础 migration 与 Notes Workspace migration 不一致时“新建后列表为空”的错误：基础 `notes` 表仍可读取、打开和编辑笔记；页面会明确显示兼容模式，而不会静默吞掉 schema 错误。
- 待完成：版本恢复、回收站页面、标签管理、附件下载、全文搜索、Markdown 导入导出与远端 RLS 验证。

## 需要用户手动提供/配置

- GitHub CLI 已重新登录且网络可用；首次提交与推送留待明确要求发布时进行。
- 已确认 Supabase 项目 `rurzksvjefwjvswjgiup`（`ACTIVE_HEALTHY`）可由当前 CLI 账号管理，本地 `supabase/` 已初始化并成功关联；之后再配置 Auth redirect URL。数据库密码不写入仓库或环境文件。
- Magic Link 已确定；生产部署前仍需 SMTP 提供商与发件域。
- Vercel 项目及环境变量，仅在准备部署时配置。
- 时区默认值（建议 `Asia/Shanghai`）与数据导出格式偏好（建议 JSON + Markdown + CSV manifest ZIP）。

## 风险与不确定性

- 当前目录已初始化为本地 Git 工作树，分支为 `main`，远端指向给定 GitHub 仓库；GitHub CLI 已验证有访问权限，远端仓库为空，尚未提交或推送。
- Supabase SSR 文档仍标注 `@supabase/ssr` 为 beta，需锁定依赖版本并在升级时回归验证。
- 任务时间粒度、登录方式、笔记附件和导出作业执行环境尚未确认；路线图已采用最小且可迁移的默认值。
- Vercel 无常驻后台任务；导出量增长后需选择安全的异步执行器/队列。Phase 1 应限制导出大小并保留可替换 Adapter 边界。
- 个人数据需要备份、导出保留期和失窃设备策略；这些是部署前必须补全的运行决策。
