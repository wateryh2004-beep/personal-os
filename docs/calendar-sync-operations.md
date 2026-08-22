# Outlook Calendar 同步运行手册

## 同步层级

- **Webhook（目标一分钟内）**：Microsoft Graph 对 `/me/events` 的订阅只传递变更信号。`/api/webhooks/microsoft/calendar` 先完成 `clientState` 验证，再将连接写入去重队列；它不保存 Graph 原始 payload 或事件正文。响应结束后由 worker 执行近期待办 delta。
- **近期待办 delta（每小时兜底）**：过去 14 天至未来 60 天。首次读取建立固定窗口和 delta link，之后只拉变化；token 失效或不完整时只重建该窗口，不会回退为 910 天高频扫描。
- **全量对账（48 小时）**：过去 2 年至未来 180 天，修复漏通知、订阅中断、delta 失效和历史循环实例漂移。它是低频修复，不是实时路径。

## 调度

`/api/cron/calendar-sync` 是受 `CRON_SECRET` 保护的 hourly worker endpoint，可由 Vercel Pro 或外部 scheduler 调用。Vercel Hobby 只支持每日 cron，且不保证小时内精确触发；Hobby 继续使用每日 `/api/cron/microsoft-backup` 做低频对账，并应配置外部 hourly scheduler。Webhook 正常时不依赖 hourly polling。

`/api/cron/microsoft-backup` 记录 `calendar_sync_cron_runs`，包括开始/结束、连接数、成功/失败、耗时、错误码和下次计划时间。每个具体同步还记录在 `calendar_sync_runs`；两者都不存 token、事件正文或 Graph payload。

## 状态解释与排障

Calendar 页面只以 `calendar_last_delta_sync_at` / `last_sync_at` 判定新鲜度，绝不使用 `last_seen_at`。后者可能仅表示 To Do 或 token 刷新成功。

1. 查看 Calendar 的“最后成功”“近期待办”“全量对账”时间。
2. 若 webhook 到期或没有收到通知，检查 `APP_URL` 是否为可公开 HTTPS 的生产地址，并重新连接 Outlook 或等待 worker 续订。
3. 若 hourly worker 未运行，检查 Vercel Cron / 外部 scheduler 对 `/api/cron/calendar-sync` 的请求日志和 `Authorization: Bearer $CRON_SECRET`。
4. 若 delta 出错，系统清除 cursor 并重建近期待办窗口；全量对账仍会在 48 小时内修复更宽范围。

## 写入方向

Outlook 是日程权威源。Personal OS 的创建、编辑、删除仍必须经过人工确认；确认后立即写入 Graph 并刷新本地镜像。Outlook 侧变更经 webhook / delta 拉回。同步锁由 `calendar_sync_runs` 的“每连接最多一个 running run”唯一约束保证，避免高低频 worker 互相覆盖。
