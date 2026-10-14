# Personal OS

余航的私人、可迁移的个人资料与决策系统。使用 Next.js、Supabase/PostgreSQL、私有 R2 存储，并连接 Microsoft Calendar、To Do 和受控 AI 能力。

## 文档与 Agent 入口

- [规范总索引与 34 个主题覆盖](docs/README.md)：主规范、模块契约、历史记录与任务阅读路由。
- [AGENTS.md](AGENTS.md)：开发 Agent 的工作入口；其他工具可通过 [CLAUDE.md](CLAUDE.md) 指向同一套规则。
- [产品规范](docs/product-spec.md)、[设计规范](docs/design-system.md)、[架构](docs/architecture.md)、[数据规范](docs/data-governance.md)、[安全规范](docs/security.md)。
- [质量与验收](docs/quality-standards.md)、[发布与恢复](docs/release-operations.md)、[当前路线图](docs/roadmap.md)。

文档规定与线上实现分别管理。2026-10-14 确定的设计 v2 是后续迁移目标，不表示本次文档变更已改变网站外观。

## 本地启动

按当前 CI 使用 Node 22，依赖版本以 `package.json` 与 `package-lock.json` 为准。

```bash
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

配置相应验证环境的 Supabase URL、publishable key 与 `OWNER_EMAIL`。真实秘密只进入受控本地/部署配置，不提交 `.env.local`。需要后台或第三方能力时按对应手册配置 server-only 凭据，不向客户端或普通日志暴露。

## 数据与集成

- Notes 的正文权威是 PostgreSQL 中的原始 Markdown，版本单独保存；源码仓库不是业务笔记存储。
- Files 原件主要位于私有 R2，元数据与归属位于 Supabase；历史 provider 原件按元数据定位。见 [文件契约](docs/files/architecture-contract.md)。
- Tasks / Calendar 以 Microsoft To Do / Outlook 为执行权威，Supabase 保存受保护缓存、队列和状态。见 [Microsoft 集成](docs/microsoft-calendar-integration.md)。
- AI 的上下文、提案、执行、审计和预算遵循 [AI 治理](docs/ai-governance.md)。
- 导出、备份的包含/排除范围与隔离恢复见 [系统备份](docs/system-backup.md)。

数据库变更进入 `supabase/migrations/`；先验证与审查，再按 [数据规范](docs/data-governance.md) 和 [运行手册](docs/release-operations.md) 核对目标与授权。不要把生产连接当作本地默认开发环境。

## 检查与交付

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run audit:ui
```

按变更风险选择检查，实际覆盖和结果以 [质量规范](docs/quality-standards.md) 与 `.github/workflows/` 为准。受影响文件 lint 成功不代表全仓通过，CI 合成场景不代表真实生产已验收。

在任务分支开发，通过 PR 说明问题、最终行为、验证和运行影响。密钥、真实恢复答案、私人原件和登录凭据不得提交；公开素材保留来源与许可边界。

