// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestmentWorkspaceData } from "@/features/investment/types";
import type { InvestmentDailyData } from "@/features/investment/daily-types";
import { deriveHoldings } from "@/features/investment/calculator";
import { parseInvestmentItem } from "@/components/investment/presentation";
const mocks=vi.hoisted(()=>({cash:vi.fn(),quotes:vi.fn(),voidCash:vi.fn(),refresh:vi.fn()}));
vi.mock("next/navigation",()=>({usePathname:()=>"/investments",useRouter:()=>({refresh:mocks.refresh})}));
vi.mock("next/link",()=>({default:({children,scroll:_scroll,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>&{scroll?:boolean})=>{void _scroll;return createElement("a",props,children);}}));
vi.mock("@/features/investment/daily-actions",()=>({addInvestmentCash:mocks.cash,saveInvestmentQuotes:mocks.quotes,voidInvestmentCash:mocks.voidCash}));
vi.mock("@/features/investment/actions",()=>({createInvestmentAccount:vi.fn(),addInvestmentEntry:vi.fn(),saveInvestmentStrategy:vi.fn(),importInvestmentResearch:vi.fn(),voidInvestmentEntry:vi.fn()}));
import { InvestmentWorkspace } from "@/components/investment/investment-workspace";
const account={id:"11111111-1111-4111-8111-111111111111",name:"Synthetic real",mode:"real" as const,currency:"CNY" as const,revision:1};
const paper={...account,id:"22222222-2222-4222-8222-222222222222",name:"Synthetic paper",mode:"paper" as const};
const data:InvestmentWorkspaceData={accounts:[account,paper],entries:[{id:"entry",account_id:account.id,sequence:1,kind:"opening",symbol:"TEST:ASSET",occurred_on:"2026-01-01",quantity:"10",price:"10",fees:"0",source:"Synthetic",import_key:"test",created_at:"2026-01-01T00:00:00Z"}],strategies:[],research:[],unavailable:false};
const daily:InvestmentDailyData={checkedAt:"2026-10-07T12:00:00Z",unavailable:false,cashEntries:[],quotes:[{id:"quote",account_id:account.id,sequence:2,symbol:"TEST:ASSET",currency:"CNY",price:"12",as_of:"2026-10-01T10:00:00Z",source_kind:"manual",source:"Synthetic quote source",import_key:"test",created_at:"2026-10-01T10:00:00Z"}]};
let host:HTMLDivElement,root:Root;
const button=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find((node)=>node.textContent?.trim()===text)!;
const field=(name:string)=>document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const dialog=()=>document.querySelector<HTMLElement>('[role="dialog"]');
async function click(text:string){await act(async()=>button(text).click());}
async function submit(){await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));}
async function render(props:Partial<React.ComponentProps<typeof InvestmentWorkspace>>={}){await act(async()=>root.render(createElement(InvestmentWorkspace,{data,holdings:deriveHoldings(data.accounts,data.entries,"real"),dailyData:daily,tab:"holdings",mode:"real",importExample:"",...props})));}
beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal("matchMedia",vi.fn(()=>({matches:false})));(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();vi.restoreAllMocks();delete (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;});
describe("daily investment UI",()=>{
  it("shows source/as-of, stale status and unknown cash while separating modes",async()=>{await render();expect(host.textContent).toContain("120");expect(host.textContent).toContain("未实现盈亏");expect(host.textContent).toContain("期初待补");expect(host.textContent).toContain("较旧");expect(host.textContent).toContain("2026-10-01 10:00:00 UTC");expect(host.textContent).toContain("Synthetic quote source");expect(host.textContent).not.toContain("Synthetic paper");expect(button("现金 / 分红")).toBeDefined();expect(button("更新报价")).toBeDefined();});
  it("keeps valuation and daily controls available after valid trades aggregate beyond 12 digits", async () => {
    const entries = [
      { ...data.entries[0], id: "buy-one", sequence: 1, kind: "buy" as const, quantity: "600000000000", price: "1" },
      { ...data.entries[0], id: "buy-two", sequence: 2, kind: "buy" as const, quantity: "600000000000", price: "1" },
    ];
    await render({ data: { ...data, entries }, holdings: deriveHoldings(data.accounts, entries, "real"), dailyData: { ...daily, quotes: [{ ...daily.quotes[0], price: "2" }] } });
    expect(host.textContent).toContain("2,400,000,000,000");
    expect(host.textContent).not.toContain("现金与报价暂不可用");
    expect(button("现金 / 分红")).toBeDefined();
    expect(button("更新报价")).toBeDefined();
  });
  it("keeps old holdings usable when the additive daily read is unavailable",async()=>{await render({dailyData:{...daily,unavailable:true}});expect(host.textContent).toContain("现金与报价暂不可用");expect(host.textContent).toContain("TEST:ASSET");expect(button("现金 / 分红")).toBeUndefined();expect(button("记录持仓").disabled).toBe(false);});
  it("preserves failed cash inputs and idempotency key and restores focus on cancel",async()=>{
    mocks.cash.mockResolvedValue({ok:false,error:"Synthetic rejected"});await render();const trigger=button("现金 / 分红");trigger.focus();await click("现金 / 分红");const key=field("import_key").value;field("amount").value="100.25";field("source").value="Synthetic source";field("confirmed").checked=true;await submit();expect(dialog()?.textContent).toContain("Synthetic rejected");expect(field("amount").value).toBe("100.25");expect(field("import_key").value).toBe(key);expect(mocks.refresh).not.toHaveBeenCalled();expect(mocks.cash.mock.calls[0][0].get("account_id")).toBe(account.id);await click("取消");await vi.waitFor(()=>expect(document.activeElement).toBe(trigger));
  });
  it("locks double-submit, cancel, Escape and mobile Back while quote write is pending",async()=>{
    vi.stubGlobal("matchMedia",vi.fn(()=>({matches:true})));window.history.replaceState({},"","/investments?mode=real");let finish!:(result:{ok:boolean})=>void;mocks.quotes.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    await render();await click("更新报价");field("symbol").value="TEST:ASSET";field("price").value="12";field("as_of").value="2026-10-01T10:00";field("source").value="Synthetic";field("confirmed").checked=true;
    await act(async()=>{document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});
    expect(mocks.quotes).toHaveBeenCalledOnce();expect(button("取消").disabled).toBe(true);await act(async()=>document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));expect(dialog()).not.toBeNull();const marker=window.history.state.__personalOsMobileLayer;await act(async()=>{window.history.back();await new Promise(resolve=>setTimeout(resolve,40));});expect(dialog()).not.toBeNull();expect(window.history.state.__personalOsMobileLayer).toBe(marker);await act(async()=>finish({ok:true}));expect(dialog()).toBeNull();expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it("switches to bounded JSON import without inventing quotes and cancels without writing",async()=>{await render();await click("更新报价");await act(async()=>{const select=document.querySelector<HTMLSelectElement>('select')!;select.value="import";select.dispatchEvent(new Event("change",{bubbles:true}));});expect(field("payload").value).toBe("");expect(field("payload").maxLength).toBe(180000);expect(dialog()?.textContent).toContain("不会推测或补全价格");await click("取消");expect(mocks.quotes).not.toHaveBeenCalled();});
  it("reveals valid linked items and never selects the other account mode",async()=>{
    const id="33333333-3333-4333-8333-333333333333";expect(parseInvestmentItem(id)).toBe(id);for(const input of [[id],"invalid",undefined]) expect(parseInvestmentItem(input)).toBeUndefined();
    await render({selectedItem:paper.id});expect(host.querySelector('[data-selected]')).toBeNull();
    const strategy={id,strategy_key:"synthetic",version:1,title:"Synthetic strategy",body_markdown:"Synthetic details",created_at:"2026-01-01T00:00:00Z"};await render({data:{...data,strategies:[strategy]},tab:"strategies",selectedItem:id});const selected=host.querySelector<HTMLDetailsElement>('[data-selected]');expect(selected?.open).toBe(true);expect(document.activeElement).toBe(selected);
  });
});
