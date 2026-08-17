# Quiet Precision 设计系统

## 视觉基调

克制、清晰、优美，优先让内容和决策显现。页面暖白，内容表面纯白；不使用渐变、玻璃拟态或金融终端黑底。卡片只用在需要边界的编辑、详情、汇总区域，不把每一行信息都卡片化。

| Token | 值 | 用途 |
| --- | --- | --- |
| `--background` | `#F7F7F5` | 页面背景 |
| `--surface` | `#FFFFFF` | 内容面、弹层 |
| `--foreground` | `#18181B` | 一级文字 |
| `--muted-foreground` | `#71717A` | 次级文字 |
| `--border` | `#E7E5E4` | 分隔与控件边框 |
| `--primary` | `#365F78` | 唯一主强调 |
| `--primary-soft` | `#EDF3F6` | 选中、轻提示背景 |

使用 CSS variables 将 token 映射到 shadcn theme。`background`、`foreground`、`card`、`card-foreground`、`popover`、`popover-foreground`、`primary`、`primary-foreground`、`secondary`、`secondary-foreground`、`muted`、`muted-foreground`、`accent`、`accent-foreground`、`input`、`border`、`ring`、`destructive` 均须在 `globals.css` 中有明确 mapping；页面 chrome 不得重新硬编码其等价颜色。状态色仅用于状态（错误、完成、提醒），不得用多色装饰。阴影只用于菜单、对话框与浮层，且应轻微。

### Radius、控件与动效

- `--radius-sm`：图标按钮、小型行内控件；`--radius-md`：Button、Input、Select、导航与行选中；`--radius-lg`：Dialog 与独立 surface。
- `rounded-full` 仅用于 avatar、badge 和真正的 pill；不得以 `rounded-xl` 制造装饰性差异。
- Button 的标准高度为 small 28px、default 32px、large 36px；Input 与 Select 默认 32px，Textarea 继承同一边框、focus ring 与 disabled 语义。
- Hover 只过渡背景、文字、边框或透明度，使用 `--motion-fast`（120ms）；普通微交互使用 `--motion-base`（160ms）；Dialog、Sheet、SidePanel 使用 `--motion-panel`（180ms），统一 `--ease-standard`。禁止 `transition-all`、普通 UI 的长动画、明显 zoom、bounce 和逐行入场。
- `prefers-reduced-motion` 始终优先，不能以动画表达唯一信息。

## 排版与布局

- UI 与数字：Geist；等宽数字、金额、时间与 ID：Geist Mono。
- 中文回退：`PingFang SC`, `Microsoft YaHei`, system-ui, sans-serif。
- 正文优先 14–16px，标题通过字重、留白与层级而非大字号制造噪声。
- 桌面：固定左导航（约 240px）、页面顶部工具栏、中心内容区；仅在选中实体时开启可折叠右详情栏。
- 移动：底部/紧凑导航，快速捕捉固定可达；Today、Tasks、Notes 优先，不强行压缩复杂表格。
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

## 页面框架与反馈

- `AppShell` 只负责导航、顶栏与主内容容器；页面通过 `DashboardLayout`、`WorkspaceLayout`、`DocumentLayout` 或局部 layout 管理自身空间，避免重复 padding。
- `PageHeader` 是普通页面的标题、说明、context 和右侧 action 的唯一入口。Section 使用 12–14px 的低噪声标题、可选计数和紧凑 action；普通数据优先 row、divider 与留白，而不是堆叠卡片。
- Inspector 与 AI 使用 `SidePanelShell`：共享遮罩、surface、边框、header 高度、关闭按钮、body scroll 与 180ms panel motion；仅宽度通过 inspector / assistant variant 区分。
- Loading 应保持真实 page/workspace 的几何结构，使用 semantic skeleton，不使用闪白文本或泛化 dashboard 卡片。异步成功优先按钮状态、局部 status 或乐观 UI；错误必须可见。高频 status 不应通过插入文档流造成 layout shift。
- Empty state 由小图标（可选）、标题、简短解释与一个主要 action 组成；不使用巨大插画。移动端不能隐藏唯一操作在 hover-only 控件后；触控设备上管理操作默认可达。
