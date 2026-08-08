import { describe, expect, it } from "vitest";
import {
  appendInboxEntryToDailyNote,
  dailyNoteTemplate,
  dateInTimeZone,
  inboxSourceMarker,
} from "@/features/notes/daily-note-utils";

describe("daily note utilities", () => {
  it("uses the owner's timezone when choosing the daily note date", () => {
    const instant = new Date("2026-08-08T16:30:00.000Z");

    expect(dateInTimeZone(instant, "Asia/Shanghai")).toBe("2026-08-09");
    expect(dateInTimeZone(instant, "America/Los_Angeles")).toBe("2026-08-08");
  });

  it("appends an Inbox reflection under 感受与想法", () => {
    const inboxId = "2ac1a9b7-53b1-49e2-bca2-5f931acea304";
    const content = "今天做饭得到了一条经验。";
    const result = appendInboxEntryToDailyNote(
      dailyNoteTemplate("2026-08-08"),
      inboxId,
      content,
    );

    expect(result).toContain(
      `## 感受与想法\n\n${content}\n\n${inboxSourceMarker(inboxId)}`,
    );
    expect(result.indexOf(content)).toBeLessThan(result.indexOf("## 明天"));
  });

  it("does not duplicate the same Inbox item when an action is retried", () => {
    const inboxId = "2ac1a9b7-53b1-49e2-bca2-5f931acea304";
    const once = appendInboxEntryToDailyNote(
      dailyNoteTemplate("2026-08-08"),
      inboxId,
      "同一条内容",
    );
    const twice = appendInboxEntryToDailyNote(
      once,
      inboxId,
      "同一条内容",
    );

    expect(twice).toBe(once);
    expect(twice.match(new RegExp(inboxSourceMarker(inboxId), "g"))).toHaveLength(1);
  });

  it("creates the reflection section when an older daily note lacks it", () => {
    const result = appendInboxEntryToDailyNote(
      "# 旧日记\n\n已有正文",
      "11111111-1111-4111-8111-111111111111",
      "补充记录",
    );

    expect(result).toContain("## 感受与想法\n\n补充记录");
  });
});
