# 暗格本地验收 · 2026-10-18

状态：代码已推送，生产迁移已应用；代码发布与线上验收进行中。
任务分支：`feature/private-vault`。规格：[独立验证的隐藏笔记与文件](../specs/private-vault.md)。

## 已执行

| 检查 | 实际结果与边界 |
| --- | --- |
| TypeScript / Next.js 生产构建 | 通过；当前锁定依赖，Node 22 |
| 受影响 TS/TSX lint | 通过 |
| 全仓 Vitest | 1994 通过，5 失败，共 1999；失败均为 `files-ocr-control.test.ts` 的已有 WebCrypto/ArrayBuffer 环境问题，未修改的 HEAD 基线同样复现 5 项失败 |
| 本功能密码与接口测试 | 13 项通过；真实 scrypt、AES-GCM/PBKDF2，以及隔离的 HTTP handler/存储适配测试 |
| Notes 列表/搜索回归 | 修复菜单更名后的残留引用后通过；未保留本次新增失败 |
| SQL 隔离测试 | PGlite PostgreSQL 引擎成功重放全部实际 migration；普通 owner 不能读取/改写隐藏记录、历史版本、搜索副本、实体关联、Storage 原件或调用专用 RPC；检查 owner 隔离、整夹收纳/恢复、版本冲突、共享引用拒绝、新建、限流和会话过期 |
| 备份与恢复回归 | 既有系统快照、原件配对和 SQLite 隔离恢复测试通过；新 schema 保留隐藏分组，排除认证秘密、会话与尝试计数 |
| 桌面浏览器 | 1440×1000，真实本机 Chrome，无真实账号；长按松手入口、首次设置、编辑、保存、密文草稿恢复、快捷锁定、原件预览、刷新后重新验证 |
| 手机浏览器尺寸 | 390×844，真实本机 Chrome 的窄视口模拟；导航长按入口、验证到文档的连续对话层、编辑、Esc 和 5 分钟自动锁定；不是实体手机或 Safari 验收 |
| 文档与源代码门禁 | 本地文档链接/34 主题索引、`system-standards-audit --check` 和 `git diff --check` 通过 |

## 测试环境处理

桌面目录受沙箱限制，需要允许测试写入构建缓存和截图产物。macOS 默认临时目录的符号链接会被备份恢复的安全检查拒绝，因此使用物理路径 TMPDIR；没有放宽恢复检查。

首轮全仓并发测试还出现过 Projects 焦点测试时序失败；该测试在基线与本分支独立执行均通过，最终限制两路并发的全仓运行也通过该项。

## 界面与运行边界

手机导航 Sheet 和认证 Dialog 同时关闭/打开会触发移动端返回历史竞争。实现中让导航先退出，并将认证与文档共用同一个 Dialog 生命周期；浏览器复测通过。减少动态效果仍沿用全站 Radix、motion token 和 media query，不新增动画运行库。

浏览器使用 `/mobile-native-e2e?scene=vault`，必须显式设置 `E2E_MOBILE_HARNESS=1`。所有 API 响应和文件字节均为浏览器本地拦截的合成内容；生产不启用此入口。截图和连续录屏不含个人资料或真实口令。

未进行真实 Supabase Auth 登录、真实 R2 上传/下载或生产的联网端到端验收；本地没有复制真实服务凭据，也没有代设独立口令。需要按规格审查迁移并确认目标后，才进行生产发布和所有者实际验收。

回退保持隐藏标记、RLS、版本和原件，不通过删策略或批量移回来恢复旧界面。

## 生产发布进度

2026-10-18 所有者明确授权推送、生产迁移与上线。PR：[#70](https://github.com/wateryh2004-beep/personal-os/pull/70)。

- 目标：Vercel `personal-os` / Hang Yu 的团队；Supabase `rurzksvjefwjvswjgiup`。
- Supabase 管理 API 于 2026-10-18 14:48 UTC 应用 `private_vault`，实际版本 `20261018144837`；本地 SQL 内容不变，仅将未发布的候选文件名对齐服务端生成版本，避免重复应用。
- 迁移前后 notes 910、documents 598、note_folders 79、file_folders 2，计数不变；未建立真实独立口令或会话。
- 四张内容/文件夹表已有隐藏列；29 条 restrictive 策略覆盖普通行、关联行与 Storage；凭据/会话/尝试表强制 RLS，无 anon/authenticated 读取授权；5 个专用 RPC 仅 service_role 可执行。
- 生产所需环境变量名称已确认；没有读取秘密值，未启用 `E2E_MOBILE_HARNESS`。
