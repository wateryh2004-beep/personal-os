import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[], analyze: vi.fn(), filters: [] as [string, unknown][] }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: async () => ({ userId: "11111111-1111-4111-8111-111111111111", supabase: { from: (table: string) => builder(table) } }), apiAuthenticationFailure: () => null }));
vi.mock("@/lib/adapters/experience-library-ai", () => ({ getExperienceAiConfiguration: async () => ({ provider: "deepseek", modelId: "synthetic", apiKey: "synthetic" }), analyzeExperienceText: state.analyze }));
vi.mock("@/features/ai/governance", () => ({ getAiGovernance: async () => ({ maxContextCharsPerRequest: 3000, maxOutputTokensPerRequest: 1000 }), assertAiBudget: async () => ({ allowed: true }), auditAiRequest: async () => "audit", completeAiRequestWithUsage: async () => {} }));
function builder(table: string) {
  const row = table === "experience_library_entries" ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "合成", tags: [] } : null;
  const data = table === "experience_library_captures" ? [] : table === "experience_library_media" ? [{ id: "media", document_id: "doc", position: 0 }] : table === "documents" ? state.docs : [];
  const b = { select: () => b, eq: (key: string, value: unknown) => { if (table === "documents") state.filters.push([key, value]); return b; }, is: () => b, in: () => b, order: () => b, update: () => b,
    maybeSingle: async () => ({ data: row, error: null }), then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve) };
  return b;
}
import { POST } from "@/app/api/experience-library/analyze/route";
const request = () => new Request("https://example.test/api/experience-library/analyze", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify({ entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
beforeEach(() => { state.docs = []; state.filters = []; state.analyze.mockReset(); });
describe("image evidence and AI visibility", () => {
  it("never sends image text when no document has normal AI visibility", async () => {
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(state.filters).toContainEqual(["ai_visibility", "normal"]);
    expect(state.analyze).not.toHaveBeenCalled();
  });
  it("links a verified quotation to the image when its text is explicitly allowed", async () => {
    state.docs = [{ id: "doc", extracted_text: "在图里写了岗位信息", text_extraction_method: "ocr_local", text_extraction_source_sha256: "a".repeat(64) }];
    state.analyze.mockResolvedValue({ analysis: { summary: "合成摘要", tags: [], keyPoints: [{ text: "岗位信息", kind: "reported", sourceIndex: 1, sourceQuote: "在图里" }] }, inputTokens: 1, outputTokens: 1 });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).keyPoints[0]).toMatchObject({ sourceMediaId: "media", sourceCaptureId: null, sourceQuote: "在图里" });
  });
});
