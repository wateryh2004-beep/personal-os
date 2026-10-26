// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationHistory } from "@/components/workbench/operation-history";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
const mocks=vi.hoisted(()=>({list:vi.fn(),preview:vi.fn(),undo:vi.fn(),show:vi.fn()}));
vi.mock("next/dynamic",()=>({default:()=>()=>null}));
vi.mock("@/components/shared/action-feedback",()=>({useActionFeedback:()=>({show:mocks.show})}));
vi.mock("@/features/workbench/operation-actions",()=>({listWorkbenchOperations:mocks.list,previewWorkbenchUndo:mocks.preview,undoWorkbenchOperation:mocks.undo}));
vi.mock("@/features/workbench/operation-read-resource",()=>({readWorkbenchTimezone:async()=>"Asia/Shanghai"}));
const idA="10000000-0000-4000-8000-000000000001",idB="10000000-0000-4000-8000-000000000002";
const preview=(id:string,title:string)=>({receiptId:id,title,count:1,operation:"note_move",status:"available",expiresAt:"2099-01-01T00:00:00Z",timezone:"Asia/Shanghai",provider:false,changes:[{label:"文件夹",before:"项目资料",after:"根目录"}]});
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
let container:HTMLDivElement,root:Root;
function button(label:string){return [...document.body.querySelectorAll("button")].find(button=>button.textContent===label)!;}
async function review(id:string){await act(async()=>window.dispatchEvent(new CustomEvent("personal-os:operation-completed",{detail:{receiptId:id,message:"已保存"}})));await act(async()=>mocks.show.mock.calls.at(-1)![0].undo());}
beforeEach(async()=>{vi.clearAllMocks();mocks.list.mockResolvedValue([]);mocks.undo.mockResolvedValue({status:"success",message:"已撤销"});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(window,"matchMedia",{configurable:true,value:()=>({matches:false,addEventListener(){},removeEventListener(){}})});container=document.createElement("div");document.body.append(container);root=createRoot(container);await act(async()=>root.render(createElement(OperationHistory)));});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();clearWorkspaceResources();});
describe("trusted undo preview and scoped canonical notification",()=>{
 it("reads a receipt ID to display trusted before/after, and cancellation writes nothing",async()=>{mocks.preview.mockResolvedValue(preview(idA,"Owned note"));await review(idA);expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(idA);expect(document.body.textContent).toContain("Owned note");expect(document.body.textContent).toContain("项目资料 → 根目录");await act(async()=>button("返回").click());expect(mocks.undo).not.toHaveBeenCalled();});
 it("ignores an older receipt preview after the selection changes",async()=>{const old=deferred<ReturnType<typeof preview>>();mocks.preview.mockReturnValueOnce(old.promise).mockResolvedValueOnce(preview(idB,"New selection"));await review(idA);await review(idB);await act(async()=>{old.resolve(preview(idA,"Obsolete private title"));await old.promise;});expect(document.body.textContent).toContain("New selection");expect(document.body.textContent).not.toContain("Obsolete private title");});
 it("does not install an old-owner preview or issue its undo after scope changes",async()=>{const pending=deferred<ReturnType<typeof preview>>();mocks.preview.mockReturnValueOnce(pending.promise);await review(idA);clearWorkspaceResources();await act(async()=>{pending.resolve(preview(idA,"Old owner private title"));await pending.promise;});expect(document.body.textContent).not.toContain("Old owner private title");expect(mocks.undo).not.toHaveBeenCalled();});
 it("confirms only the receipt ID, then requests canonical local reconciliation without router refresh",async()=>{mocks.preview.mockResolvedValue(preview(idA,"Owned note"));await review(idA);const events:unknown[]=[];const listener=(event:Event)=>events.push((event as CustomEvent).detail);window.addEventListener("personal-os:operation-undone",listener);await act(async()=>button("确认撤销").click());window.removeEventListener("personal-os:operation-undone",listener);expect(mocks.undo).toHaveBeenCalledExactlyOnceWith(idA);expect(events).toEqual([{receiptId:idA}]);expect(document.body.textContent).not.toContain("Owned note");});
 it("labels terminal outcomes accurately and enables undo only for available receipts",async()=>{
  const states=[['prepared','待确认'],['processing','处理中'],['available','可核对撤销'],['undone','已撤销'],['unknown','结果待核对'],['failed','未完成'],['conflict','有后续修改'],['remote_committed','远端已写入待核对'],['expired','已过期']];
  mocks.list.mockResolvedValue(states.map(([status],index)=>({id:`receipt-${index}`,operation:"note_move",status,title:`Fixture ${status}`,count:1,created_at:"2026-10-25T00:00:00Z",expires_at:"2099-01-01T00:00:00Z"})));
  await act(async()=>window.dispatchEvent(new CustomEvent("personal-os:workbench-history-open")));
  for(const [,label]of states)expect(document.body.textContent).toContain(label);
  const buttons=[...document.querySelectorAll<HTMLButtonElement>('button')].filter(button=>button.textContent==='核对撤销');expect(buttons).toHaveLength(states.length);expect(buttons.filter(button=>!button.disabled)).toHaveLength(1);
 });

});
