# 系统快照与隔离恢复

## 能恢复什么

设置 → 存储 →「系统数据快照与恢复演练」提供明确点击的私有下载。用户必须先确认文件未加密、可能含私人和财务资料。不会创建新备份目的地、订阅或后台任务。

`personal-os-system/v1` 是带完整 schema、逐表计数/校验和及末尾完成清单的 NDJSON。`src/features/system-backup/schema.json` 是版本化允许清单：笔记原始 Markdown、目录/标签/链接、归档/回收站、笔记/履历事实/面试答案/复盘/休闲/投资策略版本，业务记录、投资账本、偏好、原文件元数据、跨模块关系与历史证据都保留原 ID 和 owner ID。空表也有清单与校验值，不能省略。

导出只用经过 `requireOwnerApi()` 验证的 session 客户端和 `user_id` 筛选，不接收客户端 owner/table 参数。显式列清单不会读出连接密文、API key、token 或 OAuth 游标；鉴权账户/会话不在包内。所有表的读取分页继续到空页，包括服务端提前截短的页、复合主键表、归档记录。普通原始文件导出仍沿用已有 Files 私有导出流程。

## 两部分副本与已知边界

1. 下载系统 `.ndjson`
2. 暂停编辑和文件整理，下载同一状态下的 Files 原件包（大集合提供全部分包）
3. 一起运行下方校验，检查 originals / relationships / exclusions 后才算可用副本

系统包内嵌既有 Leisure 私有图片的原件、640/1280 变体和原始 activation manifest（base64 二进制记录，每个对象校验 SHA-256）。下载时只读既有固定 16 项 registry 对应的 owner 前缀 R2 对象，不重新下载外部图片、不触发 import、不列举其他对象、不写存储。每项分为 present / not_imported / unavailable，只有明确 404 的未导入项才能不要求原件；读取配置/权限失败绝不冒充空集合。恢复时以 artwork/<原 key 后缀> 重建原字节和 manifest，provider 上传需要另行授权。

Files 原件通过已有 Files portable packages 做独立 SHA-256 校验，再严格匹配 document ID、大小、历史 checksum、原名、标题、归档/更新字段、目录和文件关系。包来自其他状态、缺分包、缺文档、额外文档或关系不符均不能当完整副本。旧版 Supabase Storage 原件与部署中的静态资源需要独立保留；报告 originals.recordsByProvider 与 missingDocuments 逐项列出缺失原件 ID、原名、provider 与原因，不会悄悄认作已恢复。pending 上传仅保留元数据，不算已保存原件；用户已明确取消并变为 cancelled 的上传只需保留取消元数据，不要求不存在的提交原件，报告单列 cancelledUploadsMetadataOnly，绝不记为恢复了字节。参考 [Files portable export](./files/portable-export.md)。

排除范围都写入包及报告：认证账户/会话/密钥、部署配置、派生搜索/PDF/健康缓存、临时上传/同步租约、执行队列等。数据中的日历/Agent 历史操作仅作证据保存，任何恢复过程都不重放。外部 Outlook / To Do 仍是各自权威源。

数据导出是有界双次读取：第二遍逐表复算相同摘要，检测到变化则末尾 `status=incomplete`。这不是跨表事务/PITR 快照，不能证明所有行来自同一数据库 MVCC 时刻；导出时应暂停修改。数值比较按 JSON 数字语义规范化等值的 10.000000 / 10，不转换金额的精确十进制字符串。SHA-256 检测传输损坏，不是数字签名。敏感文件应由用户保存在控制的位置并另行加密，此功能不替用户传到任何新地点。

限制：最多 250,000 行、128 MiB 业务数据、512 MiB 总包（含嵌入图片）、单记录 8 MiB、240 秒；达到限制/源错误/取消会中断流并缺少成功清单。HTTP 200 或浏览器显示“下载完成”不算验证通过。没有静默截断或部分表成功模式。

## 无网络离线验证与可读恢复

Python 3 标准库即可，不需要数据库或凭据：

```sh
python3 scripts/verify-system-backup.py system.ndjson
python3 scripts/verify-system-backup.py system.ndjson --files files.tar
python3 scripts/verify-system-backup.py system.ndjson \
  --files personal-os-files-*-part-*.tar \
  --restore-to /trusted/local/new-rehearsal-directory
```

使用自己独占、已存在的可信父目录。目标必须不存在；既有目录、文件、符号链接和含符号链接的父目录都被拒绝。校验完成前不会发布目标目录。不渲染、不打开或执行 Markdown/原件。

- exit 0 / `verified`：数据结构、数量、字节校验、原件范围和关系校验通过
- exit 3 / `verified_with_gaps`：业务数据可读，但有待上传、尚未提供的原件、旧 provider 原件或无法解析的历史图关系；报告列出数量及样例
- exit 2 / `interrupted`：记录或末尾完成清单缺失，重新导出
- exit 1：损坏、schema 不符、外键引用缺失、变更中导出、拒绝覆盖等，不当作成功

隔离目录包含：

- `system.sqlite3`：各业务领域分别建表，保留实际列、主键、原 ID / owner / 原始 Markdown / 版本；JSON/数组以 JSON text 存储
- `snapshot.ndjson`：精确的已验证输入
- `notes/`、`note-versions/`：以 UUID 命名的原始 Markdown，原标题仍保存在数据表中
- `artwork/`：包内直接包含的已激活 Leisure 私有图片原件、变体、精确 manifest 字节；相对路径保持原 R2 key 后缀，可核对 owner 前缀后单独批准回传
- `files/`：如果提供了原件包，其已验证原件/目录/元数据树
- `restore-summary.json`、`RESTORE-README.txt`：验证范围、缺口与后续约束

SQLite 演练会重新读取全部重建后的值，与输入逐表再次比较摘要，不能只因文件写出就报告通过。声明的外键和跨板块图端点也被检查。投资交易、现金与行情三个追加账本的 sequence 必须共同覆盖账户 revision 的 1..N，原序号与 revision 完整保留。它验证便携读回，不替代下面的 PostgreSQL 原生恢复测试。

## 真正的 PostgreSQL 隔离恢复演练

先安装 Docker，并准备官方 `postgres:17` 镜像。这个命令不接受数据库 URL、凭据、已有容器或已有数据库名；只创建随机名称的全新、`--network none` 容器，无端口发布、无挂载、无外部网络。无论成功失败都销毁自己创建的容器。

```sh
# CI：合成数据 -> 实际迁移 schema -> 导出 -> 重新建库 -> 导入 -> 再导出
python3 scripts/rehearse-system-backup-postgres.py --fixture

# 用户主动在受控本地环境演练自己已下载、校验通过的副本
python3 scripts/rehearse-system-backup-postgres.py \
  --snapshot system.ndjson --files files.tar
```

流程：

1. 创建最小 Supabase Auth/Storage 外壳，逐个执行仓库实际 SQL migration，不代替应用 schema
2. 验证实际 PostgreSQL 表/列与便携允许清单完整匹配；新增业务字段未分类时失败
3. 为原 owner UUID 建无凭据的隔离 auth stub；保留原 UUID 是先决条件，不把数据重分配给任意用户，不恢复真实身份验证
4. 在新数据库一个事务内临时 `session_replication_role=replica`，避免更新/版本/审计/副作用 trigger 改写历史或重放操作，并允许循环外键不受插入顺序限制；类型、NOT NULL、CHECK、唯一约束仍生效
5. 事务结束恢复 origin；依据真实 `pg_constraint` 检查所有迁移后的外键，涵盖 auth owner、复合键和循环关系
6. 从 PostgreSQL 再导出全部允许表，比对每条内容、顺序、数量、原 ID、Markdown/版本/归档状态与关系；重新运行便携验证
7. 销毁容器，输出无正文/凭据的结果摘要

原件在受控本地由 Files 校验器重建，不上传到 R2/Supabase。它验证真实 PostgreSQL 数据层恢复能力，但不是线上登录、远端对象回传、provider 重连或完整应用灾备认证。生产恢复仍需单独评审和批准：备好匹配版本的代码/migrations、创建正确 auth owner、重配密钥/服务连接、重新映射对象存储、重新生成派生索引/封面、核对 RLS 与应用功能，最后才启用后台执行。切勿把排队操作或已过期令牌直接带回运行态。

## 历史 migration 的干净重放修复

隔离全量重放发现并修复了既有仓库的 fresh-install 阻塞，不在生产执行历史 migration：

- Notes `20260818_notes_listing_content_origin.sql` 的返回记录新增列，PostgreSQL 不允许直接 CREATE OR REPLACE；现在显式非 CASCADE DROP 后立即以原 security-invoker、空 search_path 与同样的 owner-only execute grants 重建
- `20260930085159_interview_lab_v1_2_taxonomy.sql` 两个 CREATE INDEX 中间误写了字面 `\\n`；改为真正换行。后续补建索引 migration 使用 IF NOT EXISTS
- `20260930100323_interview_lab_v1_3_learning_loop.sql` 的数据回填断言假定特定历史问题对必然存在；仅在该对实际存在时验证合并与数量缩减，空库仍验证没有缺失 archetype 的记录

`.github/workflows/system-backup-recovery.yml` 在 PR/main 上运行原生 PostgreSQL 17 全量重放与恢复。必须观察最终集成提交的该检查通过，不能以 SQLite/PGlite 结果代替。所有 fixture 仅包含合成内容，绝不上传私人快照作为 CI artifact。

## 本地测试

```sh
npm run test -- tests/system-backup*.test.ts
npm run typecheck
npx eslint src/features/system-backup src/app/api/exports/system src/components/settings/system-backup-panel.tsx tests/system-backup*.test.ts tests/helpers/system-backup-fixtures.ts
python3 scripts/rehearse-system-backup-postgres.py --fixture
```
