import { describe, expect, it } from "vitest";
import {
  buildInboxClassifyPrompt,
  inboxClassifySchema,
} from "@/features/inbox/classify";

const now = new Date("2026-08-16T04:00:00.000Z"); // 2026-08-16 星期日 12:00 Asia/Shanghai

describe("Inbox 自动识别 schema", () => {
  it("接受任务识别结果并应用 importance 默认值", () => {
    const parsed = inboxClassifySchema.safeParse({
      target: "task",
      confidence: 0.9,
      title: "提交季度报告",
      bodyText: null,
      dueAt: "2026-08-20T18:00:00+08:00",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.target === "task") {
      expect(parsed.data.importance).toBe("normal");
    }
  });

  it("接受日程识别结果，拒绝结束早于开始的日程", () => {
    const valid = inboxClassifySchema.safeParse({
      target: "calendar",
      confidence: 0.85,
      subject: "看牙医",
      startsAt: "2026-08-17T10:00:00+08:00",
      endsAt: "2026-08-17T11:00:00+08:00",
      isAllDay: false,
    });
    expect(valid.success).toBe(true);
    const invalid = inboxClassifySchema.safeParse({
      target: "calendar",
      confidence: 0.85,
      subject: "看牙医",
      startsAt: "2026-08-17T11:00:00+08:00",
      endsAt: "2026-08-17T10:00:00+08:00",
      isAllDay: false,
    });
    expect(invalid.success).toBe(false);
  });

  it("接受笔记、今日日记与 none", () => {
    expect(inboxClassifySchema.safeParse({ target: "note", confidence: 0.7, title: "随笔", bodyMarkdown: "正文" }).success).toBe(true);
    expect(inboxClassifySchema.safeParse({ target: "daily", confidence: 0.6 }).success).toBe(true);
    expect(inboxClassifySchema.safeParse({ target: "none", confidence: 0.4, reason: "内容含糊" }).success).toBe(true);
  });

  it("拒绝无法转换成去向的垃圾结果", () => {
    expect(inboxClassifySchema.safeParse({ target: "task", confidence: 0.9 }).success).toBe(false);
    expect(inboxClassifySchema.safeParse({ target: "unknown", confidence: 0.9 }).success).toBe(false);
  });
});

describe("Inbox 识别 prompt", () => {
  it("注入真实日期、星期、时区偏移与相对时间换算规则", () => {
    const { system } = buildInboxClassifyPrompt({
      content: "下周一把材料交给老师",
      timezone: "Asia/Shanghai",
      now,
      todoListNames: [],
    });
    expect(system).toContain("今天的日期：2026-08-16 星期日");
    expect(system).toContain("Asia/Shanghai");
    expect(system).toContain("UTC+08:00");
    expect(system).toContain("ISO 8601");
    expect(system).toContain("不能编造记录里没有的日期与细节");
    expect(system).toContain("合法的 JSON");
    expect(system).toContain("默认清单");
  });

  it("提供可用的 To Do 清单名并携带记录正文", () => {
    const { system, prompt } = buildInboxClassifyPrompt({
      content: "明天下午三点开会",
      timezone: "Asia/Shanghai",
      now,
      todoListNames: ["工作", "个人"],
    });
    expect(system).toContain("工作、个人");
    expect(prompt).toContain("明天下午三点开会");
  });

  it("无清单名时不虚构，提示使用默认清单", () => {
    const { system } = buildInboxClassifyPrompt({
      content: "整理论文引用",
      timezone: "UTC",
      now,
      todoListNames: [],
    });
    expect(system).toContain("默认清单");
  });
});
