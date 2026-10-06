import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { archiveStream, checkExportBudget } from "@/features/files/export/portable";
import { createExportSource } from "@/features/files/export/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

/** Explicit same-origin form POST: exporting private originals must not be prefetched. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return Response.json({ error: "请从 Files 页面发起导出。" }, { status: 403, headers: privateHeaders });
    }
    if (!isR2Configured()) return Response.json({ error: "文件存储暂时不可用。" }, { status: 503, headers: privateHeaders });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    await checkExportBudget(createExportSource(supabase, userId, signal), signal);
    return new Response(archiveStream((streamSignal) => createExportSource(supabase, userId, streamSignal), signal), {
      headers: { ...privateHeaders, "Content-Type": "application/x-tar", "Content-Disposition": `attachment; filename="personal-os-files-${new Date().toISOString().slice(0, 10)}.tar"` },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "files_export_budget_exceeded") {
      return Response.json({ error: "此导出超过 512 MiB 或 25,000 条记录的安全上限，需要分批或离线导出。" }, { status: 413, headers: privateHeaders });
    }
    return apiAuthenticationFailure(error) ?? Response.json({ error: "文件导出未完成，请重试并校验下载结果。" }, { status: 500, headers: privateHeaders });
  }
}
