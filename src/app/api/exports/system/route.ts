import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { createSystemBackupSource } from "@/features/system-backup/source";
import { prepareArtworkBackup } from "@/features/system-backup/artwork";
import { systemBackupStream } from "@/features/system-backup/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

/** Native explicit POST download, no prefetch and no provider or database writes. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site") {
      return Response.json({ error: "请从设置页面发起系统快照下载。" }, { status: 403, headers: privateHeaders });
    }
    const source = createSystemBackupSource(supabase, userId);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const artwork = await prepareArtworkBackup(userId, signal);
    return new Response(systemBackupStream(source, userId, signal, artwork), { headers: {
      ...privateHeaders, "Content-Type": "application/x-ndjson; charset=utf-8",
      "Content-Disposition": `attachment; filename="personal-os-system-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? Response.json({ error: "系统快照未完成，请重试并运行离线校验。" }, { status: 500, headers: privateHeaders });
  }
}
