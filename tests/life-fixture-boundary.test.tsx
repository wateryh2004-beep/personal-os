// @vitest-environment jsdom
import React, { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const applyReal = vi.hoisted(() => vi.fn());
vi.mock("@/features/life/actions", () => ({ applyLifeFieldOperation: applyReal, readLifeReceiptState: applyReal, readLifeRequestOutcome: applyReal }));
vi.mock("@/features/workbench/operation-actions", () => ({ listWorkbenchOperations: applyReal, previewWorkbenchUndo: applyReal, undoWorkbenchOperation: applyReal }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { lifeFieldInputSchema } from "@/features/life/contracts";
import { ActionFeedbackProvider } from "@/components/shared/action-feedback";
let Provider: typeof import("@/features/life/verification-context").LifeVerificationProvider;
let LifeConfirm: typeof import("@/components/life/life-confirm").LifeConfirm;
let OperationHistory: typeof import("@/components/workbench/operation-history").OperationHistory;
let useLifeUndo: typeof import("@/components/life/use-life-undo").useLifeUndo;
const id="ea000000-0000-4000-8000-000000000001", receipt="ef000000-0000-4000-8000-000000000001";
let root:Root,host:HTMLDivElement;
beforeAll(async()=>{vi.stubEnv("CONTINUOUS_FIXTURE_COMPILED","1");({LifeVerificationProvider:Provider}=await import("@/features/life/verification-context"));({LifeConfirm}=await import("@/components/life/life-confirm"));({OperationHistory}=await import("@/components/workbench/operation-history"));({useLifeUndo}=await import("@/components/life/use-life-undo"));});
beforeEach(()=>{vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);clearWorkspaceResources();window.history.replaceState({},"","/shopping");document.cookie="personal-os-continuous-fixture=synthetic-v3";vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener(){},removeEventListener(){}}));vi.stubGlobal("fetch",vi.fn(async()=>Response.json({timezone:"UTC"})));host=document.createElement("div");document.body.append(host);root=createRoot(host);applyReal.mockClear();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();document.cookie="personal-os-continuous-fixture=;max-age=0";vi.restoreAllMocks();vi.unstubAllGlobals();});
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(node=>node.textContent===text)!;
it("runs the real preview, one confirmation, receipt-only undo lookup and real undo UI across the gated boundary",async()=>{
 const apply=vi.fn(async(input:unknown)=>{const parsed=lifeFieldInputSchema.parse(input);expect(parsed.items.map(row=>row.id)).toEqual([id]);return {ok:true as const,rows:[{id,status:"purchased",mutation_revision:2}],receiptId:receipt};});
 const read=vi.fn(async()=>({operation:"shopping_purchased",rows:[{id,status:"ready",mutation_revision:3}]}));
 const undo=vi.fn(async()=>({status:"success" as const,message:"已撤销。",receiptId:receipt}));
 const preview=vi.fn(async()=>({receiptId:receipt,title:"合成采购",count:1,operation:"shopping_purchased",status:"available",expiresAt:"2099-01-01T00:00:00Z",timezone:"UTC",provider:false,changes:[{label:"状态",before:"已购",after:"待买"}]}));
 function Actual(){const[open,setOpen]=React.useState(true),[status,setStatus]=React.useState("ready");useLifeUndo((_operation,rows)=>setStatus(String(rows[0].status)));return <><output>{status}</output>{open?<LifeConfirm change={{title:"核对合成采购",details:[{id,title:"合成采购",change:"标记已购"}],input:{operation:"shopping_purchased",items:[{id,expected_revision:1}]}}} onClose={()=>setOpen(false)} onSaved={rows=>{setStatus(String(rows[0].status));setOpen(false);}}/>:null}<OperationHistory verificationTransport={{list:async()=>[],preview,undo}}/></>;}
 await act(async()=>root.render(<ActionFeedbackProvider><Provider transport={{apply,read,readRequest:applyReal}}><Actual/></Provider></ActionFeedbackProvider>));
 expect(apply).not.toHaveBeenCalled();await act(async()=>button("确认保存").click());expect(apply).toHaveBeenCalledTimes(1);expect(host.textContent).toContain("purchased");
 await act(async()=>button("撤回").click());expect(preview).toHaveBeenCalledExactlyOnceWith(receipt);expect(undo).not.toHaveBeenCalled();
 await act(async()=>button("确认撤销").click());expect(undo).toHaveBeenCalledExactlyOnceWith(receipt);expect(read).toHaveBeenCalledExactlyOnceWith(receipt);expect(host.textContent).toContain("ready");expect(applyReal).not.toHaveBeenCalled();
});
it("refuses a synthetic override without the explicit cookie before any action can run",async()=>{
 document.cookie="personal-os-continuous-fixture=;max-age=0";const failed=vi.fn(),apply=vi.fn(),read=vi.fn();
 class Boundary extends Component<{children:ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}componentDidCatch(error:Error){failed(error.message);}render(){return this.state.failed?<p>拒绝验证替身</p>:this.props.children;}}
 vi.spyOn(console,"error").mockImplementation(()=>{});
 await act(async()=>root.render(<Boundary><Provider transport={{apply,read,readRequest:applyReal}}><p>不应挂载</p></Provider></Boundary>));
 expect(failed).toHaveBeenCalledWith("fixture_transport_forbidden");expect(apply).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();expect(applyReal).not.toHaveBeenCalled();expect(host.textContent).toBe("拒绝验证替身");
});

it("freezes a normalized request before dispatch and switches an unconfirmed confirmation to pure lookup",async()=>{
 const submitted=vi.fn(),saved=vi.fn(),apply=vi.fn(async()=>{expect(submitted).toHaveBeenCalledTimes(1);return{ok:false as const,error:"unavailable" as const,message:"synthetic response lost"};});
 const readRequest=vi.fn(async():Promise<import("@/features/life/contracts").LifeRequestOutcome>=>({status:"needs-check"}));
 const change={title:"核对数量",details:[{id,title:"合成采购",change:"2.125 kg"}],input:{operation:"shopping_quantity" as const,items:[{id,expected_revision:1,quantity:"2.125",quantity_unit:" kg "}]}};
 await act(async()=>root.render(<Provider transport={{apply,read:async()=>null,readRequest}}><LifeConfirm change={change} requestId={receipt} onSubmitted={submitted} onSaved={saved} onClose={()=>{}}/></Provider>));expect(apply).not.toHaveBeenCalled();expect(readRequest).not.toHaveBeenCalled();
 await act(async()=>button("确认保存").click());expect(apply).toHaveBeenCalledTimes(1);expect(submitted).toHaveBeenCalledExactlyOnceWith({...change.input,requestId:receipt,items:[{...change.input.items[0],quantity_unit:"kg"}]});
 await act(async()=>button("核对原保存").click());expect(readRequest).toHaveBeenCalledExactlyOnceWith(submitted.mock.calls[0][0]);expect(apply).toHaveBeenCalledTimes(1);expect(saved).not.toHaveBeenCalled();
 readRequest.mockResolvedValueOnce({status:"saved",receiptId:receipt,receiptStatus:"available",operation:"shopping_quantity",rows:[{id,mutation_revision:2,quantity:"2.125",quantity_unit:"kg"}]});await act(async()=>button("核对原保存").click());expect(saved).toHaveBeenCalledExactlyOnceWith([{id,mutation_revision:2,quantity:"2.125",quantity_unit:"kg"}]);expect(apply).toHaveBeenCalledTimes(1);
});
it("restores only a read intent and never treats an undone original as a new successful save",async()=>{
 const saved=vi.fn(),apply=vi.fn(),readRequest=vi.fn(async():Promise<import("@/features/life/contracts").LifeRequestOutcome>=>({status:"saved",receiptId:receipt,receiptStatus:"undone",operation:"shopping_purchased",rows:[{id,status:"ready",mutation_revision:3}]}));
 await act(async()=>root.render(<Provider transport={{apply,read:async()=>null,readRequest}}><LifeConfirm requestId={receipt} resumeReadOnly change={{title:"核对原采购",details:[{id,title:"合成采购",change:"已购"}],input:{operation:"shopping_purchased",items:[{id,expected_revision:1}]}}} onSaved={saved} onClose={()=>{}}/></Provider>));expect(readRequest).not.toHaveBeenCalled();await act(async()=>button("核对原保存").click());expect(saved).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();expect(document.body.textContent).toContain("原保存已撤回");
});
it("does not apply an old lookup callback after same-mounted A to B to A target changes",async()=>{
 let finish!:(value:import("@/features/life/contracts").LifeRequestOutcome)=>void;const readRequest=vi.fn(()=>new Promise<import("@/features/life/contracts").LifeRequestOutcome>(resolve=>{finish=resolve;})),saved=vi.fn(),apply=vi.fn();
 const render=(target:string)=>root.render(<Provider transport={{apply,read:async()=>null,readRequest}}><LifeConfirm requestId={receipt} resumeReadOnly change={{title:"核对原采购",details:[{id:target,title:"合成采购",change:"已购"}],input:{operation:"shopping_purchased",items:[{id:target,expected_revision:1}]}}} onSaved={saved} onClose={()=>{}}/></Provider>);
 await act(async()=>render(id));await act(async()=>{button("核对原保存").click();});await act(async()=>render("ea000000-0000-4000-8000-000000000002"));await act(async()=>render(id));await act(async()=>finish({status:"saved",receiptId:receipt,receiptStatus:"available",operation:"shopping_purchased",rows:[{id,status:"purchased",mutation_revision:2}]}));expect(saved).not.toHaveBeenCalled();expect(apply).not.toHaveBeenCalled();
});
