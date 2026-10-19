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

## 2026-10-19 练习相关性修正

默认练习队列与复盘只包含通用题和 active 目标；暂停、结束目标仍可显式选择查看，不删除、不重写历史。仅行为与简历经历题需要个人故事；金融知识、商业 Case 等题不再因缺少故事而被加权或诊断为“缺少可用故事”。未设置下次复习日期的题不被当作到期复习。保留现有答案原文、来源和草稿确认规则。本次只修改查询、排序及展示，不需要数据库迁移或批量答案重写。

## 2026-10-19 浏览与阅读细化（候选实现）

学习模块选择始终位于高级筛选之外；「浏览模块」打开共享 Dialog，可搜索当前面试方向中的模块。模块数量随当前搜索、题型与提问风格计算，不应用所选模块自身条件；零结果与未知模块仍可发现，不按名称猜测新分类。选择后保留其他筛选；取消、Esc 不改变条件并恢复启动焦点。仅选择模块不自动展开高级题型/风格控件。搜索词本身也显示在可清除的生效条件中。

阅读区保留完整标准答案、讲解、自测和版本，新增顶部粘性返回与相邻题目控件；沿用已有 URL、范围、滚动和历史恢复，不添加练习或掌握记录。页面只有面试学习主标题，嵌入题目标题降低为二级；独立题目/练习页仍保留原默认标题级别。

`/career/interview/questions` 保留题目管理职责：名称/题干、既有能力标签、模块、题型和提问风格可组合筛选，URL 保留条件，清除恢复全部。此页只搜索题目元信息；学习库继续搜索标准答案与讲解全文。目录显示已有准备份数，不把它当作练习次数或掌握度。新建使用共享弹层与原 Server Action，既有分类、版本和详情路由不变。只向客户端传递用于目录的题目元信息和准备计数，不发送准备正文。

动效复用公共 Dialog 的进入、退出、遮罩、Esc/手机返回层及焦点恢复；模块选择和筛选立即生效，不等待动画完成。顶部阅读导航在公共工具栏下停靠，切题沿用滚动/聚焦动作；快速切换以当前选中为准，不建动画计时器或复制正文。减少动态效果沿用公共规则。实际验收与未测项另见 [本轮记录](../verification/2026-10-19-interview-browser.md)。


## 2026-10-19 练习与复盘细化（候选实现，未上线）

练习队列保留服务端优先级算法与原 preparation 路由。范围选择为有稳定标签的 GET 表单，切换、刷新和浏览器返回使用原生导航语义；空范围表示全部岗位与通用题，general 仅通用准备。优先五题显示完整题干、推荐原因、实际练习次数、故事与能力证据数量，其余题目显式展开。未关联能力不显示 0/0；未安排复习日期不标为到期。

单题保留原保存 Action、提交快照、排队防重复、失败输入恢复和验证过的保存回执。输入区有明确边界，手机正文至少 16px、主要控件至少 44px；进入不自动聚焦以免手机弹键盘遮挡题干。参考仍默认收起，不自动记录所查看的版本。最近历史完整展示查询已返回的最多八次，正文不再三行截断；这不是全部历史分页功能。

复盘优先展示记录数量与需补齐项。已准备是手动状态，可用故事包含 usable 与 strong，不当作能力评分。缺口入口回到同范围学习/练习或故事库。storyUsage.source=practice 使用实际练习次数，plan 使用母题关联数，两种口径不混写。未关联 preparation 的练习只进入全部范围，不能推断属于某个岗位或通用准备。部分读取失败显示资料不完整和同范围重试；空数据不判定为没有能力缺口。

新增界面仍为 Server Components；不增加业务数据公开缓存、网络请求、依赖、表或写入。动效沿用公共按钮、记录行与 DisclosureSummary：展开即时生效、允许连续反向、焦点保留 summary，不等待计时器；减少动态效果沿用共享规则。实际检查及未测项见 [本轮练习与复盘验收](../verification/2026-10-19-interview-practice-insights.md)。


## 2026-10-19 故事库与详情细化（候选实现，未上线）

故事库保持全局范围，在面试导航中有独立目的地；从岗位面试进入时不带无效 context。客户端只接收标题、概括、状态、经历标签、能力与母题关联数，不接收全库 STAR 正文。搜索匹配标题、概括、经历和能力，多词需同时匹配；可组合状态、经历（含未绑定）、能力条件。未知条件明确保留，不悄悄放宽。条件使用 Next 原生 History URL 同步，保留正在输入的空格；详情链接、返回故事库、重载与历史返回保留这些条件，不接受任意外部返回地址。

详情默认只读，按背景、任务、行动、结果、反思展示完整、经过清理的 Markdown；段内标题降级，不制造多个页面主标题。原始内容仍由编辑字段完整保留，不自动生成或改写事实。正文空白、未关联能力/母题、缺失经历和部分加载失败分别表达。关联能力不截断为前几个，母题关联显示首选/备选/边界角色和适配说明，不把关联数当成练习次数。

新建、编辑调用既有 createInterviewStory/updateInterviewStory；归档调用原 archiveInterviewStory，仍遵守既有 owner、校验、审计与重定向。表单不使用捕获错误后重置原生输入的提交模式，忙碌时阻止重复与关闭；不确定失败保留输入并提示先核对记录。新建默认 draft 且五段正文为空。修改未保存时，关闭、Esc 或手机 Back 先给出继续编辑/放弃修改；真正放弃才卸载表单。原关联经历不在活动选择列表中时，保留该值并明确标记，不静默改为未绑定。归档放在更多操作并二次确认，说明故事和母题关联都会归档，不宣称存在当前没有的恢复界面。

动效复用共享 Dialog 的遮罩/主体/内容、进入退出、焦点恢复和手机返回层，以及按钮和原生展开。打开手机编辑器先聚焦标题；关闭有脏输入则转换为同弹层内的确认，继续编辑恢复输入焦点；pending 拒绝退出，成功/失败以 Action 实际完成为准。快速反向不依赖动画计时器，减少动态效果沿用公共规则。筛选不发请求；仅在读取失败后显式重试时使用 router.refresh 重新读取，因为现有客户端目录无法修复服务端缺失资料。无新依赖、迁移、数据库查询类型、权限或事实字段变化。实际结果及限制见 [故事库与详情候选验收](../verification/2026-10-19-interview-stories.md)。
