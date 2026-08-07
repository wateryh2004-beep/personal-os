import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { checkR2Health } from "@/lib/adapters/cloudflare-r2";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireOwnerApi();
    return NextResponse.json(await checkR2Health(), { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "存储健康检查暂时不可用。" }, { status: 500, headers: { "Cache-Control": "private, no-store, max-age=0" } });
  }
}
