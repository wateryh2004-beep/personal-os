import { expect, it, vi } from "vitest";
import { complianceDb } from "./helpers/compliance-db";
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: vi.fn() }));
vi.mock("@/features/search/queries", () => ({ searchPersonalOs: vi.fn() }));
vi.mock("@/features/context/planner", () => ({ buildFallbackContextPlan: () => ({ intent: "knowledge", recipe: "factual_lookup", includeWorkingMemory: false, includeTimeContext: false, includeRecentHistory: false, recentNotes: { enabled: false }, retrievalOrder: [], queryConcepts: [], expandGraph: false, searchQueries: [{ query: "synthetic", domains: ["career"] }] }) }));
vi.mock("@/features/ai/governance", async importOriginal => {
  const original = await importOriginal<typeof import("@/features/ai/governance")>();
  return { ...original, getAiGovernance: async () => original.defaultAiGovernance };
});
import { requireOwner } from "@/lib/auth/require-owner";
import { searchPersonalOs } from "@/features/search/queries";
import { buildPersonalContext } from "@/features/context/engine";

it("keeps two independent sources of more than 64 characters when the character budget permits", async () => {
  const { supabase } = complianceDb({});
  vi.mocked(requireOwner).mockResolvedValue({ supabase, userId: "00000000-0000-4000-8000-000000000001", email: "synthetic@example.test" });
  vi.mocked(searchPersonalOs).mockResolvedValue([1,2].map(n => ({ id: `result-${n}`, metadata: {}, entityId: `10000000-0000-4000-8000-00000000000${n}`, entityType: "experience", domain: "career", title: `Synthetic ${n}`, snippet: "x".repeat(200), subtitle: "", href: "/career", score: 1, sourceUpdatedAt: null })));
  const pack = await buildPersonalContext({ message: "synthetic", surface: "global" });
  expect(pack.sources).toHaveLength(2);
  expect(pack.diagnostics).toMatchObject({ candidateCount: 2, totalChars: 400, truncated: false });
});
