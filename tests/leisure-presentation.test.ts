import { describe, expect, it } from "vitest";
import { emptyLeisureContext, formatLeisureDuration, hasLeisureMemory, matchesLeisureContext, ratingAvailability, selectLeisureChoices, sourceAvailability } from "@/features/leisure/presentation";
import type { LeisureExperience, LeisureRating, LeisureSource } from "@/features/leisure/types";
const now = Date.parse("2026-10-04T12:00:00Z");
const item: LeisureExperience = { id: "1", title: "Synthetic test", kind: "film", why: "Reason", body_markdown: "", how_to_start: null, duration_minutes: 90, platform: null, location: null, starts_at: null, cost_text: null, setting: "home", company: "either", budget: "free", sources: [], ratings: [], content_revision: 1, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", feedback: null };
const source: LeisureSource = { label: "Synthetic source", url: "https://example.com", kind: "official", verification: "verified", checked_at: "2026-10-01T00:00:00Z" };
const rating: LeisureRating = { platform: "Synthetic rating", value: "8.2", scale: "10", checked_at: "2026-10-01T00:00:00Z", source_url: source.url };
const ratingSource: LeisureSource = { ...source, kind: "rating" };
describe("leisure presentation", () => {
  it("does not invent feedback or personal memories", () => { expect(hasLeisureMemory(item)).toBe(false); expect(selectLeisureChoices([item], emptyLeisureContext)).toEqual([item]); });
  it("selects across media without AI scoring", () => { const entries = [item, { ...item, id: "2" }, { ...item, id: "3", kind: "game" as const }, { ...item, id: "4", kind: "book" as const }, { ...item, id: "5", kind: "music" as const }]; expect(selectLeisureChoices(entries, emptyLeisureContext).map((entry) => entry.id)).toEqual(["1", "3", "4", "5"]); });
  it("does not suggest rejected/completed experiences", () => { const feedback = { status: "completed" as const, reaction: "none" as const, personal_note: "", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: item.updated_at }; expect(selectLeisureChoices([{ ...item, feedback }], emptyLeisureContext)).toEqual([]); expect(selectLeisureChoices([{ ...item, feedback: { ...feedback, status: null, reaction: "not_for_me" } }], emptyLeisureContext)).toEqual([]); });
  it("requires evidence for context filters, leaving unknowns out", () => { expect(matchesLeisureContext(item, { ...emptyLeisureContext, minutes: "120", company: "solo" })).toBe(true); expect(matchesLeisureContext({ ...item, duration_minutes: null }, { ...emptyLeisureContext, minutes: "120" })).toBe(false); expect(matchesLeisureContext(item, { ...emptyLeisureContext, setting: "out" })).toBe(false); expect(matchesLeisureContext(item, { ...emptyLeisureContext, budget: "paid" })).toBe(false); });
  it("marks old and future source checks honestly", () => { expect(sourceAvailability(source, now)).toBe("verified"); expect(sourceAvailability({ ...source, checked_at: "2026-01-01T00:00:00Z" }, now)).toBe("stale"); expect(sourceAvailability({ ...source, checked_at: "2026-11-01T00:00:00Z" }, now)).toBe("unverified"); expect(sourceAvailability({ ...source, checked_at: null }, now)).toBe("unverified"); expect(sourceAvailability({ ...source, verification: "stale" }, now)).toBe("stale"); });
  it("checks the rating timestamp independently of a fresh source", () => {
    expect(ratingAvailability(rating, [ratingSource], now)).toBe("verified");
    expect(ratingAvailability({ ...rating, checked_at: "2026-01-01T00:00:00Z" }, [ratingSource], now)).toBe("stale");
    expect(ratingAvailability({ ...rating, checked_at: "2026-11-01T00:00:00Z" }, [ratingSource], now)).toBe("unverified");
    expect(ratingAvailability({ ...rating, checked_at: "invalid" }, [ratingSource], now)).toBe("unverified");
  });
  it("requires a matching verified rating source and fails closed on inconsistent source checks", () => {
    expect(ratingAvailability(rating, [], now)).toBe("unverified");
    expect(ratingAvailability(rating, [source], now)).toBe("unverified");
    expect(ratingAvailability(rating, [{ ...ratingSource, url: "https://example.com/other" }], now)).toBe("unverified");
    expect(ratingAvailability(rating, [{ ...ratingSource, verification: "unverified" }], now)).toBe("unverified");
    expect(ratingAvailability(rating, [{ ...ratingSource, verification: "stale" }], now)).toBe("stale");
    expect(ratingAvailability(rating, [{ ...ratingSource, checked_at: "2026-01-01T00:00:00Z" }], now)).toBe("stale");
    expect(ratingAvailability(rating, [{ ...ratingSource, checked_at: "2026-11-01T00:00:00Z" }], now)).toBe("unverified");
    expect(ratingAvailability(rating, [ratingSource, { ...ratingSource, verification: "unverified" }], now)).toBe("unverified");
  });
  it("formats duration without invented estimates", () => { expect(formatLeisureDuration(null)).toBeNull(); expect(formatLeisureDuration(25)).toBe("约 25 分钟"); expect(formatLeisureDuration(120)).toBe("约 2 小时"); expect(formatLeisureDuration(90)).toBe("约 1 小时 30 分钟"); });
});
