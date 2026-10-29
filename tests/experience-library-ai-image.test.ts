import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ docs: [] as Record<string, unknown>[], captures: [] as Record<string, unknown>[], children: [] as { id: string }[], analyze: vi.fn(), complete: vi.fn(), missingSave: false, writes: [] as string[], filters: [] as [string, unknown][] }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwnerApi: async () => ({ userId: "11111111-1111-4111-8111-111111111111", supabase: { from: (table: string) => builder(table) } }), apiAuthenticationFailure: () => null }));
vi.mock("@/lib/adapters/experience-library-ai", () => ({ getExperienceAiConfiguration: async () => ({ provider: "deepseek", modelId: "synthetic", apiKey: "synthetic" }), analyzeExperienceText: state.analyze }));
vi.mock("@/features/ai/governance", () => ({ getAiGovernance: async () => ({ maxContextCharsPerRequest: 3000, maxOutputTokensPerRequest: 1000 }), assertAiBudget: async () => ({ allowed: true }), auditAiRequest: async () => "audit", completeAiRequestWithUsage: state.complete }));
function builder(table: string) {
  const row = table === "experience_library_entries" ? { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "合成", tags: [] } : null;
  const data = table === "experience_library_entries" ? state.children : table === "experience_library_captures" ? state.captures : table === "experience_library_media" ? [{ id: "media", document_id: "doc", position: 0 }] : table === "documents" ? state.docs : [];
  let updating = false;
  const b = { select: () => b, eq: (key: string, value: unknown) => { if (table === "documents") state.filters.push([key, value]); return b; }, is: () => b, in: () => b, order: () => b, update: (value: { ai_status?: string }) => { updating = true; if (value.ai_status) state.writes.push(value.ai_status); return b; },
    maybeSingle: async () => ({ data: updating && state.missingSave ? null : row, error: null }), then: (resolve: (value: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve) };
  return b;
}
import { POST } from "@/app/api/experience-library/analyze/route";
const request = () => new Request("https://example.test/api/experience-library/analyze", { method: "POST", headers: { Origin: "https://example.test", "Content-Type": "application/json" }, body: JSON.stringify({ entryId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }) });
beforeEach(() => { state.docs = []; state.captures = []; state.children = []; state.filters = []; state.analyze.mockReset(); state.complete.mockReset().mockResolvedValue(true); state.writes = []; state.missingSave = false; });
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

it("keeps a saved result when recording usage is temporarily unavailable", async () => {
  state.docs = [{ id: "doc", extracted_text: "在图里写了岗位信息", text_extraction_method: "ocr_local", text_extraction_source_sha256: "a".repeat(64) }];
  state.analyze.mockResolvedValue({ analysis: { summary: "合成摘要", tags: [], keyPoints: [] }, inputTokens: 1, outputTokens: 1 });
  state.complete.mockRejectedValueOnce(new Error("network"));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).auditIncomplete).toBe(true);
  expect(state.writes).toEqual(["completed"]);
});

it("does not report success when the target record no longer accepts the update", async () => {
  state.docs = [{ id: "doc", extracted_text: "在图里写了岗位信息", text_extraction_method: "ocr_local", text_extraction_source_sha256: "a".repeat(64) }];
  state.analyze.mockResolvedValue({ analysis: { summary: "合成摘要", tags: [], keyPoints: [] }, inputTokens: 1, outputTokens: 1 });
  state.missingSave = true;
  const response = await POST(request());
  expect(response.status).toBe(502);
  expect(state.complete).toHaveBeenCalledWith("audit", "failed", {}, "experience_ai_failed", expect.any(Object));
});

it("includes merged originals in AI context and keeps their exact citation", async () => {
  state.children = [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" }];
  state.captures = [{ id: "child-capture", capture_type: "comment", raw_content: "子记录中有独有的建议" }];
  state.docs = [];
  state.analyze.mockResolvedValue({ analysis: { summary: "合成摘要", tags: [], keyPoints: [{ text: "独有建议", kind: "opinion", sourceIndex: 1, sourceQuote: "独有的建议" }] }, inputTokens: 1, outputTokens: 1 });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(state.analyze.mock.calls[0][0].text).toContain("子记录中有独有的建议");
  expect((await response.json()).keyPoints[0]).toMatchObject({ sourceCaptureId: "child-capture", sourceQuote: "独有的建议" });
});
