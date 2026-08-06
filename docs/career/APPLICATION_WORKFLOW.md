# 投递与面试工作流

流程为 Company → Job Position → Frozen Resume Snapshot → Application → append-only Application Event → Interview → 结果反馈。Application 当前状态与 Event 必须原子写入；历史 Event 通过新增更正事件修复，不允许编辑历史。

Microsoft To Do 仍是行动状态权威，Outlook Calendar 仍是时间承诺权威。Career 仅保存外部对象的明确关联、同步状态和上下文摘要，绝不伪造本地任务或日程状态。
