# Interview learning workspace

The Interview entry point is a read-first question library. General preparation is the default; target-specific questions remain explicitly scoped by the target selector.

## Independent dimensions

- Question type uses the normalized question-type taxonomy.
- Learning module uses the existing subcategory. Historical `通用 ·`, `技术面 ·`, and `Case面 ·` prefixes are removed for display/filter matching only; stored values are unchanged. Unknown module labels remain discoverable.
- Pressure is a question style and can be combined with any type or module.
- Competencies, interview formats, personal evidence, and target contexts retain their existing meanings and storage.

Search matches the title, prompt, concepts/notes, reasoning, pitfalls, reference-answer body, and competency labels within the selected context. Multiple whitespace-separated terms must all match. Preparations, answers, and competency relations are paged before search to avoid the server row cap silently hiding questions.

## Read, personalize, practice

Reading renders sanitized Markdown without saving or confirming anything. Existing learning fields appear as concepts/notes, key judgment, reasoning, pitfalls, and next-practice guidance. The same reader is used by the workspace, question detail, and the folded practice reference. The complete standard answer is first; explanation is a separately labelled native disclosure after it. Opening/closing explanation or using chapter navigation never saves, adopts, or records practice. Practice selects spoken answers with the same language/status rules as the workspace and includes draft fallback, visibly marked for review.

### Answer and explanation authoring contract

Use `## 标准答案` for a complete examiner-facing response, then `## 思路拆解讲解` for the lesson in the existing versioned `body_markdown`. Use level-three subheadings within either section. This keeps a rewrite together in the append-only answer history without a database migration. Existing preparation thoughts, reasoning, and pitfalls remain additional explanation; provenance stays separately accessible.

The presentation adapter recognizes those explicit full-answer headings and the observed legacy headings `完整参考答案`, `完整参考答案（AI原创未确认草稿）`, and `可口述答案`, plus the observed full Chinese/English spoken-answer headings. Both languages retain their labels when displayed together. It never substitutes a short recap for a complete response. Legacy sectioned lessons without an explicit full answer show an honest incomplete-answer message and a one-click “阅读现有讲解” control; all their original prose remains available under explanation and exact original text. Unknown JSON remains available verbatim. Complex Markdown requiring document-wide context is preserved, not guessed apart.

This is only a presentation boundary, not a semantic content rewrite or correctness review. Coaching embedded inside a legacy full-answer section, unsectioned mixed prose, incomplete responses, and stale factual explanations still require editorial rewriting. Current/draft/source labels do not certify correctness. The code does not alter stored Markdown, questions, metadata, preparation state, or answer history on read.

Editing is explicit and preserves the existing append-only answer-version workflow. AI provenance, draft/current status, language, and version are visible. Adoption remains a separate explicit action in the full question page. Reading is never counted as mastery or practice.

Each question links to its own preparation's practice route. The general or target scope carries into practice and insights, with a return route to the learning question. The existing question-management and version screens remain available.

## Navigation and reliability

Search, module, type, style, target, question, and selected answer version are encoded in the URL. An exact question deep link wins over conflicting filters. Mobile Back returns to the filtered list, Forward restores the question, and section navigation does not add history entries. Desktop retains a list/detail split.

Saves are serialized. Errors remain visible across question switches; navigation waits for pending saves and will not leave failed edits behind. Browser unload warns about dirty or in-flight drafts. Retrying a partial load waits for edits to save and disables editing during the refresh transition. Empty, partial-error, and route-loading states are distinct.

## Verification

- Unit and React/jsdom suites cover search, dimension combinations, query pagination, repeated URL parameters, history, read-only behavior, and queued-save provenance/recovery.
- `scripts/mobile-native-e2e.cjs` exercises 360, 390, 412, and 430 px mobile layouts plus a 1440 px desktop view in the existing fixture-only CI harness.
- The harness remains behind `E2E_MOBILE_HARNESS=1`; production authentication and data access are unchanged.

## 2026-10-19 浏览与阅读细化（候选实现）

学习模块选择始终位于高级筛选之外；「浏览模块」打开共享 Dialog，可搜索当前面试方向中的模块。模块数量随当前搜索、题型与提问风格计算，不应用所选模块自身条件；零结果与未知模块仍可发现，不按名称猜测新分类。选择后保留其他筛选；取消、Esc 不改变条件并恢复启动焦点。仅选择模块不自动展开高级题型/风格控件。搜索词本身也显示在可清除的生效条件中。

阅读区保留完整标准答案、讲解、自测和版本，新增顶部粘性返回与相邻题目控件；沿用已有 URL、范围、滚动和历史恢复，不添加练习或掌握记录。页面只有面试学习主标题，嵌入题目标题降低为二级；独立题目/练习页仍保留原默认标题级别。

`/career/interview/questions` 保留题目管理职责：名称/题干、模块、题型和提问风格可组合筛选，URL 保留条件，清除恢复全部。此页只搜索题目元信息；学习库继续搜索标准答案与讲解全文。目录显示已有准备份数，不把它当作练习次数或掌握度。新建使用共享弹层与原 Server Action，既有分类、版本和详情路由不变。只向客户端传递用于目录的题目元信息和准备计数，不发送准备正文。

动效复用公共 Dialog 的进入、退出、遮罩、Esc/手机返回层及焦点恢复；模块选择和筛选立即生效，不等待动画完成。顶部阅读导航在公共工具栏下停靠，切题沿用滚动/聚焦动作；快速切换以当前选中为准，不建动画计时器或复制正文。减少动态效果沿用公共规则。实际验收与未测项另见 [本轮记录](../verification/2026-10-19-interview-browser.md)。

## 发布前 CI 修正

首次 Verify 的类型、299 文件/2028 项测试和构建通过；综合浏览器回归在 interview-reading 脚本中仍按旧 h1 定位，因本轮题目已降为 h2 而超时。现将定位限定到 InterviewPrompt 的 h2，并补充页面唯一 h1=面试学习及嵌入题干完整性断言；没有删除题干、原文、首屏位置或历史返回的既有验证。修正后的 CI 结果以发布验收记录为准。

## 真实 Next 路由筛选回归

PR #75 发布后发现题目管理 URL 改变而输入和结果保持旧值。原因是将带有 Next 内部标记的 window.history.state 作为 replaceState 参数传回，Next 将其视为内部调用而跳过 useSearchParams 更新。改用官方原生 History 用法传入 null，让 Next 自行复制内部状态并同步搜索参数。早期 Vite 路由模拟总会通知订阅者，未暴露这一差异；新增门控合成目录场景，使用真实 Next 路由检查输入空格、多词搜索、风格空结果、清除与模块目录选择。修复不改变查询、权限或资料，只更正浏览器 URL 状态同步。
