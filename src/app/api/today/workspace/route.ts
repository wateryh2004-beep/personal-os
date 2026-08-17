import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getTodayWorkspace } from "@/features/today/queries";

export async function GET() {
  try {
    const owner = await requireOwnerApi();
    return NextResponse.json(await getTodayWorkspace(new Date(), owner), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "Today 工作区暂时不可用。" }, { status: 503, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
