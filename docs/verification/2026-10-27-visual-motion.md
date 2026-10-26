# 全系统视觉与动效精修 · 本地验收记录

类型：本次验收记录。日期：2026-10-27（Asia/Shanghai）。状态：首次本地静态、单元与默认生产构建通过；首轮 CI 暴露的问题已修补并完成相关本地复验，新 head 的完整远程浏览器结果与生产验收待实际执行。

## 对象与环境

- 规格：[全系统视觉与动效精修](../specs/visual-motion-polish.md)。依据现有设计、动效、工程、质量规范，不降低原门禁。
- 分支 `codex/visual-motion-polish`，基线 `0eb0b1d89f779b7eb163d3a47f7b6ef8d9cf8933`；首次本地验证对象是当时未提交工作树；随后建立 [PR #92](https://github.com/wateryh2004-beep/personal-os/pull/92)，首次候选 head 为 `b76cd719859eb2a8cbaacbd3f4278077ded0ee0f`。下文分别保留首次本地结果和该 head 的远程结果，后续修补尚待新 head CI。
- macOS 本地已安装依赖，Next.js 16.3.8、Vitest 4.1.11。完整测试、类型与 lint 于 00:26–00:28 执行；生产构建与闭包于 00:27–00:33 执行。
- 在最终检查前固定 51 个改动文件的 SHA-256；检查期间产品、测试与脚本文件未变。文档随后补充此记录，并重新执行文档及差异检查。命令、UTC 时间、退出码、完整日志和最终文件哈希保存在本地忽略目录 `work/visual-motion-2026-10-26/`，核心账本为 `final-local-verification.json`。

## 实际执行

| 检查 | 命令 | 结果与范围 |
| --- | --- | --- |
| 全仓单元/组件检查 | `npm test` | 退出 0；353 文件、2317 测试通过。保留既有 Vite 配置未来兼容提示及 jsdom navigation 提示，未通过抑制提示改变结果。 |
| 全仓类型 | `npm run typecheck` | 退出 0。 |
| 全仓 ESLint | `npm run lint` | 退出 0。 |
| 文档索引与链接 | `node scripts/check-project-docs.mjs` | 退出 0；新验收文档加入后再次检查。该脚本不证明文档事实或界面品质。 |
| 系统规范审计 | `node scripts/system-standards-audit.mjs --check` | 退出 0；保留 6 个既有需人工追踪的控件名称提示，未删除或降低规则。 |
| 三份新增浏览器脚本语法 | 分别对 `editorial-notes-files-e2e.cjs`、`shell-visual-e2e.cjs`、`planning-visual-e2e.cjs` 执行 `node --check` | 全部退出 0；仅语法通过，不表示浏览器流程通过。 |
| 差异格式 | `git diff --check` | 退出 0；最终文档补充后再次检查。 |
| 默认生产构建首次沙盒尝试 | `E2E_MOBILE_HARNESS=1 NEXT_TELEMETRY_DISABLED=1 npm run build` | 未完成：约 201 秒仍停在创建优化构建阶段；两次观察专属 `next-build` 进程 CPU 为 0 且无新增日志，随后只对本次构建发送 SIGTERM，退出 143。未将其记作通过，也不据此认定源码失败。 |
| 同命令完整重验 | 同上，在允许子进程通信的执行环境重跑 | 退出 0，38.16 秒完成；默认 Turbopack 编译 8.0 秒，类型与页面生成完成。未用 Webpack 代替该结果。 |
| 构建后运行闭包 | `node scripts/check-runtime-closure.mjs` | 退出 0；136 份 trace、28979 个路径；已知 CLI 告警链未进入加载或部署 trace。该检查不是全部依赖安全证明。 |

## 具体修复及审查闭环

- 笔记和应用主区原生共享名称只用于非交互纸面/背景及标题呈现层，实际输入、阅读和返回位于 live 层，避免可见后点击被动画快照吞掉；同笔记双区不会复用路由共享名称。
- PDF 移除与真实缩放纸面冲突的 `min-width`，纸面以画布宽度与比例居中。单位测试保护暖会话、稳定工具栏和渲染状态；浏览器缩放几何仍需新增脚本实际验证。
- 文件查看器按既有筛选排序提供连续切换，同一个 Dialog 外壳保留，旧 PDF 会话销毁；切换后的当前来源几何与返回焦点分别管理。
- 搜索预览导航先释放手机 Dialog 历史层，再关闭并进入共享导航路径；背景/live 使用不同 key，保留 Notes 内部状态与编辑器 DOM。
- Calendar 减少动态效果通过响应式偏好驱动实际配置，避免后续 React 渲染覆盖；时标列使用等值 em 尺寸以容纳放大文字。
- Projects 只呈现真实状态、目标及到期信息；当前没有独立项目里程碑、自动下一任务或状态写入入口，本轮不伪造这些事实。

## 浏览器证据与未验证项

本地此批终验未运行 Playwright，也未要求所有者手动测试。协调者先前通过电脑使用浏览器观察了合成 Today、笔记与搜索界面，并实测笔记打开后立即阅读/返回；随后浏览器连接中断，因此这些局部观察不能替代最终工作树的完整浏览器验收。

新增 [Visual motion 工作流](../../.github/workflows/visual-motion.yml) 将在隔离回环服务中运行三份脚本：

- Notes/Files：四视口与正常/实际 200% 字形/减少动态效果矩阵，纸面逐帧几何、立即反向、长正文、图片、连续文件、真实 PDF 画布及三档缩放，保存截图、视频与 trace。
- Shell：四视口搜索预览、键盘/触摸、手机预览打开及返回、动态减少效果/强制颜色、实际文字翻倍、分隔取消与编辑器身份；包含正文动画期间点击。
- Planning：五视口项目/日历、真实拖放 mirror 时长和已载入重叠、释放仅一个预览、取消、实际 200% 字形与动态偏好；保存截图、视频与 trace。

首次本地记录形成时以上远程脚本尚未执行。后续首次候选 CI 的实际结果见下节；脚本存在或部分截图不等于整套动画通过。既有 Today、Notes、Workbench、系统回归门禁继续保留。这里也没有真实手机硬件、Safari 或中国大陆网络的流畅度测量，不承诺线上帧率或 provider 延迟。

## 首次 CI 问题与修补复验

首次候选 `b76cd71` 的 21 个 check-run 最终为 14 成功、3 失败、4 取消，另有 Vercel 状态成功；该候选未通过发布门禁。完整日志、原始失败截图、连续视频、trace 与哈希保留在忽略目录 `work/visual-motion-2026-10-26/ci/b76cd71/`，`ci-status.json` 和 `artifact-manifest.json` 记录实际来源。失败候选的诊断资料不作为最终成功视觉证据。

- Notes/Files 首个 360px 正常矩阵在列表返回位置断言失败。合成 fixture 初始地址缺少 `workspace`，返回时加入 `workspace=notes`，造成真实滚动恢复 key 不同。修补将初始及返回地址规范为同一地址，保留原第六条锚点与 `<3px` 恢复限制，没有修改产品滚动恢复或在脚本中修正滚动位置。
- Shell 在反向切换时采到旧页面仍可见的同名 probe，误读为正向动画。修补等待精确目的地址与属于目的工作区的 probe；原正反方向断言、动画运行期间的真实指针点击和不中断操作要求保留。
- 系统规范中 `design-v2-e2e` 子流程通过，随后既有 `workspace-details-e2e` 在 768px 检出标题 x=520、编辑正文 x=528 的真实 8px 偏差。修补统一笔记纸面列宽与桌面 32px/手机 20px 留白，保留原 `≤2px` 对齐门禁，并补充阅读/编辑、普通/实际 200% 文字、单区/双区的真实可见面检查。
- OCR、Planning、缓存 PDF 和主 Verify 四个 job 受 Ubuntu Azure 镜像安装依赖/中文字库耗时影响取消，不能视为业务测试通过。OCR 与 Planning 尚未进入各自浏览器业务流程；缓存 PDF 已进入启动阶段但未完成最终断言。主 Verify 的单元检查实际通过 353 文件/2317 测试，后续浏览器流程未完成。共享 CI helper 只交换 runner 已有官方 HTTPS archive 与 Azure 镜像的优先级，保留 security 镜像、来源、签名/TLS、依赖版本、字体、超时及全部断言；五份工作流的六处安装步骤使用同一 helper。

修补还将实际 200% 文字验证改为首次布局前持续生效的 CSSOM 字体样式，保留实际选择器、媒体条件和优先级；新挂载的列表/正文在产品恢复滚动前已是放大尺寸。后续采样仅读取尺寸，明确检查可见标题 56/72px、CodeMirror 与阅读正文 32px，不用观察器或恢复后滚动补偿制造通过。

修补的独立本地复验：14 个相关测试文件/138 测试、全仓 typecheck、三份脚本语法和默认 Turbopack E2E 生产构建均退出 0。全仓 ESLint 退出 0；构建后闭包退出 0（136 份 trace、28979 个路径）；helper 临时目录合成检查、非 CI 主机跳过保护、Python 语法和五份工作流 YAML/六处安装顺序检查均退出 0。逐文件移除新增 helper 调用后，工作流与候选 head 原文逐字节一致。命令、时间、日志与最终文件 manifest 由 `ci-followup-local.json` 登记。本轮没有本地浏览器连接；新 head 的完整浏览器矩阵、真实 runner 安装结果及既有对齐回归必须由后续 CI 执行，不宣称这些检查已通过。

## 第二次 CI 与第三轮修补

第二次候选 `67bb3f320078794451672384f382b71e756c6c71` 的 21 个 check-run 最终为 15 成功、5 失败、1 取消；Vercel Preview READY 不代表流程通过。该 head 的最终只读快照、日志、六份经过 GitHub digest 核对的 ZIP 及逐文件校验保留在 `work/visual-motion-2026-10-26/ci/67bb3f3/`。主 Verify 单元实际为 353 文件/2317 测试通过；系统规范的两个浏览器子流程、Workbench、OCR 已实际完成。主 Verify 后段导航脚本失败，Document continuity 的阅读浏览器安装 job 取消，因此完整门禁未绿。

APT helper 在三个新增视觉 job、OCR、系统规范和 Workbench 的实际 runner 安装日志中生效，原 Playwright 1.62.1、Chromium with-deps 及中文字库保留，实际从既有 HTTPS 官方 archive 下载。Document continuity 的两个安装入口此前未接入 helper，其中阅读浏览器仍在 Azure 下载依赖时取消、尚未启动业务验证；第三轮给这两个入口补同一 helper，原安装命令、版本、依赖和超时逐字保留。真实新 runner 安装仍待下一候选 CI。前三个视觉 suite 均已越过安装，以下失败来自真实浏览器步骤：

- Notes/Files 点击“上一文件”与独立缓存 PDF 三档点击“下一页”均因控件在视口外超时。实际生产 CSS 优化将独立 `translate` 合入 `transform`，与 Tailwind 平移叠加，导致 Dialog 偏离视口。这是产品样式缺陷。修补将静止定位和开闭运动统一到单一 transform，清零 utility 平移并取消独立 translate；手机与桌面分别使用既有底部/居中坐标。减少动态效果仍保留静止定位 transform，并要求没有运行中的动画；静止定位本身不是动态效果。原真实上一文件/下一页点击继续保留，新增查看器、关闭和队列控件的边界检查，不用 force click 绕过。
- Shell 在预览内按首次 Esc 后外层搜索一起关闭，后续找不到“预览所选”。这是实际 Radix document capture 与内层 React 冒泡事件顺序冲突的产品问题。修补在真实 DialogContent 的 `onEscapeKeyDown` 消费首次 Esc，只收起预览并保留查询、外层与焦点；第二次 Esc 才退出外层。用真实 Radix portal 测试手机/桌面，保留真实历史返回次数检查，没有新增全局键盘监听。
- Planning 的浏览器 mock 返回 HTTP 200，但缺少严格 DTO 必填 `status`；fixture 也没有建立受保护资源需要的合成 owner 上下文。这是验证场景缺陷，没有修改生产 schema 或授权规则。修补让脚本与 fixture 共享含 `status:notStarted` 的 JSON，并仅在门控合成场景中建立身份边界；新增真实 Boundary→resource→fetch→schema 测试，完整 DTO 成功，缺 status 的 HTTP 200 仍明确拒绝并显示重试。
- 主 Verify 最后在 `navigation-refinement-e2e.cjs:44` 用全局 `popover-content` locator 等待隐藏时，匹配到两个仍在退场的 closed Popover，触发严格选择器错误。修补通过各触发器真实 `aria-controls` 分别定位关联弹层，保留一个 open→零个 open、所有 closed 退场层完整卸载和返回正确触发器焦点的要求。同时修复真实共享 Popover 的退出语义：closed Presence 保留绘制期间设置 inert/aria-hidden，使其不能被键盘访问；受控/非受控和快速重开使用真实 Radix 回归，不能只靠 pointer-events 阻断鼠标。没有使用 `.first()`、强点、延长超时或等待固定时长规避歧义。此前 Leisure 首图曾进入 fallback，既有真实图片重试后四视口通过，未将瞬时失败隐藏为首次成功。

前三项修补经过独立源码审查和实际 Lightning CSS minify 核对；新增共享 Popover 修补后重新执行完整本地验收：355 文件/2323 测试、全仓类型、全仓 lint、四份浏览器脚本语法、文档与差异检查均退出 0；默认 Turbopack E2E 生产构建退出 0，29.627 秒；构建后闭包退出 0（136 traces/28979 paths）。Document continuity 的两处安装调用还经过独立 YAML/顺序/原内容逐字节核对与 helper 合成检查。具体实际命令、退出码、时间和最终哈希由 `round3-local.json` 记录。初次针对 11 文件的 354 文件/2321 测试结果保留，最终证据以加入 Popover 后的复验记录为准。此处不把源码/minify/jsdom 成功当作屏幕几何、裁切或动效逐帧通过；下一候选必须重新执行完整远程浏览器矩阵。第二次候选三份新增 suite 均未完成四视口正常连续录屏，Planning 只有失败阶段截图及 trace，trace 不是视频。

## 数据、安全与发布

本次没有数据库迁移、环境变量、依赖或外部权限变化。验证使用合成资料，三个浏览器脚本限制回环目标、拒绝业务写入和未知 API；不注入生产账号或 provider 凭据。没有真实 Microsoft 写入、生产密码修改、私人正文导出或生产恢复操作。

PR #92 与首次候选 head 已建立，但本记录没有证明后续修补已提交、完整 CI 已通过、已合并、已部署或正式域名已验证。发布沿用既有授权与 PR/CI 流程，后续实际 GitHub head、部署提交、匿名协议和生产验证边界由交付账本登记。回退为兼容代码/样式回退，不删除资料、版本或原件。
