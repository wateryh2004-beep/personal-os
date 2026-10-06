import { requireOwnerApi } from "@/lib/auth/require-owner";
import { isR2Configured } from "@/lib/adapters/cloudflare-r2";
import { archiveStream } from "@/features/files/export/portable";
import { createExportSource } from "@/features/files/export/source";
import { createExportPlan, describeExportPart, exportPlanMatches, selectExportPart } from "@/features/files/export/plan";
import { exportFailure, isSameOriginExport, privateExportHeaders, readPartRequest } from "@/features/files/export/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Each request retries one part, never an implicit whole-collection download. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (!isSameOriginExport(request)) return Response.json({ error: "请从 Files 页面发起导出。" }, { status: 403, headers: privateExportHeaders });
    if (!isR2Configured()) return Response.json({ error: "文件存储暂时不可用。" }, { status: 503, headers: privateExportHeaders });
    const input = await readPartRequest(request);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const plan = await createExportPlan(createExportSource(supabase, userId, signal), signal);
    if (input.planId !== plan.planId) throw new Error("files_export_plan_changed");
    const collection = describeExportPart(plan, input.partIndex);
    const body = archiveStream((streamSignal) => selectExportPart(createExportSource(supabase, userId, streamSignal), collection), signal, {
      collection,
      maxBytes: plan.limits.maxPartBytes,
      verifyCollection: (streamSignal) => exportPlanMatches(createExportSource(supabase, userId, streamSignal), streamSignal, plan),
    });
    const filename = `personal-os-files-${plan.planId.slice(0, 16)}-part-${collection.partIndex}-of-${collection.partCount}.tar`;
    return new Response(body, { headers: { ...privateExportHeaders, "Content-Type": "application/x-tar", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch (error) { return exportFailure(error); }
}
