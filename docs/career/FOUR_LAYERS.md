# Career 四层数据边界（2026-10-20）
> 适用于 Career、Interview Lab、Codex/Agent。此文档是实现约束，不是新增招聘岗位的授权。

## 一、单一职责

| 领域 | 数据对象 | 承载事实 | 禁止 |
|---|---|---|---|
| 职业目标 | `career_directions` | 用户长期职业方向、支持和反对证据、当前决定 | 不把方向当具体招聘JD |
| 招聘机会 | `career_opportunities` | 独立招聘职位、公司、来源URL、招聘周期、截止、地点、原始JD及核验状态 | 不将过去招聘/行业方向或面试题自动列作当前在招 |
| 投递记录 | `career_applications` | 申请草稿、正式提交、选拔状态、时间、简历版本 | 不以创建草稿、写简历或准备面试推断“已投递” |
| 面试准备 | `interview_contexts` | 按岗位、方向或历史案例组织问答、证据、练习与复盘 | 不因 `status=active` 声称该招聘正在开放 |

## 二、原有数据和读写规则

1. 现有3条 `career_directions` 与92条历史/模拟 `interview_contexts` 全部保留；本阶段不从准备情境批量生成 `career_opportunities`，不自动生成 `career_applications`。
2. Career 首页只查询方向、明确记录的招聘机会、申请和路线事项。历史准备不进入“真实招聘机会”和“实际投递”统计；全部旧情境放到 `/career/interview/targets`。旧版最多3项“近期关注”浏览器选择沿用原有存储键，转入 Interview Lab 情境置顶，不能用于招聘或投递状态推断。
3. 新建具体招聘机会必须填写公司、具体岗位、可追溯JD或项目来源URL、招聘周期（如2027暑期/2028届）、类别；截止日和地点信息未知时不得臆造。URL是线索和证据入口，**仅存有URL不等于当天独立核验**。就业目标而非JD应在职业方向或备考情境记录。
4. 正式投递的状态必须由用户实际提交操作触发。创建申请默认 `preparing`，不得仅凭准备简历自动变为 `submitted`；手动创建 `submitted` 必须填实际提交时间。原有转阶段动作通过 `transition_career_application` 记录时间并写入事件历史；不能通过题库修改申请状态。
5. 一条真实机会对应面试学习，通过机会页的“准备面试”操作创建/定位 `context_type=opportunity` 的情境，并持有 `opportunity_id`。用户手动创建的是 `context_type=target` 的参考情境，与真实机会不同。旧情境深层URL不变。
6. 同一用户可有一个职业方向、多个具体机会、多个真实申请和多个准备情境；**不要强行将历史92条面试情境（通用题另计）数据映射为新的可投递岗位**。涉及联系HR、筛选职位、实际投递时应核对官方JD和账户状态。

## 三、最小验收

- Career 首页不加载92个历史面试情境，不将 Active 备考当作申请/职位；
- 四个页面入口清晰：`/career`、`/career/opportunities`、`/career/applications`、`/career/interview/targets`；
- 招聘机会创建缺URL/招聘届次即校验失败，申请草稿没有提交时间不会被计入已投递；
- 旧题目、答案版本、个人故事与目标情境不改动，`/career/interview?context=...` 和 `/career/interview/targets/[contextId]` 仍可访问；
- 现有核心单元测试、lint、类型检查、构建与移动端回归通过后才合并。

## 四、下一步（需独立用户授权后进行）

对审计PR #83逐项复核历史目标，选择哪些真正有资格和正在开放的职位，再明确审批是否导入 `career_opportunities`。正式提交申请以前不要写入 `career_applications` 的已投递状态。所有代码和自动化 Agent 应先读此规范，再写 Career/Interview 数据。
