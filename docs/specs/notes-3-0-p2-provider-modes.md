# Notes 3.0 P2.1 — 双提供商与模式

状态：代码候选；实际 API 凭据及调用尚待核对。

- 快速处理：沿用 DeepSeek Flash；高质量写作：OpenAI 官方 Responses API；深度思考：OpenAI Responses API，高推理努力。
- 官方适配器是 server-only，使用 `@ai-sdk/openai`。模型 ID 由 Vercel 服务端 `OPENAI_WRITING_MODEL` / `OPENAI_REASONING_MODEL` 配置，必须来自 OpenAI API 组织实际可用模型。
- `OPENAI_API_KEY` 不上传浏览器。OpenAI 使用 `store:false`；不配置时拒绝 OpenAI 两种模式，不能悄然用其他模型替代。DeepSeek 快速仍可使用。
- 其他模块 AI 入口保留原路由；保留 AI 访问权限、run 与费用预算及审计。现有费率是统一估算，不是精确按模型价格；分模型费用核对为 P2.6 待办。
- 未新增数据库迁移、未覆盖原文。须通过 npm ci、类型、测试、构建、配置缺失路径与真实 API 调用验证后方可声明上线。
