# Personal OS 文档索引与规范地图

状态：有效总入口。维护日期：2026-10-14。适用范围：本仓库全部规划、开发、审查和维护。先读 [项目治理](project-governance.md) 与 [Agent 工作规范](agent-workflow.md)，再按任务读取相关内容。

## 如何使用

给 Agent 分派任务时，可直接复制 [Agent 使用指南](agent-quickstart.md) 中的短指令；它说明两个总入口与按任务选择的前置文档。

- **主规范**规定长期要求；**领域契约/手册**解释具体边界；**功能规格**限定一次开发；**决策**保存选择理由；**验收/事故记录**只证明某次观察；**模板**不代表已执行。
- 当前任务指示、已有授权和平台约束持续有效。主规范之间的冲突、例外与维护遵循项目治理；不能从模板或路线图推导新的生产权限。
- 文档规定、代码实现和生产验证分别记录。本分支已实施设计 v2 迁移；覆盖与验证边界见 [全系统排查](verification/2026-10-14-system-standards-v2.md)，不等于生产已发布。
- 现有代码与历史截图不是永久目标；旧文档中的 Magic Link、空仓库、无 Adapter、青蓝和短动效等冲突内容按当前主规范处理。
- 新增有效主规范必须登记在这里，避免多份同义权威。领域参考中的安全、事实、原件和审计边界继续保留；历史步骤或状态需要核对当前实现。

## 主规范与长期契约

| 文档 | 职责 |
| --- | --- |
| [项目治理](project-governance.md) | 目标取舍、责任、授权、权威顺序、例外与维护 |
| [产品与业务](product-spec.md) | 模块职责、核心流程与业务不变量 |
| [术语与信息结构](glossary.md) | 统一词义、导航与概念边界 |
| [设计 v2](design-system.md) | 暖白、深灰绿、宋体标题、轻卡片与迁移目标 |
| [动效与空间](design/motion.md) | 完整运动定义、积极编排、打断与可访问替代 |
| [界面文案](design/content.md) | 简短直接、必要标签、真实状态与视觉引导 |
| [交互语义](design/interaction-clarity.md) | 可发现性、焦点、展开与操作；旧批次证据单独识别 |
| [架构基线](architecture.md) | 职责分层与领域结构；Phase 1 表仅作历史基础 |
| [工程与接口](engineering-standards.md) | 编码、依赖、API、配置与 Git 审查 |
| [数据治理](data-governance.md) | 模型、质量、权威源、同步、迁移与生命周期 |
| [安全与认证](security.md) | 身份、RLS、秘密、恢复凭据及带日期发布记录 |
| [应用内 AI](ai-governance.md) | 上下文、工具、提案、事实、隐私与预算 |
| [质量与验收](quality-standards.md) | 按风险选择检查、多端、真实证据与性能测量 |
| [性能](performance.md) | 反馈预算、缓存/编辑器/导航正确性；运动总时长引用动效规范 |
| [运行与恢复](release-operations.md) | 环境、发布、配置、监控、事故、成本与交接 |
| [备份专门手册](system-backup.md) | 快照、原件、格式、校验和与隔离恢复 |
| [运行状态契约](system-status.md) | 权威源、缓存、新鲜度、同步失败与恢复 |

[当前路线图](roadmap.md) 记录工作顺序；[重要决策](decisions/README.md) 保存选择；[条件性服务要求](future-service-requirements.md) 覆盖未来团队、公开、收费、开源及更高可靠性需求，当前不启用这些业务。

## Agent 任务阅读路由

| 任务 | 在通用入口之外读取 |
| --- | --- |
| 产品、命名、导航与新功能 | 产品、术语、对应领域参考，必要时建立功能规格 |
| 页面、组件、文案、状态与动画 | 设计、交互、文案、动效、质量，保留相关数据与安全契约 |
| 代码、依赖、HTTP API 或配置 | 架构、工程、质量，外部服务再读对应契约 |
| 数据、同步、迁移、导出或恢复 | 数据、安全、状态、备份及对应领域手册 |
| 应用内 AI / 工具 / 检索 | AI 治理、上下文与工具契约、数据和安全 |
| 性能、部署、排障或成本 | 性能、质量、发布运行及对应功能手册 |
| 纯文档整理 | 项目治理、受影响规范、链接和真实实现依据 |

根入口见 [AGENTS.md](../AGENTS.md)，兼容入口见 [CLAUDE.md](../CLAUDE.md)。不是所有执行环境都会自动读取，无法自动加载时主动获取；规范更新或恢复上下文时重核对涉及部分，不机械重读全部历史。

## 34 个主题的覆盖

这些是主题而非 34 份重复文件。部分主题由同一主规范负责，领域手册补充细节。

| 编号 | 主题 | 维护位置 |
| --- | --- | --- |
| 1 | 产品目标与范围 | [product-spec.md](product-spec.md) |
| 2 | 优先级与取舍 | [project-governance.md](project-governance.md) |
| 3 | 术语与信息结构 | [glossary.md](glossary.md) |
| 4 | 业务规则 | [product-spec.md](product-spec.md) |
| 5 | 单项功能规格 | [templates/feature-spec.md](templates/feature-spec.md) |
| 6 | 视觉设计 | [design-system.md](design-system.md) |
| 7 | 交互与状态 | [design/interaction-clarity.md](design/interaction-clarity.md) |
| 8 | 动效 | [design/motion.md](design/motion.md) |
| 9 | 界面文案 | [design/content.md](design/content.md) |
| 10 | 多端与无障碍 | [quality-standards.md](quality-standards.md) |
| 11 | 技术架构与模块边界 | [architecture.md](architecture.md) |
| 12 | 编码与组件复用 | [engineering-standards.md](engineering-standards.md) |
| 13 | 依赖管理 | [engineering-standards.md](engineering-standards.md) |
| 14 | 接口与外部集成 | [engineering-standards.md](engineering-standards.md) |
| 15 | 环境与配置 | [release-operations.md](release-operations.md) |
| 16 | 数据模型与质量 | [data-governance.md](data-governance.md) |
| 17 | 权威来源与同步 | [data-governance.md](data-governance.md) |
| 18 | 数据库变更 | [data-governance.md](data-governance.md) |
| 19 | 身份与权限 | [security.md](security.md) |
| 20 | 秘密与隐私 | [security.md](security.md) |
| 21 | 数据生命周期 | [data-governance.md](data-governance.md) |
| 22 | 测试与验收 | [quality-standards.md](quality-standards.md) |
| 23 | 性能与容量 | [performance.md](performance.md) |
| 24 | 变更与发布 | [release-operations.md](release-operations.md) |
| 25 | 回退与恢复 | [release-operations.md](release-operations.md) |
| 26 | 监控与排障 | [release-operations.md](release-operations.md) |
| 27 | 备份与恢复演练 | [system-backup.md](system-backup.md) |
| 28 | 成本与资源预算 | [release-operations.md](release-operations.md) |
| 29 | 开发 Agent 工作规则 | [agent-workflow.md](agent-workflow.md) |
| 30 | 应用内 AI 功能规则 | [ai-governance.md](ai-governance.md) |
| 31 | 审查与完成标准 | [quality-standards.md](quality-standards.md) |
| 32 | 重要决策记录 | [decisions/README.md](decisions/README.md) |
| 33 | 文档维护 | [project-governance.md](project-governance.md) |
| 34 | 项目归属与交接 | [project-governance.md](project-governance.md) |

## 模板与实例

| 模板/记录 | 使用时机 |
| --- | --- |
| [功能规格](templates/feature-spec.md) | 涉及流程、数据或多个组件的任务；小修复可在 PR 简写 |
| [决策记录](templates/decision-record.md) | 重要方向或架构选择 |
| [验收记录](templates/verification-record.md) | 记录实际环境、命令、结果和限制 |
| [事故记录](templates/incident-record.md) | 影响、恢复、根因与预防 |
| [例外记录](templates/exception-record.md) | 有范围和复查条件的规则例外 |
| [PR 模板](../.github/PULL_REQUEST_TEMPLATE.md) | 描述具体结果、验证和运行影响 |
| [2026-10-14 设计与治理决策](decisions/2026-10-14-design-and-governance.md) | 本轮确认依据与目标/实现区分 |
| [本次文档验收](verification/2026-10-14-project-standards.md) | 本次范围、实际检查和未验证部分 |
| [首批设计迁移规格](specs/auth-and-today-design-v2.md) | 登录、找回密码与 Today 的目标；实现与验收见关联记录 |

仓库内 Markdown 链接/锚点、主入口和 34 主题编号可通过 `node scripts/check-project-docs.mjs` 检查；`Project documentation` 工作流在相关变更时执行。它不验证互联网链接、文档事实、视觉质量或生产状态，仍需按质量规范审查。

## 既有领域参考与历史登记

下表保留现有文件，避免把旧方案和验收日志自动当成全局规则。领域参考的精确现状需对照当前代码、migration 与部署；它们细化主规范，不放宽权限/隐私/原件保护。带日期验收不代表当前 head 或生产。

| 文件 | 类型与使用边界 |
| --- | --- |
| [Cached private PDF covers (test branch)](cached-pdf-covers.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Outlook Calendar 同步运行手册](calendar-sync-operations.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [投递与面试工作流](career/APPLICATION_WORKFLOW.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career 数据模型与保留计划](career/DATA_MODEL.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career 信息架构](career/INFORMATION_ARCHITECTURE.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Interview learning workspace](career/INTERVIEW_LEARNING.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career Migration](career/MIGRATION.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career War Room V1](career/PRODUCT.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Resume 版本与冻结](career/RESUME_VERSIONING.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career Roadmap](career/ROADMAP.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Career 安全与隐私](career/SECURITY.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Agent capability contract](contracts/agent-capabilities.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [AI context contract](contracts/ai-context.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Calendar time contract](contracts/calendar-time.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Daily flow usability changes](daily-flow-verification.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Core flow optimization · 2026-10-06](design/core-flow-optimization-2026-10-06.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Files upload and archive integrity foundation](files-recovery-upload.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Files architecture contract](files/architecture-contract.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Files 浏览与照片管理（本地候选）](files/browser-management.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [PDF first-page covers](files/pdf-first-page-covers.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Files 可迁移导出、分包与隔离恢复演练](files/portable-export.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Files 私有 PDF / 图片预览](files/private-preview.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Settings: bounded R2 storage inspection](files/r2-storage-inspection.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Private PDF reading continuity](files/reading-continuity.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Files 离线恢复体验与分卷校验](files/restore-experience.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Private resumable Files uploads](files/resumable-uploads.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Investment daily overview](investment-daily-overview.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Investment journal V1](investment-v1.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Leisure: a gallery for the good hours](leisure-cinematic-redesign.md) | 历史视觉方案及素材来源边界；冲突视觉以设计 v2 为准 |
| [Leisure detail editions · October 5 refinement](leisure-detail-editions.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Leisure migration impact and rollback boundary](leisure-migration-impact.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [闲暇 persistence contract](leisure-persistence.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Private promotional artwork in R2](leisure-private-artwork.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [闲暇 implementation and verification](leisure-verification.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Microsoft Calendar Companion（已弃用的本机诊断工具）](microsoft-calendar-companion.md) | 方案/演进参考；仅明确采纳且仍符合当前契约的部分生效 |
| [Microsoft Calendar 云端集成](microsoft-calendar-integration.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Integrated release checklist](optimization/release-checklist.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Search coverage and storage clarity](optimization/search-and-storage.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Startup and navigation: bounded October 7 change](optimization/startup-and-navigation.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Ten-item optimization program](optimization/ten-item-program.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Performance baseline and measurement protocol](performance-baseline.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Workspace navigation ownership](performance/navigation-resource-ownership.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Startup and navigation investigation — 2026-10-05](performance/startup-2026-10-05.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Personal Intelligence Agent](personal-intelligence-agent.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Personal OS 2.0 产品与技术架构方案](personal-os-2.0-architecture.md) | 方案/演进参考；仅明确采纳且仍符合当前契约的部分生效 |
| [Private document OCR](private-document-ocr.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Phase 1 施工路线图](roadmap.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Bounded runtime dependency security patch](security/runtime-dependencies-2026-10-07.md) | 领域参考/专门契约；核对当前实现与适用范围 |
| [Settings workspace redesign](settings-redesign.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [Typography and spacing refinement — October 2026](typography-spacing-verification.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |
| [UI responsiveness refinement — October 2026](ui-responsiveness-verification.md) | 历史批次/基线证据；状态与参数仅属于当时对象 |

## 已归档的原始主文件

- [原 README 配置上下文](history/readme-before-standards.md)：保留原来的详细说明和历史状态，当前操作从发布手册进入。

- [Phase 1 产品规格](history/product-spec-phase-1.md)：保留早期 Magic Link 与模块排除的上下文，由当前产品规范替代。
- [Phase 1 路线图](history/roadmap-phase-1.md)：保留当时环境、任务和未部署状态，不用于操作当前资源。
- [设计 v1](history/design-system-v1.md)：保留旧视觉依据，冲突条目由设计 v2 替代。

## 当前实现排查

[职业、笔记与日历工作区细化](specs/workspace-details-v2.md) 衔接全局迁移，规定页面内部的具体行为；结果与限制见 [2026-10-15 验收记录](verification/2026-10-15-workspace-details-v2.md)。

[依赖与部署闭包复核](security/runtime-dependencies-2026-10-14.md) 记录安全补丁、未使用 CLI 的移除及剩余告警判断。

[全系统规范排查与 v2 改造](verification/2026-10-14-system-standards-v2.md) 记录固定基线、逐模块覆盖、已修复问题和验证边界。全仓静态扫描不等于生产或真实设备验收。

[独立验证的隐藏笔记与文件](specs/private-vault.md) 记录暗格的交互、RLS、口令会话、草稿、备份和发布边界。已部署生产，实际验收范围与限制见其关联的日期记录。

## 尚未由文档建设完成的工作

本分支的样式、动画与交互实现见上述排查记录。真实设备字体与流畅度测量、完整多端验收、统一服务目标/告警/备份调度/保留期的实际配置仍需独立证据，不能因规范或合成回归存在就宣称完成。
