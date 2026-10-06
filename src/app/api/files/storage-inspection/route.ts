import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { checkR2Health, inspectR2ObjectUsage } from "@/lib/adapters/cloudflare-r2";
import { readLogicalStorage } from "@/features/files/storage-inspection/service";
import type { StorageInspection } from "@/features/files/storage-inspection/contract";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Private aggregate-only process cache. Every request still authenticates first.
// Instance-local deduplication limits repeated clicks; this is not a global rate limiter.
const inspections = new Map<string, { expiresAt: number; promise: Promise<StorageInspection> }>();
const reuseMs = 60_000;
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
/** Explicit owner-initiated metadata inspection; no object reads or storage writes. */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "请从设置页面发起检查。" }, { status: 403, headers });
    const raw = await request.text();
    if (raw.length > 128) return Response.json({ error: "检查请求无效。" }, { status: 400, headers });
    let input: { scan?: boolean };
    try { input = JSON.parse(raw || "{}"); } catch { return Response.json({ error: "检查请求无效。" }, { status: 400, headers }); }
    if (!input || typeof input !== "object" || Array.isArray(input) || (input.scan !== undefined && typeof input.scan !== "boolean")) return Response.json({ error: "检查请求无效。" }, { status: 400, headers });
    const key = `${userId}:${input.scan === true ? "scan" : "health"}`;
    const now = Date.now();
    for (const [cacheKey, value] of inspections) if (value.expiresAt <= now) inspections.delete(cacheKey);
    let inspection = inspections.get(key);
    if (!inspection) {
      // Avoid retaining arbitrary owner identities if deployment policy changes.
      if (inspections.size >= 16) inspections.delete(inspections.keys().next().value!);
      const promise = (async (): Promise<StorageInspection> => {
        // Independent of any one client's disconnect, since concurrent requests share this result.
        const signal = AbortSignal.timeout(45_000);
        const health = await checkR2Health(signal);
        const [logical, usage] = await Promise.all([
          health.bucket ? readLogicalStorage(supabase, userId, health.bucket, signal) : Promise.resolve({ status: "unavailable" as const, records: 0, activeBytes: 0, archivedBytes: 0, pendingBytes: 0 }),
          input.scan ? inspectR2ObjectUsage(signal) : Promise.resolve(null),
        ]);
        return { checkedAt: new Date().toISOString(), health, logical, usage };
      })();
      inspection = { expiresAt: now + reuseMs, promise };
      inspections.set(key, inspection);
      void promise.catch(() => { if (inspections.get(key) === inspection) inspections.delete(key); });
    }
    const response = await inspection.promise;
    return Response.json(response, { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? Response.json({ error: "本次检测未完成，请稍后重试。" }, { status: 503, headers }); }
}
