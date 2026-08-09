import { NextResponse } from "next/server";
import { z } from "zod";
import {
  apiAuthenticationFailure,
  requireOwnerApi,
} from "@/lib/auth/require-owner";
import { listNotesWorkspacePage } from "@/features/notes/queries";

const querySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      offset: url.searchParams.get("offset") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "分页参数无效。" }, { status: 400 });
    }

    const { supabase } = await requireOwnerApi();
    const page = await listNotesWorkspacePage(supabase, parsed.data);
    if (page.state === "unavailable") {
      return NextResponse.json({ error: "暂时无法读取笔记列表。" }, { status: 503 });
    }

    return NextResponse.json(
      { notes: page.notes, hasMore: page.hasMore },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return (
      apiAuthenticationFailure(error) ??
      NextResponse.json({ error: "暂时无法读取笔记列表。" }, { status: 503 })
    );
  }
}
