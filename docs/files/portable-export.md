# Files 可迁移导出与隔离恢复演练（v1）

## 能保证什么

`POST /api/files/export` 只在认证 owner 的同源显式请求后读取数据。响应是未压缩 `.tar`，私有且 `no-store`，无需新依赖。导出不写数据库、不修改 R2、不创建公开链接，不将密钥、cookie、签名 URL、bucket 或对象存储路径写入清单。

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

输出为 JSON；exit 0 且 `status=verified` 才表示这个包通过。pending 排除项和外部关系仍需查看。

- `interrupted` / exit 2：缺末尾 manifest、tar 结束块或对象流中断，不是成功导出，重新下载
- `incomplete` / exit 1：包结构和已取得字节可读，但有对象不可读、已记录 checksum 不匹配，或导出中元数据变化；解决问题后重新导出
- `corrupt` / exit 1：实际字节、清单、数量或文件夹关系不匹配，不能使用
- `restore_refused` / exit 1：目标不是安全的新目录，换一个本地路径

下载 HTTP 200 不表示导出完整：流开始后服务端不能改回错误 HTTP 状态。必须检查包内完成清单，并运行校验器。不要仅凭浏览器“下载完成”判断安全。

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
- 单原件上限 100 MiB，保守预估整个包不超过 512 MiB，元数据行数不超过 25,000；预检超限在开始下载前返回 413。运行期间再次限制大小，避免预检之后新增数据突破界限
- 单条 JSON 上限 2 MiB，校验器也限制条目数量和归档总量，拒绝重复、非法路径、链接和非本格式的条目
- 应用请求期限 240 秒；route maxDuration 为 300 秒，但平台实际配额可能更短，配置不能延长套餐限制。该版本不是后台导出任务，不承诺任意规模或断点续传
- 导出中途丢连接/异常会取消 provider 读取，未成功结束不会有可信完成标记。缺失对象先记录不可读并继续收集其他文件；已写 tar header 后流长度不符只能中断整包
- 导出末尾重新分页扫描同样元数据，摘要不一致则 `incomplete`。这能发现观察到的新增、删改、归档变化，但不是数据库事务快照，也无法排除两次读取间改回原状。需要强原子备份时应另建数据库快照与对象版本策略
- 导出期间尽量暂停文件整理/上传。超限或反复超时需要另行设计有授权的分批/后台方案；当前版本不静默截断、不自动重试和重复计费、不更改付费套餐

## 本地验证（仅合成数据）

```sh
npm run test -- tests/files-portable-export.test.ts tests/files-export-source.test.ts tests/files-export-route.test.ts
npm run typecheck
npx eslint src/features/files/export src/app/api/files/export tests/files-portable-export.test.ts tests/files-export-source.test.ts tests/files-export-route.test.ts
```

测试使用内存合成原件、临时目录和 mock provider/数据库。覆盖完整字节往返、归档/嵌套文件夹、关系、旧 hash 边界、pending、缺失/损坏/中断/重试、元数据漂移、短页和 >1,000 记录、资源限制、同源/auth 和取消。没有执行生产导出、恢复、R2 写入或真实敏感数据传输。
