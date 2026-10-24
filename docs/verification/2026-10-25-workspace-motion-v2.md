# 笔记与公共导航动效 · 第一批验收

状态：本地实现、截图与连续录屏完成；补充可访问性环境验证有明确未覆盖项，未声明完整多端或生产验收。执行时间：2026-10-24 晚至 2026-10-25，Asia/Shanghai。

后续 8 项失败的修复、原生 200% 缩放、系统减少动态效果与发布推进见 [补充发布记录](2026-10-25-workspace-release.md)。下文保留首轮验收的真实历史状态。

## 对象与环境

- 分支 `codex/workspace-motion-v2`，基线 `f52a69ae2e01844f155c030cc0713fae74e85bb2`，本地工作树实现。源文件摘要见证据目录中的 `source-manifest.json`。
- 遵循现有 [设计](../design-system.md)、[交互](../design/interaction-clarity.md)、[动效](../design/motion.md)、[质量](../quality-standards.md) 与 [本批规格](../specs/workspace-motion-v2.md)；没有降低规范或删除检查要求。
- Next.js 16.3.8 webpack 生产构建，macOS 上的 Codex 内置浏览器，回环地址 `127.0.0.1:3125`。390×844 手机与 1440×1000 桌面；另检查 360×780、768×1024 和 390×600 短屏。这些是浏览器视口，不是真实手机。
- 已有 `E2E_MOBILE_HARNESS=1` 门控内的 `workspace-motion` 场景；32 篇合成笔记、3 个合成文件夹与合成正文。无依赖新增，无 schema、认证或业务接口变更。

## 最终行为

笔记列表采用 840px 最大阅读宽度、共同对齐轴、36/30px 宋体标题与更清楚的行间距。笔记导航默认 240px，保留已存宽度；窄桌面限制到视口的 28%，宽屏仍支持原有 360px 上限。详情将正文和标题分开衔接，标题使用真实 note ID 配对；返回时先恢复原列表位置再采样过渡。

桌面导航与手机底部导航的底面读取实际链接位置，选中反馈和已提交路由语义分开。侧栏收展同步工作区边距；手机切换断点时不动画遗留桌面边距。

全局搜索采用同一个标题、输入和结果面板，桌面从搜索入口展开，手机从底部进入。首次加载、成功、空态和失败有实际反馈；空结果提示不再被仍存在的 AI 选项隐藏。重模块仅在打开时加载；退出周期内快速重开保留关键词，重复快捷键保留原始焦点，正常关闭恢复真实启动位置。

## 实际检查

| 检查 | 实际执行 | 结果 / 退出码 | 范围 |
| --- | --- | --- | --- |
| 类型 | `npm run typecheck`；生产构建内 TypeScript | 通过 / 0 | 全仓类型 |
| lint | `npm run lint` | 通过 / 0 | 全仓；未屏蔽规则 |
| 聚焦回归 | 8 个相关测试文件 | 51 项通过 / 0 | 返回参数、导航几何与清理、搜索真实空态、懒加载、面板生命周期与焦点、移动几何、交互连续性 |
| 完整 Vitest | `npm test -- --reporter=json` | 316 文件，2,101 项；2,093 通过，8 失败 / 1 | 失败与此前基线一致，见下文；不能写成全仓测试通过 |
| 生产构建 | `E2E_MOBILE_HARNESS=1 npm run build -- --webpack` | 通过 / 0 | 包含 prebuild OCR 资源生成；门控只用于本地验证 |
| 规范审计 | `node scripts/system-standards-audit.mjs --check` | 通过 / 0 | 6 处既有 control-name-needs-trace 人工追踪项，非全模块视觉证明 |
| 部署闭包 | 构建后 `node scripts/check-runtime-closure.mjs` | 通过 / 0 | 127 traces / 25,791 paths；已知 CLI 告警链未加载、未追踪 |
| UI 提示审计 | `npm run audit:ui` | 执行完成 / 0 | 提示性存量漂移清单，非阻断式全面验收 |
| 文档与差异 | `node scripts/check-project-docs.mjs`、`git diff --check` | 通过 / 0 | 仓内链接与差异格式 |
| 响应布局 | 上述五组视口，列表、详情和搜索 | 已观察通过 | 无文档横向溢出；768px 初始断点动画中的测量与落定测量分别保存 |
| 返回与草稿 | 深列表打开第 12 篇后浏览器返回；修改合成标题后离开再打开 | 已观察通过 | 列表恢复至 scrollTop 1099.5；本机草稿恢复；写入拒绝显示真实失败 |
| 输入与焦点 | 阅读/编辑；标题中打开搜索再 Escape；重复快捷键 | 已观察通过 | 编辑器节点保留；标题值与 caret=40 保留；焦点回到标题或实际搜索入口 |
| 搜索状态 | 合成成功、无结果、503；手机打开不自动聚焦字段 | 已观察通过 | 手机首次焦点是标题；结果和失败未冒充真实业务服务 |
| 键盘与宽度 | ArrowDown / Enter 打开真实结果；导航拖动到 340px 后刷新，双击复位 | 已观察通过 | 结果打开对应详情，弹层退出后可返回；340px 保留，复位到 240px |
| 中断 | 搜索收回后 74ms 内重开；今日→职业→笔记连续导航 | 已观察通过并录屏 | 同一搜索面板，关键词仍为“判断”；最终选中为笔记，无残留遮罩 |
| 控制台 | 最终生产构建验证标签的 warn/error | 0 条 | 仅此合成操作范围，不代表生产监控 |

完整测试中的 8 个失败：`files-ocr-control.test.ts` 5 项校验/识别失败；`system-backup.test.ts` 2 项、`system-backup-artwork.test.ts` 1 项因 macOS 临时路径符号链接触发恢复拒绝。这些实现与断言不在本批改动中，没有改白名单、放宽恢复规则或隐藏失败。Vitest 另有 Vite native configLoader 的未来兼容提示。

## 截图与连续录屏

所有图片、视频均为合成资料。录屏由独立于操作序列的连续浏览器视口捕获循环产生，按实际帧间隔用 ffmpeg 编成 VFR MP4，没有补帧或插值。捕获约 7.9–9.0 fps，用于查看路径、起止、中间帧与中断，不是 60fps、真实设备流畅度或性能预算证明。已检查连续帧与对应落定画面。

- [桌面列表](evidence/2026-10-24-workspace-motion/desktop-notes.jpg)、[桌面详情](evidence/2026-10-24-workspace-motion/desktop-note.jpg)、[桌面搜索](evidence/2026-10-24-workspace-motion/desktop-search.jpg)
- [手机列表](evidence/2026-10-24-workspace-motion/mobile-notes.jpg)、[手机详情](evidence/2026-10-24-workspace-motion/mobile-note.jpg)、[手机搜索](evidence/2026-10-24-workspace-motion/mobile-search.jpg)、[文件夹抽屉](evidence/2026-10-24-workspace-motion/mobile-folders.jpg)
- [360px](evidence/2026-10-24-workspace-motion/notes-360x780.jpg)、[768px](evidence/2026-10-24-workspace-motion/notes-768x1024.jpg)、[短屏](evidence/2026-10-24-workspace-motion/notes-390x600.jpg)、[长标题与保存失败](evidence/2026-10-24-workspace-motion/mobile-long-title.jpg)、[搜索空态](evidence/2026-10-24-workspace-motion/mobile-search-empty.jpg)、[搜索失败](evidence/2026-10-24-workspace-motion/mobile-search-failure.jpg)
- [桌面连续录屏](evidence/2026-10-24-workspace-motion/desktop-motion.mp4)：66 帧，约 7.5s，笔记打开/返回、阅读、导航、侧栏收展与搜索。
- [手机连续录屏](evidence/2026-10-24-workspace-motion/mobile-motion.mp4)：52 帧，约 6.6s，笔记、搜索、浏览器返回与底部导航。
- [快速反向连续录屏](evidence/2026-10-24-workspace-motion/interruptions-motion.mp4)：22 帧，约 2.4s，搜索反向、重复快捷键与连续导航。
- [观察数据](evidence/2026-10-24-workspace-motion/observations.json)、[录屏说明](evidence/2026-10-24-workspace-motion/recording-manifest.json)、[检查摘要](evidence/2026-10-24-workspace-motion/checks.json)

## 数据、安全与未覆盖项

场景复用真实组件，API 读由场景返回合成资料，所有非 GET 请求拒绝，表单提交被阻止，不连接个人数据库或执行 AI。场景把生产链接映射到门控 URL；返回按钮在浏览器证据中也走映射，生产返回处理器则由真实组件单测验证。不能将其写成生产鉴权、真实保存、Supabase 或真实完整路由升级验证。

减少动态效果：已实现并检查公共 ViewTransition、导航、搜索与 Presence 的减少动态效果分支，以及强制颜色选中轮廓；本轮未完成浏览器媒体偏好的实际切换验证。200% 缩放：曾在独立 Chrome 标签中设置到 200%，但系统屏幕捕获报错，未取得有效页面证据；已恢复缩放并关闭独立标签，因此这一项标记为未验证。没有用空白截图、修改测试样式或弱化规范代替验收。

未进行真实 iOS/Android、Safari、触摸硬件、读屏器、强制颜色实际环境、后台标签恢复或真实网络性能测量。当前截图/录屏只能证明所列本地浏览器场景，不能声称完整可访问性、100ms/p95 或生产流畅度通过。

## 发布与恢复

本批只在本地分支实现，尚未提交 Git commit、推送、建立 PR、合并或部署；没有数据库迁移。此前安全修复 PR #86 与其受备份验证阻塞的生产发布保持独立，本记录不代表其已上线。

回退本批源代码与样式即可恢复界面；不需要数据库回退。不能清空用户笔记、草稿或已有导航宽度来回退。合并前仍需补齐上面未验证的环境项，并处理或明确接受全仓基线失败。
