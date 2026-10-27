// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarPendingTasks } from "@/components/calendar/calendar-pending-tasks";
const mocks=vi.hoisted(()=>({read:vi.fn()}));
vi.mock("@/features/workbench/operation-read-resource",()=>({readPendingCalendarTasks:mocks.read}));
vi.mock("@fullcalendar/interaction",()=>({Draggable:class{destroy(){}}}));
function deferred<T>(){let resolve!:(value:T)=>void, reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
let root:Root,host:HTMLDivElement;
beforeEach(()=>{vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
describe("Calendar pending tasks truthful read states",()=>{
 it("announces loading until a successful response establishes an empty list",async()=>{
  const request=deferred<{tasks:[];timezone:string}>();mocks.read.mockReturnValue(request.promise);
  await act(async()=>root.render(createElement(CalendarPendingTasks,{onSchedule:vi.fn()})));
  expect(host.textContent).toContain("正在读取待安排任务");expect(host.textContent).not.toContain("没有未完成任务");expect(host.querySelector('[aria-label="待安排任务"]')?.getAttribute("aria-busy")).toBe("true");
  await act(async()=>{request.resolve({tasks:[],timezone:"UTC"});await request.promise;});
  expect(host.textContent).toContain("没有未完成任务");expect(host.textContent).not.toContain("正在读取");expect(host.querySelector('[aria-label="待安排任务"]')?.getAttribute("aria-busy")).toBe("false");
 });
 it("keeps failure distinct from empty, then shows loading during a deferred retry",async()=>{
  const first=deferred<{tasks:[];timezone:string}>(),retry=deferred<{tasks:{id:string;title:string;provider_last_modified_at:null}[];timezone:string}>();mocks.read.mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);const schedule=vi.fn();
  await act(async()=>root.render(createElement(CalendarPendingTasks,{onSchedule:schedule})));
  await act(async()=>{first.reject(new Error("offline"));await first.promise.catch(()=>{});});
  expect(host.textContent).toContain("待安排任务暂时无法读取");expect(host.textContent).not.toContain("没有未完成任务");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="重试")!.click());
  expect(host.textContent).toContain("正在读取待安排任务");expect(host.textContent).not.toContain("没有未完成任务");expect(mocks.read).toHaveBeenCalledTimes(2);
  const task={id:"fixture-task",title:"Fixture pending task",provider_last_modified_at:null};
  await act(async()=>{retry.resolve({tasks:[task],timezone:"UTC"});await retry.promise;});
  expect(host.textContent).toContain(task.title);expect(host.textContent).not.toContain("正在读取");expect(host.textContent).not.toContain("没有未完成任务");
  await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent==="安排")!.click());expect(schedule).toHaveBeenCalledExactlyOnceWith(task);
 });
});

it("only exposes draggable estimates for known durations and never silently assigns unknown work 45 minutes",async()=>{
 const known={id:"known",title:"Known",provider_last_modified_at:null,estimated_minutes:120},unknown={id:"unknown",title:"Unknown",provider_last_modified_at:null,estimated_minutes:null};mocks.read.mockResolvedValue({tasks:[known,unknown],timezone:"UTC",truncated:false});await act(async()=>root.render(createElement(CalendarPendingTasks,{onSchedule:vi.fn()})));expect(host.querySelector('[data-calendar-task-id="known"]')?.getAttribute("data-calendar-task-minutes")).toBe("120");expect(host.querySelector('[data-calendar-task-id="unknown"]')?.hasAttribute("data-calendar-task-minutes")).toBe(false);expect(host.textContent).toContain("未估时请点击安排并明确选择本次时长");
});
