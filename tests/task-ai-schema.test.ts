import { describe, expect, it } from "vitest";
import { todoProposalSchema } from "@/features/tasks/schemas";

describe("task AI proposal", () => {
  const proposal = { todoListId: "00000000-0000-4000-8000-000000000001", title: "完成项目说明", bodyText: "补充项目背景", importance: "high", dueAt: "2026-08-07T09:00:00+08:00" };

  it("requires a concrete To Do list and an offset-aware due time", () => {
    expect(todoProposalSchema.parse(proposal)).toEqual(proposal);
    expect(todoProposalSchema.safeParse({ ...proposal, todoListId: "other-user-list" }).success).toBe(false);
    expect(todoProposalSchema.safeParse({ ...proposal, dueAt: "2026-08-07 09:00" }).success).toBe(false);
  });
});
