import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getCalendarWorkspace } from "@/features/calendar/queries";

export async function GET() {
  try {
    const owner = await requireOwnerApi();
    return NextResponse.json(await getCalendarWorkspace(owner), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "日历工作区暂时不可用。" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
