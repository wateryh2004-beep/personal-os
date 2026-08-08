import { describe, expect, it } from "vitest";
import { resolveAssistantPolicy } from "@/features/assistant/policy";
import { buildAssistantTools } from "@/features/assistant/tools";

const request = (surface: "calendar" | "tasks" | "inbox" | "global") => ({
  surface,
  mode: surface === "inbox" ? ("triage" as const) : ("chat" as const),
});
describe("Unified Assistant policy", () => {
  it("keeps personal context broad but tool permission surface-specific", () => {
    const calendar = buildAssistantTools({
      supabase: {} as never,
      policy: resolveAssistantPolicy(request("calendar")),
    });
    const tasks = buildAssistantTools({
      supabase: {} as never,
      policy: resolveAssistantPolicy(request("tasks")),
    });
    const inbox = buildAssistantTools({
      supabase: {} as never,
      policy: resolveAssistantPolicy(request("inbox")),
    });
    expect(Object.keys(calendar).sort()).toEqual([
      "findFreeTime",
      "proposeCalendarDelete",
      "proposeCalendarEvent",
      "proposeCalendarUpdate",
      "searchCalendar",
    ]);
    expect(Object.keys(tasks).sort()).toEqual([
      "listTodoLists",
      "proposeTodoComplete",
      "proposeTodoTask",
      "searchTodoTasks",
    ]);
    expect(Object.keys(inbox).sort()).toEqual([
      "listTodoLists",
      "proposeInboxDestination",
      "searchTodoTasks",
    ]);
  });
  it("gives the global surface read and proposal tools but no executor", () => {
    const global = buildAssistantTools({
      supabase: {} as never,
      policy: resolveAssistantPolicy(request("global")),
    });

    expect(Object.keys(global)).toContain("searchPersonalOs");
    expect(Object.keys(global)).toContain("findFreeTime");
    expect(Object.keys(global)).toContain("proposeNoteUpdate");
    expect(Object.keys(global)).not.toContain("executeAgentAction");
  });
  it("never grants personal context to note transforms or selection operations", () => {
    expect(
      resolveAssistantPolicy({
        surface: "notes",
        mode: "transform",
        operation: "polishSelection",
        usePersonalContext: true,
      }).context,
    ).toBe("local");
    expect(
      resolveAssistantPolicy({
        surface: "notes",
        mode: "chat",
        operation: "askNote",
        usePersonalContext: false,
      }).context,
    ).toBe("local");
    expect(
      resolveAssistantPolicy({
        surface: "notes",
        mode: "chat",
        operation: "askNote",
        usePersonalContext: true,
      }).context,
    ).toBe("personal");
  });

  it("routes today's experiences and lessons toward the daily note", () => {
    const instruction = resolveAssistantPolicy(request("inbox")).instruction;

    expect(instruction).toContain("今天发生的事情");
    expect(instruction).toContain("经验教训");
    expect(instruction).toContain("优先归今日日记");
  });
});
