# Personal Intelligence Agent

Global Personal OS Agent 的请求链路是：

1. Cognitive Router 将请求分类为稳定的 cognitive recipe，并给出复杂度、时间窗口与所需检索能力。
2. Context Planner 按 recipe 构建检索计划。回顾型问题先按时间读取近期 Notes，不把用户整句话当关键词。
3. Context Engine 组合 queryless recent Notes、Reviews、Memory、Decision、Career、时间上下文、lexical search、Graph，以及可选的 provider-neutral semantic retriever。
4. Recipe-specific reranking 同时考虑来源权威性、时效性、当前/历史状态、跨笔记重复度和任务类型。
5. Personal Operating Model 只从 confirmed profile、Working Memory、active Decision、structured Career 与显式偏好动态构建；历史 Notes 不会被升级为长期事实。
6. 模型根据复杂度使用 Flash 或 Pro，并仅对分析型请求启用 DeepSeek thinking。reasoning content 不发送到客户端，也不写入 Agent Run。
7. Tool Router 由 recipe capabilities 决定工具组；任何写操作仍只能生成 proposal，并由用户在界面确认。

## Retrospective retrieval

`retrospective_thinking` 默认读取最近 21 天 Notes。少于 5 篇时扩展到 45 天，同时读取 Reviews 与当前 Memory/Decision。系统对最近 7 天和此前 14 天进行主题趋势比较；主要主题至少需要两篇独立 Notes 支持，单篇记录只作为弱信号。

候选阶段只返回有字符预算的预览。需要更多正文时，Agent 使用 `readNotesBatch` 一次读取最多 12 篇，并受单篇与总字符预算约束。

## Semantic retrieval boundary

`SemanticRetriever` 是 provider-neutral 接口。当前没有默认外发 embeddings，也不会因为未配置 embedding provider 阻塞 lexical、recent、graph、memory 等检索。未来可以接入 pgvector 或其他经用户配置的 provider。

## Database migration

`20260809054940_personal_intelligence_agent_v2.sql` 是增量迁移：

- 新增 owner-scoped `assistant_preferences`，启用 RLS，仅授权 authenticated owner select/insert/update；
- 更新 security-invoker `search_personal_os`，让 snippet 位于实际 query 命中附近；
- 不修改 Notes、Memory、Decision、Career 等既有业务数据。

`20260809055042_restrict_personal_intelligence_rpc.sql` 显式撤销 `anon` 对搜索 RPC 的执行权限，只保留 `authenticated`。搜索函数仍为 `security invoker`，所有结果继续受调用者 RLS 约束。

应用前可运行 `supabase db push --dry-run`。若需要回滚，应创建新的 rollback migration：恢复 `20260808124822_fix_global_search_escape.sql` 中的 `search_personal_os` 函数，然后 `drop table public.assistant_preferences`。应用代码在表不存在时会安全使用只读默认偏好，因此数据库迁移与应用部署可独立回退。
