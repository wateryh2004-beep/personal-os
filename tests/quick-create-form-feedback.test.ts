// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import { GlobalCreateLayer } from "@/components/shared/global-create-layer-impl";

const actions = vi.hoisted(() => ({ readCalendar:vi.fn(),createCalendarEvent: vi.fn(), createNote: vi.fn() }));
vi.mock("@/features/calendar/actions", () => ({ createCalendarEvent: actions.createCalendarEvent,readCalendarCreationIntent:actions.readCalendar }));
vi.mock("@/features/notes/actions", () => ({ createNote: actions.createNote }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: vi.fn() }));
vi.mock("@/features/shopping/creation-intents",()=>({submitPurchaseCreationIntent:vi.fn(),readPurchaseCreationIntent:vi.fn()}));
vi.mock("@/features/travel/create-intents",()=>({submitTravelCreationIntent:vi.fn(),readTravelCreationIntent:vi.fn()}));
vi.mock("@/features/projects/creation-intents",()=>({submitProjectCreationIntent:vi.fn(),readProjectCreationIntent:vi.fn()}));
vi.mock("@/features/shopping/actions", () => ({ createPurchaseItem: vi.fn() }));
vi.mock("@/features/travel/actions", () => ({ createTrip: vi.fn() }));
vi.mock("@/features/projects/actions", () => ({ createProject: vi.fn() }));
vi.mock("@/features/inbox/actions", () => ({ captureInboxItem: vi.fn() }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
  vi.clearAllMocks();clearWorkspaceResources();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("quick-create forms", () => {
  it("labels times and retains input after failure while suppressing duplicate submissions", async () => {
    let fail!: (error: Error) => void;
    actions.createCalendarEvent.mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
    await act(async () => root.render(createElement(GlobalCreateLayer, { initialRequest: { kind: "calendar", title: "准备讨论" } })));
    const form = document.querySelector("form")!;
    const title = form.querySelector<HTMLInputElement>('[name="subject"]')!;
    expect(title.labels?.[0].textContent).toContain("日程标题");
    expect(form.querySelector<HTMLInputElement>('[name="starts_at"]')?.labels?.[0].textContent).toContain("开始时间");
    expect(form.querySelector<HTMLInputElement>('[name="ends_at"]')?.labels?.[0].textContent).toContain("结束时间");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(actions.createCalendarEvent).toHaveBeenCalledTimes(1);
    expect(form.querySelector("fieldset")?.disabled).toBe(false);
    expect(title.matches(":disabled")).toBe(false);
    expect(form.getAttribute("aria-busy")).toBe("true");
    await act(async () => fail(new Error("连接中断，请重试。")));
    expect(form.querySelector('[role="alert"]')?.textContent).toContain("连接中断");
    expect(title.value).toBe("准备讨论");
    expect(form.querySelector("fieldset")?.disabled).toBe(false);
    actions.readCalendar.mockResolvedValue({ status: "success", message: "已核对" });
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(actions.createCalendarEvent).toHaveBeenCalledTimes(1);expect(actions.readCalendar).toHaveBeenCalledTimes(1);
    expect([...actions.readCalendar.mock.calls[0][0].entries()]).toEqual([...actions.createCalendarEvent.mock.calls[0][1].entries()]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("reports note creation failure inside the still-open dialog", async () => {
    actions.createNote.mockRejectedValue(new Error("暂时无法创建笔记"));
    await act(async () => root.render(createElement(GlobalCreateLayer, { initialRequest: { kind: "note" } })));
    await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("暂时无法创建笔记");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });
});


it("a confirmed pure read after unmount clears exact A even when schema reorders object keys",async()=>{
 actions.createCalendarEvent.mockRejectedValue(new Error("Unknown A"));actions.readCalendar.mockResolvedValue({status:"success",message:"已核对原日程"});
 const render=()=>root.render(createElement(GlobalCreateLayer,{initialRequest:{kind:"calendar",title:"Original A"}}));
 await act(async()=>render());await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));const sent=actions.createCalendarEvent.mock.calls[0][1] as FormData;
 await act(async()=>root.render(null));await act(async()=>render());await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(actions.createCalendarEvent).toHaveBeenCalledOnce();expect(actions.readCalendar).toHaveBeenCalledOnce();expect([...actions.readCalendar.mock.calls[0][0].entries()]).toEqual([...sent.entries()]);expect(getWorkflowDrafts()).toHaveLength(0);expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("global Calendar known not-written keeps current raw and needs a new explicit confirmation with a new intent",async()=>{
 actions.createCalendarEvent.mockResolvedValueOnce({status:"error",message:"Not written",writeOutcome:"not_written"});await act(async()=>root.render(createElement(GlobalCreateLayer,{initialRequest:{kind:"calendar",title:"A"}})));await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));const original=actions.createCalendarEvent.mock.calls[0][1] as FormData;
 await act(async()=>{const node=document.querySelector<HTMLInputElement>('[name="subject"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,"Corrected B");node.dispatchEvent(new Event("input",{bubbles:true}));});expect(actions.createCalendarEvent).toHaveBeenCalledOnce();actions.createCalendarEvent.mockResolvedValue({status:"success",message:"Saved"});await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 const next=actions.createCalendarEvent.mock.calls[1][1] as FormData;expect(next.get("subject")).toBe("Corrected B");expect(next.get("request_id")).not.toBe(original.get("request_id"));expect(actions.readCalendar).not.toHaveBeenCalled();
});
