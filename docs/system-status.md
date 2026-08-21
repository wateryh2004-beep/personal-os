# 统一系统状态层

系统状态层是运行状态的只读视图，不是业务数据的第二权威源。它回答“数据能否信任、最后何时成功、为什么失败、下一步怎么恢复”，但不保存 Notes 正文、文件内容、provider payload、令牌或密钥。

异步适配器遵循 `SystemStatusAdapter`：业务 adapter 负责 provider I/O，统一状态层只接收无载荷的成功/失败结果和可重试性，不反向持有业务数据。

## 领域契约

| 域 | 权威源 | 副本/缓存 | 方向 | 刷新与恢复 |
| --- | --- | --- | --- | --- |
| Tasks | Microsoft To Do | Supabase 同步缓存 | 双向（写入先确认） | 手动/计划同步；失败后检查连接并重试 |
| Calendar | Outlook Calendar | Supabase 近期同步缓存 | 双向（确认队列） | 手动/计划同步；冲突不覆盖 Outlook，进入队列处理 |
| Notes | Supabase Notes | 无 | 无 | 本地持久化失败则不可用，保留版本与审计 |
| Files | R2 对象 | Supabase 文档元数据 | 写入 | 上传/校验失败可重新验证或上传 |
| Briefing | Supabase Briefing run | RSS 抓取缓存 | 拉取 | 在 Briefing 页重新生成；失败不展示半成品 |
| AI | 请求时模型响应 | Supabase 脱敏运行元数据 | 无 | 预算、配置或 provider 失败时停止/降级，不复用失败写入 |

状态取值：`fresh`、`stale`、`syncing`、`failed`、`conflict`、`unavailable`。优先级为 conflict/unavailable/failed 高于 freshness。所有对外写保持既有 Calendar 操作队列与 To Do provider-first 语义。

## 数据与保留

`system_domain_statuses` 每用户每域一行，保存权威源、缓存角色、同步方向、最近成功/尝试、重试时间、错误码与不超过 280 字的脱敏摘要。

`system_status_events` 是按幂等 `operation_key` 去重的追加事件时间线，包含尝试、成功、失败、重试、冲突和不可用事件。失败会递增 `retry_attempt`，按 30s、60s、120s…指数退避，最长 1 小时；成功会清零。建议由受控任务每 90 天归档，不删除 `audit_logs`。两表都启用 RLS；浏览器只读，受信任的 server-only worker 写入。

## 渐进接入

1. Calendar 与 Tasks 同步先写统一状态（已接入）。
2. Settings 从现有 Notes、Files、Briefing、AI 元数据推导初始健康度，迁移上线后逐步转为快照优先。
3. Files 提取、Briefing 抓取/生成、Notes 乐观并发保存和 AI run 已接入 `recordStatusSafely`；每次只记录错误码与摘要。
4. 可重试操作以稳定 operation key 去重，并由状态层统一计算退避；外部写操作只在 provider 明确未提交时重试。
5. 任何 provider 版本/修改时间不一致均写 `conflict`，展示详情入口，禁止静默覆盖权威源。

## 故障排查

Settings → 系统状态先看“最近成功”和“下一步”。连接错误到 Calendar/Tasks 重新连接或手动同步；Files 错误检查 R2/CORS；Briefing 错误重新生成；AI 错误检查 Settings 配置与预算。若状态事件与业务结果不一致，以权威源和 `audit_logs` 为准，状态写入本身不得阻断业务操作。
