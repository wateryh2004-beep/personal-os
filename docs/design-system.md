# Quiet Precision 设计系统

## 视觉基调

克制、清晰、优美，优先让内容和决策显现。页面暖白，内容表面纯白；不使用渐变、玻璃拟态或金融终端黑底。卡片只用在需要边界的编辑、详情、汇总区域，不把每一行信息都卡片化。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--background` | `#F7F7F5` | 页面背景 |
| `--surface` | `#FFFFFF` | 内容面、弹层 |
| `--foreground` / `--text-primary` | `#1D1D1F` | 一级文字 |
| `--text-secondary` | `#454C54` | 次级文字 |
| `--text-tertiary` | `#60666D` | 辅助文字 |
| `--border` | `#E5E7E7` | 分隔与控件边框 |
| `--primary` / `--accent` | `#0E7490` | 唯一主强调 |
| `--primary-soft` / `--accent-soft` | `#ECF6F8` | 选中、轻提示背景 |

使用 CSS variables 将 token 映射到 shadcn theme。`background`、`foreground`、`card`、`card-foreground`、`popover`、`popover-foreground`、`primary`、`primary-foreground`、`secondary`、`secondary-foreground`、`muted`、`muted-foreground`、`accent`、`accent-foreground`、`input`、`border`、`ring`、`destructive` 均须在 `globals.css` 中有明确 mapping；页面 chrome 不得重新硬编码其等价颜色。状态色仅用于状态（错误、完成、提醒），不得用多色装饰。阴影只用于菜单、对话框与浮层，且应轻微。

### Radius、控件与动效

- `--radius-sm`：图标按钮、小型行内控件；`--radius-md`：Button、Input、Select、导航与行选中；`--radius-lg`：Dialog 与独立 surface。
- `rounded-full` 仅用于 avatar、badge 和真正的 pill；不得以 `rounded-xl` 制造装饰性差异。
- Button 的标准高度为 small 30px、default 34px、large 38px；Input 与 Select 默认 34px，Textarea 继承同一边框、focus ring 与 disabled 语义。手机主要控件与图标按钮至少 44px，输入文字至少 16px。
- Hover 只过渡背景、文字、边框或透明度，使用 `--motion-fast`（120ms）；普通微交互使用 `--motion-base`（160ms）；Dialog、Sheet、SidePanel 使用 `--motion-panel`（180ms），统一 `--ease-standard`。禁止 `transition-all`、普通 UI 的长动画、明显 zoom、bounce 和逐行入场。
- `prefers-reduced-motion` 始终优先，不能以动画表达唯一信息。

## 排版与布局

- UI 使用系统字体；等宽数字、金额、时间与 ID 使用 SF Mono、Geist Mono 等宽回退。
- 中文回退：`PingFang SC`, `Microsoft YaHei`, system-ui, sans-serif。
- 正文优先 14–16px，标题通过字重、留白与层级而非大字号制造噪声。
- 桌面：固定左导航（216px）、页面顶部工具栏、中心内容区；仅在选中实体时开启可折叠右详情栏。
- 移动：底部今日、笔记、职业、更多，快速捕捉固定可达；不强行压缩复杂表格。
- 采用一致的 4px 间距尺度、清晰 1px 边框与可见 focus ring。

## 组件策略

从 shadcn/ui 按需生成组件代码（Radix 底座），先使用 Button、Input、Textarea、Dialog、DropdownMenu、Sheet、Command、Popover、Select、Tabs、Tooltip、Skeleton、Sonner/Toast。包装成产品组件：`AppShell`、`SidebarNav`、`PageHeader`、`EntityList`、`EntityDetailPanel`、`QuickCapture`、`EmptyState`、`StatusBadge`。

所有图标配文字或 tooltip；关键行为不只依赖颜色。表单有 label、错误文本和键盘流程；Command Palette 支持 `⌘K` 与焦点回归。

## 页面层次

```text
RootLayout
├── AuthLayout → Login
└── AppLayout (受保护)
    ├── SidebarNav
    ├── TopBar → GlobalSearchTrigger / QuickCapture
    ├── Main → Route Page (Server Component) → Feature UI
    ├── Optional DetailPanel
    └── CommandPalette (client island, Phase 1 shell)
```

Career 延续同一应用壳：二级导航使用细底线，不另建仪表盘。经历、事实和成果以列表与分隔线表达层次；状态总是同时显示文字，敏感字段不会在普通列表呈现。

## 样式边界

- `globals.css` 管理颜色、排版、控件尺度、焦点、动效与通用状态。
- `workspaces.css` 管理编辑器与日历等第三方组件的皮肤及模块语义类。
- `responsive.css` 管理手机尺寸、触控、安全区域与响应式布局。
- 组件持有自身结构；列表为空或有数据时使用相同布局类，不按文案、结果行或 `:has()` 判断页面布局。

## 重点工作区

- Today：优先显示今日重点与日程；到期提醒排除已展示的重点任务，并避免重复日程操作。继续编辑来自真实最近笔记。
- Notes：快速打开与正文搜索分开；文件夹、收藏、最近列表在分页前完成范围查询。保存状态占固定位置，工具栏保留保存、AI、专注与更多；版本、冲突与原文语义继续保留。
- Career：工作台、面试准备、履历素材、机会与申请、简历五个主入口。经历默认阅读，编辑按需展开；创建成功复位，失败保留输入；机会可带上下文进入申请与面试。
- 缓存内容刷新失败时保留可读内容并提供重试；手机侧栏使用共享 Dialog 焦点约束及关闭后焦点恢复。

## 页面框架与反馈

- `AppShell` 只负责导航、顶栏与主内容容器；页面通过 `DashboardLayout`、`WorkspaceLayout`、`DocumentLayout` 或局部 layout 管理自身空间，避免重复 padding。
- `PageHeader` 是普通页面的标题、说明、context 和右侧 action 的唯一入口。Section 使用 12–14px 的低噪声标题、可选计数和紧凑 action；普通数据优先 row、divider 与留白，而不是堆叠卡片。
- Inspector 与 AI 使用 `SidePanelShell`：共享遮罩、surface、边框、header 高度、关闭按钮、body scroll 与 180ms panel motion；仅宽度通过 inspector / assistant variant 区分。
- Loading 应保持真实 page/workspace 的几何结构，使用 semantic skeleton，不使用闪白文本或泛化 dashboard 卡片。异步成功优先按钮状态、局部 status 或乐观 UI；错误必须可见。高频 status 不应通过插入文档流造成 layout shift。
- Empty state 由小图标（可选）、标题、简短解释与一个主要 action 组成；不使用巨大插画。移动端不能隐藏唯一操作在 hover-only 控件后；触控设备上管理操作默认可达。
