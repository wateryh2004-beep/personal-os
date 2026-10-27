// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({apply:vi.fn(),read:vi.fn()}));
vi.mock("@/features/life/actions",()=>({applyLifeFieldOperation:api.apply,readLifeRequestOutcome:api.read}));
import {ShoppingChange} from "@/components/shopping/shopping-change-dialog";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {parseDraftResumeTarget,draftResumeKey} from "@/features/workflow-continuity/draft-resume";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
const a="11111111-1111-4111-8111-111111111111",b="22222222-2222-4222-8222-222222222222",c="33333333-3333-4333-8333-333333333333";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});host=document.createElement("div");document.body.append(host);root=createRoot(host);api.apply.mockResolvedValue({ok:false,error:"unavailable",message:"Unknown"});api.read.mockResolvedValue({status:"needs-check"});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(row=>row.textContent===text)!;
async function fill(name:string,value:string){await act(async()=>{const node=document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));});}
const item=(id:string,revision=4)=>({id,title:`Synthetic ${id[0]}`,status:"ready",quantity:"1",quantity_unit:"瓶",mutation_revision:revision});
it("restores exact batch, half-decimal raw and original revisions without restoring confirmation",async()=>{
 const render=(revision:number)=>root.render(<ShoppingChange items={[item(a,revision),item(b,revision)]} kind="quantity" onClose={vi.fn()} onSaved={vi.fn()}/>);
 await act(async()=>render(4));await fill("quantity","1.");await fill("quantityUnit","千克");const target=getWorkflowDrafts()[0].resumeTarget!;expect(target.itemIds).toEqual([a,b]);
 await act(async()=>root.render(null));await act(async()=>render(9));expect(document.querySelector<HTMLInputElement>('[name="quantity"]')!.value).toBe("1.");expect(document.querySelector<HTMLInputElement>('[name="quantityUnit"]')!.value).toBe("千克");expect(document.querySelector<HTMLInputElement>('[name="baselineRevisions"]')!.value).toContain('"expected_revision":4');expect(button("预览修改")).toBeTruthy();expect(api.apply).not.toHaveBeenCalled();
});
it("unknown purchase uses only exact frozen request read after return, and never resends on missing",async()=>{
 const saved=vi.fn(),render=(revision:number)=>root.render(<ShoppingChange items={[item(a,revision)]} kind="purchased" onClose={vi.fn()} onSaved={saved}/>);
 await act(async()=>render(4));await act(async()=>button("确认保存").click());expect(api.apply).toHaveBeenCalledOnce();const frozen=api.apply.mock.calls[0][0];
 await act(async()=>root.render(null));await act(async()=>render(9));api.read.mockResolvedValue({status:"missing"});await act(async()=>button("核对原保存").click());expect(api.read).toHaveBeenCalledExactlyOnceWith(frozen);expect(api.apply).toHaveBeenCalledOnce();expect(saved).not.toHaveBeenCalled();expect(document.body.textContent).toContain("未重复发送");
});
it("strict batch identity rejects unrelated member arrays and distinguishes same first record batches",()=>{
 expect(parseDraftResumeTarget({kind:"task.edit",id:a,itemIds:[a,b]})).toBeNull();expect(parseDraftResumeTarget({kind:"shopping.quantity",id:a,itemIds:[b]})).toBeNull();expect(parseDraftResumeTarget({kind:"shopping.quantity",id:a,itemIds:[a,a]})).toBeNull();
 expect(draftResumeKey({kind:"shopping.quantity",id:a,itemIds:[a,b]})).not.toBe(draftResumeKey({kind:"shopping.quantity",id:a,itemIds:[a,c]}));expect(draftResumeKey({kind:"shopping.quantity",id:a,itemIds:[a,b]})).toBe(draftResumeKey({kind:"shopping.quantity",id:a,itemIds:[b,a]}));
});
it("historical saved receipt with later canonical changes requires explicit comparison before rebasing",async()=>{
 const saved=vi.fn();await act(async()=>root.render(<ShoppingChange items={[item(a)]} kind="quantity" onClose={vi.fn()} onSaved={saved}/>));
 await fill("quantity","2");await fill("quantityUnit","瓶");await act(async()=>button("预览修改").click());await act(async()=>button("确认保存").click());const original=api.apply.mock.calls[0][0];
 const rows=[{id:a,quantity:"3",quantity_unit:"瓶",mutation_revision:8}];api.read.mockResolvedValue({status:"saved",receiptId:c,receiptStatus:"available",operation:"shopping_quantity",rows});await act(async()=>button("核对原保存").click());
 expect(saved).not.toHaveBeenCalled();expect(api.apply).toHaveBeenCalledOnce();expect(document.querySelector<HTMLInputElement>('[name="baselineRevisions"]')!.value).toContain('"expected_revision":4');expect(document.querySelector<HTMLInputElement>('[name="request_id"]')!.value).toBe(original.requestId);
 await act(async()=>button("采用当前版本，保留输入").click());expect(document.querySelector<HTMLInputElement>('[name="quantity"]')!.value).toBe("2");expect(document.querySelector<HTMLInputElement>('[name="baselineRevisions"]')!.value).toContain('"expected_revision":8');expect(document.querySelector<HTMLInputElement>('[name="submitted_input"]')!.value).toBe("");expect(saved).toHaveBeenCalledWith(rows,true);expect(api.apply).toHaveBeenCalledOnce();expect(getWorkflowDrafts()).toHaveLength(1);
});
