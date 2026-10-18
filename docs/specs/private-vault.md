# 暗格：独立验证的笔记与文件

状态：已部署生产；所有者已设置并完成真实解锁，笔记保存/版本、上传/下载、搜索隔离、图片与 PDF Canvas 预览及锁定已验收。日期：2026-10-19。
所属规范：[数据治理](../data-governance.md)、[安全](../security.md)、[文件契约](../files/architecture-contract.md)。

## 范围与交互

- 同时支持 Notes 和 Files。普通导航、命令面板与设置不展示暗格入口、内容或数量。
- 长按桌面或手机导航中的 `Life of HANG` 2 秒唤出验证。普通点击保留原行为。默认 `Cmd/Ctrl + Shift + P` 可唤出或立即收起；在解锁后的选项中可改为 P/U/Y/B/H。
- 首次设置要求重新验证当前登录密码，并设置与其不同的 12–256 字符独立口令。后续只验证独立口令。没有免验证重置入口；禁止以登录状态替代口令校验。
- 验证后进入同风格的独立文档面板；可新建笔记和文件夹、编辑 Markdown、查看历史版本、上传文件、预览 PDF/图片和下载原件。PDF 使用同站本地 Canvas 逐页绘制，复用普通文件区的渲染与资源销毁逻辑；不使用原生 PDF iframe，也不改走普通文件 API。页内上限 25 MiB、500 页、单页 400 万像素，失败时保留原件下载。历史版本先载入为草稿，显式保存后产生新版本，不修改旧版本。
- “整理普通内容”暂时收起面板，普通笔记菜单、笔记子文件夹和文件操作中才出现“收入暗格”。文件夹递归收纳；原路径和原件保留。收纳完成后刷新普通工作区，清除此前已加载的列表、编辑器和预览内存；继续整理时再次验证。笔记附件同批保护。共享引用和普通笔记中的原始附件链接会拒绝收纳，提示先处理引用；不静默改写其他文档。
- 移回时明确确认，同批收纳的文件夹、笔记和附件一起恢复原位置。来源的 AI 可见性设置保持原值；暗格中直接创建的新内容默认 `never`。
- 暗格面板保持当前普通 URL，不写入公开导航历史、全局检索或正常草稿恢复缓存。快捷收起、关闭面板和 Esc 都锁定。

## 权限边界

`vault_group_id` 加在 `notes/documents/note_folders/file_folders`，默认 NULL。额外的 restrictive RLS 永久排除普通 `authenticated` 对这些隐藏行的读取、修改和删除，即便网页已解锁也不会放开普通客户端。

历史版本、标签关联、笔记链接、实体引用、搜索副本、操作审计、封面/OCR 工作和直接引用源对象的行，受到对应父对象的可见性检查。`vault_private` 中的布尔函数使用固定空 search_path，只返回当前 owner 的可见性，不返回内容。增加新的引用结构或 SECURITY DEFINER RPC 时必须扩展此边界。原件的 Supabase Storage 访问同样受 restrictive policy 约束；旧 OCR definer RPC 显式拒绝隐藏来源。

暗格只经 `/api/vault/*`：真实 owner claims → 已验证 login `session_id` → 独立口令会话 → 当前标签页证明。service client 仅存在于服务端，每次业务查询另加明确 owner 和隐藏范围。敏感 RPC 仅授予 service_role，不能由浏览器调用。不能为了兼容缺失 migration 而回退读取。

- 独立口令存为随机盐 scrypt 校验值；口令与登录密码不进入日志、审计或返回值。
- HttpOnly / SameSite=Strict cookie 保存随机会话令牌，数据库只保存令牌散列，并绑定真实登录 session。另有只存于内存、只发送到暗格 API 的标签页证明，刷新或另开标签页必须重新验证。
- 服务端共享限流：15 分钟最多 5 次失败验证；成功后清零。没有配置、数据库错误、过期或错误证明均拒绝。
- 服务端闲置有效期 5 分钟，绝对上限 1 小时；前端仅有实际键盘/点击活动时续租。离开页面立即遮住内容，30 秒后锁定；短暂返回先核验服务端状态。
- 收起先撤去界面和内存访问，再请求撤销服务端令牌。网络失败会明确提示撤销尚未确认，服务端空闲期限仍生效；不伪称断网时已成功撤销远端状态。
- 写操作校验同源，JSON 使用流式大小上限；所有响应 no-store。普通下载改用受保护转发，不再返回可独立使用的 R2 GET URL；暗格原件按当前证明转发成当前面板的临时 Blob，关闭会撤销 Blob URL。

## 草稿、上传与备份

隐藏编辑器不使用普通明文 sessionStorage。草稿用口令通过 PBKDF2-SHA256（310000 次）派生的不可导出 AES-GCM 密钥加密，随机 IV，AAD 绑定 owner 和 note ID。加密快照只保留在当前标签页；锁定后必须重新验证和派生密钥才能恢复。正文和标题不以明文存入恢复缓存。草稿与云端 revision 不一致时先展示比较，用户明确选择后才继续编辑；保存使用原子 revision 检查、版本快照与审计。

上传先建立不可见的 pending 元数据，再复用私有 R2 的单文件 PUT、全量 SHA-256 核验、密封复制和复制后核验。未完成上传不冒充成功；不自动删除来源或未知原件。当前暗格不提供大文件分片续传，单文件上限 100 MiB。

普通导出默认由普通 RLS 排除暗格。解锁后的选项提供“系统快照（含暗格）”和“文件原件包（含暗格）”；两者都包括普通资料，完整备份须同时保存并使用已有离线校验/恢复流程。系统 schema 保留四张表的 `vault_group_id`，明确排除口令、会话和限流表。恢复时隐藏标记不消失；新环境在 owner 登录后重新设置独立口令。历史 Supabase 原件仍遵循既有手册单独保留，不能宣称 R2 原件包覆盖它们。

## 发布与恢复

1. 先在隔离环境运行完整 migration replay、ACL/RLS 和冲突测试。
2. 审查 `20261018144837_private_vault.sql`，确认生产目标与授权后才应用；需要已有服务端 `SUPABASE_SECRET_KEY`，不新增公开密钥。
3. 再部署对应代码；`E2E_MOBILE_HARNESS` 不得在生产启用。所有者在网页里自行设置真实口令，开发者不代设或记录。
4. 升级前已经签发的旧 R2 GET URL 最多有 5 分钟有效期，应等其过期后验收；浏览器已下载的副本、用户主动复制到别处的文字及既有外部 AI 对话不会被追溯擦除。

回退优先修复兼容代码并保留 migration；不能删除 RLS/清空隐藏标记，否则会公开原来隐藏的内容。故障时保留原件、标记、版本和加密草稿，不在未核验情况下批量移回。

## 验证入口

- `npx vitest run tests/vault-crypto.test.ts tests/vault-api.test.ts tests/vault-session.test.ts`。
- 安装独立测试运行时后：`VAULT_PGLITE_ROOT=/absolute/path/to/node_modules/@electric-sql/pglite node tests/vault-database.mjs`。PGlite 使用实际 PostgreSQL 引擎、真实仓库 migration、最小 Auth/Storage 壳和虚构数据，不连接生产。
- 浏览器：构建并以 `E2E_MOBILE_HARNESS=1` 在本机启动，执行 `scripts/check-private-vault-browser.mjs`；可通过 `PLAYWRIGHT_MODULE`、`CHROME_EXECUTABLE`、`VAULT_BASE_URL` 和 `VAULT_ARTIFACT_DIR` 配置测试运行时。
- UI API 由隔离浏览器拦截，证明交互与草稿路径；独立口令服务端逻辑另由真实散列和 HTTP handler 测试覆盖。它们不等同于真实 Supabase Auth/R2 的联网端到端验收。

[2026-10-18 本地验收与限制](../verification/2026-10-18-private-vault.md)。
