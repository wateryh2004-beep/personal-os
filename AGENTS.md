# Personal OS 协作约定

## 开始任务必读

每个新实现或维护任务先读取 [文档索引](docs/README.md)、[项目治理](docs/project-governance.md) 和 [Agent 工作规范](docs/agent-workflow.md)，再按索引读取相关主规范与领域契约。检查目标目录适用指令、当前分支和工作树，保留无关用户修改。聊天中通过 GitHub 工作也主动读取；不能假定所有工具自动载入文档。

任务中规范变化、切分支或恢复上下文时重新核对涉及部分。无需每条消息重读全部历史文件。明确用户指示与已有授权持续有效；不重复索取相同授权，不从文档模板推导新权限。

## 任务阅读路由

| 任务 | 必读 |
| --- | --- |
| 产品、导航、业务流程 | [产品](docs/product-spec.md)、[术语](docs/glossary.md) 与相关领域规格 |
| 页面、组件、文案 | [设计](docs/design-system.md)、[交互](docs/design/interaction-clarity.md)、[文案](docs/design/content.md) |
| 动态反馈、步骤、路由、弹层 | 上述设计文档和 [动效](docs/design/motion.md) |
| 代码、依赖、接口、配置 | [架构](docs/architecture.md)、[工程](docs/engineering-standards.md) |
| 数据、同步、导入导出、迁移 | [数据](docs/data-governance.md)、[安全](docs/security.md) 与相关 contracts/领域契约 |
| 应用内 AI | [AI 治理](docs/ai-governance.md)、[上下文契约](docs/contracts/ai-context.md)、[工具契约](docs/contracts/agent-capabilities.md) |
| 检查、性能、发布、排障、恢复 | [质量](docs/quality-standards.md)、[性能](docs/performance.md)、[运行](docs/release-operations.md) 与相关手册 |

## 产品与技术不变量

- Personal OS 是余航私人使用、长期可维护且可迁移的模块化单体；当前模块范围以产品规范为准。
- Career Facts 是权威事实，Bullets 是表达版本；证据、问题类型、面试形式与能力分开，不能编造经历/答案来源或静默覆盖事实。
- 不实施招聘网站爬取、自动投递/联系或真实交易，不新增公开注册/多用户服务；新范围需明确任务。
- Next.js App Router + TypeScript strict + Tailwind + shadcn/Radix + Supabase；普通写入优先 Server Actions，HTTP API、OAuth、Webhook、流与导出等使用 Route Handlers。
- 第三方连接置于 `src/lib/adapters/` 后。Tasks/Calendar 的执行权威是 Microsoft To Do/Outlook；Notes 原始 Markdown 和私有文件原件保持可迁移。
- 身份来自经过验证的服务端 session/请求边界，绝不信任浏览器 `user_id` 或伪造身份头；业务数据启用 RLS 并校验关联归属。
- 不使用万能 `items` / EAV 数据模型；领域表有明确 owner、时间与归档语义，技术计数/队列按最小权限契约处理。
- 数据库变化进入可审查 migration；保留高价值内容版本、原件与审计，不擅自改写已部署迁移或永久删除资料。
- 真实密钥、密码、恢复答案/校验值、service role、数据库凭据和 `.env.local` 不进入源码、文档、日志或浏览器。公开变量仅用于明确可公开配置。

## 当前设计方向

暖白、深灰绿、少量轻卡片、宋体主标题与无衬线正文，精准对齐和简短文案。动效积极且完整设计，支持纵深、形态和连续空间过渡，覆盖中断/返回/减少动态效果。不得回退到旧文档中的青蓝、全无衬线或一律限制空间动效的规则。

设计 v2 是迁移目标，文档更新不代表页面已迁移。新/重构界面使用共享变量与组件，保留真实状态、必要标签、可发现性、键盘和触摸能力。

## 验证与交付

按变更风险选择真实检查，文档小改不强制全套浏览器回归。不得把局部 lint、合成测试、脚本存在、部署 READY 或无错误日志夸大为全仓/生产通过。

PR 说明问题、最终行为、实际验证和限制；运行变更记录配置/迁移顺序与回退。界面提供截图，动效提供录屏或可操作预览，证据使用合成或已授权数据。现有授权内持续推进；新增必要授权才提出具体问题并说明原因。

## Code Review Rules

- 标出跨用户数据/缓存泄漏、秘密或真实恢复答案外泄、伪造身份与成功、原件/版本丢失和未经授权的外部副作用。
- 标出与有效产品/设计/数据契约冲突的新增行为，以及只为通过测试而降低规则的改动。
- 核对新旧 schema/状态兼容、并发与重试、输入/焦点保留、动画可打断及性能证据条件。
- 区分目标规范、实现和历史验收；检查相关文档与任务证据一致。格式/链接等可自动化项不替代实质审查。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

