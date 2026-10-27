// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const { apply, readRequest,refresh, readReceipt, createPurchase, readPurchase, startPlanning, readTrip, searchQuery } = vi.hoisted(() => ({ apply: vi.fn(),readRequest:vi.fn(),refresh: vi.fn(), readReceipt: vi.fn(),createPurchase:vi.fn(),readPurchase:vi.fn(),startPlanning:vi.fn(),readTrip:vi.fn(),searchQuery:{value:""} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh,replace:vi.fn() }),useSearchParams:()=>new URLSearchParams(searchQuery.value) }));
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) }));
vi.mock("@/features/life/actions", () => ({ applyLifeFieldOperation: apply, readLifeReceiptState: readReceipt,readLifeRequestOutcome:readRequest }));
vi.mock("@/features/leisure/actions", () => ({ saveLeisureFeedback: vi.fn(), readLeisureFeedback: vi.fn() }));
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import { reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { useLifeUndo } from "@/components/life/use-life-undo";
vi.mock("@/features/shopping/creation-intents",()=>({submitPurchaseCreationIntent:createPurchase,readPurchaseCreationIntent:vi.fn()}));
vi.mock("@/features/travel/create-intents",()=>({submitTravelCreationIntent:vi.fn(),readTravelCreationIntent:vi.fn()}));
vi.mock("@/features/shopping/actions",()=>({createPurchaseItem:createPurchase,readPurchaseItemState:readPurchase}));
vi.mock("@/features/travel/actions",()=>({startTripPlanning:startPlanning,readTripState:readTrip,addTripStop:vi.fn(),updateTripStop:vi.fn(),resolveTripStop:vi.fn()}));
vi.mock("@/components/travel/travel-map",()=>({TravelMap:()=>null}));
import { ShoppingWorkspace } from "@/components/shopping/shopping-workspace";
import { TripDetail } from "@/components/travel/trip-detail";
import { ShoppingChange } from "@/components/shopping/shopping-change-dialog";
import { LeisureFeedbackControls } from "@/components/leisure/leisure-feedback";
import type { LeisureFeedbackInput } from "@/features/leisure/types";
let host: HTMLDivElement, root: Root;
const id = "20000000-0000-4000-8000-000000000001", second = "20000000-0000-4000-8000-000000000002", receipt = "30000000-0000-4000-8000-000000000001";
const items = [{ id, title: "Synthetic one", status: "ready", quantity: null, quantity_unit: null, mutation_revision: 4 }, { id: second, title: "Synthetic two", status: "ready", quantity: "1", quantity_unit: "袋", mutation_revision: 8 }];
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!;
async function input(label: string, value: string) {
  const node = [...document.querySelectorAll("label")].find((element) => element.textContent?.startsWith(label))!.querySelector("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); });
}
beforeEach(() => {clearWorkspaceResources();searchQuery.value="";window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; apply.mockReset();readRequest.mockReset(); refresh.mockReset(); readReceipt.mockReset();readReceipt.mockResolvedValue(null);createPurchase.mockReset();readPurchase.mockReset();startPlanning.mockReset();readTrip.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
it("previews a precise batch without writing; cancel is side-effect free", async () => {
  const close = vi.fn(); await act(async () => root.render(createElement(ShoppingChange, { items, kind: "quantity", onClose: close, onSaved: vi.fn() })));
  await input("数量", "2.125"); await input("单位", "千克");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.body.textContent).toContain("数量未记录 → 2.125 千克"); expect(apply).not.toHaveBeenCalled();
  await act(async () => button("取消").click()); expect(close).toHaveBeenCalledOnce(); expect(apply).not.toHaveBeenCalled();
});
it("keeps a stable request on failed retry, sends only selected metadata, installs canonical rows", async () => {
  const saved = vi.fn(); apply.mockResolvedValueOnce({ ok: false, error: "unavailable", message: "请先读取最新内容" });
  await act(async () => root.render(createElement(ShoppingChange, { items, kind: "quantity", onClose: vi.fn(), onSaved: saved })));
  await input("数量", "3"); await input("单位", "袋"); await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => button("确认保存").click()); expect(saved).not.toHaveBeenCalled(); expect(document.body.textContent).toContain("请先读取最新内容");
  const rows = items.map((item) => ({ id: item.id, mutation_revision: (item.mutation_revision ?? 0) + 1, quantity: "3", quantity_unit: "袋" }));
  readRequest.mockResolvedValueOnce({status:"saved",receiptId:receipt,receiptStatus:"available",operation:"shopping_quantity",rows});await act(async()=>{button("核对原保存").click();button("核对原保存").click();});
  expect(apply).toHaveBeenCalledTimes(1);expect(readRequest).toHaveBeenCalledTimes(1);expect(readRequest.mock.calls[0][0]).toEqual(apply.mock.calls[0][0]);expect(readRequest.mock.calls[0][0].items).toEqual([{ id, expected_revision: 4, quantity: "3", quantity_unit: "袋" }, { id: second, expected_revision: 8, quantity: "3", quantity_unit: "袋" }]); expect(saved).toHaveBeenCalledWith(rows);
});
it("records structured progress then shares the returned revision with feedback without overwriting a note", async () => {
  const onSave = vi.fn(async (value: LeisureFeedbackInput) => ({ ok: true as const, feedback: { status: value.status, reaction: value.reaction, personal_note: value.personal_note, linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: value.expected_revision + 1, updated_at: "2026-10-25T00:00:00Z" } }));
  await act(async () => root.render(createElement(LeisureFeedbackControls, { experience: { id, feedback: { status: "current", reaction: "none", personal_note: "User original reflection", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: "2026-10-25T00:00:00Z", progress_unit: "page", progress_value: 42, progress_total: 200 } }, onSave })));
  await input("当前进度", "60"); await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  apply.mockResolvedValueOnce({ ok: true, receiptId: receipt, rows: [{ id, mutation_revision: 2, progress_unit: "page", progress_value: 60, progress_total: 200 }] });
  await act(async () => button("确认保存").click());
  expect(apply.mock.calls[0][0].items[0]).toEqual({ id, expected_revision: 1, progress_unit: "page", progress_value: 60, progress_total: 200 });
  await act(async () => button("感兴趣").click()); expect(onSave.mock.calls[0][0].expected_revision).toBe(2); expect(onSave.mock.calls[0][0].personal_note).toBe("User original reflection");
});

it("undo events contain only an opaque receipt and reconcile authoritative rows",async()=>{
 function Probe(){const [value,setValue]=useState("original");useLifeUndo((_operation,rows)=>setValue(String(rows[0].quantity)));return createElement("output",null,value);}
 readReceipt.mockResolvedValue({operation:"shopping_quantity",rows:[{id,quantity:"trusted 2.125"}]});
 await act(async()=>root.render(createElement(Probe)));
 await act(async()=>window.dispatchEvent(new CustomEvent("personal-os:operation-undone",{detail:{receiptId:receipt,rows:[{quantity:"forged browser snapshot"}]}})));
 expect(readReceipt).toHaveBeenCalledWith(receipt);expect(host.textContent).toBe("trusted 2.125");
});

it("creates once and installs a canonical owned record without reloading or guessing server fields",async()=>{
 createPurchase.mockResolvedValue({status:"saved",id});readPurchase.mockResolvedValueOnce({ok:false});
 const canonical={id,title:"Server canonical title",price_cny:12,status:"cooling",cooldown_until:"2099-01-01T00:00:00Z",category:null,necessity:"unknown",quantity:"2.125",quantity_unit:"kg",mutation_revision:3};
 await act(async()=>root.render(createElement(ShoppingWorkspace,{items:[],stats:{active:0,ready:0,purchased:0},initialCreateOpen:true})));
 await input("名称","Local draft title");await input("数量","2");await input("单位","bag");
 await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
 expect(createPurchase).toHaveBeenCalledOnce();expect(document.body.textContent).toContain("已保存待购记录");
 readPurchase.mockResolvedValueOnce({ok:true,item:canonical});await act(async()=>button("重新读取已保存记录").click());
 expect(createPurchase).toHaveBeenCalledOnce();expect(host.textContent).toContain("Server canonical title");expect(host.textContent).toContain("2.125 kg");expect(refresh).not.toHaveBeenCalled();
});
it("reconciles planning with canonical trip rows while another station's dirty notes stay mounted",async()=>{
 const trip={id,title:"Synthetic trip",status:"dream",description:null,mutation_revision:1};
 const stops=[{id:second,place_name:"First stop",day_number:1,sort_order:0,latitude:0,longitude:0,notes:"Original note",planned_time:null,duration_minutes:null,mutation_revision:1}];
 startPlanning.mockResolvedValue(undefined);readTrip.mockResolvedValue({ok:true,trip:{...trip,status:"planning",mutation_revision:2},stops:[{...stops[0],place_name:"Canonical stop name",notes:"Canonical saved note"}],documents:[],availableDocuments:[]});
 await act(async()=>root.render(createElement(TripDetail,{trip,stops})));
 const note=host.querySelector<HTMLInputElement>('input[name="notes"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(note,"Keep independent dirty draft");note.dispatchEvent(new Event("input",{bubbles:true}));});
 await act(async()=>button("开始规划").click());
 expect(readTrip).toHaveBeenCalledWith(id);expect(host.textContent).toContain("Canonical stop name");expect(note.value).toBe("Keep independent dirty draft");expect(host.querySelector('input[name="notes"]')).toBe(note);expect(refresh).not.toHaveBeenCalled();
});

it("reconciles deferred Undo responses for different domains and refuses an older record revision",async()=>{
 const resolvers:((value:unknown)=>void)[]=[];readReceipt.mockImplementation(()=>new Promise(resolve=>resolvers.push(resolve)));
 function Probe(){const [values,setValues]=useState<Record<string,string>>({});useLifeUndo((operation,rows)=>setValues(before=>({...before,[operation.split("_")[0]]:String(rows[0].quantity??rows[0].sort_order)})));return createElement("output",null,JSON.stringify(values));}
 await act(async()=>root.render(createElement(Probe)));
 await act(async()=>{window.dispatchEvent(new CustomEvent("personal-os:operation-undone",{detail:{receiptId:receipt}}));window.dispatchEvent(new CustomEvent("personal-os:operation-undone",{detail:{receiptId:second}}));});
 await act(async()=>resolvers[1]({operation:"travel_stop_order",rows:[{id:second,mutation_revision:3,sort_order:1}]}));
 await act(async()=>resolvers[0]({operation:"shopping_quantity",rows:[{id,mutation_revision:5,quantity:"2.125"}]}));
 expect(host.textContent).toContain('"shopping":"2.125"');expect(host.textContent).toContain('"travel":"1"');
 await act(async()=>window.dispatchEvent(new CustomEvent("personal-os:operation-undone",{detail:{receiptId:id}})));
 await act(async()=>resolvers[2]({operation:"shopping_quantity",rows:[{id,mutation_revision:4,quantity:"stale"}]}));
 expect(host.textContent).not.toContain("stale");
});
it("does not publish or install an old owner's late mutation result",async()=>{
 reconcileWorkspaceScope("life-owner-a","v1");let finish!:(value:unknown)=>void;apply.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const saved=vi.fn();const notices=vi.fn();window.addEventListener("personal-os:operation-completed",notices);
 await act(async()=>root.render(createElement(ShoppingChange,{items:[items[0]],kind:"purchased",onClose:vi.fn(),onSaved:saved})));
 await act(async()=>button("确认保存").click());reconcileWorkspaceScope("life-owner-b","v1");
 await act(async()=>finish({ok:true,receiptId:receipt,rows:[{id,mutation_revision:5,status:"purchased"}]}));
 expect(saved).not.toHaveBeenCalled();expect(notices).not.toHaveBeenCalled();window.removeEventListener("personal-os:operation-completed",notices);
});


it("groups same normalized titles for field display but preserves units, unknown quantities and each purchase ID",async()=>{
 searchQuery.value="mode=field";
 const third="20000000-0000-4000-8000-000000000003";
 const base={price_cny:12,category:null,necessity:"necessary",cooldown_until:null,status:"ready",mutation_revision:1};
 const records=[{...base,id,title:"Synthetic tea",quantity:"2",quantity_unit:"袋"},{...base,id:second,title:" Synthetic   tea ",price_cny:21,quantity:"0.125",quantity_unit:"kg",necessity:"nonessential"},{...base,id:third,title:"Ｓｙｎｔｈｅｔｉｃ tea",price_cny:null,quantity:null,quantity_unit:null,status:"inbox",necessity:"unknown"}];
 await act(async()=>root.render(createElement(ShoppingWorkspace,{items:records,stats:{active:3,ready:2,purchased:0},initialCreateOpen:false})));
 expect(host.textContent).toContain("1 组 · 3 条记录");
 const details=host.querySelector("details")!;
 expect(details.open).toBe(false);expect(details.querySelector("summary")!.textContent).toContain("3 条记录，分别核对");
 await act(async()=>details.querySelector("summary")!.click());expect(details.open).toBe(true);
 const record=(recordId:string)=>host.querySelector<HTMLElement>(`[data-shopping-record="${recordId}"]`)!;
 expect(record(id).textContent).toContain("2 袋");expect(record(second).textContent).toContain("0.125 kg");
 expect(record(third).textContent).toContain("数量未记录");expect(record(third).textContent).toContain("价格未知");
 expect(record(id).textContent).toContain("必要品");expect(record(second).textContent).toContain("非必要品");expect(record(third).textContent).toContain("购买资格：尚不可购买");
 expect(record(second).querySelector("a")!.getAttribute("href")).toBe(`/shopping/${second}`);
 await act(async()=>[...record(id).querySelectorAll("button")].find(node=>node.textContent==="我买了")!.click());
 expect(apply).not.toHaveBeenCalled();
 apply.mockResolvedValueOnce({ok:true,receiptId:receipt,rows:[{id,mutation_revision:2,status:"purchased",purchased_at:"2026-10-26T00:00:00Z",cooldown_until:null}]});
 await act(async()=>button("确认保存").click());
 expect(apply.mock.calls[0][0].items).toEqual([{id,expected_revision:1}]);
 expect(host.querySelector(`[data-shopping-record="${id}"]`)).toBeNull();
 expect(record(second).textContent).toContain("0.125 kg");expect(record(third).textContent).toContain("数量未记录");expect(host.textContent).toContain("1 组 · 2 条记录");
});
