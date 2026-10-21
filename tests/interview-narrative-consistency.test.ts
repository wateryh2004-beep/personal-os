import { describe, expect, it } from "vitest";
import {
  evaluateNarrativeConsistency,
  preferredSpokenVersion,
  type NarrativeAnswer,
  type NarrativeBaseline,
  type NarrativeLink,
} from "../src/features/interview/narrative-consistency";

const master: NarrativeBaseline = {
  id: "n1", title: "通用自我介绍", master_preparation_id: "general",
  selected_version_id: "master-v1", review_status: "draft",
};
const base: NarrativeAnswer = {
  id: "target-v1", preparation_id: "target", language: "zh", answer_mode: "spoken",
  target_seconds: 90, status: "draft", source: "ai_edited", version_number: 1,
  created_at: "2026-10-21T00:00:00Z", updated_at: "2026-10-21T00:00:00Z",
};
const link: NarrativeLink = {
  id: "link-1", narrative_id: "n1", answer_version_id: "target-v1",
  based_on_version_id: "master-v1", review_state: "unreviewed",
};

function audit(options: {
  narratives?: NarrativeBaseline[];
  answers?: NarrativeAnswer[];
  links?: NarrativeLink[];
  factLinks?: Array<{ answer_version_id: string; fact_id: string; fact_version_id: string; review_state: "unreviewed" | "reviewed" }>;
  factVersions?: Array<{ id: string; fact_id: string; version_number: number }>;
  facts?: Array<{ id: string; verification_status: string }>;
} = {}) {
  return evaluateNarrativeConsistency({
    narratives: options.narratives ?? [master],
    preparations: [
      { id: "general", question_id: "q", context_id: null, target_language: "zh", target_title: "通用" },
      { id: "target", question_id: "q", context_id: "c", target_language: "zh", target_title: "渣打" },
    ],
    answers: options.answers ?? [base],
    narrativeLinks: options.links ?? [link],
    factLinks: options.factLinks ?? [],
    factVersions: options.factVersions ?? [],
    facts: options.facts ?? [],
  });
}

describe("version-pinned interview narrative consistency", () => {
  it("shows the old cited version without promoting or rewriting a draft", () => {
    const result = audit();
    expect(result.summary.total).toBe(1);
    expect(result.summary.stale).toBe(0);
    expect(result.summary.needsReview).toBe(1);
    expect(result.rows[0].findings.map(f => f.code)).toContain("lineage_unreviewed");
    expect(result.rows[0].findings.map(f => f.code)).toContain("fact_missing");
  });

  it("flags version drift when a different baseline is selected", () => {
    const result = audit({ narratives: [{ ...master, selected_version_id: "master-v2" }] });
    expect(result.summary.stale).toBe(1);
    expect(result.rows[0].findings.map(f => f.code)).toContain("baseline_changed");
  });

  it("does not silently repair a missing version citation", () => {
    const result = audit({ links: [] });
    expect(result.summary.needsLink).toBe(1);
    expect(result.rows[0].findings.map(f => f.code)).toContain("unlinked");
  });

  it("treats a missing spoken answer as absent instead of a blank confirmed answer", () => {
    const result = audit({ answers: [], links: [] });
    expect(result.rows[0].answer).toBeNull();
    expect(result.rows[0].findings.map(f => f.code)).toContain("no_spoken");
  });

  it("does not claim a factual contradiction when no supporting facts have been linked", () => {
    const result = audit({ links: [{ ...link, review_state: "reviewed" }] });
    expect(result.rows[0].state).toBe("linked");
    expect(result.rows[0].findings.map(f => f.code)).toEqual(["fact_missing"]);
  });

  it("detects changes to pinned fact versions and distinguishes verification", () => {
    const result = audit({
      links: [{ ...link, review_state: "reviewed" }],
      factLinks: [{ answer_version_id: base.id, fact_id: "f", fact_version_id: "fv1", review_state: "reviewed" }],
      facts: [{ id: "f", verification_status: "document_verified" }],
      factVersions: [{ id: "fv1", fact_id: "f", version_number: 1 }, { id: "fv2", fact_id: "f", version_number: 2 }],
    });
    expect(result.summary.stale).toBe(1);
    expect(result.rows[0].findings.map(f => f.code)).toContain("fact_version_changed");
  });

  it("allows structural all-clear only for reviewed links with current verified fact versions", () => {
    const result = audit({
      links: [{ ...link, review_state: "reviewed" }],
      factLinks: [{ answer_version_id: base.id, fact_id: "f", fact_version_id: "fv2", review_state: "reviewed" }],
      facts: [{ id: "f", verification_status: "self_confirmed" }],
      factVersions: [{ id: "fv2", fact_id: "f", version_number: 2 }],
    });
    expect(result.summary.linked).toBe(1);
    expect(result.rows[0].findings).toEqual([]);
  });

  it("prefers adopted answers over newer drafts for the same spoken language", () => {
    const newer = { ...base, id: "draft-v2", version_number: 2, updated_at: "2026-10-21T02:00:00Z" };
    const current = { ...base, id: "adopted-v1", status: "current" };
    expect(preferredSpokenVersion([newer, current], "zh")?.id).toBe("adopted-v1");
  });

  it("never counts general self-introduction as a target to review", () => {
    const result = audit();
    expect(result.summary.total).toBe(1);
  });
});
