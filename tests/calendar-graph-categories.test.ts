import { describe, expect, it } from "vitest";
import { graphEventRecord, microsoftCalendarConfiguration, microsoftScopeVersionForGrantedScopes, requiresCategoryReauthorization, seriesMasterFallback } from "@/lib/adapters/microsoft-graph/calendar";
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

  it("keeps the app-assigned categories when Graph reports an empty category list", () => {
    // 全量重同步时，Outlook 上没有分类的日程 Graph 返回 categories: []；空数组
    // 不能覆盖 App 已打好的分类，否则同步一次、分类全没。
    const record = graphEventRecord({ id: "event-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" }, categories: [] }, "user-1", { categories: ["领域·实习/工作"] });
    expect(record.categories).toEqual(["领域·实习/工作"]);
  });

  it("keeps the mirror subject and location when Graph returns them empty", () => {
    const record = graphEventRecord({ id: "event-1", subject: "  ", location: { displayName: "" }, start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } }, "user-1", { subject: "华夏 REITs 晨会", location_name: "国贸二期" });
    expect(record.subject).toBe("华夏 REITs 晨会");
    expect(record.location_name).toBe("国贸二期");
  });

  it("prefers a real Graph subject over the cached fallback", () => {
    const record = graphEventRecord({ id: "event-1", subject: "改名后的标题", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } }, "user-1", { subject: "旧标题" });
    expect(record.subject).toBe("改名后的标题");
  });

  it("fills delta-minimized occurrences from the series master", () => {
    // calendarView/delta 对循环日程的 occurrence 只返回精简实体（subject/body 为空），
    // 完整字段在同一个响应内的 series master 上。缺失字段必须从 master 补齐，
    // 否则每天固定 8:30-17:00 的循环实习日程会被写成「未命名」。
    const occurrence = { id: "occ-1", type: "occurrence" as const, seriesMasterId: "master-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } };
    const master = { id: "master-1", type: "seriesMaster" as const, subject: "华夏基金实习", location: { displayName: "华夏基金" }, body: { content: "正文", contentType: "text" }, categories: ["领域·实习/工作"], importance: "high" as const, showAs: "busy" as const };
    const record = graphEventRecord(occurrence, "user-1", seriesMasterFallback(occurrence, master, undefined));
    expect(record).toMatchObject({ subject: "华夏基金实习", location_name: "华夏基金", body_text: "正文", categories: ["领域·实习/工作"], importance: "high", show_as: "busy" });
  });

  it("prefers the occurrence's own fields over the series master", () => {
    const occurrence = { id: "occ-1", type: "occurrence" as const, seriesMasterId: "master-1", subject: "改名的单次", categories: ["领域·娱乐/社交"], start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } };
    const master = { id: "master-1", type: "seriesMaster" as const, subject: "华夏基金实习", start: { dateTime: "2026-01-01T00:00:00Z" }, end: { dateTime: "2026-01-01T08:00:00Z" } };
    const record = graphEventRecord(occurrence, "user-1", seriesMasterFallback(occurrence, master, undefined));
    expect(record).toMatchObject({ subject: "改名的单次", categories: ["领域·娱乐/社交"] });
  });

  it("falls back to the mirror row when no series master resolves", () => {
    const occurrence = { id: "occ-1", type: "occurrence" as const, seriesMasterId: "master-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } };
    const record = graphEventRecord(occurrence, "user-1", seriesMasterFallback(occurrence, undefined, { provider_event_id: "occ-1", subject: "镜像旧标题", location_name: null, body_text: null, categories: ["领域·实习/工作"] }));
    expect(record).toMatchObject({ subject: "镜像旧标题", categories: ["领域·实习/工作"] });
  });

  it("keeps app-assigned mirror categories when the master reports an empty list", () => {
    const occurrence = { id: "occ-1", type: "occurrence" as const, seriesMasterId: "master-1", start: { dateTime: "2026-08-09T08:00:00Z" }, end: { dateTime: "2026-08-09T09:00:00Z" } };
    const master = { id: "master-1", type: "seriesMaster" as const, subject: "华夏基金实习", categories: [] };
    const record = graphEventRecord(occurrence, "user-1", seriesMasterFallback(occurrence, master, { provider_event_id: "occ-1", subject: null, location_name: null, body_text: null, categories: ["领域·实习/工作"] }));
    expect(record.categories).toEqual(["领域·实习/工作"]);
  });

  it("uses a stable transaction id and preserves an all-day local date", () => {
    const payload = calendarEventForGraph({ subject: "全天", description: null, startsAt: "2026-08-10T16:00:00.000Z", endsAt: "2026-08-11T16:00:00.000Z", isAllDay: true, locationName: null, timeZone: "Asia/Shanghai", transactionId: "operation-1" });
    expect(payload).toMatchObject({ transactionId: "operation-1", start: { dateTime: "2026-08-11T00:00:00" }, end: { dateTime: "2026-08-12T00:00:00" } });
    expect(() => graphTimeZone("Etc/Unknown")).toThrow("calendar_timezone_unsupported");
  });
});
