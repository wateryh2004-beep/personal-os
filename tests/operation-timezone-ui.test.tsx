// @vitest-environment jsdom
import {act,createElement} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {useOperationTimezone} from "@/features/workbench/use-operation-timezone";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
function Consumer(){const timezone=useOperationTimezone();return createElement("output",null,timezone??"时区读取中");}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(yes=>{resolve=yes;});return {promise,resolve};}
const response=(timezone:string)=>({ok:true,status:200,json:async()=>({timezone})});
let root:Root,host:HTMLDivElement;
beforeEach(()=>{clearWorkspaceResources();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement("div");document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearWorkspaceResources();vi.unstubAllGlobals();});
describe("shared timezone UI reads",()=>{
 it("mounts two consumers with one GET and updates them from the same result",async()=>{const pending=deferred<ReturnType<typeof response>>(),fetcher=vi.fn().mockReturnValue(pending.promise);vi.stubGlobal("fetch",fetcher);await act(async()=>root.render(createElement("div",null,createElement(Consumer),createElement(Consumer))));expect(fetcher).toHaveBeenCalledOnce();expect(host.textContent).toBe("时区读取中时区读取中");await act(async()=>{pending.resolve(response("Asia/Shanghai"));await pending.promise;});expect(host.textContent).toBe("Asia/ShanghaiAsia/Shanghai");});
 it("does not install an old-owner delayed result over current UI",async()=>{const old=deferred<ReturnType<typeof response>>(),fetcher=vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(response("UTC"));vi.stubGlobal("fetch",fetcher);await act(async()=>root.render(createElement(Consumer,{key:"old"})));clearWorkspaceResources();await act(async()=>root.render(createElement(Consumer,{key:"current"})));expect(host.textContent).toBe("UTC");await act(async()=>{old.resolve(response("Asia/Shanghai"));await old.promise;});expect(host.textContent).toBe("UTC");});
 it("keeps unavailable profile state explicit instead of a made-up browser timezone",async()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:false,status:503}));await act(async()=>root.render(createElement(Consumer)));expect(host.textContent).toBe("时区读取中");});
});
