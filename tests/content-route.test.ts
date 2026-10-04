import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/content/route";
import { OwnerAuthenticationError, requireOwnerApi } from "@/lib/auth/require-owner";
import { readContent } from "@/features/content/queries";
import { ContentWriteError, writeContent } from "@/lib/adapters/content/supabase-content";
import { revalidatePath } from "next/cache";

vi.mock("@/lib/auth/require-owner", async (original) => ({ ...await original<typeof import("@/lib/auth/require-owner")>(), requireOwnerApi: vi.fn() }));
vi.mock("@/features/content/queries", async (original) => ({ ...await original<typeof import("@/features/content/queries")>(), readContent: vi.fn() }));
vi.mock("@/lib/adapters/content/supabase-content", async (original) => ({ ...await original<typeof import("@/lib/adapters/content/supabase-content")>(), writeContent: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const base = "https://personal-os.example.test";
const id = "10000000-0000-4000-8000-000000000001";
const result = { operationId: id, entityType: "note" as const, entityId: id, revision: 1, updatedAt: "2026-10-04T00:00:00Z", href: `/notes/${id}/read`, replayed: false };
const post = (body = "{}", extra: Record<string, string> = {}) => new Request(`${base}/api/content`, { method: "POST", headers: { Origin: base, "Content-Type": "application/json", ...extra }, body });

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireOwnerApi).mockResolvedValue({ supabase: {} as never, userId: id, email: "owner@example.test" });
  vi.mocked(writeContent).mockResolvedValue(result);
});

describe("content HTTP boundary", () => {
  it.each(["unauthenticated", "not-authorized"] as const)("rejects %s for both operations", async (code) => {
    vi.mocked(requireOwnerApi).mockRejectedValue(new OwnerAuthenticationError(code));
    expect((await GET(new Request(`${base}/api/content?action=find&kind=note&q=test`))).status).toBe(code === "unauthenticated" ? 401 : 403);
    const response = await POST(post());
    expect(response.status).toBe(code === "unauthenticated" ? 401 : 403);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(writeContent).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{}, { Origin: "null" }, { Origin: "https://attacker.example" }, { Origin: base, "Sec-Fetch-Site": "cross-site" }])("rejects absent/opaque/cross-site origins", async (unsafeHeaders) => {
    const response = await POST(new Request(`${base}/api/content`, { method: "POST", headers: { "Content-Type": "application/json", ...unsafeHeaders }, body: "{}" }));
    expect(response.status).toBe(403);
    expect(requireOwnerApi).not.toHaveBeenCalled();
    expect(writeContent).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and actual oversized bodies without trusting declared length", async () => {
    expect((await POST(post("{"))).status).toBe(400);
    expect((await POST(post("x".repeat(1_000_001), { "Content-Length": "2" }))).status).toBe(413);
    expect((await POST(post("{}", { "Content-Type": "text/plain" }))).status).toBe(415);
    expect(writeContent).not.toHaveBeenCalled();
  });
  it.each([["invalid_input", 400], ["conflict", 409], ["idempotency_conflict", 409], ["migration_required", 503], ["forbidden", 403], ["not_found", 404]] as const)("maps %s without leaking internals", async (code, status) => {
    vi.mocked(writeContent).mockRejectedValue(new ContentWriteError(code));
    const response = await POST(post());
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
  });
  it("returns the committed receipt even if cache invalidation fails", async () => {
    vi.mocked(revalidatePath).mockImplementation(() => { throw new Error("unavailable"); });
    const response = await POST(post('{"operation":"note.create"}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(writeContent).toHaveBeenCalledExactlyOnceWith({}, { operation: "note.create" });
  });
  it("rejects owner spoofing in read parameters and hides unknown IDs", async () => {
    expect((await GET(new Request(`${base}/api/content?action=find&kind=note&q=x&user_id=${id}`))).status).toBe(400);
    vi.mocked(readContent).mockResolvedValue(null);
    const response = await GET(new Request(`${base}/api/content?action=read&kind=note&id=${id}`));
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
