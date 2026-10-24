# 工作区动效与测试环境修复 · 发布记录

日期：2026-10-25，Asia/Shanghai。状态：本地检查全部通过，GitHub/生产发布进行中。此记录补充 [首轮验收](2026-10-25-workspace-motion-v2.md)，不改写其中的历史失败或未覆盖事实。

## 范围与安全边界

分支 `codex/workspace-motion-v2`，基线 `f52a69ae2e01844f155c030cc0713fae74e85bb2`。包含已授权的笔记排版、列表/详情过渡、全局导航与搜索面板，以及后续 8 项测试失败和 200% 缩放问题的修复。遵循现有设计、动效、质量、安全、工程和发布规范，没有降低检查标准。

本批没有 migration、权限、生产环境变量或依赖变更，不执行数据库迁移。此前 Agent 合规 PR #86 保持独立，其物理备份核验与生产 migration 仍未完成；本批上线不能被描述为该 PR 已发布。部署目标是 `wateryh2004-beep/personal-os` 的 `main`、Vercel 项目 `prj_MJTl1G24vYp9lwXMB7Zi9tjnjRcC`，team `team_e1IqTnbq4W6tJQRLNMcea3k9`。

## 8 项失败的根因与修复

- OCR 的 5 项失败：JSDOM/undici 的 ArrayBuffer 来自不同 VM realm，直接交给 Node WebCrypto 被类型校验拒绝。仅在测试夹具中把同一字节复制成 Node Buffer，继续调用真实 `webcrypto.subtle.digest`。缺失/错误摘要、等长篡改、截断和超长输入的原断言全部保留，没有返回固定摘要或跳过校验；生产 OCR 代码未改。
- 恢复的 3 项失败：macOS 的临时目录路径经过 `/var` 符号链接。正向夹具在 `realpathSync(tmpdir())` 下创建独立目录，满足原有严格输入契约。恢复 CLI 未改；已有目录、目标链接、链接父目录等拒绝断言继续通过，没有放行符号链接、覆盖原件或忽略恢复缺口。

原失败的三个文件现在 24 项全部通过。额外真实 Tesseract 识别也通过：使用本机 `STHeiti Medium.ttc` 与既有 `OCR_TEST_FONT` 配置生成合成材料，实际识别 PNG 与无文字层 PDF，保留中英文检查及空白页检查。最初不指定字体的运行因默认 Linux 字体不存在失败，补上实际 macOS 字体后原脚本通过，未修改断言或默认 CI 字体要求。

## 200% 缩放与短屏修复

使用独立 Chrome 窗口和浏览器原生 200% 页面缩放，非修改 CSS 假装缩放。已保存 [200% 原生控件](evidence/2026-10-25-workspace-release/chrome-200-control.png)、[列表](evidence/2026-10-25-workspace-release/chrome-200-list.png)、[搜索](evidence/2026-10-25-workspace-release/chrome-200-search.png) 与 [最终正文](evidence/2026-10-25-workspace-release/chrome-200-note.png) 截图。

检查发现原固定工具栏在短视口挤压正文。新增高度不超过 600px 的适配：文档区域可以纵向滚动，让位置栏和工具栏离开视口，正文区域保留 320px；编辑器仍挂载，专注/全屏路径不套用该覆盖。637×334 CSS 视口测量为文档可视高度 214px、内容高度 524px、正文高度 320px、文档宽度 637px，无横向溢出。

实际完成搜索输入、ArrowDown/Enter 打开对应笔记、阅读切换和滚动正文；放大后控件与正文仍可达。验证后将 localhost 缩放恢复 100%，关闭独立窗口，不修改真实笔记。该证据是原生页面缩放，不声称已经执行所有浏览器的“仅放大文字”模式。

## 系统减少动态效果

通过 macOS 系统设置 → 辅助功能 → 动态效果，记录原开关为关闭，临时开启真正的“减弱动态效果”。内置浏览器实际计算样式：侧栏、导航指示器、标签过渡为 0s；搜索为 `animation:none`、`transition:0s`、`transform:none`、`clip-path:none`。

1440×1000 和 390×844 均实际执行笔记打开/返回、阅读、搜索输入/结果、Escape 和导航；关闭后无残留 dialog，桌面回到搜索启动按钮，手机打开焦点停在标题，不自动唤起输入。运行中关闭系统减少动态效果后，已输入的“判断”和同一 dialog 保留，正常过渡恢复为 460/180ms。最后已恢复原关闭偏好。

- [桌面减少动态效果录屏](evidence/2026-10-25-workspace-release/reduced-desktop.mp4)；[详情](evidence/2026-10-25-workspace-release/reduced-desktop-note.jpg)、[搜索](evidence/2026-10-25-workspace-release/reduced-desktop-search.jpg)
- [手机减少动态效果录屏](evidence/2026-10-25-workspace-release/reduced-mobile.mp4)；[列表](evidence/2026-10-25-workspace-release/reduced-mobile-notes.jpg)、[搜索](evidence/2026-10-25-workspace-release/reduced-mobile-search.jpg)
- [实际观察](evidence/2026-10-25-workspace-release/accessibility.json)、[录屏帧信息](evidence/2026-10-25-workspace-release/recording-manifest.json)

录屏独立连续捕获真实浏览器画面，保留实际帧间隔，无插值；约 9fps，是行为证据，不是 60fps 性能证明。真实手机、读屏器和强制颜色等原来未覆盖的范围没有因此被声明通过。

## 发布前实际检查

| 检查 | 最终结果 |
| --- | --- |
| `npm test -- --reporter=json` | 316 文件，2,101 项全部通过，0 失败 |
| `npm run typecheck`、`npm run lint` | 全仓通过；曾与构建并行导致生成类型文件读取竞争，构建完成后顺序重跑通过，未排除 `.next/types` |
| `E2E_MOBILE_HARNESS=1 npm run build -- --webpack` | 通过，含原 prebuild OCR 资源与 TypeScript 检查 |
| `node scripts/verify-private-ocr-runtime.mjs` | 配置实际 macOS 字体后真实识别通过，无外部 OCR 或私人材料 |
| `node scripts/system-standards-audit.mjs --check` | 通过；6 个既有人工追踪项不冒充全站无缺陷 |
| 构建后 `node scripts/check-runtime-closure.mjs` | 127 traces / 25,791 paths；已知 CLI 告警链未加载、未追踪 |
| `npm run audit:ui` | 执行完成，保持提示性审计与存量清单 |
| `node scripts/check-project-docs.mjs`、`git diff --check` | 通过 |

摘要见 [检查结果](evidence/2026-10-25-workspace-release/checks.json)。全部界面正文为合成材料；门控场景拒绝真实写入。没有向公开缓存放私人内容、改动 owner 认证或扩大测试路由 allowlist。

## 首轮远端 CI 发现的阅读对齐回归

PR [#87](https://github.com/wateryh2004-beep/personal-os/pull/87) 的首轮 `design-and-code` 在 `workspace-details-e2e.cjs:129` 失败：1440px 桌面标题左缘 563px、阅读正文 583px，超过原 2px 要求。阅读容器仍使用旧 720px，现统一到标题与编辑正文的 760px；没有改动断言、容差或测试选择。重新构建后，360、390、768、1440px 的标题与阅读正文左缘差均为 0px，无横向溢出，见 [测量](evidence/2026-10-25-workspace-release/reading-alignment.json) 与 [截图](evidence/2026-10-25-workspace-release/reading-alignment-desktop.jpg)。原始来源清单保留，修复后来源另记于 [清单](evidence/2026-10-25-workspace-release/alignment-source-manifest.json)。

首轮 `verify` 还发现首次进入笔记的默认导航宽度从既有 272px 变成了 240px。现恢复默认及双击重置为 272px，导航上限也保留原 360px，避免窄桌面 CSS 限宽覆盖默认值；保留用户保存宽度与拖动，不修改原 `mobile-native-e2e.cjs` 的精确断言。排版与动效优化继续保留。重新构建后，768、1024、1440px 的首次宽度均为 272px，无横向溢出，见 [测量](evidence/2026-10-25-workspace-release/navigator-width.json)。两项修复后全量 Vitest 再次通过：316 文件、2,101 项、0 失败。

## GitHub、生产与回退

发布前核对远端 `main` 与当前生产仍为基线 `f52a69a`；原生产部署为 `dpl_6CY6CwAFN12q94LMJPRCEC3kEayd`。执行顺序：本地检查通过 → 推送并建立 PR → 当前 head 的 CI 通过 → 合并 PR → 核对生产部署与正式域名提交、认证拒绝、测试门控关闭及相关页面。

实际 PR 为 [#87](https://github.com/wateryh2004-beep/personal-os/pull/87)。最终 head、CI、merge commit、生产部署与正式域名验证结果在发布完成后记录于该 PR 的发布记录，避免把将来状态写进待发布源码；本地本记录同步补充，不以当前计划冒充执行结果。只读生产验证不触发 AI、数据库写入、重设密码或真实外部服务操作。纯界面/测试夹具变更可回滚到原部署，无数据库回退；不清空草稿、私人笔记或已存宽度。
