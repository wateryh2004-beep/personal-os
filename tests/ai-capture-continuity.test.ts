// @vitest-environment jsdom
import {beforeEach,expect,it,vi} from "vitest";
const actions=vi.hoisted(()=>({save:vi.fn(),read:vi.fn()}));vi.mock("@/features/inbox/actions",()=>({captureInboxIntent:actions.save,reconcileInboxCaptureIntent:actions.read}));
import {submitCapture,reconcileCapture} from "@/features/assistant/ai-capture";
import {clearWorkspaceResources} from "@/lib/workspace-resource-cache";
import {getAiContinuitySnapshot} from "@/features/assistant/ai-continuity";
const intent={intentId:"11111111-1111-4111-8111-111111111111",content:"  exact raw input\n"};
beforeEach(()=>{clearWorkspaceResources();vi.clearAllMocks();});
it("single-flights the exact intent, preserves unknown UUID/raw, and only reads to reconcile without another write",async()=>{
 let release!:(value:unknown)=>void;actions.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const first=submitCapture(intent),second=submitCapture({...intent});expect(first).toBe(second);expect(actions.save).toHaveBeenCalledTimes(1);
 release({status:"needs-check",intentId:intent.intentId,message:"unknown"});expect((await first).status).toBe("needs-check");expect((await submitCapture(intent)).status).toBe("needs-check");expect(actions.save).toHaveBeenCalledTimes(1);
 actions.read.mockResolvedValue({status:"saved",intentId:intent.intentId,inboxId:intent.intentId,classification:"failed"});expect((await reconcileCapture(intent)).status).toBe("saved");expect(actions.read).toHaveBeenCalledWith(intent);expect(actions.save).toHaveBeenCalledTimes(1);
});
it("does not treat a different raw input with the same active intent as replay or leak a late owner's result",async()=>{
 let release!:(value:unknown)=>void;actions.save.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const first=submitCapture(intent);expect((await submitCapture({...intent,content:"different"})).status).toBe("rejected");expect(actions.save).toHaveBeenCalledTimes(1);
 clearWorkspaceResources();release({status:"saved",intentId:intent.intentId,inboxId:intent.intentId,classification:"ready"});await first;expect(getAiContinuitySnapshot()).toEqual([]);
});
it("ordinary builds reject any injected transport before dispatch",()=>{expect(()=>submitCapture(intent,{submit:actions.save,reconcile:actions.read})).toThrow("fixture_transport_forbidden");expect(actions.save).not.toHaveBeenCalled();});
