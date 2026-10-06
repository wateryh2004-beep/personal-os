# Outlook Calendar 同步运行手册

## 同步层级

- **Webhook（可选，当前每日方案不依赖）**：Microsoft Graph 对 `/me/events` 的订阅只传递变更信号。`/api/webhooks/microsoft/calendar` 先完成 `clientState` 验证，再将连接写入去重队列；它不保存 Graph 原始 payload 或事件正文。响应结束后由 worker 执行近期待办 delta。
- **近期待办 delta（每日刷新）**：过去 14 天至未来 60 天。首次读取建立固定窗口和 delta link，之后只拉变化；token 失效或不完整时只重建该窗口，不会回退为 910 天高频扫描。
- **全量对账（48 小时）**：过去 2 年至未来 180 天，修复漏通知、订阅中断、delta 失效和历史循环实例漂移。它是低频修复，不是实时路径。

## 调度

当前启用的是 **每日自动同步**，无需打开页面或点击按钮。现有 `/api/cron/microsoft-backup` 使用 Production 中已有的 `CRON_SECRET`，计划为 `0 23 * * *`（UTC），即北京时间次日 07:00–08:00 的执行窗口。Hobby 不保证整点到达。每次先处理变更队列；深度对账未到期时执行近 14 天 / 未来 60 天的增量同步，到期时进行 48 小时一次的宽窗口对账与备份。保留 Briefing、Files 的既有每日任务。

`/api/cron/calendar-sync` 仍是受同一个 secret 保护的可选增量端点，**当前没有配置小时调度**。Hobby 当前允许每项目 100 个 cron，但单个任务只能每日运行。未来小时级需求需要 Pro 或另行授权的外部调度器，不通过重复创建每日任务绕过限制。

每日轮询不会新建或续订 Graph webhook，也不会创建、编辑、邀请或删除 Outlook 日程。OAuth 只使用既有授权。Webhook 的独立配置不影响每日轮询。

参考：[Vercel 当前 cron 限制](https://vercel.com/docs/cron-jobs/usage-and-pricing)、[Microsoft calendarView delta 语义](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0)。

`/api/cron/microsoft-backup` 记录 `calendar_sync_cron_runs`，包括开始/结束、连接数、成功/失败、耗时、错误码和下次计划时间。每个具体同步还记录在 `calendar_sync_runs`；两者都不存 token、事件正文或 Graph payload。

## 状态解释与排障

Calendar 页面只以 `calendar_last_delta_sync_at` / `last_sync_at` 判定新鲜度，绝不使用 `last_seen_at`。后者可能仅表示 To Do 或 token 刷新成功。

1. 查看 Calendar 的“最后成功”“后台每日同步”“下次后台同步”时间。未观察到后台完成记录时明确显示尚未验证，不用手动同步时间虚构调度。
2. 若同步失败，检查记录的错误码；只有明确授权失效才重新连接 Outlook，不因普通网络失败要求重新授权。已有缓存保留。
3. 若每日后台任务未运行，在 Vercel Cron 查看 `/api/cron/microsoft-backup` 的计划和日志，确认 Production 的既有 `CRON_SECRET` 生效。发布后可用 Vercel 的 Run 验证同一路径；代码已上线不等于观察到了成功运行。
4. 只有明确 cursor 过期才清除并重建窗口；网络、分页或补全失败不推进 cursor、不推断删除。被运行时终止的同步在 30 分钟后由下一次任务回收锁。队列处理不会吞掉执行中到达的新通知。

## 写入方向

Outlook 是日程权威源。Personal OS 的创建、编辑、删除仍必须经过人工确认；确认后立即写入 Graph 并刷新本地镜像。Outlook 侧变更经 webhook / delta 拉回。同步锁由 `calendar_sync_runs` 的“每连接最多一个 running run”唯一约束保证，避免高低频 worker 互相覆盖。
