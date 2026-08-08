import { describe, expect, it } from "vitest";
import { dateTimeInputValue, wallTimeToIso } from "@/features/calendar/timezone";

describe("calendar timezone conversion", () => {
  it("stores Beijing wall time as the correct instant", () => {
    expect(wallTimeToIso("2026-08-08T14:10", "Asia/Shanghai")).toBe("2026-08-08T06:10:00.000Z");
    expect(dateTimeInputValue("2026-08-08T06:10:00.000Z", "Asia/Shanghai")).toBe("2026-08-08T14:10");
  });

  it("does not depend on the browser timezone", () => {
    expect(wallTimeToIso("2026-08-09T16:00", "Asia/Tokyo")).toBe("2026-08-09T07:00:00.000Z");
  });
});
