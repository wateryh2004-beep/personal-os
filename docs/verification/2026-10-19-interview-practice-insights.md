# 练习与复盘页面候选验收 · 2026-10-19

状态：桌面工作区候选验证；未合并、未上线。基线 cd1b83c，分支 feat/interview-practice-insights。行为契约见 [面试学习](../career/INTERVIEW_LEARNING.md)，依据 [设计 v2](../design-system.md)、[交互](../design/interaction-clarity.md)、[动效](../design/motion.md)、[质量](../quality-standards.md)。

## 范围与实现

练习队列、单题作答与历史、复盘的层级和动作；复用共享范围表单、按钮和原生展开控件。保留完整题干/答案、原保存与回执语义。修正“未安排却显示到期”和“无 preparation 的练习进入单一范围”两处读取/展示规则；没有 migration、依赖、环境变量、Auth/RLS 或业务写入边界变更。回退可恢复前述基线代码，无需逆向删除数据。

## 实际检查

本地 Node 24，已安装 Next 16.3.8，桌面 personalOS 完整 checkout。全套命令实际结果见下方最终检查，不把本记录当生产验收。

- CUA 内置浏览器访问隔离 Vite 预览，使用真实页面组件、合成查询返回和失败 Action，无数据库连接、真实资料与写入。
- 练习：全部 9 / 通用 8 / 示例岗位 1，范围切换、URL、浏览器返回恢复；进入首题；其余题目展开和 Enter 收起；空队列与部分失败分开。
- 单题：初始参考和历史收起、不自动弹出作答键盘；完整参考展开后保留回答。填入回答、90 秒、卡点、复盘、下次重点后触发合成失败，全部输入保留、出现核对与重试动作；8 篇历史的最后正文可见，不截断。
- 复盘：待补齐动作保留范围；计划母题关联数/实际练习使用次数分别显示；空资料不判定能力无缺口；部分读取失败有明确提示；趋势 Enter 开关可逆。
- 三个页面 360、768、1440px 实测 document.clientWidth 与 scrollWidth 相同；390px 手机检查含长题干、长能力名。390×600 短屏可滚动到作答和保存；回答 16px、保存按钮和卡点标签 44px。浏览器最终 error 日志为空。
- 截图保存在任务本地 outputs：interview-practice-candidate-desktop/mobile、interview-insights-candidate-desktop/mobile、interview-practice-answer-candidate-mobile。使用合成数据；本地可操作预览保留用于连续开关与反向检查。

## 验证边界

预览的 next/link 和查询为隔离替身；范围表单通过真实浏览器 GET 验证，但不等于生产 Next 身份、数据或网络验收。现有保存行为另有 jsdom/Action 测试；本轮未做真实 Supabase 写入。没有数据库/鉴权 SDK 新用法，读取 owner/RLS 和 SQL 请求不变，范围修正仅在现有受保护结果上派生。

未独立验证 Safari、物理手机键盘、200% 字体、动态切换 reduced-motion/forced-colors 或真实网络性能；未录制独立动效视频，提供可操作预览。没有新增运动实现或性能达标声明。全局共享动效的历史/CI 证据不能冒充本轮设备测试。

## 最终检查

- `TMPDIR=/private/tmp npm test`：300 个文件、2036 项测试通过（本地最终整套运行）。新增真实页面渲染、统计范围、未安排日期文案和完整八次历史用例；原保存失败、防重复、已验证回执测试通过。
- `npm run typecheck`、全仓 `npm run lint`、新增测试最后补充后的定向 lint：通过。
- `npm run build`：生产 Next 构建通过；`node scripts/check-runtime-closure.mjs`：125 个 trace、26610 路径检查通过，CLI 告警链未加载/未追踪。
- `node scripts/system-standards-audit.mjs --check`、`node scripts/check-project-docs.mjs`（98 文档、349 链接）、`git diff --check`：通过。
- Vitest 提示现有 Vite 原生配置将来的兼容性警告，jsdom 提示未实现跨文档导航；均非测试失败。曾修正新测试漏导入和 details 属性匹配问题，最终结果如上。
