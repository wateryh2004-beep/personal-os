# Personal OS 2.0 产品与技术架构方案

**版本：** v0.1
**日期：** 2026-08-07
**项目：** Personal OS / Life of HANG
**状态：** 产品与技术架构总纲

---

# 0. Executive Summary

Personal OS 2.0 不再以“把日历、任务、笔记、文件、职业规划放进同一个网站”为最终目标。

它的核心目标是：

> 构建一个长期掌握个人上下文、能够主动发现问题、辅助决策并执行低风险操作的个人智能操作系统。

Personal OS 2.0 应逐步解决五件事：

1. **知道我是谁。**
2. **知道我现在正在做什么。**
3. **知道过去发生过什么，以及我的判断如何变化。**
4. **知道现在什么事情值得我关注。**
5. **在适当情况下帮助我完成下一步行动。**

系统最终应降低用户持续向 AI 重复提供上下文的必要性。

理想状态下，用户可以直接提出：

> 我最近是不是有点偏离自己的职业计划？

而不是重新解释：

* 自己是谁；
* 最近在哪里实习；
* 做过什么；
* 之前考虑过什么职业方向；
* 最近写过什么笔记；
* 最近日程如何；
* 有哪些任务；
* 为什么以前改变过想法。

这些信息应由 Personal OS 根据权限自动检索、组合并提供给 AI。

---

# 1. 产品北极星

## 1.1 一句话定义

> Personal OS 是我的个人数据、记忆、决策与行动基础设施，以及建立在其上的长期个人 AI。

它不是另一个 Notion。

不是另一个 Todo App。

不是另一个 Calendar。

不是一个私人 ChatGPT Wrapper。

也不是一个试图复制所有专业软件功能的 All-in-One SaaS。

---

## 1.2 核心产品价值

Personal OS 的价值不在于：

> “这里存了多少东西。”

而在于：

> “过去已经记录的信息，今天能否自动帮助我做得更好。”

因此系统发展的最终方向是：

**Data → Context → Understanding → Decision → Action → Review → Memory**

而不是：

**More Modules → More Features → More Pages**

---

## 1.3 North Star Metric

长期最重要的指标不是：

* 笔记数量；
* AI 调用次数；
* Task 数量；
* 页面数量；
* 功能数量。

而是：

> **一天中有多少次，本来需要我自己回忆、搜索、整理、规划或重新向 AI 解释上下文的工作，被 Personal OS 自动完成。**

可进一步拆成代理指标：

* AI 对话中无需用户再次补充个人背景即可完成回答的比例；
* 全局搜索一次找到目标内容的比例；
* AI 主动建议被接受的比例；
* Capture 后无需人工整理即可正确归档的比例；
* Now 页面推荐行动被实际执行的比例；
* 主动 Insight 被标记为“有用”的比例；
* 不必要通知/Insight 的忽略率；
* 相关历史信息自动召回成功率。

---

# 2. Personal OS 2.0 的产品原则

## 2.1 All in one experience，不等于 all built from scratch

继续保留当前原则：

* Outlook 管理 Calendar；
* Microsoft To Do 管理任务执行；
* Supabase/PostgreSQL 管理 Personal OS 数据；
* R2 管理文件对象；
* Vercel 承担当前 Web 部署；
* GitHub 管理代码和版本。

Personal OS 负责的是：

* 统一体验；
* 统一个人数据模型；
* 统一关系；
* 统一 AI Context；
* 统一决策历史；
* 统一搜索；
* 统一主动智能。

Calendar 和 To Do 已经成为真实使用的基础设施，因此 2.0 不应为了“架构漂亮”重新制造第二套 Calendar 或 Todo 数据源。现有项目也已经明确把 Microsoft Calendar / To Do 作为同步端，并在私有数据库保留自己的数据与备份。

---

## 2.2 AI should think aggressively, act conservatively

AI 可以非常主动地：

* 阅读；
* 检索；
* 分析；
* 发现；
* 关联；
* 提醒；
* 建议；
* 规划。

但越接近真实外部操作，权限越严格。

原则：

> **AI decides; deterministic code executes.**

LLM 不直接获得任意 SQL、文件系统或外部服务写权限。

所有操作应经过：

1. 结构化输出；
2. Schema validation；
3. 业务规则验证；
4. 权限判断；
5. 必要时用户确认；
6. 确定性代码执行；
7. Audit log。

---

## 2.3 系统应该越来越懂用户，而不是越来越需要维护

用户应该能够高频使用 Personal OS。

但高频使用不等于高频维护。

应尽量减少：

* 手工标签；
* 手工分类；
* 重复建立关系；
* 重复填写已经存在的信息；
* 手工更新 AI Memory；
* 为了“整理知识库”而整理知识库。

用户真正应该输入的是：

* 想法；
* 决策；
* 修正；
* 行动；
* 事实。

结构化整理尽量由系统完成。

---

## 2.4 主动不等于打扰

Personal OS 未来最大的风险之一，是变成一个不断生成：

* AI Insight；
* 提醒；
* 摘要；
* 新闻；
* RSS；
* 推荐；

的信息机器。

因此系统必须有：

> **Attention Budget。**

Personal OS 的责任不是最大化 engagement。

而是：

> 最小化用户为了管理自己而消耗的注意力。

---

# 3. 当前架构：保留什么，改变什么

## 3.1 应明确保留的资产

### A. Supabase/PostgreSQL

继续作为：

* 结构化个人数据；
* Metadata；
* 关系；
* AI memory；
* Search index；
* Audit；
* Review；

的核心数据库。

---

### B. Cloudflare R2

继续承担：

* PDF；
* 图片；
  -证明材料；
  -报告；
  -简历；
  -其他文件对象；

的私有对象存储。

文件 Metadata 保留在 PostgreSQL。

---

### C. Microsoft Calendar + To Do

继续作为 Calendar / Task 的主要执行层。

Personal OS 不建立一个平行、独立的日历和待办系统。

---

### D. Notes

保留当前 PostgreSQL Markdown 模型。

但停止把大量工程资源投入到：

> “如何成为比 Obsidian 更完整的 Markdown 编辑器”。

未来重点转向：

* Semantic Search；
* Relationships；
* AI Context；
* Related Knowledge；
* Decision extraction；
* Memory；
* Knowledge evolution。

---

### E. Career Data Model

现有 Career 数据模型继续保留。

当前已经存在：

* Career Profile；
* Career Direction；
* Experience；
* Experience Fact；
* Fact Version；
* Output；
* Resume Bullet；
* Skill；
* Certification；
* Evidence / Document；
* Entity Link。

尤其是：

**Experience → Fact → Evidence → Bullet**

应成为长期 Career Capital 的核心链路。

Career 2.0 主要重构的是产品层，而不是推倒数据库。

---

### F. Inbox

当前：

> Capture → AI 判断 → Task / Calendar / Note → 用户确认

是整个项目中最值得保留和扩大的交互模型之一。

未来应把 Inbox 的思想升级为：

> **Universal Capture**

而不是仅仅作为单独页面存在。

---

# 4. 2.0 整体系统架构

Personal OS 2.0 建议形成六层架构。

```text
┌──────────────────────────────────────────────┐
│                 SURFACES                     │
│                                              │
│ Now · Inbox · Calendar · Tasks · Notes       │
│ Career · Reviews · Briefing · Files          │
│                                              │
│ Mac Web / Mobile PWA / Notifications         │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│             PERSONAL ASSISTANT               │
│                                              │
│ Ask · Search · Analyze · Plan                │
│ Suggest · Summarize · Explain · Act          │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│              CONTEXT ENGINE                  │
│                                              │
│ Intent Router                                │
│ Context Planner                              │
│ Hybrid Retrieval                             │
│ Graph Expansion                              │
│ Temporal Context                             │
│ Context Ranking                              │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│         MEMORY + PERSONAL GRAPH              │
│                                              │
│ Profile · Working Memory · Episodes          │
│ Semantic Memory · Decisions                  │
│ Entity Links · Timeline                      │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│              DOMAIN DATA                     │
│                                              │
│ Calendar · Tasks · Notes · Career            │
│ Files · Projects · Reviews · RSS             │
└──────────────────────────────────────────────┘
                       ↓
┌──────────────────────────────────────────────┐
│               ADAPTERS                       │
│                                              │
│ Supabase · R2 · Microsoft Graph              │
│ RSS · Future external services               │
└──────────────────────────────────────────────┘
```

核心变化是：

当前系统主要拥有：

**Surface + Domain Data + Adapter**

Personal OS 2.0 的核心建设重点则是中间：

**Assistant + Context Engine + Memory / Personal Graph**

---

# 5. 信息架构

不建议为了理论上的整洁，立刻删除用户已经形成习惯的 Calendar / Tasks / Notes。

2.0 第一阶段导航建议保持操作效率。

## Primary

### Now

默认首页。

回答：

> 现在我最应该关注什么？

---

### Inbox

统一捕获和待整理信息。

---

### Calendar

时间安排。

---

### Tasks

行动执行。

---

### Notes

知识与思考。

---

### Career

职业资本与职业决策。

---

## Secondary

### Briefing

RSS / 新闻 / 研究 / 信息摘要。

---

### Reviews

Daily / Weekly / Decision Review。

---

### Files

文件与证据资产。

---

### Projects

仅在真实工作流明确后深化。

不要为了“Personal OS 应该有 Project Manager”而复制 Asana。

---

## 暂停作为一级导航

Photos
Investing

在核心智能层完成之前不继续横向扩展。

---

# 6. Now 2.0

Now 是 Personal OS 2.0 的第一产品入口。

它不是 Dashboard。

而是：

> Dynamic Personal Command Center。

---

## 6.1 Now 必须回答四个问题

### 1. What is happening?

今天有什么：

* Calendar；
* Deadline；
* Task；
* Career milestone；
  -重要事件。

---

### 2. What should I do now?

根据：

* 当前时间；
* 空闲窗口；
* Deadline；
* Priority；
* Roadmap；
* Project；
  -用户计划；

给出一个有限的“今日承诺面”（默认 3–5 项，可手动展开但不形成无限流）。每一项都是确定性读模型从已存在的权威实体导出的下一步，而非新的 Task 或 Calendar 数据源：

* 进行中或 45 分钟内开始的 Outlook 日程；
* 已逾期、今天到期的 Microsoft To Do 任务；
* 7 天内的 Career milestone；
* 待处理 Inbox 数量。

每项必须同时展示“为什么现在”、截止/开始等时间约束与来源标签；无可验证依据时显示“暂无足够依据”，不能由 AI 补造优先级。排序先由 `features/today/utils.ts` 的确定性规则完成，AI 如接入只能解释或在展示层辅助，不能成为事实来源。

写入仍经现有边界：任务完成/延后写回 Microsoft To Do 并审计；“转任务”“安排日程”“暂存”只打开带预填内容的显式创建确认面板，Calendar 继续走 Outlook 的确认队列，Inbox 继续保留原始捕捉。Today 本身不保存第二套承诺表；读模型、RLS 和审计沿用来源实体的 `user_id`、Server Action 与 `audit_logs`。

---

### 3. What needs my attention?

例如：

* overdue；
  -即将截止；
  -长时间无进展；
  -Career 路线偏离；
  -Inbox 积压；
  -重要信息。

---

### 4. What should I know?

例如：

* AI Insight；
* RSS Brief；
* Personalized News；
* Meeting preparation；
  -近期重要变化。

---

# 6.2 Now 数据组成

```text
NowContext
├── current_time
├── calendar_today
├── calendar_next_7_days
├── tasks_today
├── overdue_tasks
├── high_priority_tasks
├── active_projects
├── career_upcoming
├── inbox_count
├── recent_activity
├── active_insights
└── latest_briefing
```

---

## 6.3 Now 不应变成固定 Widget Dashboard

错误方向：

```text
Calendar Card
Task Card
Career Card
News Card
Note Card
```

正确方向：

根据上下文动态排序。

例如上午 8:00：

> 上午 9:00 开会。

Meeting Prep 应成为第一信息。

下午空闲：

> 15:00–17:30 无固定安排。

Task Recommendation 成为第一信息。

晚上：

> 今天剩余两个低优先任务。

Review / Wind-down 信息优先级提高。

---

# 7. Universal Capture

目前 Inbox 已经验证了：

> 先输入，再判断去向

是正确方向。

2.0 将其升级为全局能力。

Mac：

`⌘ + Shift + Space` 或系统内全局快捷入口。

Mobile：

中央 Capture 按钮。

---

## Capture Input

支持逐步扩展：

* text；
* voice；
* image；
* file；
* URL。

第一阶段只要求：

**text + URL**

稳定。

---

## Capture Pipeline

```text
INPUT
  ↓
Store raw inbox item
  ↓
Classifier
  ↓
Possible destination
  ↓
Entity matching
  ↓
Suggested relations
  ↓
User confirm if necessary
  ↓
Destination
```

例如：

> 明天下午提醒我看看高力这周做了什么，整理进简历。

系统理解：

Task：

> 整理本周高力实习成果

关联：

> Experience · 高力国际

可能提示：

> 完成后建议提取 Career Facts。

---

# 8. Global Search + Command

当前全局搜索仍然不是完整的跨模块能力。顶部 Command Palette 实际仍主要指向 Career Search。

2.0 中：

> `⌘K` 必须成为核心操作入口。

---

# 8.1 两种模式

## Search

输入：

> 高力

返回分组结果：

```text
Experience
高力国际

Notes
高力实习记录
天津项目思考

Files
天津消费研究.pptx

Career Facts
……

Tasks
……

Calendar
……
```

---

## Command

输入：

> 明天下午提醒我整理高力实习

解析：

```text
intent = create_task

title = 整理高力实习
due = tomorrow afternoon
related_entity = Experience: 高力国际
```

显示 Preview。

用户确认。

执行。

---

# 8.2 Search Architecture

不要一开始就完全依赖 Vector Search。

采用 Hybrid Search：

```text
Query
 ↓
┌────────────────┐
│ lexical search │
│ semantic search│
│ graph expansion│
│ recency        │
│ entity match   │
└────────────────┘
 ↓
rerank
 ↓
results
```

---

# 8.3 统一 Search Index

建议新增：

```sql
search_documents
```

核心字段：

```text
id
user_id

entity_type
entity_id

title
content_text

source_updated_at

metadata jsonb

search_vector tsvector
embedding vector nullable

created_at
updated_at
```

第一阶段：

Postgres Full Text Search。

第二阶段：

Embedding。

Embedding 必须通过 `EmbeddingProvider` Adapter 接入。

不要让某一家模型供应商成为系统架构依赖。

---

# 9. Personal Graph

现有 `entity_links` 应升级为 Personal Graph 的基础。

目前它已经支持 Note、Task、Project、Experience、Career Direction、Document 等实体间关系。

2.0 不建议立即引入 Neo4j。

PostgreSQL 足够。

---

# 9.1 扩展 Entity Types

逐步扩展：

```text
note
daily_note

task
calendar_event

project
goal

career_direction
career_track
career_milestone

experience
experience_fact
experience_output
resume_bullet
application

document

decision
review

topic
person

rss_item
briefing_item
```

---

# 9.2 Relationship Types

不要允许无限自由文本污染。

建立推荐关系枚举/约束：

```text
related_to
part_of

supports
contradicts

derived_from
evidence_for

mentions
about

created_from
resulted_in

depends_on
blocks

prepares_for

applies_to
```

---

# 9.3 Auto Link

AI 可以自动建议关系。

例如：

新 Note 中出现：

> 高力国际……

系统匹配现有 Experience。

AI 建议：

> 关联至「高力国际」？

对于高 confidence、低风险关系，可允许自动创建。

Relationship 必须可撤销。

---

# 10. Personal Memory Architecture

Personal Memory 不等于“Notes 做 RAG”。

2.0 应把记忆划分为五种。

---

# 10.1 Profile Memory

稳定个人事实。

例如：

* 教育；
  -工作阶段；
  -长期偏好；
  -地点；
  -语言；
  -设备；
  -重要长期约束。

特点：

* 变化低频；
  -高 confidence；
  -需要明确来源；
  -重要修改可要求确认。

---

# 10.2 Working Memory

当前状态。

例如：

* 当前实习；
  -活跃项目；
  -近期考试；
  -当前职业探索；
  -最近关注主题；
  -当前主要目标。

特点：

* 时效性高；
  -允许自动衰减；
  -需要定期重新计算。

---

# 10.3 Episodic Memory

人生事件时间线。

主要来源：

* Calendar；
  -Tasks；
  -Journal；
  -Career Experiences；
  -Projects；
  -Reviews。

例如：

> 2026-08-07 集中迭代 Personal OS Notes / Roadmap。

---

# 10.4 Semantic Memory

长期形成的认知与判断。

例如：

> 对某种工作的理解。

> 对某种学习方法的判断。

> 对某行业的看法。

它不应该由一次 Note 直接写入。

应满足：

* 有来源；
  -有一定稳定性；
  -支持 revision；
  -可以被未来证据修正。

---

# 10.5 Decision Memory

单独建模。

因为：

> “我曾经决定过什么，以及为什么”

对长期 AI 极其重要。

建议数据模型：

```text
decisions

id
user_id

title
decision

status
  active
  superseded
  reversed
  archived

context_markdown
reasoning_markdown

confidence

decided_at
review_at

supersedes_decision_id

created_at
updated_at
```

以及：

```text
decision_sources

decision_id
entity_type
entity_id
relationship
```

未来 AI 应能够回答：

> 我以前为什么决定 X？

并展示来源。

---

# 11. Memory 数据模型

建议新增：

```text
personal_memories
```

```text
id
user_id

memory_type
  profile
  working
  semantic

title
content

structured_data jsonb

confidence

valid_from
valid_until

status
  proposed
  confirmed
  superseded
  archived

created_by
  user
  assistant
  system

created_at
updated_at
```

配套：

```text
memory_sources
```

```text
memory_id
entity_type
entity_id

source_role
```

原则：

> 不存在无来源的重要 AI Memory。

尤其是 Semantic Memory。

---

# 12. Context Engine

这是 2.0 最关键的技术模块。

它负责：

> AI 每次到底应该看到哪些个人信息。

不是把数据库全部塞入 Prompt。

---

## 12.1 Pipeline

```text
User Request / System Trigger
           ↓
Intent Router
           ↓
Context Planner
           ↓
Candidate Retrieval
           ↓
Hybrid Ranking
           ↓
Graph Expansion
           ↓
Temporal Filtering
           ↓
Privacy Filtering
           ↓
Context Pack
           ↓
LLM
```

---

# 12.2 Context Pack

统一定义：

```ts
type PersonalContextPack = {
  identity?: ...
  currentState?: ...
  timeContext?: ...
  relatedEntities?: ...
  memories?: ...
  decisions?: ...
  notes?: ...
  career?: ...
  sources: ContextSource[]
}
```

所有 Assistant 不再各自手写：

> “读当前笔记……”

而是调用 Context Engine。

---

# 12.3 Retrieval Priority

默认：

1. 当前页面；
2. 用户明确提及实体；
3. 当前时间相关信息；
4. Working Memory；
5. 相关 Decision；
6. Semantic Search；
7. Graph Neighbors；
8. Recent Activity。

---

# 12.4 Source Grounding

每个 Context item 必须拥有：

```text
source_type
source_id
label
timestamp
confidence
```

AI 回答重要个人事实时，应可以展示：

> 依据

用户可点击回原始：

* Note；
  -Career；
  -Calendar；
  -Decision；
  -Review。

---

# 13. Unified Personal Assistant

当前 Notes AI 的能力仍主要限定在单篇笔记上下文中，例如总结、润色、解释和 Ask Note。

2.0 将各模块 AI 统一到底层 Assistant。

---

## 13.1 一个 Assistant，多种 Surface Context

```text
Global Assistant
Notes Assistant
Calendar Assistant
Tasks Assistant
Career Assistant
Now Assistant
```

不是 6 个 Agent。

而是：

```text
same brain
+
different current context
+
different visible tools
```

---

## 13.2 Assistant Request

建议统一结构：

```ts
{
  message,
  surface,
  currentEntity?,
  conversationId?,
  requestedModel?,
}
```

Backend：

```text
Assistant
 ↓
Intent
 ↓
Context Engine
 ↓
Tool availability
 ↓
LLM
 ↓
Structured response
```

---

# 14. Tool Architecture

LLM 不直接调用数据库底层。

工具必须业务化。

正确：

```text
search_personal_context
get_calendar_range
get_tasks
create_task_proposal
create_calendar_proposal
find_related_notes
get_career_context
link_entities
```

错误：

```text
execute_sql
update_any_table
delete_file
```

---

# 15. Assistant 权限模型

## Level 1 — Read

无需确认。

例如：

* 查 Calendar；
  -查 Task；
  -查 Note；
  -查 Career；
  -查 Memory；
  -查 File Metadata。

---

## Level 2 — Suggest

无需确认。

例如：

* 推荐 Task；
  -推荐时间安排；
  -提出 Career Gap；
  -建议关联关系；
  -生成计划。

---

## Level 3 — Low-Risk Write

用户可授权自动执行。

例如：

* 创建 entity link；
  -更新 AI metadata；
  -标记 RSS 已处理；
  -创建内部 AI Insight；
  -更新 search index。

必须：

可撤销 + Audit。

---

## Level 4 — Consequential Write

默认确认。

例如：

* 创建/修改 Outlook Event；
  -删除 Event；
  -创建关键 Task；
  -修改 Career confirmed fact；
  -删除 File；
  -修改重要 deadline；
  -发送外部通信。

---

# 16. Proactive Engine

真正的 Jarvis 不应该只存在聊天窗口中。

需要：

> Proactive Engine。

---

# 16.1 Events

建议建立统一事件：

```text
assistant_events
```

来源：

```text
calendar_event_created
calendar_event_approaching

task_created
task_completed
task_overdue

note_created
note_updated

inbox_created

career_milestone_approaching
career_direction_stale

decision_created
decision_review_due

rss_items_ingested

daily_start
daily_end
weekly_review_due
```

---

## 16.2 Event Pipeline

```text
Event
 ↓
Deterministic filters
 ↓
Candidate insight
 ↓
Importance evaluation
 ↓
Deduplication
 ↓
Attention budget
 ↓
Destination
```

Destination：

```text
silent
activity_log
briefing
now
notification
```

---

# 16.3 不直接让 LLM 监控所有东西

先规则。

例如：

```text
task overdue > 3 days
```

这是确定性判断。

不要调用 AI 判断：

> 这个任务是不是逾期。

AI 只负责更高层：

> 这个逾期任务是否值得现在提醒？

---

# 17. Attention Budget

主动 AI 是否成功，取决于它是否知道什么时候闭嘴。

定义四档：

## P0 — Immediate

真正紧急。

可 Push。

---

## P1 — Now

打开 Personal OS 时展示。

---

## P2 — Briefing

进入 Daily / Weekly Brief。

---

## P3 — Silent

只存入 Activity。

---

系统应学习：

* dismiss；
* accepted；
* snoozed；
* not useful；
* don't remind again。

未来作为个性化信号。

---

# 18. AI Insight

新增：

```text
assistant_insights
```

建议字段：

```text
id
user_id

type
title
content

priority

status
  active
  accepted
  dismissed
  expired

valid_until

evidence jsonb

created_at
```

Insight 必须：

1. 给出具体结论；
2. 给出依据；
3. 尽量提出下一行动；
4. 可以 dismiss；
5. 不重复轰炸。

例如：

> 过去 14 天你已经三次推迟同一个 Career Milestone。

而不是：

> 记得坚持职业规划哦。

---

# 19. Briefing

不要建立 Infinite Feed。

Briefing 的目标：

> 帮助管理注意力。

---

## 19.1 Sources

第一阶段：

RSS。

以后再考虑：

-新闻 API；
-Newsletter；
-GitHub；
-Research feeds；
-其他合法公开源。

---

# 19.2 Pipeline

```text
Feed fetch
 ↓
dedup
 ↓
metadata extraction
 ↓
topic classification
 ↓
personal relevance
 ↓
importance
 ↓
summary
 ↓
Briefing
```

---

## 19.3 Relevance 不只依赖兴趣

应考虑：

```text
long_term_interests
+
working_memory
+
current_projects
+
career
+
recent_notes
+
recent_searches
```

因此：

今天高度相关的信息，

下个月未必相关。

---

## 19.4 Briefing UI

```text
Today's Brief

Must Know
────────
1. XXX

Why it matters:
与你正在进行的 XXX 相关。

Worth Reading
────────
2.
3.

Optional
────────
4.

Filtered:
187 items
```

---

# 20. Reviews

Reviews 从“未来功能”提升为核心功能。

---

# 20.1 Daily Reflection

不强迫写长日记。

AI 根据当天数据生成：

```text
今天：
• Calendar
• Completed tasks
• Notes
• Important activity
```

然后：

> 今天有什么值得补充或记住？

用户可以只写一句话。

---

# 20.2 Weekly Review

系统自动整理：

```text
本周时间
完成
未完成
重大事件
主要主题
Career progress
长期拖延
观点变化
下周风险
```

用户负责：

* 修正；
  -解释；
  -做决定。

---

# 20.3 Review → Memory

Review 不应该只是文章。

它是 Memory Consolidation 的重要来源。

例如：

Daily Notes 中连续出现某种看法。

Weekly Review 确认：

> 最近确实越来越不喜欢 X。

然后才建议：

> 是否更新 Semantic Memory？

---

# 21. Career 2.0

Career 继续作为独立的高价值 Domain。

但是从：

> Career Database UI

升级成：

> Career Operating System。

---

# 21.1 Career 首页回答

```text
Where am I?
Where am I going?
What am I building?
What am I missing?
What is next?
```

---

# 21.2 Career 四层结构

## Current Position

当前：

-身份；
-经历；
-阶段；
-招聘周期。

---

## Career Portfolio

允许多个方向并存。

每个方向：

```text
status
priority
confidence

supporting evidence
opposing evidence

open questions

next experiment

last reviewed
```

AI 不自动决定 confidence。

用户拥有最终判断。

---

## Opportunity Horizon

未来：

-实习窗口；
-秋招；
-考试；
-证书；
-关键招聘节点。

Roadmap 属于：

> Timeline View

而不是整个 Career 的核心。

---

## Career Capital

持续积累：

```text
Experience
Fact
Evidence
Output
Skill
Bullet
Resume
Application
Relationship
```

---

# 21.3 Career Gap Analysis

未来 AI 可以回答：

> 如果我要投某岗位，我缺什么？

Pipeline：

```text
JD
 ↓
extract requirements
 ↓
Career context
 ↓
Fact/Evidence mapping
 ↓
Gap analysis
 ↓
Action plan
```

输出必须区分：

```text
Strong evidence
Weak evidence
No evidence
Unknown
```

不能为了匹配而虚构经历。

---

# 22. Notes 2.0

Notes 不再把主要工程资源投入 Editor feature race。

优先级变为：

1. Search；
2. Related Notes；
3. Entity Relations；
4. Context-aware AI；
5. Memory；
6. Decision extraction；
7. Knowledge evolution。

---

## Note 页面未来应有 Context Panel

例如：

```text
Related

Career
高力国际

Topics
量化
职业选择

Related Notes
...

Decisions
...

Tasks
...
```

AI 可以回答：

> 这篇东西和我之前哪些观点相关？

---

# 23. Mobile Strategy

Mac：

> Command + Creation + Deep Work

Mobile：

> Now + Capture + Assistant + Notification

不要追求功能完全一致。

---

# 23.1 Mobile Primary Navigation

建议：

```text
Now
Capture
Assistant
```

Secondary Drawer：

Calendar
Tasks
Notes
Career。

---

# 23.2 Mobile 不优先实现

复杂：

* Roadmap 编辑；
  -Resume 编辑；
  -File management；
  -长篇 Note 编辑。

这些保留 Desktop-first。

---

# 24. 数据模型新增建议

2.0 第一阶段重点新增以下数据域。

```text
search_documents

personal_memories
memory_sources

decisions
decision_sources

assistant_events
assistant_insights
assistant_runs
assistant_feedback

rss_feeds
rss_items

briefings
briefing_items
```

暂不建立万能：

```text
entities
```

把所有现有 Domain 强行迁进一个 Mega Table。

当前 UUID + `entity_links` 足够继续演进。

---

# 25. AI Observability

必须新增：

```text
assistant_runs
```

记录：

```text
id

surface
intent

model

prompt_version

retrieved_sources

tool_calls

latency

token_usage nullable
cost nullable

status

created_at
```

注意：

不要记录：

* API Key；
  -敏感 Credential；
  -不必要完整私密文件正文。

---

# 26. AI Feedback

每个重要 Assistant Answer / Insight 支持：

```text
Helpful
Wrong
Not Relevant
Don't Suggest Again
```

这些反馈未来参与：

* retrieval；
  -主动程度；
  -topic weight；
  -insight ranking。

---

# 27. Privacy & Security

延续当前：

* server-side owner verification；
* Supabase RLS；
* private R2；
* server-only keys；
  -审计。

并新增 AI Data Boundary。

---

# 27.1 AI Visibility

重要实体可以设置：

```text
ai_visibility

normal
sensitive
never
```

例如：

某些特别敏感文件：

`never`

默认不进入 AI Context。

---

# 27.2 Sensitive Retrieval

敏感数据只有在明确需要时加入 Context。

例如用户问：

> 我的证书号是多少？

才读 credential。

普通 Career 分析：

不得取。

---

# 28. Performance & Cost

Personal OS 不能每打开一个页面都调用大型模型。

原则：

## Deterministic first

数据库能算的不要 AI。

---

## Cache context

例如：

Daily context snapshot。

---

## Incremental indexing

Note 没变化：

不重新 embedding。

---

## Cheap model first

分类、去重、简单摘要：

优先低成本模型。

复杂个人决策：

再调用 reasoning model。

---

## RSS 必须 batch

绝不能 200 篇文章调用 200 次高端模型。

---

# 29. 推荐代码模块

建议逐渐建立：

```text
src/features/assistant/
src/features/context/
src/features/search/
src/features/memory/
src/features/graph/
src/features/insights/
src/features/briefing/
src/features/reviews/
```

AI Tools：

```text
src/lib/ai/tools/
```

外部能力：

```text
src/lib/adapters/
```

继续坚持 Adapter 模式。

---

# 30. API / Backend 建议

核心统一入口：

```text
POST /api/assistant
GET  /api/search
POST /api/capture
```

内部 Job：

```text
/api/internal/process-events
/api/internal/refresh-briefing
/api/internal/consolidate-memory
```

必须受到：

* cron secret；
* owner；
  -内部认证；

保护。

---

# 31. Feature Flag

2.0 必须避免一次性重构。

新增简单 Feature Flags：

```text
now_v2
global_search
context_engine
memory_v1
proactive_insights
briefing
reviews_v2
assistant_v2
```

逐个切换。

现有生产功能始终可回退。

---

# 32. 不应该做的事情

2.0 明确禁止以下方向。

### 不要继续无限横向添加人生模块

Health、Travel、Finance、Reading 等全部以后根据真实需求增加。

---

### 不要先造万能 Agent

没有：

```text
AI + 所有 SQL 权限
```

---

### 不要所有东西全部 embedding

先解决：

数据质量 + Search + Graph + Context。

---

### 不要把所有个人信息永久塞进 System Prompt

Context 必须动态获取。

---

### 不要把 News 做成无限 Feed

Briefing > Feed。

---

### 不要继续把 Notes 目标设成 Obsidian replacement

Notes 的优势必须来自 Personal Context。

---

### 不要为了理论统一复制 Microsoft To Do / Outlook

外部服务继续做 Execution Layer。

---

### 不要让 AI 静默修改高价值事实

Career Fact、Decision、外部 Event 等必须保持可追踪。

---

# 33. 实施路线

---

# Phase 0 — Architecture Freeze

目标：

> 暂停横向扩张。

工作：

-隐藏尚未启用且当前无用的一级入口；
-补核心测试；
-整理现有 Domain；
-建立 Feature Flags；
-建立 Assistant audit 基础；
-确定 Personal OS 2.0 文档。

完成标准：

现有：

Calendar
Tasks
Notes
Career
Roadmap
Inbox
Files

功能不得回退。

---

# Phase 1 — Now 2.0

优先级：最高。

先不需要 AI。

先完成统一数据聚合：

```text
Calendar
Tasks
Career Milestone
Inbox
Projects
```

然后确定性生成：

```text
Now
Next
Today
Attention
```

第二步才加入 AI Insight。

完成标准：

> 用户打开 Personal OS 后，不进入 Calendar / Tasks，也能在 3–5 秒内知道今天的主要安排和下一步行动。

---

# Phase 2 — Global Search

第一阶段：

Postgres FTS。

搜索：

* Notes；
* Career；
* Files；
* Tasks；
* Calendar。

完成：

`⌘K`

真正可用。

完成标准：

> 输入一个曾经出现过的重要实体或关键词，一次搜索能够找到跨模块相关内容。

---

# Phase 3 — Personal Graph

扩展：

`entity_links`

加入 UI：

Related。

支持：

Manual Link + Suggested Link。

完成标准：

> 一条 Experience 可以直接看到相关 Note / File / Task / Career 信息。

---

# Phase 4 — Context Engine V1

统一：

* Context Planner；
* Search；
* Time context；
  -Working memory；
  -Graph retrieval。

Assistant 回答开始具备个人上下文。

完成标准：

用户询问：

> “结合我的情况分析……”

系统不再需要用户手动复制 Career / Notes / Calendar 的相关材料。

---

# Phase 5 — Unified Assistant

迁移：

Notes AI
Calendar AI
Task AI
Inbox AI

到底层统一 Assistant。

保留各自 UI Surface。

完成标准：

> 在 Notes 中也可以引用 Career，在 Career 中也可以找到相关 Notes。

---

# Phase 6 — Memory V1

建立：

Profile
Working
Decision。

Semantic Memory 暂缓自动化。

完成标准：

> AI 可以准确回答重要长期个人事实、当前状态以及过去的重要决定，并展示来源。

---

# Phase 7 — Proactive Engine

建立：

Events
Insight
Attention Budget。

先做：

```text
task overdue
calendar upcoming
career milestone approaching
weekly review due
```

不先做“万能 AI 洞察”。

完成标准：

> 系统可以在无需用户提问的情况下发现少量真正重要的事项，同时不会产生大量噪音。

---

# Phase 8 — Reviews

完成：

Daily Reflection
Weekly Review
Decision Review。

Review 与 Memory 打通。

完成标准：

> 一个月后 AI 能描述最近一段时间主要发生了什么、哪些判断发生了变化，并能指出来源。

---

# Phase 9 — Briefing

RSS-first。

完成：

Feed
Item
Dedup
Ranking
Briefing。

完成标准：

> 用户每天无需查看几十个 Feed，就能获得少量真正相关内容。

---

# Phase 10 — Career 2.0

完成：

Career Portfolio
Career Capital
Gap Analysis
Applications
Resume Center
Opportunity Horizon。

Roadmap 保留为 Timeline View。

---

# Phase 11 — Mobile Experience

先通过 Responsive / PWA 完成：

Now
Capture
Assistant。

不要急于 Native App。

---

# 34. 推荐的实际开发顺序

不要同时开发所有 Phase。

实际执行：

```text
NOW 2.0
   ↓
GLOBAL SEARCH
   ↓
PERSONAL GRAPH
   ↓
CONTEXT ENGINE
   ↓
UNIFIED ASSISTANT
   ↓
MEMORY
   ↓
PROACTIVE ENGINE
   ↓
REVIEWS
   ↓
BRIEFING
   ↓
CAREER 2.0
```

其中：

**Now + Search + Context**

是 Personal OS 2.0 的前三根支柱。

---

# 35. 第一阶段暂不做 Semantic Memory 自动学习

这是非常重要的边界。

AI 自动总结：

> “用户是一个怎样的人”

风险很大。

早期先实现：

### Profile Memory

用户确认。

### Working Memory

由明确数据计算。

### Decision Memory

明确创建。

Semantic Memory：

以后通过 Review + 多来源证据逐步形成。

---

# 36. Personal OS 2.0 的产品闭环

最终形成：

```text
CAPTURE
   ↓
UNDERSTAND
   ↓
CONNECT
   ↓
REMEMBER
   ↓
PLAN
   ↓
ACT
   ↓
OBSERVE
   ↓
REVIEW
   ↓
LEARN
   ↓
NEXT ACTION
```

这是整个系统最重要的闭环。

---

# 37. 最终产品体验

理想状态下：

## Morning

打开 Now：

系统已经完成：

* 今日 Calendar 整理；
  -Tasks；
  -Deadline；
  -近期 Career；
  -RSS；
  -风险判断。

告诉用户：

> 今天真正重要的是这三件事。

---

## During Day

想到事情：

直接 Capture。

系统决定：

* Task？
  -Note？
  -Calendar？
  -Career？
  -Inbox？

---

## Before Meeting

系统自动提供：

* 相关 Calendar；
  -Notes；
  -Files；
  -以前讨论；
  -待处理事项。

---

## Personal Question

用户：

> 我最近是不是越来越不想做某类工作？

系统自动寻找：

* 日记；
  -相关 Note；
  -Career Decision；
  -Experience；
  -过去 Review。

回答：

> 你的判断经历了什么变化。

---

## Evening

系统：

> 今天发生了这些事情。

用户补充一句：

> 今天真正让我印象最深的是……

---

## Weekly

系统：

> 本周投入、完成、拖延、观点变化和下周风险如下。

用户负责：

> 做真正的判断。

---

# 38. 成功标准

Personal OS 2.0 成功，不是因为：

> 用户把自己所有人生数据全部搬了进来。

而是当用户产生以下体验：

### 1.

> 我不用反复告诉 AI 我是谁。

### 2.

> 我忘记的信息，它可以帮我找到。

### 3.

> 我以前为什么这么决定，它知道。

### 4.

> 今天应该做什么，我打开系统就能看到。

### 5.

> 一些我没有意识到的问题，它会适当地提醒我。

### 6.

> 我的 Notes、Career、Calendar 和 Tasks 不再是四个世界。

### 7.

> 系统越来越懂我，但我始终能看到它为什么这么判断。

---

# 39. 核心工程原则

最后固定以下规则，后续 Codex / Claude Code 开发均应遵守：

1. **Do not break existing workflows.**
2. **Do not create duplicate sources of truth.**
3. **Prefer adapters over vendor lock-in.**
4. **Prefer deterministic logic before AI.**
5. **AI reads broadly but writes narrowly.**
6. **Every important AI conclusion should be traceable.**
7. **Every consequential action should be reviewable.**
8. **Context should be retrieved, not permanently stuffed into prompts.**
9. **Memory must support correction and supersession.**
10. **Proactivity must respect attention.**
11. **Search and relationships are infrastructure, not optional features.**
12. **Mobile is capture-first, desktop is creation-first.**
13. **No module exists merely because a Personal OS “should have it.”**
14. **A feature is valuable only if it reduces cognitive work or improves decisions.**
15. **The system serves the user; the user does not maintain the system for its own sake.**

---

# 40. 最终定义

Personal OS 1.x 的核心问题是：

> 数据和功能逐渐齐全，但仍需要用户自己把它们组合成意义。

Personal OS 2.0 的目标是：

> **让系统负责组织上下文，让用户负责真正的判断。**

最终，Personal OS 不应该只是保存：

> What I did.

它还应该逐渐理解：

> What I am doing.

> What I care about.

> What I believed.

> Why I changed my mind.

> What requires my attention.

> What I should probably do next.

而用户始终拥有：

> 最终决定权。
