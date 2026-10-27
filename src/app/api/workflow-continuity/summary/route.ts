import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { readContinuitySummary } from "@/features/assistant/continuity-summary";
import { continuitySummarySchema } from "@/features/assistant/continuity-summary-contracts";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
export async function GET() {
  try { return Response.json(continuitySummarySchema.parse(await readContinuitySummary(await requireOwnerApi())), { headers }); }
  catch (error) {
    const auth = apiAuthenticationFailure(error);
    if (auth) { for (const [key, value] of Object.entries(headers)) auth.headers.set(key, value); return auth; }
    return Response.json({ error: "继续工作的服务器记录暂未读全，当前任务仍保留。" }, { status: 503, headers });
  }
}
