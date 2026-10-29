import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: async () => ({
    userId: "11111111-1111-4111-8111-111111111111",
    supabase: { rpc: state.rpc, from: state.from },
  }),
}));

import { getExperienceLibraryWorkspace } from "@/features/experience-library/queries";

beforeEach(() => {
  state.rpc.mockReset().mockResolvedValue({
    data: [{
      id: "22222222-2222-4222-8222-222222222222",
      source_url: "https://example.test/post",
      title: "Synthetic interview note",
      tags: ["interview"],
      ai_summary: null,
      ai_status: "not_requested",
      ai_error_code: null,
      ai_provider: null,
      ai_model: null,
      ai_analyzed_at: null,
      updated_at: "2026-10-28T00:00:00Z",
      created_at: "2026-10-28T00:00:00Z",
      capture_count: 2,
      media_count: 1,
    }],
    error: null,
  });
  state.from.mockImplementation(() => {
    const builder = {
      select() { return builder; },
      is() { return builder; },
      eq() { return builder; },
      in() { return builder; },
      limit() { return builder; },
      order() { return builder; },
      range() { return Promise.resolve({ data: [], error: null }); },
      then(resolve: (value: unknown) => unknown) {
        return Promise.resolve({ count: 3, error: null }).then(resolve);
      },
    };
    return builder;
  });
});

describe("Experience Library workspace query", () => {
  it("uses the owner-scoped database search instead of silently filtering a fixed local page", async () => {
    const query = `  ${"留".repeat(140)}  `;
    const result = await getExperienceLibraryWorkspace(query);
    expect(state.rpc).toHaveBeenCalledOnce();
    expect(state.rpc).toHaveBeenCalledWith("search_experience_library_v3", {
      p_query: "留".repeat(120), p_tag: "", p_status: "", p_has_media: false, p_analyzed: false, p_sort: "updated", p_offset: 0,
    });
    expect(result).toMatchObject({
      available: true,
      total: 3,
      captureTotal: 3,
      mediaTotal: 3,
      entries: [{
        title: "Synthetic interview note",
        captureCount: 2,
        mediaCount: 1,
        aiStatus: "not_requested",
      }],
    });
  });
});

it("keeps the capture workspace usable when only reading-document counts are unavailable", async () => {
  state.from.mockImplementation((table: string) => {
    const builder = { select: () => builder, is: () => builder, eq: () => builder, in: () => builder, order: () => builder,
      range: async () => ({ data: [], error: null }),
      then: (resolve: (result: unknown) => unknown) => Promise.resolve(table === "experience_library_reading_documents" ? { data: null, error: { message: "temporary" } } : { count: 3, error: null }).then(resolve) };
    return builder;
  });
  const result = await getExperienceLibraryWorkspace("");
  expect(result.available).toBe(true);
  expect(result.readingUnavailable).toBe(true);
  expect(result.entries).toHaveLength(1);
});
