import { describe, expect, it } from "vitest";
import { formatCny, formatCount, formatDate, formatTime } from "@/lib/format";

describe("shared presentation formatters", () => {
  it("formats dates and times in the configured timezone", () => {
    const value = "2026-08-17T16:30:00.000Z";
    expect(formatDate(value, "Asia/Shanghai")).toBe("8/18");
    expect(formatTime(value, "Asia/Shanghai")).toBe("00:30");
  });

  it("keeps money and counts consistently numeric", () => {
    expect(formatCny(50)).toMatch(/50/);
    expect(formatCount(12000)).toBe("12,000");
  });
});
