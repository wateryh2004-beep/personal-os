import { describe, expect, it } from "vitest";
import { graphEventRecord, microsoftCalendarConfiguration, microsoftScopeVersionForGrantedScopes, requiresCategoryReauthorization } from "@/lib/adapters/microsoft-graph/calendar";
import { calendarEventForGraph, graphTimeZone } from "@/lib/adapters/microsoft-graph/event-payload";

describe("Microsoft Graph calendar category integration", () => {
  it("requests the explicit mailbox settings permission and versions the consent", () => {
    expect(microsoftCalendarConfiguration.scopes).toContain("MailboxSettings.ReadWrite");
    expect(microsoftCalendarConfiguration.scopeVersion).toBeGreaterThanOrEqual(2);
    expect(microsoftScopeVersionForGrantedScopes(["User.Read", "Calendars.ReadWrite"])).toBe(1);
    expect(requiresCategoryReauthorization(1)).toBe(true);
    expect(microsoftScopeVersionForGrantedScopes(["User.Read", "MailboxSettings.ReadWrite"])).toBe(2);
    expect(requiresCategoryReauthorization(2)).toBe(false);
  });

  it("replaces a cached Outlook category on the next authoritative sync record", () => {
    const oldRecord = graphEventRecord({ id: "event-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" }, categories: ["领域·实习/工作"] }, "user-1");
    const newRecord = graphEventRecord({ id: "event-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" }, categories: ["领域·娱乐/社交"] }, "user-1");
    expect(oldRecord.categories).toEqual(["领域·实习/工作"]);
    expect(newRecord.categories).toEqual(["领域·娱乐/社交"]);
  });

  it("caches exact Graph categories, importance and availability", () => {
    const record = graphEventRecord({ id: "event-1", subject: "实习", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" }, categories: ["领域·实习/工作", "Client External"], importance: "high", showAs: "tentative" }, "user-1");
    expect(record).toMatchObject({ categories: ["领域·实习/工作", "Client External"], importance: "high", show_as: "tentative" });
  });

  it("uses the cached values if a partial Graph update response omits them", () => {
    const record = graphEventRecord({ id: "event-1", subject: "改名", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } }, "user-1", { categories: ["Client External"], importance: "low", show_as: "free" });
    expect(record).toMatchObject({ categories: ["Client External"], importance: "low", show_as: "free" });
  });

  it("uses a stable transaction id and preserves an all-day local date", () => {
    const payload = calendarEventForGraph({ subject: "全天", description: null, startsAt: "2026-08-10T16:00:00.000Z", endsAt: "2026-08-11T16:00:00.000Z", isAllDay: true, locationName: null, timeZone: "Asia/Shanghai", transactionId: "operation-1" });
    expect(payload).toMatchObject({ transactionId: "operation-1", start: { dateTime: "2026-08-11T00:00:00" }, end: { dateTime: "2026-08-12T00:00:00" } });
    expect(() => graphTimeZone("Etc/Unknown")).toThrow("calendar_timezone_unsupported");
  });
});
