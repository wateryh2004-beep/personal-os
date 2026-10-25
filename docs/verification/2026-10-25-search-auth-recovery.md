# 全局搜索协议与偶发 Data API 401 修复

日期：2026-10-25，Asia/Shanghai。状态：本地检查通过，等待精确 head CI 与发布。本文记录发布前证据；CI、merge commit 和生产执行结果最终补记于对应 PR。

## 范围与基线

基线为已发布的 `606df7596fdad8450aef85a36977c818d3989d4a`，分支 `codex/auth-search-session-fix`。遵循 [安全](../security.md)、[工程](../engineering-standards.md)、[质量](../quality-standards.md)、[性能](../performance.md) 和 [发布](../release-operations.md) 规范。没有 migration、数据库权限、生产环境变量、依赖或视觉/动效变化；PR #86 的独立备份/迁移前提仍不属于本批。

## 观察与原因

匿名 `/api/search?q=...` 进入调用 `requireOwner()` 的领域函数；页面 guard 抛出的登录重定向被 Route Handler 当作未知异常，最终返回 503。空查询还会在领域查询认证前返回空数组。现在 Route Handler 明确执行协议 guard，再传入同一个 owner；正常与空查询均受保护。上游持续 JWT 拒绝也保留 401，真实服务故障仍为 503。

生产 2026-10-25 15:13:05 的 GET `/rest/v1/notes` 返回 401，`Proxy-Status` 为 `PostgREST; error=PGRST303`。该请求的 JWT 15:11:44 签发、16:11:44 到期，邻近 notes/folders/list RPC 返回 200，因此不能归因为令牌到期或据此改变 TTL。日志未保存具体 claims 错误响应正文，无法还原上游拒绝的具体 claim；本次修复的是应用对这类瞬态拒绝缺少安全恢复的边界，不宣称修改了 Supabase 服务内部验证器。

## 最终行为

- 成功读取路径不增加 Auth 远程请求。只在 PGRST303 后重新验证同一 JWT 的签名、有效期、owner 和相同用户，再调用 Auth `getUser(jwt)`；通过后最多重放一次同一读取，不变换身份或凭据。
- 并发失败在请求内共享一次核对；请求外不保存客户端、身份或令牌。未知 RPC、变更写入、权限拒绝、不同 origin、无效/撤销会话和永久失败不能通过重试变成成功。
- 两个显式允许 RPC 的实际 SQL 体已只读审查。`search_personal_os` 当前数据库 volatility 为默认 VOLATILE，但函数体是 SELECT/CTE；没有通过改数据库 volatility 或权限解决问题。
- 正常到期刷新继续在 Proxy 完成，请求/浏览器两端 Cookie 和 SDK 防缓存头完整转交。页面渲染阶段不能写回 Cookie，因此不在恢复路径旋转 refresh token。
- 无 service role 回退、无新增公开路径、无放宽 RLS、JWT 有效期、签名校验、测试断言或发布门槛。

## 验证与限制

新增全局搜索 HTTP 认证测试、受限重试矩阵、真实 SSR/Auth SDK + ES256 签名场景，以及真实 Next Proxy → Route Handler → SDK → localhost HTTP 认证/数据服务验证。覆盖匿名和空查询、非 owner、伪造头与签名、过期 Cookie 刷新、并发、撤销会话、持续拒绝和真实故障；所有材料均为合成数据，不修改真实密码或业务内容。

本地最终检查：

| 检查 | 结果 |
| --- | --- |
| 全量 Vitest | 319 文件、2,139 项通过、0 失败 |
| 全仓 typecheck / lint | 均退出 0 |
| `E2E_MOBILE_HARNESS=1 npm run build -- --webpack` | 退出 0，含 OCR 资源生成与类型检查 |
| `node scripts/auth-search-http-smoke.mjs` | 8 组真实 Next/SDK/localhost HTTP 场景全部通过 |
| 规范审计 | 退出 0，6 个既有人工追踪项不当作全站零缺陷 |
| 部署闭包 | 127 traces / 25,859 paths；已知 CLI 告警链未加载、未追踪 |
| 新增 SQL READ ONLY 断言 | 本机无 psql/PGlite，未运行；合并前必须由 CI 的真实 PostgreSQL 验证 |

摘要与最终源码清单见 [检查结果](evidence/2026-10-25-search-auth/checks.json) 和 [来源](evidence/2026-10-25-search-auth/source-manifest.json)。HTTP 场景已接入 Verify 工作流，保留所有原测试与严格检查。

生产不注入无效真实令牌、不篡改 owner Cookie、不诱导真实写入来制造失败；无法人为重现所有真实网关偶发状态，受控失败恢复由隔离场景证明。

## 发布与回退

本地检查 → 推送 PR → 精确 head 的全量 CI → 合并 → 核对 Vercel production 与正式域名 SHA → 匿名协议和现有 owner 会话只读流程 → 有界日志核对。原生产部署 `dpl_GULnocLLGWruLHvFvTmY1ayU4dHQ` 可作代码回退入口；无数据库回退，不删除资料或重置会话来验收。
