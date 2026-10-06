import { requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { createExportSource } from "@/features/files/export/source";
import { createExportPlan } from "@/features/files/export/plan";
import { exportFailure, isSameOriginExport, privateExportHeaders } from "@/features/files/export/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Explicit owner request, metadata only. Does not fetch originals or persist a job. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (!isSameOriginExport(request)) return Response.json({ error: "请从 Files 页面发起导出。" }, { status: 403, headers: privateExportHeaders });
    if (!isR2Configured()) return Response.json({ error: "文件存储暂时不可用。" }, { status: 503, headers: privateExportHeaders });
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const plan = await createExportPlan(createExportSource(supabase, userId, signal), signal);
    return Response.json(plan, { headers: privateExportHeaders });
  } catch (error) { return exportFailure(error); }
}
