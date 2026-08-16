import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { getEntityBacklinks } from "@/features/links/queries";
import { linkableEntityTypes } from "@/features/links/types";

const schema = z.object({ type: z.enum(linkableEntityTypes), id: z.string().uuid() });

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = schema.safeParse({
      type: url.searchParams.get("type"),
      id: url.searchParams.get("id"),
    });
    if (!parsed.success) return NextResponse.json({ error: "参数无效。" }, { status: 400 });
    const result = await getEntityBacklinks(parsed.data.type, parsed.data.id);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "反链暂时不可用。" }, { status: 503 });
  }
}
