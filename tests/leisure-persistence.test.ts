import { describe, expect, it } from "vitest";
import {
  leisureContentSchema,
  leisureContentWriteSchema,
  leisureFeedbackInputSchema,
  leisureFeedbackSchema,
  leisureRatingSchema,
  leisureSourceSchema,
} from "@/features/leisure/schemas";

const id = "c0000000-0000-4000-8000-000000000001";
const content = {
  title: "A quiet afternoon", kind: "book", why: "An accessible first chapter", body_markdown: "## Start\nRead a chapter",
  how_to_start: null, duration_minutes: 30, platform: null, location: null, starts_at: null,
  cost_text: null, setting: "home", company: "solo", budget: "unknown", sources: [], ratings: [],
};
const feedback = { experience_id: id, expected_revision: 0, status: null, reaction: "liked", personal_note: "", linked_note_id: null };

describe("leisure persistence boundaries", () => {
  it("keeps a liked reaction independent of progress and allows explicit clearing", () => {
    expect(leisureFeedbackInputSchema.parse(feedback).status).toBeNull();
    expect(leisureFeedbackInputSchema.safeParse({ ...feedback, reaction: "none" }).success).toBe(true);
    for (const status of ["interested", "planned", "current", "completed"])
      expect(leisureFeedbackInputSchema.safeParse({ ...feedback, status }).success).toBe(true);
    expect(leisureFeedbackInputSchema.safeParse({ ...feedback, status: "saved" }).success).toBe(false);
  });

  it("rejects client identity and editorial keys from feedback", () => {
    for (const patch of [{ user_id: id }, { title: "Changed" }, { archived_at: new Date().toISOString() }])
      expect(leisureFeedbackInputSchema.safeParse({ ...feedback, ...patch }).success).toBe(false);
    expect(leisureFeedbackInputSchema.safeParse({ ...feedback, linked_note_id: "/notes/made-up" }).success).toBe(false);
  });

  it("requires a bounded revision and complete personal snapshot", () => {
    for (const expected_revision of [-1, 1.5, 2147483647, "1"])
      expect(leisureFeedbackInputSchema.safeParse({ ...feedback, expected_revision }).success).toBe(false);
    expect(leisureFeedbackInputSchema.safeParse({ ...feedback, personal_note: "x".repeat(10000) }).success).toBe(true);
    expect(leisureFeedbackInputSchema.safeParse({ ...feedback, personal_note: "x".repeat(10001) }).success).toBe(false);
    const partial: Record<string, unknown> = { ...feedback };
    delete partial.personal_note;
    expect(leisureFeedbackInputSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects all feedback and ownership fields in the editorial contract", () => {
    expect(leisureContentSchema.safeParse(content).success).toBe(true);
    for (const patch of [{ status: "interested" }, { reaction: "liked" }, { feedback }, { personal_note: "overwrite" }, { user_id: id }])
      expect(leisureContentSchema.safeParse({ ...content, ...patch }).success).toBe(false);
    expect(leisureContentWriteSchema.safeParse({ experience_id: id, expected_revision: 0, content }).success).toBe(true);
  });

  it("requires evidence for verified links and preserves original platform scores", () => {
    const source = { label: "Original page", url: "https://example.com/rating", kind: "rating", verification: "verified", checked_at: "2026-10-04T10:00:00Z" };
    const rating = { platform: "Original platform", value: "92%", scale: null, checked_at: source.checked_at, source_url: source.url };
    expect(leisureContentSchema.parse({ ...content, sources: [source], ratings: [rating] }).ratings[0].value).toBe("92%");
    expect(leisureContentSchema.safeParse({ ...content, ratings: [rating] }).success).toBe(false);
    expect(leisureRatingSchema.safeParse({ ...rating, value: 92 }).success).toBe(false);
    expect(leisureSourceSchema.safeParse({ ...source, checked_at: null }).success).toBe(false);
    expect(leisureSourceSchema.safeParse({ ...source, checked_at: null, verification: "unverified" }).success).toBe(true);
    expect(leisureSourceSchema.safeParse({ ...source, verification: "stale" }).success).toBe(true);
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "https://name:secret@example.com", "/local"])
      expect(leisureSourceSchema.safeParse({ ...source, url }).success).toBe(false);
  });

  it("projects feedback responses without returning private database metadata", () => {
    const result = leisureFeedbackSchema.parse({ ...feedback, revision: 1, updated_at: "2026-10-04T10:00:00Z", user_id: id, created_at: "private", archived_at: null });
    expect(result).not.toHaveProperty("user_id");
    expect(result).not.toHaveProperty("experience_id");
    expect(result.linked_note_title).toBeNull();
  });
});
