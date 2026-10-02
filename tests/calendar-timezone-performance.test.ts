import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

describe("calendar timezone formatter reuse", () => {
  it("uses one formatter for every offset check and event in a timezone", async () => {
    vi.resetModules();
    const { wallTimeToInstant, instantToFullCalendarDate } = await import("@/features/calendar/timezone");
    const Original = Intl.DateTimeFormat;
    const constructor = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) { return new Original(locales, options); });

    expect(wallTimeToInstant("2026-08-08T14:10", "Asia/Shanghai")).toBe("2026-08-08T06:10:00.000Z");
    for (let index = 0; index < 200; index += 1) {
      expect(instantToFullCalendarDate("2026-08-08T06:10:00Z", "Asia/Shanghai").getUTCHours()).toBe(14);
    }
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(instantToFullCalendarDate("2026-08-08T06:10:00Z", "Asia/Tokyo").getUTCHours()).toBe(15);
    expect(constructor).toHaveBeenCalledTimes(2);
  });

  it("bounds server lifetime cache size and never caches invalid timezones", async () => {
    vi.resetModules();
    const { instantToDate } = await import("@/features/calendar/timezone");
    const Original = Intl.DateTimeFormat;
    const constructor = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(function (locales, options) { return new Original(locales, options); });
    const instant = "2026-08-08T06:10:00Z";
    for (let offset = 0; offset <= 16; offset += 1) instantToDate(instant, `Etc/GMT${offset < 13 ? `+${offset}` : `-${offset - 12}`}`);
    expect(constructor).toHaveBeenCalledTimes(17);
    instantToDate(instant, "Etc/GMT+0");
    expect(constructor).toHaveBeenCalledTimes(18);
    expect(() => instantToDate(instant, "not/a-timezone")).toThrow(RangeError);
    expect(() => instantToDate(instant, "not/a-timezone")).toThrow(RangeError);
    expect(constructor).toHaveBeenCalledTimes(20);
  });
});
