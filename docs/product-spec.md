# Personal OS：Phase 1 产品规范

## 目标与边界

Personal OS 是 Hang Yu 的私人、长期个人数据与决策系统。Phase 1 建立可靠的日常操作基础：安全登录、快速捕捉、任务与项目管理、Markdown 笔记、今日视图、设置、活动记录和可导出数据。

基础阶段明确不做 Investing、Outlook、AI、照片、实时协作、社交、行情、交易、Webhook、向量数据库、知识图谱或原生应用。Career Module Phase 1 已启动，但仅覆盖职业档案、经历事实、成果、表达、技能、证书和证明材料；不做简历、投递或面试。

## Career Module Phase 1

职业数据链为 Direction → Experience → Fact → Output → Bullet → Evidence。Facts 是可验证的权威底稿，Bullets 是按职业方向组织的表达版本；两者严格分离。Career 复用 Notes、Tasks、Projects、审计与导出，不创建第二套业务系统。私有文件保存在 `private-files`，普通导出不含证书编号或文件原件。

## 用户与关键流程

初期为单一私人用户，但所有数据仍以 `user_id` 隔离，避免把单用户假设写进数据库。

1. 用户仅通过邮件 Magic Link 登录，进入 `/today`；Phase 1 不提供密码登录。
2. 用户通过全局捕捉或 Inbox 新建一条原始输入；它可保留、归档，或被转换为任务/笔记（转换保留来源链接）。
3. 用户维护 Areas（持续责任域）与 Projects（有明确结果、可完成的工作），任务可隶属项目或仅隶属 Area。
4. 用户在 Today 查看今日到期、计划、收件箱待处理和近期活动；Phase 1 不做自动排程。
5. 用户撰写原始 Markdown 笔记；每次有意义的保存产生版本。用户可查看版本并恢复。
6. 用户在 Settings 发起导出；系统后台生成 JSON/Markdown/CSV manifest ZIP，完成后提供下载。

## Phase 1 功能验收

- 未登录用户只能访问认证相关页面；登录后只能看到自己的数据。
- Inbox、Areas、Projects、Tasks、Notes 支持创建、读取、更新与归档；所有表单经 Zod 验证。
- Today 是聚合读模型界面，不创建与业务数据重复的万能 Today 表。
- Notes 的 `body_markdown` 可原样导出；历史版本可审计、可恢复。
- 全局 Command Palette 仅提供导航、创建入口与搜索界面骨架；首版不承诺全文搜索或自然语言命令。
- 每个重要写入记录 activity event 与 audit log；用户可请求完整数据导出。

## 非功能要求

- 中文优先界面；桌面和移动端均可用，移动端优先保证捕捉、Today、Tasks、Notes。
- 可访问性：键盘操作、可见 focus、语义化控件、Radix 对话框/菜单默认行为不被破坏。
- 数据可迁移：以 PostgreSQL migration、Markdown、JSON/CSV 和 Storage 清单为边界，不依赖专有编辑器格式。

## 待产品确认

1. Tasks 是否需要开始/结束时间，或仅需 `due_date` 与 `planned_for_date`？建议先仅日期，减少时区和日历复杂度。
2. Notes 第一版是否要文件附件？建议延后；Storage 先用于导出包。
