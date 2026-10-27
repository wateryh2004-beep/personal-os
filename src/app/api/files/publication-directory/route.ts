import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { fileRecordSchema } from "@/features/files/record-schema";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const columns = "id,title,original_filename,mime_type,file_size,folder_id,uploaded_at,created_at,archived_at,ai_visibility,text_extraction_status,extracted_character_count,mutation_revision";
const input = z.object({ after: z.string().uuid().optional(), q: z.string().trim().max(200).optional() }).strict();
/** One explicit 20-row directory page; no original data or automatic table scan. */
export async function GET(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return Response.json({ error: "核对参数无效。" }, { status: 400, headers });
    const parsed = input.safeParse(Object.fromEntries(params));
    if (!parsed.success) return Response.json({ error: "核对参数无效。" }, { status: 400, headers });
    let query = supabase.from("documents").select(columns).eq("user_id", userId).eq("storage_provider", "cloudflare_r2")
      .eq("storage_state", "available").is("archived_at", null).is("vault_group_id", null);
    if (parsed.data.after) query = query.gt("id", parsed.data.after);
    if (parsed.data.q) query = query.ilike("title", `%${parsed.data.q.replace(/[\\%_]/g, "\\$&")}%`);
    const result = await query.order("id").limit(21);
    if (result.error) throw new Error("directory_unavailable");
    const scanned = (result.data ?? []).slice(0, 20);
    const attached = new Set<string>();
    // Per-target existence reads cannot silently lose exclusions to duplicate
    // attachment rows; each is limit1, with at most two DB reads in flight.
    for (let offset = 0; offset < scanned.length; offset += 2) {
      await Promise.all(scanned.slice(offset, offset + 2).map(async row => {
        const links = await supabase.from("entity_links").select("id").eq("user_id", userId).eq("target_id", row.id)
          .eq("source_type", "note").eq("target_type", "document").eq("relationship_type", "attachment").is("archived_at", null).limit(1);
        if (links.error) throw new Error("directory_unavailable");
        if (links.data?.length) attached.add(row.id);
      }));
    }
    const files = scanned.filter(row => !attached.has(row.id)).map(row => fileRecordSchema.parse(row));
    return Response.json({ files, next: (result.data?.length ?? 0) > 20 ? scanned.at(-1)!.id : null }, { headers });
  } catch (error) {
    const failure = apiAuthenticationFailure(error);
    if (failure) { for (const [key, value] of Object.entries(headers)) failure.headers.set(key, value); return failure; }
    return Response.json({ error: "文件核对暂不可用，请重试。" }, { status: 503, headers });
  }
}
