import "server-only";
import {
  ContentWriteError,
  contentWriteResultSchema,
  contentWriteSchema,
  type ContentWriteErrorCode,
  type ContentWriteResult,
} from "@/features/content/contracts";

/** Supply the validated owner's session client. Never substitute a service-role client. */
export interface ContentRpcClient {
  rpc(name: "write_content", parameters: { p_command: Record<string, unknown> }): PromiseLike<{
    data: unknown;
    error: { code?: string } | null;
  }>;
}

function errorCode(code?: string): ContentWriteErrorCode {
  if (code === "P0101" || code === "23505" || code === "40001") return "conflict";
  if (code === "P0102") return "idempotency_conflict";
  if (code === "P0103") return "not_found";
  if (code === "22023" || code === "22P02" || code === "22007" || code === "22008" || code === "22003" || code === "23514") return "invalid_input";
  if (code === "PGRST202" || code === "42883") return "migration_required";
  if (code === "42501" || code === "PGRST301") return "forbidden";
  return "write_failed";
}

/** One database call commits content, its history, provenance, and replay receipt together. */
export async function writeContent(client: ContentRpcClient, input: unknown): Promise<ContentWriteResult> {
  const parsed = contentWriteSchema.safeParse(input);
  if (!parsed.success) throw new ContentWriteError("invalid_input");
  let response: Awaited<ReturnType<ContentRpcClient["rpc"]>>;
  try {
    response = await client.rpc("write_content", { p_command: parsed.data });
  } catch {
    // A transport failure can be ambiguous. Retry the identical command/operation ID.
    throw new ContentWriteError("write_failed");
  }
  if (response.error) throw new ContentWriteError(errorCode(response.error.code));
  const result = contentWriteResultSchema.safeParse(response.data);
  if (!result.success || result.data.operationId !== parsed.data.operationId) throw new ContentWriteError("write_failed");
  return result.data;
}

export { ContentWriteError } from "@/features/content/contracts";
