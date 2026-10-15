# 2026-10-14 依赖与部署闭包复核

状态：本轮升级记录，不替代后续持续扫描。基线：`00d7d05`；相关实现与验证见 [全系统排查](../verification/2026-10-14-system-standards-v2.md)。

## 已采取的动作

| 对象 | 原状态 | 处理 |
| --- | --- | --- |
| Next / eslint-config-next | 16.3.6 | 固定到同一维护分支的 16.3.8 安全补丁；核对安装包内 App Router / ViewTransition 文档，重新执行类型、构建和浏览器验证 |
| Mammoth | 1.12.0 | 固定到 1.12.2，包含文档样式原型污染修复；保留仅提取原文的用途与 xmldom 0.8.15 限定 |
| shadcn CLI | 不被应用或脚本引用，却列在生产依赖 | 移除未使用的 CLI 依赖；现有已生成的 UI 组件、Radix、配置文件和功能保留 |
| js-yaml / undici / DOMPurify / source-map-js 等 | 锁文件含已公告受影响版本 | 在兼容范围内更新锁文件；不使用强制降级或不兼容的大版本覆盖 |
| PDF/图片原生栈 | 已有独立版本与渲染协议 | 本轮不改变 Sharp、PDF.js、canvas、MapLibre 及原生库的既有版本；沿用冷包渲染、真实提取与边界回归 |

来源核对：[Next 官方 9 月补丁说明](https://nextjs.org/blog/september-2026-security-release)、[Mammoth 维护者变更记录](https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/NEWS)、[Mammoth 原型污染公告](https://github.com/advisories/GHSA-89qm-22qm-xf5h)。使用 npm registry 的实际可获取版本和安装包内容核对，不只依据自动修复建议。

## 剩余的 CLI 告警

初始 `npm audit --omit=dev --json` 报告 23 个包级告警：1 critical、14 high、7 moderate、1 low。包级统计会沿依赖链扩散，并不表示 23 条独立可利用的应用漏洞。

更新后的生产依赖扫描剩余 Mammoth → argparse 1.x → sprintf-js 的 3 个 moderate 包级告警，属于同一 [未发布修复的 sprintf-js 公告](https://github.com/advisories/GHSA-hp3w-g68c-fv3c)。npm 给出的 Mammoth 0.3.29 强制降级没有采用。

应用入口是 `mammoth.extractRawText()`，不调用 Mammoth CLI。`scripts/check-runtime-closure.mjs` 使用真实 Node require 缓存及构建后的所有 server nft 清单，核对未加载/未追踪这条 CLI 依赖链。此检查不宣称所有第三方代码已被形式化证明安全，也不把剩余告警改写成零告警。

后续若改变提取入口、增加 CLI 调用或升级依赖，应重新检查这项判断。若 CLI 链进入部署闭包，新增检查会失败；不能仅凭当前分类继续接受它。

## 开发工具链扫描

完整安装扫描（包含 devDependencies）仍有 8 个包级告警：上述 3 个 moderate，以及 Next ESLint 插件 → fast-glob → micromatch → braces 的 5 个 high，后者对应同一 [深层嵌套模式导致栈耗尽的公告](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。本轮没有把全依赖扫描称为零高危。

这条链用于开发期 lint 的项目路径匹配，应用没有将用户输入当作这些工具的 glob 模式；部署清单检查同时排除对应独立包路径。自动工具建议降到 eslint-config-next 14.2.35，未采用不匹配框架的降级。保留现有严格 lint 与兼容维护版本，并记录上游待修复状态。

以上是对既有告警的调用路径分类，不是全局忽略规则；未来如果将这些包用于运行时或接收不可信模式，部署闭包检查会失败，必须重新评估。

## 验证

运行 `npm ci --ignore-scripts`、`npm test`、`npm run lint`、`npm run typecheck`、`E2E_MOBILE_HARNESS=1 npm run build`、`node scripts/check-runtime-closure.mjs`，并执行原有 PDF 冷包、文档提取和跨模块浏览器流程。最终实际结果写入本轮排查记录与 PR；本文件中的检查命令不是已通过的替代证据。
