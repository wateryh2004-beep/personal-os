import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { listNoteLinkSuggestions } from "@/features/notes/links/queries";

const querySchema = z.object({
  q: z.string().trim().max(160).default(""),
  limit: z.coerce.number().int().min(1).max(20).default(20),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      q: url.searchParams.get("q") ?? "",
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "搜索参数无效。" }, { status: 400 });
    const { supabase, userId } = await requireOwnerApi();
    const notes = await listNoteLinkSuggestions(supabase, userId, parsed.data.q, parsed.data.limit);
    return NextResponse.json({ notes }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "暂时无法搜索笔记。" }, { status: 503 });
  }
}
