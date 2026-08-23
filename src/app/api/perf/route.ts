import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { clientMetricNames } from "@/lib/performance/client-metrics";

export const dynamic = "force-dynamic";

const metricSchema = z.object({
  kind: z.enum(["web-vital", "navigation"]),
  name: z.enum(clientMetricNames),
  value: z.number().finite().min(0).max(120_000),
  rating: z.enum(["good", "needs-improvement", "poor"]).optional(),
  route: z.enum(["/today", "/calendar", "/tasks", "/notes", "/notes/[id]", "/briefing"]),
  displayMode: z.enum(["standalone", "browser"]),
  viewport: z.enum(["360", "390", "412", "430", "wide"]),
}).strict();

export async function POST(request: Request) {
  try {
    await requireOwnerApi();
  } catch (error) {
    const failure = apiAuthenticationFailure(error);
    if (failure) return failure;
    throw error;
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 2_048) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = metricSchema.safeParse(input);
  if (!parsed.success) return Response.json({ error: "invalid_metric" }, { status: 400 });

  // Structured timing only. Never log titles, task bodies, note text, URLs, or search queries.
  console.info(JSON.stringify({ type: "client_perf", ...parsed.data }));
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
