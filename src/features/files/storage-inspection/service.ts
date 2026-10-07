import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAllFilePages } from "../read-all-pages";
import type { LogicalStorage } from "./contract";
export async function readLogicalStorage(supabase: SupabaseClient, userId: string, bucket: string, signal: AbortSignal): Promise<LogicalStorage> {
  try {
    const rows = await readAllFilePages<{ id: string; file_size: number | string | null; storage_state: string; archived_at: string | null }>((after, limit) => {
      let query = supabase.from("documents").select("id,file_size,storage_state,archived_at").eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_bucket", bucket).order("id").limit(limit).abortSignal(signal);
      if (after) query = query.gt("id", after);
      return query;
    });
    const result: LogicalStorage = { status: "complete", records: rows.length, activeBytes: 0, archivedBytes: 0, pendingBytes: 0 };
    for (const row of rows) {
      // Cancelled uploads are retained audit metadata, never stored originals.
      if (row.storage_state === "cancelled") { result.records--; continue; }
      if (row.file_size === null || (typeof row.file_size !== "number" && (typeof row.file_size !== "string" || !/^\d+$/.test(row.file_size)))) throw new Error("invalid_size");
      const bytes = Number(row.file_size);
      if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error("invalid_size");
      if (row.storage_state === "pending") result.pendingBytes += bytes;
      else if (row.archived_at || row.storage_state === "archived") result.archivedBytes += bytes;
      else if (row.storage_state === "available") result.activeBytes += bytes;
      else throw new Error("invalid_storage_state");
    }
    if (![result.activeBytes, result.archivedBytes, result.pendingBytes].every(Number.isSafeInteger)) throw new Error("invalid_total");
    return result;
  } catch { return { status: "unavailable", records: 0, activeBytes: 0, archivedBytes: 0, pendingBytes: 0 }; }
}
