import { NextRequest, NextResponse } from "next/server";
import { extractDocumentForOwner } from "@/features/files/extraction-service";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!env.cronSecret || request.headers.get("authorization") !== `Bearer ${env.cronSecret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers });
  if (!env.ownerUserId || !env.ownerEmail)
    return NextResponse.json({ error: "background_owner_not_configured" }, { status: 503, headers });

  const admin = createAdminClient();
  const { data: owner, error: ownerError } = await admin.auth.admin.getUserById(env.ownerUserId);
  if (ownerError || !owner.user || owner.user.email?.toLocaleLowerCase() !== env.ownerEmail.toLocaleLowerCase())
    return NextResponse.json({ error: "background_owner_invalid" }, { status: 503, headers });

  const staleProcessing = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: documents, error } = await admin
    .from("documents")
    .select("id")
    .eq("user_id", env.ownerUserId)
    .eq("storage_provider", "cloudflare_r2")
    .eq("storage_state", "available")
    .is("archived_at", null)
    .or(`text_extraction_status.in.(pending,not_requested,failed),and(text_extraction_status.eq.processing,updated_at.lt.${staleProcessing})`)
    .order("updated_at")
    .limit(3);
  if (error)
    return NextResponse.json({ error: "extraction_queue_unavailable" }, { status: 500, headers });

  let completed = 0;
  let deferred = 0;
  for (const document of documents ?? []) {
    const result = await extractDocumentForOwner({
      supabase: admin,
      userId: env.ownerUserId,
      documentId: document.id,
    });
    if (result.status === "completed") completed += 1;
    else deferred += 1;
  }
  return NextResponse.json({ processed: documents?.length ?? 0, completed, deferred }, { headers });
}
