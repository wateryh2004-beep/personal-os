import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { workbenchReadInputSchema } from "@/features/workbench/contracts";
import { readWorkbenchEntity } from "@/features/workbench/entity-queries";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
export async function GET(request: Request) {
  try {
    const owner = await requireOwnerApi();
    const raw = new URL(request.url).searchParams.get("refs");
    if (!raw || raw.length > 2048) return Response.json({ error: "记录引用无效。" }, { status: 400, headers });
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return Response.json({ error: "记录引用无效。" }, { status: 400, headers }); }
    const parsed = workbenchReadInputSchema.safeParse({ refs: input });
    if (!parsed.success) return Response.json({ error: "记录引用无效。" }, { status: 400, headers });
    return Response.json({ results: await Promise.all(parsed.data.refs.map((ref) => readWorkbenchEntity(ref, owner))) }, { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? Response.json({ error: "记录暂时无法读取。" }, { status: 503, headers }); }
}
