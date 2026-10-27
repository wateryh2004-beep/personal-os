// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
const api=vi.hoisted(()=>({save:vi.fn(),read:vi.fn()}));
vi.mock("@/features/briefing/actions",()=>({submitBriefingFormIntentAction:api.save,reconcileBriefingFormIntentAction:api.read}));
import {BriefingIntentForm} from "@/components/briefing/briefing-intent-form";
import type {BriefingFormIntent} from "@/features/briefing/form-intents";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
const record="11111111-1111-4111-8111-111111111111",stamp="2026-10-27T01:00:00.000Z";
const cases:Array<{kind:BriefingFormIntent["kind"];fields:Record<string,string|boolean>}>= [
 {kind:"feed-create",fields:{title:"  Raw feed  ",feed_url:"https://example.com/rss",category:"Test"}},
 {kind:"feed-edit",fields:{category:"  Test  ",personal_priority:"normal",source_quality:"high",reason_for_subscription:"  Reason  "}},
 {kind:"feed-verify",fields:{category:"  Review  ",personal_priority:"core",source_quality:"primary",reason_for_subscription:"  Basis  "}},
 {kind:"interest-create",fields:{name:"  Interest  ",weight:"50",keywords:"alpha, beta",excluded_keywords:" skip "}},
 {kind:"interest-edit",fields:{name:"  Revised  ",weight:"25",keywords:"alpha\nbeta",excluded_keywords:" skip "}},
 {kind:"exclusion-create",fields:{phrase:"  exclude  "}},
 {kind:"settings",fields:{generation_mode:"manual",ai_enabled:false,daily_input_token_budget:"20000",max_ai_candidates:"24",max_selected_items:"8",budget_exhaustion_behavior:"pause"}},
];
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();api.save.mockReset();api.read.mockReset();host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
function Form({kind,fields}:typeof cases[number]){return <BriefingIntentForm kind={kind} id={kind.includes("edit")||kind==="feed-verify"?record:undefined} expectedUpdatedAt={stamp}>{Object.entries(fields).map(([name,value])=>typeof value==="boolean"?<input key={name} name={name} type="checkbox" defaultChecked={value}/>:<textarea key={name} name={name} defaultValue={value}/>)}<button>保存</button></BriefingIntentForm>;}
async function submit(){await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
async function type(name:string,value:string){await act(async()=>{const field=host.querySelector<HTMLTextAreaElement>(`[name="${name}"]`)!;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value")!.set!.call(field,value);field.dispatchEvent(new Event("input",{bubbles:true}));});}
it.each(cases)("$kind restores raw fields, freezes original baseline and only reconciles unknown intent",async fixture=>{
 api.save.mockResolvedValue({status:"needs-check",message:"Original uncertain"});api.read.mockResolvedValue({status:"needs-check",message:"Still uncertain"});
 await act(async()=>root.render(<Form {...fixture}/>));const textName=fixture.kind==="settings"?"daily_input_token_budget":Object.entries(fixture.fields).find(([,v])=>typeof v==="string")![0];await type(textName,String(fixture.fields[textName])+" changed");await submit();
 const intent=api.save.mock.calls[0][0];expect(intent.kind).toBe(fixture.kind);expect(intent[textName]).toBe(String(fixture.fields[textName])+" changed");if("expectedUpdatedAt"in intent)expect(intent.expectedUpdatedAt).toBe(stamp);
 expect(getWorkflowDrafts()).toHaveLength(1);await act(async()=>root.render(null));await act(async()=>root.render(<Form {...fixture}/>));expect(host.querySelector<HTMLTextAreaElement>(`[name="${textName}"]`)!.value).toBe(intent[textName]);await type(textName,"Later input");await submit();expect(api.save).toHaveBeenCalledTimes(1);expect(api.read).toHaveBeenCalledExactlyOnceWith(intent);expect(host.textContent).not.toContain("已保存。");
});
it("known success preserves B, clears only exact saved input and uses new canonical baseline",async()=>{
 let finish!:(value:unknown)=>void;api.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));const fixture=cases[1];await act(async()=>root.render(<Form {...fixture}/>));await type("category","A");await submit();await type("category","B");await act(async()=>finish({status:"saved",id:record,updatedAt:"2026-10-27T02:00:00.000Z",message:"Saved A"}));expect(host.querySelector<HTMLTextAreaElement>('[name="category"]')!.value).toBe("B");expect(host.textContent).toContain("当前新输入尚未保存");expect(getWorkflowDrafts()).toHaveLength(1);api.save.mockResolvedValue({status:"needs-check",message:"pending"});await submit();expect(api.save.mock.calls[1][0]).toMatchObject({category:"B",expectedUpdatedAt:"2026-10-27T02:00:00.000Z"});expect(api.save.mock.calls[1][0].intentId).not.toBe(api.save.mock.calls[0][0].intentId);
});
it("receipt for frozen A after an unknown route return never marks or clears current B as saved",async()=>{
 api.save.mockResolvedValue({status:"needs-check",message:"Unknown A"});const fixture=cases[0];await act(async()=>root.render(<Form {...fixture}/>));await type("title","Original A");await submit();const original=api.save.mock.calls[0][0];await act(async()=>root.render(null));await act(async()=>root.render(<Form {...fixture}/>));await type("title","Current B");api.read.mockResolvedValue({status:"saved",id:record,updatedAt:stamp,message:"Saved original A"});await submit();expect(api.read).toHaveBeenCalledExactlyOnceWith(original);expect(api.save).toHaveBeenCalledOnce();expect(host.querySelector<HTMLTextAreaElement>('[name="title"]')!.value).toBe("Current B");expect(host.textContent).toContain("当前新输入尚未保存");expect(getWorkflowDrafts()).toHaveLength(1);await act(async()=>root.render(null));await act(async()=>root.render(<Form {...fixture}/>));expect(host.querySelector<HTMLTextAreaElement>('[name="title"]')!.value).toBe("Current B");
});
