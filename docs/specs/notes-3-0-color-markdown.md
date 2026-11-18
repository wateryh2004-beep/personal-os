# Notes 3.0 P1.2 · 色块与行内颜色的 Markdown 合约

状态：**实现候选**（是否合并与生产发布以 PR 和 CI 为准）。制定：2026-11-18。
关联：[Notes 3.0 执行总计划](notes-3-0-editor-upgrade.md)、
[P1.1 配色设计](notes-3-0-color-system.md)。
所有颜色由 P1.1 的 5 个有限语义 Token 决定。**Markdown 文本仍是唯一权威**；这次没有数据库迁移、文档改写、无约束 HTML 或新的富文本 JSON 数据源。

## 一、最终选择的可移植语法

### 整段色块：合法 GFM 引用块

写作源码：

```md
> [!NOTE]
> 资料来源与背景，可以写 **强调**、[站内链接](/notes/xxx)。
>
> - 支持列表
> - 支持多段

> [!IMPORTANT] 重要结论
> 第二行继续正文。
```

五种明确标记：

| Markdown 标签 | 语义色 ID | 中文可见标题 |
| --- | --- | --- |
| `[!NOTE]` | `info` | 信息 |
| `[!WARNING]` | `warning` | 提醒 |
| `[!IMPORTANT]` | `important` | 重点 |
| `[!TIP]` | `idea` | 思考 |
| `[!QUOTE]` | `quote` | 引用 |

识别条件：必须是 **blockquote 中第一段开头**的完整大写 marker，后面跟空白或行尾。普通 `>` 引用保持普通引用样式；未知 marker 保留为原文。不能把来自代码块或普通段落里的同名字符串误认为色块。块内 Markdown 仍由原来的 GFM 解析，包括标题、列表、表格与链接。导出到不支持扩展的编辑器时表现为普通引用，marker 仍可阅读和迁移。

### 行内文字颜色和背景高亮：受限的 Notes 扩展

```md
这是 {{ink:info|要着色的字}}，这是 {{mark:important|需要高亮的文字}}。
```

- `ink` 为前景字色；`mark` 为背景高亮。必须包含 P1.1 五个已知 tone 之一，不能填任意 CSS、HEX、HTML 或 URL。
- 值只接受单行、1–1000 字符的纯文本；不跨越换行、不递归嵌套、不可包含未转义的 `{`/`}`。文本若含 Markdown 强调等结构，解析器不会为跨节点的 token 强行合并，保持源文本的可读回退；P1.3 选区命令只包装明确的纯文字选区。
- 不在代码区、原始 HTML、链接目标或图片中应用色彩。未知或半输入 token 在各模式中可读，不会因打开、导出或保存而被“修复”。
- 在其他 Markdown 阅读器中，标记依然显示为普通文字，内容没有丢失；这属于“可移植的文本降级”，**不保证第三方编辑器也渲染颜色**。

## 二、渲染和存储契约

- 编辑态：`src/features/notes/editor/note-color-decorations.ts` 注册在 CodeMirror **可视模式**，依据 Lezer Blockquote 节点与当前可视区域装饰色块；行内文字取当前行的受限 token。光标置于 token 或选区触及 token 时保留源码符号可编辑；源码模式关闭颜色装饰，Markdown、Undo/Redo、选区与粘贴功能不更换实例。
- 阅读态：`NoteReadingView` 为 `EntityMarkdown` 显式传递 `noteColors`；`remarkNoteColors` 只更新当前 Markdown AST（不是用户正文），`rehypeSanitize` 只允许确定的 `note-color-*` class 与五个 tone。其他任务/日程等复用 `EntityMarkdown` 的位置不自动套用 Notes 语法。
- HTML 与可搜索 PDF：`renderPortableNoteHtml` 采用完全相同的 remark 解析与安全 Schema，带完整的低饱和色彩内联 CSS；PDF 使用浏览器打印同一份安全 HTML。独立图片式 PDF 则使用同一插件加允许类/属性的组件，保留高亮与色块背景。
- 搜索、版本、历史导出、数据库写入仍以原始 `body_markdown` 字节串为准；代码不生成平行 HTML 存储或自动迁移旧笔记。
- 安全：从不启用 `rehype-raw`，不会对任意 HTML `style`、`onerror`、JS 协议或颜色值开放权限。仅 renderer 中预先声明的 class 和属性可以通过白名单。

## 三、范围及未包含功能

P1.2 完成解析、阅读、编辑态呈现、导出与安全测试；**没有**新增选区颜色浮层、顶部入口、快捷键、斜杠菜单或交互式类型切换。上述操作属于 P1.3。

本次 P1.2 不支持在行内颜色中嵌套任意 Markdown 语法、跨行彩色标记与第三方的自动渲染；这些限制优先保证可迁移性和安全，不通过不受控 HTML 扩展补齐。

## 四、验收

- 五类合法色块、纯普通引用、未知 marker、代码区、非法 tone、半输入 token、嵌套多段 Markdown。
- 阅读与 HTML/可搜索 PDF 输出语义一致；图片式 PDF 背景可用；原始 Markdown 字节不变。
- CodeMirror 在可视模式着色、源码模式可编辑；对每个输入、撤销及版本更改保持原文。
- HTML/XSS：不生成脚本/onclick/HTML style 注入，不因传入任意文字提高渲染权限。
- CI：typecheck、Vitest、build、Markdown 写作/表格/版本相关回归、导出测试；记录真实失败及已有 CI 环境问题。
- 回滚：纯应用代码与 CSS 回退，无 SQL rollback 或资料迁移。

## P1.3 交互实施（独立开发）

编辑入口新增单次 CodeMirror 事务的行内字色、背景高亮、清除标记、整段色块与类型切换；斜杠菜单可插入五种色块，并在已有上方工具栏提供一个紧凑的“颜色”入口。对跨行、空白或非纯文本色彩选区不盲目包裹；受保护代码片段不能着色。没有新的数据库字段、自动迁移或 HTML 特权。本阶段状态由独立 PR/测试/生产部署记录确认，不因文档描述自动视作已上线。
