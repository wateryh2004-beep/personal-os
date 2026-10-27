// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({taskSubmit:vi.fn(),taskRead:vi.fn(),shoppingSubmit:vi.fn(),shoppingRead:vi.fn(),travelSubmit:vi.fn(),travelRead:vi.fn(),projectSubmit:vi.fn(),projectRead:vi.fn()}));
vi.mock("next/navigation",()=>({unstable_rethrow:vi.fn()}));
vi.mock("@/features/tasks/microsoft-todo",()=>({createMicrosoftTodoTaskAction:api.taskSubmit,readMicrosoftTodoCreationAction:api.taskRead}));
vi.mock("@/features/shopping/creation-intents",()=>({submitPurchaseCreationIntent:api.shoppingSubmit,readPurchaseCreationIntent:api.shoppingRead}));
vi.mock("@/features/travel/create-intents",()=>({submitTravelCreationIntent:api.travelSubmit,readTravelCreationIntent:api.travelRead}));
vi.mock("@/features/projects/creation-intents",()=>({submitProjectCreationIntent:api.projectSubmit,readProjectCreationIntent:api.projectRead}));
vi.mock("@/features/calendar/actions",()=>({createCalendarEvent:vi.fn(),readCalendarCreationIntent:vi.fn()}));
vi.mock("@/features/notes/actions",()=>({createNote:vi.fn()}));
import {GlobalCreateLayer,type CreateKind} from "@/components/shared/global-create-layer-impl";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
const list="11111111-1111-4111-8111-111111111111";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({lists:[{id:list,displayName:"Synthetic",isDefault:true}]}),{status:200})));host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();vi.unstubAllGlobals();});
async function render(kind:CreateKind){await act(async()=>root.render(<GlobalCreateLayer initialRequest={{kind}}/>));}
async function fill(name:string,value:string){await act(async()=>{const node=document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(){await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
for(const kind of ["task","shopping","travel","project"] as const){
 it(`actual global ${kind} freezes A and only reads that intent after route return while B remains editable`,async()=>{
  const send=api[`${kind}Submit`],read=api[`${kind}Read`];send.mockResolvedValue(kind==="task"?{status:"error",message:"Unknown A"}:{status:"needs-check",message:"Unknown A"});read.mockResolvedValue(kind==="task"?{status:"success",message:"已核对"}:{status:"saved",id:list});await render(kind);const field=kind==="project"?"name":"title";await fill(field,"Original A");if(kind==="task")await vi.waitFor(()=>expect(document.querySelector<HTMLSelectElement>('[name="todo_list_id"]')!.value).toBe(list));if(kind==="shopping")await fill("priceCny","1.");await submit();expect(send).toHaveBeenCalledOnce();const original=send.mock.calls[0];await act(async()=>root.render(null));await render(kind);await fill(field,"New B");await submit();expect(send).toHaveBeenCalledOnce();expect(read).toHaveBeenCalledOnce();if(kind==="task")expect(Array.from((read.mock.calls[0][0] as FormData).entries())).toEqual(Array.from((original[1] as FormData).entries()));else expect(read.mock.calls[0]).toEqual(original);expect(document.querySelector<HTMLInputElement>(`[name="${field}"]`)!.value).toBe("New B");expect(document.querySelector<HTMLInputElement>(`[name="${field}"]`)!.matches(":disabled")).toBe(false);expect(document.querySelector('[role="dialog"]')).not.toBeNull();expect(document.body.textContent).toContain("当前新输入尚未保存");if(kind==="shopping")expect(document.querySelector<HTMLInputElement>('[name="priceCny"]')!.value).toBe("1.");
 });
}

it("global task accepts corrected explicit confirmation only after typed not-written",async()=>{
 api.taskSubmit.mockResolvedValueOnce({status:"error",message:"Rejected",writeOutcome:"not_written"});await render("task");await fill("title","A");await vi.waitFor(()=>expect(document.querySelector<HTMLSelectElement>('[name="todo_list_id"]')!.value).toBe(list));await submit();
 const original=api.taskSubmit.mock.calls[0][1] as FormData;expect(api.taskSubmit).toHaveBeenCalledOnce();await fill("title","B");api.taskSubmit.mockResolvedValue({status:"success",message:"Saved"});await submit();
 expect(api.taskSubmit).toHaveBeenCalledTimes(2);expect(api.taskRead).not.toHaveBeenCalled();const next=api.taskSubmit.mock.calls[1][1] as FormData;expect(next.get("request_id")).not.toBe(original.get("request_id"));expect(next.get("title")).toBe("B");
});
