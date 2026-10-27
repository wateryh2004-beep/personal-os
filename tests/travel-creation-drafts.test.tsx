// @vitest-environment jsdom
import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
const api=vi.hoisted(()=>({submit:vi.fn(),read:vi.fn(),push:vi.fn()}));
vi.mock("@/features/travel/create-intents",()=>({submitTravelCreationIntent:api.submit,readTravelCreationIntent:api.read}));
vi.mock("next/navigation",()=>({useRouter:()=>({push:api.push})}));
vi.mock("next/link",()=>({default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=><a {...props}>{children}</a>}));
import {TravelWorkspace} from "@/components/travel/travel-workspace";
import {getWorkflowDrafts} from "@/features/workflow-continuity/drafts";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
let root:Root,host:HTMLDivElement;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});clearWorkspaceResources();vi.clearAllMocks();window.matchMedia=vi.fn().mockReturnValue({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();});
async function render(){await act(async()=>root.render(<TravelWorkspace trips={[]} initialCreateOpen/>));}
async function fill(value:string){await act(async()=>{const node=document.querySelector<HTMLInputElement>('[name="title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,value);node.dispatchEvent(new Event("input",{bubbles:true}));});}
async function submit(){await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
it("actual travel creation keeps B editable after confirmed A and does not navigate away from B",async()=>{
 let finish!:(value:unknown)=>void;api.submit.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();await fill("A destination");await submit();await fill("B destination");expect(document.querySelector('[name="title"]')!.matches(":disabled")).toBe(false);const original=api.submit.mock.calls[0][0];await act(async()=>finish({status:"saved",id:original.intentId}));expect(api.push).not.toHaveBeenCalled();expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("B destination");expect(getWorkflowDrafts()).toHaveLength(1);
});
it("unknown restores frozen travel intent, reads first and retries the same ID only after explicit missing result",async()=>{
 api.submit.mockResolvedValue({status:"needs-check",message:"Unknown"});api.read.mockResolvedValue({status:"missing",message:"原记录缺失"});await render();await fill("Original destination");await submit();const original=api.submit.mock.calls[0][0];await act(async()=>root.render(null));await render();await fill("B after return");await submit();expect(api.submit).toHaveBeenCalledOnce();expect(api.read).toHaveBeenCalledExactlyOnceWith(original);const retry=[...document.querySelectorAll<HTMLButtonElement>("button")].find(row=>row.textContent==="重试同一次保存")!;await act(async()=>retry.click());expect(api.submit).toHaveBeenCalledTimes(2);expect(api.submit.mock.calls[1][0]).toEqual(original);expect(document.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("B after return");expect(api.push).not.toHaveBeenCalled();
});
it("known validation rejection retains raw input and allows a deliberate corrected submission",async()=>{
 api.submit.mockResolvedValue({status:"rejected",code:"invalid",message:"请检查输入"});await render();await fill("Invalid raw");await submit();await fill("Corrected raw");await submit();expect(api.submit).toHaveBeenCalledTimes(2);expect(api.submit.mock.calls[1][0].title).toBe("Corrected raw");expect(api.submit.mock.calls[1][0].intentId).not.toBe(api.submit.mock.calls[0][0].intentId);expect(api.read).not.toHaveBeenCalled();
});
