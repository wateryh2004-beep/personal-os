import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getNotesWorkspace } from "@/features/notes/queries";

/** Private list metadata only; note bodies remain an on-demand document read. */
export async function GET() {
  try {
    const owner = await requireOwnerApi();
    return NextResponse.json(await getNotesWorkspace(owner), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "笔记工作区暂时不可用。" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
