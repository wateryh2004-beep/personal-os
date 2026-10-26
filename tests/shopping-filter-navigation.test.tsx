// @vitest-environment jsdom
import { act, createElement, useMemo, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ShoppingWorkspace } from "@/components/shopping/shopping-workspace";

const mocks=vi.hoisted(()=>({router:{replace:vi.fn(),refresh:vi.fn()},create:vi.fn(),apply:vi.fn()}));
vi.mock("next/navigation",()=>({
 useRouter:()=>mocks.router,
 useSearchParams:()=>{
  const href=useSyncExternalStore(notify=>{
   window.addEventListener("popstate",notify);window.addEventListener("test:next-history",notify);
   return()=>{window.removeEventListener("popstate",notify);window.removeEventListener("test:next-history",notify);};
  },()=>window.location.href,()=>"http://localhost:3000/shopping");
  return useMemo(()=>new URL(href).searchParams,[href]);
 },
}));
vi.mock("next/link",()=>({default:(props:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>createElement("a",props)}));
vi.mock("@/features/shopping/actions",()=>({createPurchaseItem:mocks.create,readPurchaseItemState:vi.fn()}));
vi.mock("@/features/life/actions",()=>({applyLifeFieldOperation:mocks.apply,readLifeReceiptState:vi.fn()}));

let host:HTMLDivElement,root:Root;
const records=[
 {id:"20000000-0000-4000-8000-000000000001",title:"Synthetic ready",price_cny:12,status:"ready",cooldown_until:null,category:null,necessity:"necessary"},
 {id:"20000000-0000-4000-8000-000000000002",title:"Synthetic purchased",price_cny:15,status:"purchased",cooldown_until:null,category:null,necessity:"unknown"},
];
const select=()=>host.querySelector<HTMLSelectElement>("select")!;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.clearAllMocks();
 window.history.replaceState({__NA:true,__PRIVATE_NEXTJS_INTERNALS_TREE:"fixture-tree"},"","/shopping?status=purchased&q=retained#list");
 for(const method of ["replaceState","pushState"] as const){
  const original=window.history[method].bind(window.history);
  vi.spyOn(window.history,method).mockImplementation((data,unused,url)=>{
   // Match Next: forwarding its own private marker would bypass hook updates.
   if(data?.__NA||data?._N)return original(data,unused,url);
   original({...data,__NA:window.history.state?.__NA,__PRIVATE_NEXTJS_INTERNALS_TREE:window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE},unused,url);
   if(url)window.dispatchEvent(new Event("test:next-history"));
  });
 }
 vi.stubGlobal("matchMedia",()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();delete (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT;});

it("restores a saved same-route filter URL while keeping the mounted dirty form",async()=>{
 await act(async()=>root.render(createElement(ShoppingWorkspace,{items:records,stats:{active:1,ready:1,purchased:1},initialCreateOpen:true})));
 expect(select().value).toBe("purchased");expect(host.textContent).toContain("Synthetic purchased");expect(host.textContent).not.toContain("Synthetic ready");
 const name=document.querySelector<HTMLInputElement>('input[name="title"]')!;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(name,"Unsaved synthetic draft");name.dispatchEvent(new Event("input",{bubbles:true}));});
 const savedHref=window.location.pathname+window.location.search+window.location.hash;
 await act(async()=>{select().value="ready";select().dispatchEvent(new Event("change",{bubbles:true}));});
 expect(select().value).toBe("ready");expect(window.location.search).toContain("status=ready");expect(window.location.search).toContain("q=retained");expect(window.location.hash).toBe("#list");
 expect(host.textContent).toContain("Synthetic ready");expect(host.textContent).not.toContain("Synthetic purchased");
 expect(window.history.replaceState).toHaveBeenLastCalledWith(null,"","/shopping?status=ready&q=retained#list");
 // Workbench scene restoration updates the same route without remounting this component.
 await act(async()=>window.history.pushState(null,"",savedHref));
 expect(select().value).toBe("purchased");expect(host.textContent).toContain("Synthetic purchased");expect(host.textContent).not.toContain("Synthetic ready");
 expect(document.querySelector('input[name="title"]')).toBe(name);expect(name.value).toBe("Unsaved synthetic draft");
 await act(async()=>{window.history.back();await vi.runAllTimersAsync();});
 expect(select().value).toBe("ready");
 await act(async()=>{window.history.forward();await vi.runAllTimersAsync();});
 expect(select().value).toBe("purchased");expect(name.value).toBe("Unsaved synthetic draft");
 expect(mocks.router.replace).not.toHaveBeenCalled();expect(mocks.router.refresh).not.toHaveBeenCalled();expect(mocks.create).not.toHaveBeenCalled();expect(mocks.apply).not.toHaveBeenCalled();
});

it("defaults missing or unsupported status to active and omits the default from URL writes",async()=>{
 await act(async()=>window.history.replaceState(null,"","/shopping?status=not-a-filter"));
 await act(async()=>root.render(createElement(ShoppingWorkspace,{items:records,stats:{active:1,ready:1,purchased:1},initialCreateOpen:false})));
 expect(select().value).toBe("active");expect(host.textContent).toContain("Synthetic ready");expect(host.textContent).not.toContain("Synthetic purchased");
 await act(async()=>{select().value="all";select().dispatchEvent(new Event("change",{bubbles:true}));});
 expect(host.textContent).toContain("Synthetic purchased");
 await act(async()=>{select().value="active";select().dispatchEvent(new Event("change",{bubbles:true}));});
 expect(window.location.search).toBe("");expect(select().value).toBe("active");
});
