import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { maxExportParts } from "./contract";

export const privateExportHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
export function isSameOriginExport(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin && request.headers.get("sec-fetch-site") !== "cross-site";
}
export function exportFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "files_export_failed";
  const known: Record<string, [number, string]> = {
    files_export_plan_changed: [409, "Files 元数据已变化，请重新生成分包计划；不要把不同计划的包拼为完整备份。"],
    files_export_invalid_part: [400, "分包请求无效，请从 Files 页面重新选择。"],
    files_export_invalid_request: [400, "导出请求无效，请从 Files 页面重新发起。"],
    files_export_plan_budget_exceeded: [413, "此集合超过分包计划的记录、元数据或分包数量上限，需要另行设计离线导出。"],
    files_export_part_budget_exceeded: [413, "共享元数据与单个原件超过分包安全上限，需要另行设计离线导出。"],
    export_invalid_size: [413, "集合中存在无效大小或超过 100 MiB 的单个原件，无法生成可靠导出。"],
    export_metadata_too_large: [413, "集合中存在超过 2 MiB 的元数据记录，无法生成可靠导出。"],
  };
  if (known[code]) return Response.json({ error: known[code][1], code }, { status: known[code][0], headers: privateExportHeaders });
  return apiAuthenticationFailure(error) ?? Response.json({ error: "文件导出未完成，请重试并校验下载结果。", code: "files_export_failed" }, { status: 500, headers: privateExportHeaders });
}

const partRequest = z.object({ planId: z.string().regex(/^[a-f0-9]{64}$/), partIndex: z.coerce.number().int().min(1).max(maxExportParts) }).strict();
/** Native form POST, with a small bounded body instead of an unbounded formData read. */
export async function readPartRequest(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/x-www-form-urlencoded" || !request.body) throw new Error("files_export_invalid_request");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) throw new Error("files_export_invalid_request");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const fields = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  if (fields.getAll("planId").length !== 1 || fields.getAll("partIndex").length !== 1) throw new Error("files_export_invalid_request");
  const result = partRequest.safeParse(Object.fromEntries(fields));
  if (!result.success) throw new Error("files_export_invalid_request");
  return result.data;
}
