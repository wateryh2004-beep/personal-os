import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { searchNotesWorkspace } from "@/features/notes/queries";

const schema = z.object({
  q: z.string().trim().min(1).max(200),
  folderId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = schema.safeParse({
      q: url.searchParams.get("q") ?? "",
      folderId: url.searchParams.get("folderId") || undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return NextResponse.json({ error: "搜索参数无效。" }, { status: 400 });
    return NextResponse.json(
      { results: await searchNotesWorkspace(parsed.data.q, parsed.data.folderId ?? null, parsed.data.limit) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "搜索暂时不可用。" }, { status: 503 });
  }
}
