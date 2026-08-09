import { describe, expect, it } from "vitest";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";

describe("calendar deterministic classification", () => {
  it.each([
    ["华夏基金实习", "work_internship", ["huaxia_fund"]],
    ["人大论文开题讨论", "academic", ["ruc"]],
    ["秋招面试复盘", "career", []],
    ["CFA 刷题", "exam", []],
    ["RQAlpha 回测", "research", []],
    ["Personal OS 开发", "project", ["personal_os"]],
    ["燕郊理发", "life", []],
    ["和朋友看电影", "leisure", []],
    ["去机场赶航班", "travel", []],
    ["医院体检", "health", []],
  ] as const)("classifies %s", (subject, primary, contexts) => {
    expect(classifyCalendarEvent({ subject })).toMatchObject({ primaryCategoryKey: primary, contextCategoryKeys: contexts, needsConfirmation: false });
  });

  it("flags unknown content for confirmation instead of inventing a category", () => {
    expect(classifyCalendarEvent({ subject: "聊一下" })).toMatchObject({ primaryCategoryKey: "other", confidence: 0.35, needsConfirmation: true });
  });
});
