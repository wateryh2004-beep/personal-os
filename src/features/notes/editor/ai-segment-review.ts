import { diffLines } from "diff";

/**
 * Stage line/paragraph-level AI changes without mutating CodeMirror.
 * Every hunk is anchored to an exact range in the original Markdown. Equal
 * source bytes are copied verbatim during final assembly.
 */
export type AiReviewDecision = "pending" | "accept" | "reject";
export type AiReviewHunk = {
  id: string;
  from: number;
  to: number;
  line: number;
  original: string;
  suggested: string;
  decision: AiReviewDecision;
};
export type AiSegmentReview = { source: string; hunks: AiReviewHunk[] };
export const AI_REVIEW_MAX_CHARS = 60_000;
export const AI_REVIEW_MAX_HUNKS = 80;

/** null means the diff is too large, invalid or costly for granular review. */
export function buildAiSegmentReview(source: string, suggested: string): AiSegmentReview | null {
  if (source.length + suggested.length > AI_REVIEW_MAX_CHARS) return null;
  const changes = diffLines(source, suggested);
  const hunks: AiReviewHunk[] = [];
  let originalOffset = 0;
  let suggestedOffset = 0;
  let active: { from: number; original: string; suggested: string } | null = null;
  const flush = () => {
    if (!active) return;
    const value = active;
    if (source.slice(value.from, value.from + value.original.length) !== value.original) {
      throw new Error("ai_review_invalid_source");
    }
    hunks.push({
      id: `part-${hunks.length + 1}`,
      from: value.from,
      to: value.from + value.original.length,
      line: source.slice(0, value.from).split("\n").length,
      original: value.original,
      suggested: value.suggested,
      decision: "pending",
    });
    active = null;
  };
  try {
    for (const change of changes) {
      if (!change.added && !change.removed) {
        flush();
        if (source.slice(originalOffset, originalOffset + change.value.length) !== change.value ||
            suggested.slice(suggestedOffset, suggestedOffset + change.value.length) !== change.value)
          return null;
        originalOffset += change.value.length;
        suggestedOffset += change.value.length;
        continue;
      }
      active ??= { from: originalOffset, original: "", suggested: "" };
      if (change.removed) {
        if (source.slice(originalOffset, originalOffset + change.value.length) !== change.value) return null;
        active.original += change.value;
        originalOffset += change.value.length;
      } else if (change.added) {
        if (suggested.slice(suggestedOffset, suggestedOffset + change.value.length) !== change.value) return null;
        active.suggested += change.value;
        suggestedOffset += change.value.length;
      }
      if (hunks.length > AI_REVIEW_MAX_HUNKS) return null;
    }
    flush();
  } catch {
    return null;
  }
  if (hunks.length > AI_REVIEW_MAX_HUNKS ||
      originalOffset !== source.length || suggestedOffset !== suggested.length) return null;
  // Identical input/output is valid; the UI can explain there are no changes.
  return { source, hunks };
}

export function chooseAiReviewHunk(plan: AiSegmentReview, id: string, decision: AiReviewDecision): AiSegmentReview {
  return { ...plan, hunks: plan.hunks.map(hunk => hunk.id === id ? { ...hunk, decision } : hunk) };
}
export function chooseAllAiReviewHunks(plan: AiSegmentReview, decision: Exclude<AiReviewDecision, "pending">): AiSegmentReview {
  return { ...plan, hunks: plan.hunks.map(hunk => ({ ...hunk, decision })) };
}
export function reviseAiReviewHunk(plan: AiSegmentReview, id: string, next: string): AiSegmentReview {
  return { ...plan, hunks: plan.hunks.map(hunk => {
    if (hunk.id !== id) return hunk;
    // Model output is trimmed by the API; preserve the original hunk's trailing
    // line boundary so subsequent paragraphs cannot accidentally concatenate.
    const suffix = hunk.suggested.match(/\n+$/)?.[0] ?? "";
    const suggested = next.trimEnd() + suffix;
    return { ...hunk, suggested, decision: "pending" as const };
  }) };
}

export function countAiReviewDecisions(plan: AiSegmentReview) {
  const accepted = plan.hunks.filter(hunk => hunk.decision === "accept").length;
  const rejected = plan.hunks.filter(hunk => hunk.decision === "reject").length;
  return { accepted, rejected, pending: plan.hunks.length - accepted - rejected };
}

/** Caller must require all decisions and the existing server-side CAS checkpoint. */
export function assembleAiSegmentReview(plan: AiSegmentReview): string {
  if (countAiReviewDecisions(plan).pending) throw new Error("ai_review_pending_decisions");
  let cursor = 0;
  let assembled = "";
  for (const hunk of plan.hunks) {
    if (hunk.from < cursor || hunk.to < hunk.from ||
        plan.source.slice(hunk.from, hunk.to) !== hunk.original)
      throw new Error("ai_review_source_mismatch");
    assembled += plan.source.slice(cursor, hunk.from);
    assembled += hunk.decision === "accept" ? hunk.suggested : hunk.original;
    cursor = hunk.to;
  }
  return assembled + plan.source.slice(cursor);
}
