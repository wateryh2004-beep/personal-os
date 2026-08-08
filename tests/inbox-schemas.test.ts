import { describe, expect, it } from "vitest";
import { inboxCaptureSchema, inboxProposalSchema } from "@/features/inbox/schemas";
import { initialInboxCaptureState } from "@/features/inbox/state";

describe("Inbox schemas", () => {
  it("accepts a bounded capture", () => expect(inboxCaptureSchema.safeParse({ content: "  想法  " }).success).toBe(true));
  it("rejects an invalid calendar range", () => expect(inboxProposalSchema.safeParse({ target: "calendar", subject: "会议", description: null, startsAt: "2026-08-07T10:00:00+08:00", endsAt: "2026-08-07T09:00:00+08:00", locationName: null, isAllDay: false }).success).toBe(false));
  it("keeps a task proposal structured and confirmable", () => expect(inboxProposalSchema.safeParse({ target: "task", todoListId: "00000000-0000-4000-8000-000000000001", title: "联系老师", bodyText: null, importance: "normal", dueAt: null }).success).toBe(true));
  it("keeps the action state as plain client-safe data", () => {
    expect(initialInboxCaptureState).toEqual({ status: "idle", message: "" });
    expect(typeof initialInboxCaptureState).toBe("object");
  });
});
