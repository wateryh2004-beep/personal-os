import { revalidatePath } from "next/cache";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { contentReadSchema, readContent } from "@/features/content/queries";
import { ContentWriteError, writeContent } from "@/lib/adapters/content/supabase-content";
import { hasSameOrigin } from "@/lib/auth/same-origin";
import { env } from "@/lib/env";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
const maximumBodyBytes = 1_000_000;

/** Cookie/session boundary only. No tokens, API keys or CORS grants are minted
 * here. An external runner needs an already authorized owner session adapter. */
export async function GET(request: Request) {
  try {
    const parsed = contentReadSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return json({ error: "invalid_input" }, 400);
    const owner = await requireOwnerApi();
    const result = await readContent(owner, parsed.data);
    return result ? json(result) : json({ error: "not_found" }, 404);
  } catch (error) {
    return apiAuthenticationFailure(error) ?? json({ error: "read_unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  try {
    // Session cookies alone are not CSRF protection. Reject absent, opaque,
    // cross-origin, and cross-site requests before any database work.
    if (!hasSameOrigin(request, env.appUrl)) return json({ error: "forbidden" }, 403);
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return json({ error: "invalid_content_type" }, 415);
    const owner = await requireOwnerApi();
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > maximumBodyBytes) return json({ error: "payload_too_large" }, 413);
    // Enforce an actual streaming byte limit; Content-Length is not trusted.
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "invalid_input" }, 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBodyBytes) {
        await reader.cancel();
        return json({ error: "payload_too_large" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    let input: unknown;
    try { input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { return json({ error: "invalid_input" }, 400); }
    const result = await writeContent(owner.supabase, input);
    // The transaction has already committed. Cache invalidation must never
    // turn an acknowledged write into an ambiguous retryable failure.
    try {
      revalidatePath("/notes");
      revalidatePath("/career");
      revalidatePath("/career/materials");
      revalidatePath("/career/interview");
      revalidatePath(result.href.split("?")[0]);
    } catch { /* A repeated operationId still returns the original receipt. */ }
    return json(result);
  } catch (error) {
    const auth = apiAuthenticationFailure(error);
    if (auth) return auth;
    if (error instanceof ContentWriteError) {
      const status = error.code === "invalid_input" ? 400 : error.code === "forbidden" ? 403
        : error.code === "not_found" ? 404 : ["conflict", "idempotency_conflict"].includes(error.code) ? 409 : 503;
      return json({ error: error.code }, status);
    }
    return json({ error: "write_unavailable" }, 503);
  }
}
