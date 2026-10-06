# Files 可迁移导出、分包与隔离恢复演练

## 能保证什么

`POST /api/files/export`（旧单包）、`POST /api/files/export/plan`（分包计划）和 `POST /api/files/export/part`（指定分包）只在认证 owner 的同源显式请求后读取数据。响应是未压缩 `.tar`，私有且 `no-store`，无需新依赖。导出不写数据库、不修改 R2、不创建公开链接，不将密钥、cookie、签名 URL、bucket 或对象存储路径写入清单。

范围是当前 owner 的全部 `cloudflare_r2` documents，包括归档原件、Notes 图片附件、AI 标为 sensitive/never 的文件；AI 可见性不影响 owner 自己下载原件。文件夹和涉及 document 的 entity_links 包含归档记录。分页按稳定 `id` keyset 遍历到空页，即使服务端返回少于请求条数也不会提前停止，避免常见 1,000 行截断。

pending 是未完成上传：仅导出元数据，清单单列 `pendingUploadOriginals`，不声称已备份其字节。非 R2 文档、其他业务实体正文、认证、密钥、审计历史、数据库结构不在本导出中。跨业务关系保留原 ID；外部端点数量由校验器报告，它们不是已恢复的实体。

这是 Files 原件和元数据的可迁移包，不是整个 Personal OS 的数据库灾难恢复备份。恢复生产数据库、配置新存储、密钥迁移、覆盖现有数据均未实现或授权。

## 用户操作

1. Files 页面通过原生同源 POST 表单发起下载。不要用 GET 链接自动预取，也不要在浏览器把全包读成 Blob
2. 文件可能含隐私材料，保存在可信本地目录；不要上传到第三方验证网站
3. 用本仓库的离线校验器验证下载，Python 3 标准库即可，不需要网络、账户或服务凭据：

   ```sh
   python3 scripts/verify-files-export.py /path/to/personal-os-files-YYYY-MM-DD.tar
   ```

4. 用新的空闲路径进行隔离恢复演练。它只还原 portable staging tree，不连接任何应用或数据库，不覆盖目录，也不会打开/执行原件：

   ```sh
   python3 scripts/verify-files-export.py /path/to/export.tar --restore-to /trusted/local/files-rehearsal
   ```

只有完整验证通过才把临时目录发布为指定新目录。失败时清理本次临时文件；更正问题后可重试同一路径。若目标已经存在则拒绝，不能误覆盖一次成功结果。目标父目录应由当前本地用户独占管理，不要放在其他用户可写的目录。

输出为 JSON；exit 0 且 `status=verified` 表示所提供的包通过字节校验。对于分包，还必须看到 `collectionComplete=true` 才表示整个计划的分包齐全；单个通过的分包不等于完整副本。pending 排除项和外部关系仍需查看。

- `verified` 且 `collectionComplete=false` / exit 3：所提供的分包各自通过，但尚缺其他分包；摘要列出缺少的序号，不能按完整副本处理
- `interrupted` / exit 2：缺末尾 manifest、tar 结束块或对象流中断，不是成功导出，重新下载
- `incomplete` / exit 1：包结构和已取得字节可读，但有对象不可读、已记录 checksum 不匹配，或导出中元数据变化；解决问题后重新导出
- `corrupt` / exit 1：实际字节、清单、数量或文件夹关系不匹配，不能使用
- `restore_refused` / exit 1：目标不是安全的新目录，换一个本地路径

下载 HTTP 200 不表示导出完整：流开始后服务端不能改回错误 HTTP 状态。必须检查包内完成清单，并运行校验器。不要仅凭浏览器“下载完成”判断安全。

## 大文件集合：可重试分包

Files 页的“准备分包导出”只读取元数据，不读取原件、不写服务器任务、不创建新的备份位置。计划按 document ID 升序确定固定分组；同样的元数据和限额会产生相同的 planId。每个分包的保守预算为 256 MiB，单原件仍最多 100 MiB。超过 512 MiB 的集合可以下载多个分包，不需要一次下载整个集合，也不会在浏览器用 Blob 缓存整个归档。

1. 准备计划后逐个下载分包；下载按钮只表示已发起，始终不是“已校验”
2. 某个下载中断时，只重试同一个分包；原件按流读取，不自动重试或重复下载其他分包。这里是“分包级重试”，不是包内字节断点续传
3. 每次请求重新读取元数据并复算计划；如果 planId 已变化，在读取原件前返回 HTTP 409，重新生成计划。不要混用不同计划的分包
4. 单个分包可以独立校验；部分集合会明确列出缺失分包，不能发布恢复目录。将同一计划的分包放到一个单独目录后，可按任意顺序一起提供：

   ```sh
   python3 scripts/verify-files-export.py /trusted/local/one-export/personal-os-files-*-part-*.tar
   python3 scripts/verify-files-export.py /trusted/local/one-export/personal-os-files-*-part-*.tar --restore-to /trusted/local/files-rehearsal
   ```

每个分包都含全部文件夹和关系元数据，以便独立验证该包的文件夹引用；document 元数据及其原件只属于一个分包。重复的共享元数据会增加下载容量，计划的 estimatedBytes 已包含这部分开销。`remainingDocuments` 仅表示按计划排列在这个分包之后的记录数，不证明前面的分包已下载或通过验证。

分包采用 `personal-os-files-part/v1`，旧校验器不能将它当成旧单包的完整集合。`export.json` 与末尾 `manifest.json` 包含相同的 `collection` 描述：planId、全体元数据摘要、分包序号/数量、累计记录偏移、该包与全体 document/原件字节/pending 数、首尾 document ID 和剩余记录数。`manifest.status=complete` 只说明本分包的原件和元数据检查通过；多分包时 `manifest.collectionComplete` 始终为 false。校验器收齐且检查全部分包后才报告集合完成。

planId 是元数据、算法格式和限额的哈希，不是认证签名。末尾除复查本分包元数据，还复查整个集合；其他分包的文件变化也会令当前包 `incomplete`。这是多次实时读取，不是跨分包数据库事务快照，也不承诺历史上同一时刻所有字节的强原子一致性。导出时应暂停上传和整理；元数据修改后重建计划，不拼接旧计划。

### 容量说明

计划展示的是 document 记录的逻辑容量：未归档的已保存文件、归档文件和 pending 记录分别累计。潜在重复只按有效的已记录 SHA-256 加声明大小分组，不在准备计划时重新读取原件，也不表示这些原件可安全删除。pending 原件不纳入重复估计。

这些数字不等于 R2 物理用量或账单容量：它们不扫描 bucket，不计未关联对象、上传暂存副本或其他应用对象。此功能不清理任何原件、暂存副本或归档记录，不更改存储、权限或套餐。

## 包格式

- `export.json`：格式版本、开始时间、范围和明确排除项
- `folders/<id>.json`：文件夹元数据，保留层级、顺序与归档状态
- `objects/<document-id>`：逐块取得的原始字节。路径只含 UUID，不采用上传文件名，避免路径穿越/同名覆盖
- `documents/<id>.json`：文件元数据、原始文件名、分类/隐私/AI 可见性、提取状态和文本、字节数、SHA-256、文件夹 ID、原件校验状态
- `relationships/<id>.json`：关联类型、原始端点 ID、归档/时间字段
- `manifest.json`：最后写入的完成记录，计数、pending 排除数、元数据复查结果、按归档顺序计算的整体条目 SHA-256

条目索引摘要输入依次为 UTF-8 `path + NUL + decimal-size + NUL + lowercase-sha256 + LF`，覆盖 manifest 之前所有文件，包括 export header、元数据和原件。manifest 本身不是数字签名。任何持有包的人都能重算哈希；校验能发现意外损坏，不证明来源真实性或防止蓄意整体篡改。

有有效历史 checksum 的文件同时比较原始记录；旧文件没有 checksum 时记录 `observed_sha256_only`，证明此次传输一致，不能追溯证明旧文件从未损坏。已记录 checksum 异常/不匹配不得伪装成成功。

## 一致性、资源界限与中断

- 每页 25 条元数据，每次只读一个原件流，尊重下游背压，不把归档或原件累积在内存中
- 单原件上限 100 MiB；旧单包保守预估最多 512 MiB。分包每包最多 256 MiB、最多 256 包；整个集合（非每包）的文件夹、document、关系元数据合计最多 25,000 行，计划扫描的原始 JSON 合计最多 64 MiB。预检超限在开始下载前返回 413；共享元数据加单个 document 放不进一个分包时也会拒绝，不静默跳过。运行期间再次限制包大小
- 单条 JSON 上限 2 MiB，校验器也限制条目数量和归档总量，拒绝重复、非法路径、链接和非本格式的条目
- 应用请求期限 240 秒；route maxDuration 为 300 秒，但平台实际配额可能更短，配置不能延长套餐限制。不是后台导出任务，不承诺任意规模或包内字节断点续传；分包可以单独重试，但每包仍受请求时间限制
- 导出中途丢连接/异常会取消 provider 读取，未成功结束不会有可信完成标记。缺失对象先记录不可读并继续收集其他文件；已写 tar header 后流长度不符只能中断整包
- 导出末尾重新分页扫描同样元数据，摘要不一致则 `incomplete`。这能发现观察到的新增、删改、归档变化，但不是数据库事务快照，也无法排除两次读取间改回原状。需要强原子备份时应另建数据库快照与对象版本策略
- 导出期间尽量暂停文件整理/上传。超出分包限制或反复超时需要另行设计有授权的离线/后台方案；当前版本不静默截断、不自动重试、不更改付费套餐

## 本地验证（仅合成数据）

```sh
npm run test -- tests/files-portable-export.test.ts tests/files-export-source.test.ts tests/files-export-route.test.ts tests/files-export-plan.test.ts tests/files-export-plan-route.test.ts
npm run typecheck
npx eslint src/features/files/export src/app/api/files/export tests/files-portable-export.test.ts tests/files-export-source.test.ts tests/files-export-route.test.ts tests/files-export-plan.test.ts tests/files-export-plan-route.test.ts
```

测试使用内存合成原件、临时目录和 mock provider/数据库。覆盖完整字节往返、归档/嵌套文件夹、关系、旧 hash 边界、pending、缺失/损坏/中断/重试、元数据漂移、短页和 >1,000 记录、资源限制、同源/auth 和取消。没有执行生产导出、恢复、R2 写入或真实敏感数据传输。

分包功能回归覆盖：600 MiB 合成集合只读元数据规划、确定性分组与重试、逻辑容量/重复估计、全体记录上限/分包上限、跨包元数据漂移、过期计划 409、原件不提前读取，以及真实 TypeScript 归档与 Python 多包校验的往返。未执行生产导出或生产恢复。


## 浏览器下载回归

`scripts/files-recovery-e2e.cjs` 在隔离的 E2E Files 页面拦截网络，仅提供合成计划/原件，实际通过浏览器原生下载分包，再调用 Python 校验器并保存 360px / 1440px 截图。CI 将小型证据单独保存为 `files-recovery-evidence`；不会访问生产对象或导出私有资料。

`node scripts/files-recovery-e2e.cjs --prepare-only` 可在不启动浏览器时检查同一合成计划、归档构造与离线校验链路；它不等于浏览器交互或像素验收。
