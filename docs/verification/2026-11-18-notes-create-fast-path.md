# Notes 3.0 P0.2 · 新建笔记原子快路径验收记录

状态：候选实现，尚未通过生产 SQL 与真实浏览器性能验收。
开发分支：codex/notes-3-0-p0-2-create-fast-path-20261118
对应 PR：#111
目标基线：main 合并 P0.1 后的提交 45b9778c99c0f239a0e4d77439a101598c02a940。

## 具体改动

- 新增 `public.create_note_fast(p_folder_id uuid default null)`：`SECURITY INVOKER`；只从服务端当前 JWT 获取 `auth.uid()`，不接受用户 ID；有效普通文件夹须归属于当前用户且未归档；一次调用在同一事务插入 `notes`、`note_versions` 和 `audit_logs`。
- 函数撤销 `PUBLIC`、`anon` 的默认执行权，仅对 `authenticated` 授权；各个表的 RLS 保持生效。
- `createNote` 和 `createNoteInFolder` 优先调用 RPC，**只在 PGRST202/42883 代表函数不存在时**进入原有兼容路径；任何其他权限、SQL 或业务错误均不得误判为兼容。
- `after` 仅用于辅助状态更新；正式笔记、初始版本及审计都必须完成，才导航到新文档。

## 当前已取得的证据

- 2026-11-18：已只读检查 PersonalOS 生产 Supabase `rurzksvjefwjvswjgiup` 中 `notes`、`note_versions`、`audit_logs`、`note_folders` 的列、RLS 与现有函数；新 RPC 尚未出现在生产。
- P0.2 叠加 PR 首次 CI 的 `isolated-verification` 已完成，包括完整历史迁移重放与已有 RLS/RPC/版本测试。这证明新增 migration 至少未阻塞该隔离重放；**不能代替本新 RPC 的真实行为测试**。
- 本阶段新增 `tests/notes-create-fast-path.test.ts` 作为静态合同防回退守卫。它不是数据库事务回滚验证。
- 在新的 clean-main PR #111 上仍需重跑 typecheck、Vitest、构建和 SQL/鉴权矩阵，不能把先前分支的检查直接当作新 head 的检查结果。

## 必须补足的运行验证

1. 隔离数据库创建有效 owner，调用 RPC，验证 notes、note_versions(version=1,revision=1,reason=initial) 和 audit_logs(create) 记录各恰好一条且属于 owner。
2. `anon` 调用必须拒绝；无 owner 的 `authenticated` 调用必须拒绝；另一 owner 的 folder ID 必须拒绝；已归档或不存在的 folder ID 必须拒绝。
3. 对初始版本/审计写入制造受控失败，确认事务回滚后 `notes` 不保留孤儿新记录。不得在真实生产数据上故意制造故障。
4. 确认数据库迁移尚未部署时走旧流程；迁移部署后走一次 RPC。对重复提交、弱网、页面返回、重试、双窗口以及草稿恢复进行回归。
5. 分别对根目录与文件夹新建测点击反馈、空白编辑器可输入、后端写入确认与目录可见时间；每组至少 20 次报告 p50/p95，生产区域和网络条件明确。

## 部署与回退

部署顺序：隔离 PostgreSQL 测试 → 安全审查 → 独立 migration 上线 → 代码 PR 合并及部署 → 生产只读核对 RPC 定义和最小范围的正常新建流程 → 性能对比。

回退先切回旧 Server Action 实现（可不删除新 SQL 函数，避免期间客户端协议变化）；确认没有新代码调用 RPC 后，才考虑独立 `drop function public.create_note_fast(uuid)`。新建的真实笔记是业务资料，不能因功能回滚而删除。

绝不扩大其他数据访问范围，不上传实际笔记正文作为 CI 证据，不把当前“迁移尚未上线”记成已完成。
