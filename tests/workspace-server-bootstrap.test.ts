// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceResources, createWorkspaceResource, reconcileWorkspaceScope, useWorkspaceResource } from "@/lib/workspace-resource-cache";
const renderers: (()=>Promise<void>)[]=[];
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});reconcileWorkspaceScope("owner-a","revision-1");});
afterEach(async()=>{for(const clean of renderers.splice(0))await clean();clearWorkspaceResources();vi.restoreAllMocks();});
async function mount({ownerId="owner-a",age=0,existing,active=false}:{ownerId?:string;age?:number;existing?:string;active?:boolean}={}) {
 let finish!:(x:string)=>void;const fetcher=vi.fn(()=>active?new Promise<string>(r=>finish=r):Promise.resolve("from-api"));
 const resource=createWorkspaceResource<string>(crypto.randomUUID(),fetcher,45_000);if(existing)resource.set(existing);if(active)void resource.revalidate();
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host);renderers.push(async()=>{await act(async()=>root.unmount());host.remove();});
 const bootstrap={ownerId,generatedAt:Date.now()-age,data:"server-bootstrap"};
 function Child(){const snapshot=useWorkspaceResource(resource,"notes",bootstrap);return createElement("p",null,snapshot.data??"loading");}
 function View(){useWorkspaceResource(resource,"notes-navigator",undefined,true);return createElement(Child);}
 await act(async()=>root.render(createElement(View)));
 return {resource,fetcher,host,finish};
}
describe("owner-scoped server bootstrap",()=>{
 it("starts with real server data and eliminates duplicate hydration API request",async()=>{const v=await mount();expect(v.host.textContent).toBe("server-bootstrap");expect(v.fetcher).not.toHaveBeenCalled();expect(v.resource.get().data).toBe("server-bootstrap");});
 it("never overwrites an already warm or locally mutated snapshot",async()=>{const v=await mount({existing:"newer-mutation"});expect(v.host.textContent).toBe("newer-mutation");expect(v.fetcher).not.toHaveBeenCalled();});
 it("never exposes another owner's bootstrap",async()=>{const v=await mount({ownerId:"owner-b"});expect(v.host.textContent).toBe("from-api");expect(v.resource.get().data).not.toBe("server-bootstrap");expect(v.fetcher).toHaveBeenCalledTimes(1);});
 it("revalidates expired route payloads instead of treating them as newly fetched",async()=>{const v=await mount({age:60_000});expect(v.host.textContent).toBe("from-api");expect(v.fetcher).toHaveBeenCalledTimes(1);});
 it("lets an in-flight newer request finish without cancelling it",async()=>{const v=await mount({active:true});expect(v.host.textContent).toBe("loading");await act(async()=>v.finish("newer-api"));expect(v.host.textContent).toBe("newer-api");expect(v.fetcher).toHaveBeenCalledTimes(1);});
 it("refreshes normally after invalidation",async()=>{const v=await mount();await act(async()=>{v.resource.invalidate();await v.resource.revalidate();});expect(v.host.textContent).toBe("from-api");expect(v.fetcher).toHaveBeenCalledTimes(1);});
});
