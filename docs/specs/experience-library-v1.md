# 经验资料库 V1

状态：实现中，本地候选。维护日期：2026-10-28。

## 问题与结果

用户需要在 Personal OS 中快速保存从公开帖子或私聊中手动复制的留学申请、求职面试与实习经验，包括正文、评论、截图和评论附图。完成后，原文可以追加保存，图片保留为私有原件，并在详情中靠近对应正文或选中的原文显示。

本功能不抓取平台内容，不模拟浏览或展开评论，不创建新账号、数据库或存储服务。

## 数据与权限

- `experience_library_entries` 保存笔记元信息、来源 URL、标签、AI 派生摘要和状态。
- `experience_library_captures` 保存每次粘贴的原始文字、SHA-256 和规则分段；数据库触发器禁止更新或删除。
- `experience_library_media` 关联经验、capture、选中范围和 `documents` 中的私有 R2 原件。数据库触发器同时核对经验、capture、document 的 owner，以及选区原文。
- `experience_library_ai_settings` 只保存该模块独立的 Provider、模型和 AES-256-GCM 密钥密文；密钥不进入浏览器状态或导出。
- 四张表均启用并强制 RLS。capture 只授予读取与追加；媒体关联允许更新归档状态和顺序，不授予删除；AI 设置只向 authenticated 暴露非秘密字段，写操作经 server action 的服务端 admin 边界。

同一次 RPC 在事务中复用同 URL 经验或指定经验并追加 capture。`request_id` 同时提供丢失响应后的幂等返回。一个来源 URL 在未归档经验中唯一。

## 图片流程

1. 浏览器只接受 PNG、JPEG、WebP、GIF、AVIF，单张上限 15MB；SVG 与可执行扩展名拒绝。
2. `/api/experience-library/upload-url` 创建 owner-scoped、`pending` 的 document 和五分钟签名 PUT。
3. 浏览器上传后调用现有 `/api/files/upload-url` finalization；后者校验长度与 SHA-256、条件复制封存对象并再次校验。
4. document 变为 `available` 后，server action 还会读取已封存原件的文件头，核对实际图片签名；通过后才写入经验媒体关联。
5. 上传后或关联失败时保留可以重试的状态；页面不会显示“图片已保存并关联”，已保存文字也不回滚。

媒体记录可绑定整次 capture，或保存 `selection_start`、`selection_end` 与原文引用快照。详情页允许更换 capture、调整顺序和移除关联；移除关联不会删除 R2 原件。

## 规则整理与 AI

无 AI 时仍可保存、查看、搜索和导出。自动分段只识别明确的评论行标记，并将无法确定的正文保留为原文。所有解析结果附带原始字符范围，不虚构评论作者或回复关系。

用户主动点击“AI 整理”后，服务端将当前经验的纯文字发送到所选 DeepSeek 或 Qwen 兼容端点。图片、图片说明和文件不发送。输出必须区分网友自述、主观评价与 AI 推断，并经过结构化校验。调用沿用 AI governance 的预算与脱敏审计；失败只记录状态，不删除原文或图片。

## 搜索、导出与恢复

页面在标题、摘要、标签、正文与评论中做当前 owner 范围内的简单文本搜索，不修改全局 `search_documents` 白名单。

`/api/experience-library/export` 输出稳定 ID、原文、capture 分段、图片关系和 document 元数据，不包含图片字节、storage path、签名 URL 或密钥。完整恢复由两部分组成：

1. 经验 JSON 或系统 `.ndjson` 保存文本与关系；
2. 现有 Files portable package 保存匹配 document ID 的 R2 原件。

系统备份允许清单已纳入 entries、captures 与 media；专用 AI 设置作为凭据明确排除。离线校验会核对 document 外键，并继续要求 Files 原件包覆盖所有已提交 R2 document。

## 界面与状态

`/experience-library` 是连续收录页：来源、标题、大文本区、多图预览与关联说明、最近记录和站内搜索在同一工作区。`/experience-library/[entryId]` 按原文顺序显示正文、评论、选区高亮和图片，其他图片单独分组。

文本与图片同时存在于剪贴板时，文字走浏览器默认插入，图片加入保存队列。只有 HTML 图片链接而没有二进制时会明确提示另行复制或上传。页面对保存中、图片上传中、原件核验、已关联、失败和取消使用不同真实状态。

页面使用共享 Design v2 语义色、控件、焦点与弹层，并提供本地图片区域 360/390px 与桌面布局、长文、失败状态和减少动态效果的可复核预览入口。

## 发布与回退

发布顺序：

1. 在隔离 Supabase/PostgreSQL 重放全部 migration，执行跨 owner 引用、追加不可变和 RLS 测试；
2. 应用 `20261028073144_experience_library_v1.sql`（正式项目实际迁移版本）；
3. 部署应用并完成真实 owner、私有 R2 图片和 AI 配置的合成数据验收；
4. 在备份校验覆盖新表后才启用界面入口。

代码回退时隐藏导航和页面入口；新增表与 R2 原件保留。不能通过删除经验表或私有图片回退。AI 失败可移除此模块 Key，文字和媒体不受影响。
