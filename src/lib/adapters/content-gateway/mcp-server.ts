import "server-only";
import { createHash } from "node:crypto";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { contentWriteSchema } from "@/features/content/contracts";
import { contentReadSchema } from "@/features/content/queries";
import { GatewayAccessError, type GatewayConfig, type GatewayStore, type GatewayToken } from "@/features/content-gateway/contracts";
import { gatewayChallenge } from "@/features/content-gateway/metadata";
import { withGatewayStore } from "./postgres-store";

type Transaction = <T>(work: (store: GatewayStore) => Promise<T>) => Promise<T>;
const findSchema = z.object({ q: z.string().trim().min(1).max(200), limit: z.number().int().min(1).max(30).default(20) }).strict();
const noteReadSchema = z.object({ id: z.string().uuid() }).strict();
const interviewReadSchema = z.object({ id: z.string().uuid(), answerId: z.string().uuid().optional() }).strict();
const { operation: createOperation, source: createSource, ...createShape } = contentWriteSchema.options[0].shape;
const { operation: reviseOperation, source: reviseSource, ...reviseShape } = contentWriteSchema.options[1].shape;
const { operation: answerOperation, source: answerSource, ...answerShape } = contentWriteSchema.options[2].shape;
void createOperation; void createSource; void reviseOperation; void reviseSource; void answerOperation; void answerSource;

export function createContentMcpServer(config: GatewayConfig, rawToken: string, token: GatewayToken, transaction: Transaction = withGatewayStore) {
  const server = new McpServer({ name: "personal-os-content", version: "1.0.0" });
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const result = (value: unknown): CallToolResult => ({ content: [{ type: "text", text: JSON.stringify(value) }], ...(value && typeof value === "object" && !Array.isArray(value) ? { structuredContent: value as Record<string, unknown> } : {}) });
  const invoke = async (write: boolean, command: unknown): Promise<CallToolResult> => {
    try {
      const parsed = write ? contentWriteSchema.safeParse(command) : contentReadSchema.safeParse(command);
      if (!parsed.success) throw new GatewayAccessError("invalid_request");
      // Authorization is repeated inside the same DB transaction as each read/write,
      // including revocation and operation-specific scopes. Discovery is not authority.
      return result(await transaction((store) => write ? store.writeContent(tokenHash, config.resource, parsed.data) : store.readContent(tokenHash, config.resource, parsed.data)));
    } catch (error) {
      const code = error instanceof GatewayAccessError ? error.code : "temporarily_unavailable";
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: code }) }],
        ...(code === "invalid_token" || code === "insufficient_scope" ? { _meta: { "mcp/www_authenticate": [gatewayChallenge(config, code)] } } : {}) };
    }
  };
  const readable = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const writable = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  if (token.scope.includes("notes:read")) {
    server.registerTool("notes_find", { description: "查找已授权普通笔记的标题与修订信息；不会读取敏感或永不供 AI 使用的笔记。", inputSchema: findSchema, annotations: readable }, (args) => invoke(false, { ...args, action: "find", kind: "note" }));
    server.registerTool("notes_read", { description: "读取一篇已明确选择的普通笔记、修订号与来源。", inputSchema: noteReadSchema, annotations: readable }, (args) => invoke(false, { ...args, action: "read", kind: "note" }));
  }
  if (token.scope.includes("notes:write")) {
    server.registerTool("notes_create", { description: "保存用户明确选择的原文或整理 Markdown，来源独立保存。必须明确作者来源；保留 operationId 用于安全重试。不会自动收集全部对话。", inputSchema: z.object(createShape).strict(), annotations: writable }, (args) => invoke(true, { ...args, operation: "note.create", source: "codex" }));
    server.registerTool("notes_revise", { description: "按原笔记 ID、expectedRevision 和 expectedUpdatedAt 修改正文；原文保留为历史。冲突后重新读取，不能静默覆盖。", inputSchema: z.object(reviseShape).strict(), annotations: { ...writable, destructiveHint: true } }, (args) => invoke(true, { ...args, operation: "note.update", source: "codex" }));
  }
  if (token.scope.includes("interview:read")) {
    server.registerTool("interview_find", { description: "查找面试学习题目与稳定准备记录 ID。", inputSchema: findSchema, annotations: readable }, (args) => invoke(false, { ...args, action: "find", kind: "interview" }));
    server.registerTool("interview_read", { description: "读取已选择的准备记录、答案草稿和版本信息，为后续有冲突保护的修订提供依据。", inputSchema: interviewReadSchema, annotations: readable }, (args) => invoke(false, { ...args, action: "read", kind: "interview" }));
  }
  if (token.scope.includes("interview:append")) {
    server.registerTool("interview_append_answer", { description: "在同一准备记录下追加 spoken 答案草稿，保留旧版本并检查版本/基准冲突。不会设为当前答案、核实事实或标记掌握。", inputSchema: z.object(answerShape).strict(), annotations: writable }, (args) => invoke(true, { ...args, operation: "interview.answer.append", source: "codex" }));
  }
  return server;
}
