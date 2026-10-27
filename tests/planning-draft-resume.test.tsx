// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({save:vi.fn(),read:vi.fn()}));
vi.mock("@/features/planning/actions",()=>({saveAvailability:api.save,readAvailability:api.read,saveTaskPlanning:vi.fn(),readTaskPlanning:vi.fn()}));
import {DayCapacity} from "@/components/planning/day-capacity";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {requestDraftResume,getDraftResumeStatus} from "@/features/workflow-continuity/draft-resume";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();vi.stubGlobal("requestAnimationFrame",(callback:FrameRequestCallback)=>setTimeout(()=>callback(performance.now()),0));HTMLElement.prototype.scrollIntoView=vi.fn();vi.stubGlobal("fetch",vi.fn(async(input:string)=>{const date=new URL(input,"https://synthetic.test").searchParams.get("date");return new Response(JSON.stringify({date,timezone:"Asia/Shanghai",availability:{revision:date==="2026-10-27"?4:8,timezone:"Asia/Shanghai",periods:[{start:"09:00",end:"12:00"}]},plans:[],tasks:[],events:[],calendarComplete:true,truncated:false,lastSyncAt:null}),{status:200});}));host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();vi.unstubAllGlobals();});
it("actual Today capacity resumes the original date, raw periods and revision after the current owner date changes",async()=>{
 await act(async()=>root.render(<DayCapacity date="2026-10-27"/>));await vi.waitFor(()=>expect(host.querySelector('[aria-label="第1段开始"]')).not.toBeNull());await act(async()=>{const node=host.querySelector<HTMLInputElement>('[aria-label="第1段开始"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,"09:30");node.dispatchEvent(new Event("input",{bubbles:true}));});const target=getWorkflowDrafts()[0].resumeTarget!;await act(async()=>root.render(null));await act(async()=>root.render(<DayCapacity date="2026-10-28"/>));await vi.waitFor(()=>expect(host.textContent).toContain("2026-10-28"));await act(async()=>{await requestDraftResume(target);});await vi.waitFor(()=>expect(getDraftResumeStatus().status).toBe("accepted"));expect(document.activeElement?.getAttribute("aria-label")).toBe("第1段开始");expect(host.querySelector<HTMLInputElement>('[aria-label="第1段开始"]')!.value).toBe("09:30");expect(host.querySelector("details")!.open).toBe(true);expect(host.textContent).toContain("正在恢复 2026-10-27");expect(api.save).not.toHaveBeenCalled();expect(api.read).not.toHaveBeenCalled();expect(vi.mocked(fetch).mock.calls.some(([input])=>String(input).endsWith("date=2026-10-27"))).toBe(true);
});
