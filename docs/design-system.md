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

使用 CSS variables 将 token 映射到 shadcn theme；状态色仅用于状态（错误、完成、提醒），不得用多色装饰。阴影只用于菜单、对话框与浮层，且应轻微。

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
