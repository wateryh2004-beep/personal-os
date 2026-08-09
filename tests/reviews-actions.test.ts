import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  completeReviewSchema,
  reviewProposalSchema,
} from "@/features/reviews/schemas";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260809094617_reviews_intelligence_loop.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Review completion and proposal actions", () => {
  it("validates source ownership before inserting the snapshot", () => {
    expect(migration).toContain("review_source_is_owned");
    expect(migration).toContain("invalid or unowned review source");
    expect(migration).toContain("source_role in ('context', 'cited')");
  });

  it("records actual source count, AI flag, and an appended version", () => {
    expect(migration).toContain("p_generated_with_ai");
    expect(migration).toContain("select count(*) into v_source_count");
    expect(migration).toContain("coalesce(max(version_number), 0) + 1");
    expect(migration).toContain("insert into public.review_versions");
    expect(
      completeReviewSchema.safeParse({
        type: "daily",
        structuredData: {
          wins: ["完成一项工作"],
          friction: [],
          openLoops: [],
          changes: [],
          lessons: [],
          nextFocus: [],
          freeReflection: "",
        },
        generatedWithAi: true,
      }).success,
    ).toBe(true);
  });

  it("keeps proposals pending until an explicit resolver runs", () => {
    expect(migration).toContain("v_proposal.status <> 'pending'");
    expect(migration).toContain("proposal already resolved");
    expect(migration).toContain("set status = 'accepted'");
    expect(migration).toContain("set status = 'dismissed'");
  });

  it("requires bounded working memory and an existing decision id", () => {
    const base = {
      title: "当前重点",
      content: "完成复盘闭环",
      rationale: "本周证据支持",
      evidenceSourceIds: ["00000000-0000-4000-8000-000000000001"],
    };
    expect(reviewProposalSchema.safeParse({ ...base, type: "working_memory" }).success).toBe(false);
    expect(reviewProposalSchema.safeParse({ ...base, type: "decision_keep" }).success).toBe(false);
  });

  it("rejects a second accept through the locked pending-state guard", () => {
    expect(migration).toContain("for update");
    expect(migration.match(/proposal already resolved/g)).toHaveLength(1);
  });
});
