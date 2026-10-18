import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { requireVault, sameOrigin, vaultFailure, vaultHeaders } from "@/features/vault/server";
import { createSystemBackupSource } from "@/features/system-backup/source";
import { prepareArtworkBackup } from "@/features/system-backup/artwork";
import { systemBackupStream } from "@/features/system-backup/export";
import { archiveStream, checkExportBudget } from "@/features/files/export/portable";
import { createExportSource } from "@/features/files/export/source";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(240_000)]);
    const files = new URL(request.url).searchParams.get("kind") === "files";
    if (files) {
      await checkExportBudget(createExportSource(owner.admin, owner.userId, signal), signal);
      return new Response(archiveStream(streamSignal => createExportSource(owner.admin, owner.userId, streamSignal), signal), {
        headers: { ...vaultHeaders, "Content-Type": "application/x-tar", "Content-Disposition": "attachment; filename=\"personal-os-files-with-private.tar\"" },
      });
    }
    const artwork = await prepareArtworkBackup(owner.userId, signal);
    return new Response(systemBackupStream(createSystemBackupSource(owner.admin, owner.userId), owner.userId, signal, artwork), {
      headers: { ...vaultHeaders, "Content-Type": "application/x-ndjson; charset=utf-8", "Content-Disposition": "attachment; filename=\"personal-os-system-with-private.ndjson\"" },
    });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}
