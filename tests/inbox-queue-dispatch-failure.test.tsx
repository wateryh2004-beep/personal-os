// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({create:vi.fn(),cancel:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:state.refresh}),useSearchParams:()=>new URLSearchParams()}));
vi.mock("@/components/workflow-continuity/source-link",()=>({SourceLink:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>createElement("a",props,children)}));
vi.mock("@/components/shared/action-feedback",()=>({useActionFeedback:()=>({show:vi.fn()})}));
vi.mock("@/features/tasks/microsoft-todo",()=>({createMicrosoftTodoTaskAction:(...args:unknown[])=>state.create(...args)}));
vi.mock("@/features/calendar/actions",()=>({createCalendarEvent:vi.fn()}));
vi.mock("@/features/inbox/actions",()=>({
 cancelInboxUndispatchedIntent:(...args:unknown[])=>state.cancel(...args),captureInboxItem:vi.fn(),convertInboxToDailyNote:vi.fn(),convertInboxToNote:vi.fn(),convertInboxToProject:vi.fn(),convertInboxToLink:vi.fn(),readInboxProjectChoices:vi.fn(),dismissInboxProposal:vi.fn(),reclassifyInboxItem:vi.fn(),restoreInboxItem:vi.fn(),archiveInboxItem:vi.fn(),
}));
import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
const inbox=(id:string,content:string)=>({id,content_markdown:content,created_at:"2026-10-27T00:00:00Z",processed_at:null,converted_task_id:null,converted_todo_task_id:null,converted_note_id:null,ai_proposal:null,ai_status:null,ai_error:null});
const items=[inbox("e2000000-0000-4000-8000-000000000001","First preserved source"),inbox("e2000000-0000-4000-8000-000000000002","Second source")];
const props={items,archivedItems:[],lists:[{id:"e4000000-0000-4000-8000-000000000001",display_name:"Synthetic",is_default:true}]};
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});state.create.mockReset().mockResolvedValue({status:"error",message:"远端结果待核对，未重复发送。"});state.cancel.mockReset().mockResolvedValue({status:"success",message:"已取消尚未发送的意图。"});state.refresh.mockReset();clearWorkspaceResources();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
async function mount(){await act(async()=>root.render(createElement(InboxWorkspace,props)));return host.querySelector<HTMLElement>('[aria-label="连续整理收集箱"]')!;}
describe("Inbox queue requires canonical completion",()=>{
 it("retains the active source and edited input after a provider claim conflict or unknown result",async()=>{
  const queue=await mount();const title=queue.querySelector<HTMLInputElement>('[name="title"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(title,"User correction kept");title.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>title.form!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(state.create).toHaveBeenCalledOnce();expect(queue.textContent).toContain("First preserved source");expect(queue.textContent).not.toContain("Second source");expect(queue.textContent).toContain("已处理 0");expect(queue.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("User correction kept");expect(queue.textContent).toContain("待核对");
 });
 it("cancels only the undispatched intent and leaves the queue and form input available",async()=>{
  const queue=await mount();const title=queue.querySelector<HTMLInputElement>('[name="title"]')!;const before=title.value;
  const cancel=[...queue.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="取消尚未发送的意图")!;
  await act(async()=>cancel.form!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(state.cancel).toHaveBeenCalledOnce();expect(queue.textContent).toContain("已处理 0");expect(queue.textContent).toContain("First preserved source");expect(queue.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe(before);
  await act(async()=>root.render(createElement(InboxWorkspace,{...props,items:[{...items[0],processed_at:"2026-10-27T01:00:00Z"},items[1]]})));
  expect(queue.textContent).toContain("Second source");expect(queue.textContent).toContain("已处理 1");
 });
});
