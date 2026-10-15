# 如何给 Agent 分派 Personal OS 的开发任务

状态：使用指南，2026-10-15。规则的权威来源仍是 [AGENTS.md](../AGENTS.md)、[文档索引](README.md) 和相应主规范；本文帮助所有者发出任务，不另建一套规范。

## 可以直接复制的指令

> 这是 Personal OS 项目。开始前，请先读取仓库根目录 `AGENTS.md` 和 `docs/README.md`，再按任务阅读路由读取项目治理、Agent 工作规范、本次涉及的主规范与模块契约。简要说明适用的文档和当前实现的具体差距，然后落实改进、验证完整用户操作并更新相关记录。界面任务要检查页面内部的信息结构、阅读与编辑、常用操作、状态、响应式和完整动效；不能只修改公共配色与字号就视为完成。区分已实现、已验证与未验证项，保留现有数据和输入。任务是：〔填写你的需求〕。

日常可以更短：**“按仓库 `AGENTS.md` 和 `docs/README.md` 的阅读路由，继续优化〔模块/流程〕；完成相关实现、交互与验证。”**

不需要在每次任务粘贴几十份文档。两个入口负责把 Agent 引导到适用文件；若平台没有自动加载仓库指令，应由 Agent 主动读取。让它报出本次实际适用文件即可，不要求反复抄全文。

## 文档分别负责什么

| 任务 | 入口之后要读的内容 |
| --- | --- |
| 所有开发 | [项目治理](project-governance.md)、[Agent 工作规范](agent-workflow.md)；核对当前分支和适用目录指令 |
| 页面布局、阅读、操作与文案 | [设计](design-system.md)、[交互](design/interaction-clarity.md)、[文案](design/content.md)、[动效](design/motion.md) |
| 代码与组件实现 | [架构](architecture.md)、[工程规范](engineering-standards.md)、[质量](quality-standards.md)、[性能](performance.md) |
| 职业与面试 | [产品](product-spec.md)、[Career 信息架构](career/INFORMATION_ARCHITECTURE.md)、[数据模型](career/DATA_MODEL.md)、[面试学习](career/INTERVIEW_LEARNING.md)；保留事实、答案、思路与练习的边界 |
| 笔记与编辑器 | [数据治理](data-governance.md)、[安全](security.md)、[导航资源所有权](performance/navigation-resource-ownership.md)；本轮交互见 [工作区细化规格](specs/workspace-details-v2.md) |
| 日历 | [时间契约](contracts/calendar-time.md)、[同步运行手册](calendar-sync-operations.md)、[Microsoft 集成](microsoft-calendar-integration.md)；Outlook 的执行权威与确认管道保持有效 |
| 数据、权限或上线 | [数据治理](data-governance.md)、[安全](security.md)、[发布与恢复](release-operations.md)，再读对应领域手册 |

遇到长列表时由 Agent 按实际变更范围选择；纯样式修复无需读取全部数据库历史，涉及保存、恢复或权限时不能跳过相关契约。历史验收记录证明当时的检查，不作为永久的现状或设计规则。

## 如何判断它是否完成了任务

可以要求它用你能理解的方式报告三个问题：**原来哪里不好 → 现在具体怎么操作 → 实际检查过什么**。例如：“笔记可切换阅读与编辑，切回时草稿和撤销记录保留；已检查手机与桌面，真实设备帧率尚未测量。”

“统一了颜色”“改了很多文件”“构建成功”本身都不能证明页面好用。UI 需要代表性截图，动画需要完整过程的录屏或可操作预览；失败、返回、快速切换和减少动态效果也属于验收。正式规则以 [质量规范](quality-standards.md) 为准。

本轮职业、笔记与日历的具体实现和边界见 [工作区细化规格](specs/workspace-details-v2.md) 与对应 [验收记录](verification/2026-10-15-workspace-details-v2.md)。
