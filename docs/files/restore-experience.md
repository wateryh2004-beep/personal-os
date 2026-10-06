# Files 离线恢复体验与分卷校验

这个工具只在本地检查下载的 Files 导出，并在用户指定的新目录中生成隔离恢复树。无需网络、第三方软件包、数据库账户或存储凭据；不会读取生产存储、导入数据库、清理原文件或自动配置新备份位置。

## 日常用法

原有单包格式 `personal-os-files/v1` 保持兼容，默认仍输出机器可读 JSON。加 `--summary` 可直接看数量、字节数、归档文件、pending 排除项和 checksum 保证范围：

```sh
python3 scripts/verify-files-export.py /trusted/downloads/export.tar --summary
```

新格式 `personal-os-files-part/v1` 支持一次检查同一个计划的多个分卷，输入顺序不限：

```sh
python3 scripts/verify-files-export.py /trusted/downloads/part-*.tar --summary
```

单卷的 `status=verified` 只表示传入卷的本地完整性通过；如果全集仍缺卷，CLI 返回独立的 exit 3，避免脚本把它当成完整备份。分卷格式必须同时满足 `collectionComplete=true` 才表示全部卷齐全；少卷时 `scope=verified_parts_only`，`collection.missingParts` 精确列出缺少的序号，摘要醒目提示 `COLLECTION INCOMPLETE`。默认 JSON 的 `counts` 只统计实际检查到的文件，不能当成全集数量；`collection.totalDocuments` 和 `totalOriginalBytes` 是同一计划的声明总量。

校验器检查每卷 header/manifest 描述一致、计划 ID 与 metadata digest 相同、共享文件夹/关系的字节摘要一致、文档无重复且按 ID 排序、范围和 offset 连续、全部卷的字节/文档/pending 数量汇总正确。完整集合中，重复出现的文件夹和关系只统计一次。任何卷都不能凭自己的 `status=complete` 宣称多卷全集完整。

SHA-256 不是签名。共同的计划 ID 和元数据摘要是集合一致性约束，不证明来源真实性，也无法把 live-read 导出变成数据库事务快照。

## 隔离恢复与可读目录

用户选定一个本地、私有、尚不存在的目标路径后：

```sh
python3 scripts/verify-files-export.py /trusted/downloads/part-*.tar \
  --restore-to /trusted/local/files-rehearsal --readable-tree --summary
```

- 先在目标父目录创建临时目录，只在所有卷完整验证成功后发布目标目录
- 少卷时 `incomplete_collection` / exit 1，提示缺少的卷，清理本次临时文件，不发布目标；补齐后可重试相同路径
- 已存在的目标目录拒绝覆盖；父目录必须由当前本地用户独占管理
- 多卷 header/manifest 保存在 `parts/001/` 等目录；单包仍保留根目录的 `export.json` 和 `manifest.json`
- `objects/` 保留 UUID 命名原件；`documents/`、`folders/`、`relationships/` 保留原始元数据、归档状态和原 ID，关联到其他业务实体不等于这些实体已恢复
- `RESTORE-README.txt` 给出人可读结果、注意事项；`restore-summary.json` 保留机器可读结果

`--readable-tree` 是可选项，必须与 `--restore-to` 同用。它额外创建 `readable/`，按照文件夹和原始文件名整理文件。文件/文件夹名附加完整 UUID，因此同名文件不会冲突；不适合文件系统的字符会替换，长文件名会缩短。完整原名、folder ID、对象路径与可读路径逐行记录在 `restore-map.jsonl`，精确原值也始终保留在 JSON 元数据中。pending 文件只有元数据和映射，不伪造空原件。

为了兼顾长路径，超过 16 层或约 2,000 字节的可读文件夹路径放入 `readable/_deep_folders/`，并在摘要中说明数量；原始层级仍完整保存在文件夹元数据中。

## 存储占用与限制

可读目录使用同一新恢复目录内的硬链接，不复制第二份原件字节，也不会悄悄退回到额外复制。文件系统不支持硬链接时整个恢复拒绝发布，提示不带 `--readable-tree` 重试。

重要：可读文件与 UUID 对象共享同一份字节。编辑任意一路径会同时修改另一处；要编辑，请先复制到恢复树以外。工具不会打开或执行原件。下载的 TAR 与恢复出的原件本身仍各占一份存储；硬链接只避免可读视图再增加一份，目录项和元数据仍有开销。不要把恢复树当作不可变备份，也不要仅因重复字节估算就删除来源文件。

- 一次最多 256 卷；每卷最多 512 MiB；全集最多 25,000 条文件夹、文档和关系元数据
- 按 64 KiB 读取原件，单条 JSON 上限 2 MiB，内存只保留有上限的身份/关系/完整性索引；不把原件或整包读入内存
- 多卷按次序逐卷处理，整合集合中只保存一份共享文件夹/关系元数据；验证当前卷期间会有一份短暂的共享元数据副本
- 恢复需要足够本地空间容纳全部原件和元数据；工具不会自动清理其他内容来腾空间
- `--summary` 只改变输出格式，默认 JSON 保持兼容；完整单包或完整集合 exit 0，已验证但缺卷 exit 3，恢复拒绝/损坏/不完整原件 exit 1，下载中断 exit 2
- 不支持生产数据库导入、原目录覆盖、应用实体重建、跨计划卷混合或只恢复不完整全集

## 本地验证

仅使用合成原件与临时目录：

```sh
python3 -m unittest discover -s tests -p test_files_restore_experience.py -v
npm run test -- tests/files-restore-experience.test.ts tests/files-portable-export.test.ts tests/files-export-plan.test.ts
```

恢复测试覆盖同名/Unicode 文件、嵌套和归档元数据、pending、硬链接字节一致、可读摘要、默认 UUID 布局、过深路径、完整/部分/乱序分卷、混合计划、重复卷、共享元数据差异、范围/offset/总量、空集合、拒绝覆盖与补齐重试。额外用 64 MiB 合成原件进行串流恢复，Python 跟踪到的峰值分配低于 4 MiB；这个阈值不代表进程总 RSS，也不代表最大元数据规模的内存占用。
