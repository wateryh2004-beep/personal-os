import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
  evidence: vi.fn(),
  sources: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: async () => ({
    userId: "81000000-0000-4000-8000-000000000001",
    supabase: { from: state.from, rpc: state.rpc },
  }),
}));
vi.mock("@/features/assistant/runtime", () => ({ runAssistant: vi.fn() }));
vi.mock("@/features/reviews/evidence", () => ({
  countReviewEvidence: vi.fn(),
  getReviewEvidence: state.evidence,
  reviewEvidenceSources: state.sources,
  serializeReviewEvidence: vi.fn(),
}));
vi.mock("@/features/reviews/periods", () => ({
  getReviewPeriod: () => ({ key: "daily:2026-10-27", startDate: "2026-10-27", endDate: "2026-10-27" }),
}));
vi.mock("@/features/reviews/formatting", () => ({
  humanizeReviewDraftSources: vi.fn(),
  parseJsonObject: vi.fn(),
  reviewStructuredDataToMarkdown: (data: { freeReflection: string }) => data.freeReflection,
}));
import { completeReview } from "@/features/reviews/actions";

const reviewId = "e1600000-0000-4000-8000-000000000001";
const input = {
  type: "daily",
  structuredData: { wins: [], friction: [], openLoops: [], changes: [], lessons: [], nextFocus: [], freeReflection: "Synthetic original reflection" },
  generatedWithAi: false,
  selectedSources: [],
  aiContextSources: [],
};

describe("actual completion Action uses only the atomic RPC boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.evidence.mockResolvedValue({});
    state.sources.mockReturnValue([]);
    state.rpc.mockResolvedValue({ data: { review_id: reviewId, source_count: 0, version_number: 1 }, error: null });
    state.from.mockImplementation((table: string) => {
      if (table !== "profiles") throw new Error("Independent audit or business write attempted outside the RPC");
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "Asia/Shanghai" } }) }) }) };
    });
  });

  it.each([1, 2])("returns version %i after one RPC without a second audit insert", async (version) => {
    state.rpc.mockResolvedValue({ data: { review_id: reviewId, source_count: 0, version_number: version }, error: null });
    await expect(completeReview(input)).resolves.toEqual({ reviewId, sourceCount: 0, versionNumber: version });
    expect(state.rpc).toHaveBeenCalledTimes(1);
    expect(state.rpc).toHaveBeenCalledWith("complete_review_with_sources", expect.objectContaining({ p_review_key: "daily:2026-10-27", p_content_markdown: input.structuredData.freeReflection, p_generated_with_ai: false, p_sources: [] }));
    expect(state.from.mock.calls.map(([table]) => table)).toEqual(["profiles"]);
    expect(state.revalidate.mock.calls.map(([path]) => path)).toEqual(["/reviews", "/reviews/daily", `/reviews/${reviewId}`]);
  });

  it("propagates an audit failure from the atomic RPC without reporting success or refreshing", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "synthetic_compat_completion_audit_failure" } });
    await expect(completeReview(input)).rejects.toThrow("无法原子保存复盘、来源与版本快照");
    expect(state.revalidate).not.toHaveBeenCalled();
    expect(state.from.mock.calls.map(([table]) => table)).toEqual(["profiles"]);
  });

  it("rejects a malformed receipt rather than inventing a successful completion", async () => {
    state.rpc.mockResolvedValue({ data: { source_count: 0 }, error: null });
    await expect(completeReview(input)).rejects.toThrow("无法原子保存复盘、来源与版本快照");
    expect(state.revalidate).not.toHaveBeenCalled();
  });

  it("retains source visibility validation before the RPC", async () => {
    await expect(completeReview({ ...input, selectedSources: [{ sourceType: "note", sourceId: "e1600000-0000-4000-8000-000000000002" }] })).rejects.toThrow("部分选中来源已不在当前可见周期内");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.revalidate).not.toHaveBeenCalled();
  });
});
