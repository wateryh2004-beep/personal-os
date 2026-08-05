# Personal OS 协作约定

## 范围与原则

- Personal OS 是 Hang Yu 私人使用、可长期维护且可迁移的模块化单体。
- 先完成当前阶段；不得预先实现未进入路线图的 Career、Investing、AI、Outlook、照片或自动化功能。
- 数据模型不得使用万能 `items` 表或 EAV。每个业务表均应有 `user_id`、时间戳和适当的归档字段。
- 笔记正文以原始 Markdown 保存。删除优先归档；重大内容修改必须保留版本。

## 技术约束

- Next.js App Router + TypeScript strict + Tailwind CSS + shadcn/ui（Radix）+ Supabase。
- 默认 Server Components；普通写入使用 Server Actions；Route Handlers 只用于 OAuth、Webhook、导出等 HTTP 边界。
- 所有数据库变更均为可审查的 Supabase migration，并进入 Git。
- 从服务端认证 session 取得身份；绝不接受浏览器提交的 `user_id`；业务表必须启用 RLS。
- 不得提交真实密钥、service role key、数据库密码或 `.env.local`。客户端仅可使用 Supabase URL 与 publishable key。

## 工作方式

- 修改既有代码前先检查工作树；保留无关的用户改动。
- 为新增行为补充比例适当的测试、类型检查与 lint 验证。
- 外部服务统一置于 `src/lib/adapters/` 后；领域代码不得直接依赖供应商 SDK。
- 提交前检查 migration、RLS、输入 Zod 校验、审计与归档行为。

完整产品、架构、设计、安全与实施顺序见 `docs/`。

<!-- BEGIN:nextjs-agent-rules -->

Next.js 版本说明：修改 App Router 代码前，先阅读 `node_modules/next/dist/docs/` 中对应的当前版本文档；遵循其 deprecation 提示。

<!-- END:nextjs-agent-rules -->
