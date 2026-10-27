// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({apply:vi.fn(),read:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/features/life/actions",()=>({applyLifeFieldOperation:api.apply,readLifeRequestOutcome:api.read}));
import {TravelStopMetadataEditor,TravelDocumentForm} from "@/components/travel/travel-form-drafts";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
const trip="11111111-1111-4111-8111-111111111111",stop="22222222-2222-4222-8222-222222222222",file="33333333-3333-4333-8333-333333333333",receipt="44444444-4444-4444-8444-444444444444";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});host=document.createElement("div");document.body.append(host);root=createRoot(host);api.apply.mockResolvedValue({ok:false,error:"unavailable",message:"Unknown"});api.read.mockResolvedValue({status:"needs-check"});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(row=>row.textContent===text)!;
async function fill(name:string,value:string){await act(async()=>{const node=document.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${name}"]`)!;Object.getOwnPropertyDescriptor(node instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event(node instanceof HTMLSelectElement?"change":"input",{bubbles:true}));});}
const stopRow=(revision:number)=>({id:stop,place_name:"Synthetic stop",day_number:1,planned_time:null,duration_minutes:30,mutation_revision:revision});
it("actual metadata form restores half raw values and original revision without reopening confirmation",async()=>{
 const render=(revision:number)=>root.render(<TravelStopMetadataEditor tripId={trip} stops={[stopRow(revision)]} onClose={vi.fn()} onSaved={vi.fn()}/>);
 await act(async()=>render(4));await fill("dayNumber","2");await fill("durationMinutes","1.");await act(async()=>root.render(null));await act(async()=>render(9));
 expect(document.querySelector<HTMLInputElement>('[name="durationMinutes"]')!.value).toBe("1.");expect(document.querySelector<HTMLInputElement>('[name="baselineRevisions"]')!.value).toContain('"expected_revision":4');expect(button("确认保存")).toBeUndefined();expect(api.apply).not.toHaveBeenCalled();expect(api.read).not.toHaveBeenCalled();expect(getWorkflowDrafts()[0].resumeTarget).toMatchObject({kind:"travel.stop-metadata",parentId:trip,itemIds:[stop]});
});
it("metadata unknown restore previews original fields, reads same request only and requires explicit rebase for later changes",async()=>{
 const saved=vi.fn(),render=(revision:number)=>root.render(<TravelStopMetadataEditor tripId={trip} stops={[stopRow(revision)]} onClose={vi.fn()} onSaved={saved}/>);
 await act(async()=>render(4));await fill("durationMinutes","45");await act(async()=>button("预览修改").click());await act(async()=>button("确认保存").click());const original=api.apply.mock.calls[0][0];
 await act(async()=>root.render(null));await act(async()=>render(9));expect(button("核对原保存")).toBeUndefined();expect(api.read).not.toHaveBeenCalled();await act(async()=>button("预览原提交核对").click());
 const rows=[{...stopRow(9),duration_minutes:60}];api.read.mockResolvedValue({status:"saved",receiptId:receipt,receiptStatus:"available",operation:"travel_stop_metadata",rows});await act(async()=>button("核对原保存").click());expect(api.read).toHaveBeenCalledExactlyOnceWith(original);expect(api.apply).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();expect(document.querySelector<HTMLInputElement>('[name="request_id"]')!.value).toBe(original.requestId);
 await act(async()=>button("采用当前版本，保留输入").click());expect(document.querySelector<HTMLInputElement>('[name="durationMinutes"]')!.value).toBe("45");expect(document.querySelector<HTMLInputElement>('[name="baselineRevisions"]')!.value).toContain('"expected_revision":9');expect(saved).toHaveBeenCalledWith(rows,true);expect(api.apply).toHaveBeenCalledOnce();
});
it("document recovery keeps unavailable original file and reads the original request rather than choosing a replacement",async()=>{
 const docs=[{id:file,title:"Synthetic ticket",mime_type:"application/pdf",storage_state:"available"}],saved=vi.fn(),render=(available:boolean)=>root.render(<TravelDocumentForm tripId={trip} revision={available?4:9} documents={available?docs:[]} linkedIds={[]} onSaved={saved}/>);
 await act(async()=>render(true));await fill("document_id",file);await act(async()=>button("预览关联").click());await act(async()=>button("确认保存").click());const original=api.apply.mock.calls[0][0];await act(async()=>root.render(null));await act(async()=>render(false));expect(document.querySelector<HTMLSelectElement>('[name="document_id"]')!.value).toBe(file);expect(document.body.textContent).toContain("原文件当前不可用");expect(api.read).not.toHaveBeenCalled();
 await act(async()=>button("预览原关联核对").click());await act(async()=>button("核对原保存").click());expect(api.read).toHaveBeenCalledExactlyOnceWith(original);expect(api.apply).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();expect(document.body.textContent).toContain("不会重复提交");
});
