import { describe, expect, it } from "vitest";
import { resolveCalendarEventVisual } from "@/features/calendar/categories/visual";
import { createCalendarEventSchema, updateCalendarEventSchema } from "@/features/calendar/schemas";
import { calendarUpdatePayload, resolveCalendarCategories } from "@/features/calendar/utils";
import type { CalendarCategory } from "@/features/calendar/categories/types";

const base = { subject: "华夏基金实习", description: "", startsAt: "2026-08-10T00:30:00.000Z", endsAt: "2026-08-10T09:00:00.000Z", locationName: "北辰中心", isAllDay: false };
const categories: CalendarCategory[] = [{ id: "1", provider_category_id: "provider-1", display_name: "领域·实习/工作", color: "preset7", managed_key: "work_internship", category_kind: "primary", ai_description: null, keywords: [], display_order: 1, is_ai_managed: true, ai_enabled: true, last_synced_at: "2026-08-09T00:00:00Z" }];

describe("calendar category behavior", () => {
  it("combines one primary domain with matching long-lived contexts", () => {
    const parsed = createCalendarEventSchema.parse(base);
    expect(resolveCalendarCategories(parsed)).toEqual(["领域·实习/工作", "场景·华夏基金"]);
  });

  it("does not auto-apply a low confidence guess", () => {
    const parsed = createCalendarEventSchema.parse({ ...base, subject: "聊一下", locationName: "" });
    expect(resolveCalendarCategories(parsed)).toEqual([]);
  });

  it("preserves all Outlook categories when an update does not explicitly change them", () => {
    const parsed = updateCalendarEventSchema.parse({ subject: base.subject, startsAt: base.startsAt, endsAt: base.endsAt, providerEventId: "event-1", originalSubject: base.subject, originalStartsAt: base.startsAt, originalEndsAt: base.endsAt, preserveCategories: true });
    expect(calendarUpdatePayload(parsed, { categories: ["领域·实习/工作", "External Client"], body_text: "保留说明", location_name: "保留地点", is_all_day: true, importance: "high", show_as: "busy" })).toMatchObject({ categories: undefined, description: "保留说明", locationName: "保留地点", isAllDay: true, importance: "high", showAs: "busy" });
  });

  it("replaces only managed categories and keeps external Outlook categories", () => {
    const parsed = updateCalendarEventSchema.parse({ ...base, providerEventId: "event-1", originalSubject: base.subject, originalStartsAt: base.startsAt, originalEndsAt: base.endsAt, preserveCategories: false, classificationMode: "manual", primaryCategoryKey: "life", contextCategoryKeys: [] });
    expect(calendarUpdatePayload(parsed, { categories: ["领域·实习/工作", "External Client"], importance: "normal", show_as: "busy" }).categories).toEqual(["领域·生活/事务", "External Client"]);
  });

  it("maps a synced Outlook category to semantic event colors and falls back neutrally", () => {
    expect(resolveCalendarEventVisual(["领域·实习/工作"], categories)).toMatchObject({ border: "#47758f", primaryCategory: categories[0] });
    expect(resolveCalendarEventVisual(["Unknown"], categories)).toMatchObject({ border: "#a1a1aa", primaryCategory: null });
  });

  it("renders synced external Outlook categories with their real preset color", () => {
    const external: CalendarCategory = { ...categories[0], id: "external-1", display_name: "重要客户", color: "preset22", managed_key: null, category_kind: "external", is_ai_managed: false };
    expect(resolveCalendarEventVisual(["重要客户"], [external])).toMatchObject({ border: "#82415c", primaryCategory: external });
  });

  it("falls back to taxonomy colors when the synced category table is empty", () => {
    expect(resolveCalendarEventVisual(["领域·实习/工作"], [])).toMatchObject({ border: "#47758f", dot: "#365f78", primaryCategory: null });
    expect(resolveCalendarEventVisual(["场景·人大"], [])).toMatchObject({ dot: "#6b4f8a" });
  });
});
