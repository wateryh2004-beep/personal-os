// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mode = vi.hoisted(() => ({ action: false }));
vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("@/features/assistant/kernel/context-gate", () => ({ decideContextGate: () => ({ mode: mode.action ? "action" : "none" }) }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => createElement("section", null, children, footer) }));
import { GlobalAgent } from "@/components/assistant/global-agent";
import { saveWorkspaceSession, WORKSPACE_SESSION_PREFIX } from "@/lib/workspace-session";
import { getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { acquireAssistantChat } from "@/features/assistant/client-chat-runtime";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
let host: HTMLDivElement, root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources(); window.sessionStorage.clear(); window.localStorage.clear(); mode.action = false;
  reconcileWorkspaceScope("synthetic-owner", "1");
  fetcher = vi.fn(async () => new Response('{"error":"synthetic failure"}', { status: 503 })); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { root.render(createElement(GlobalAgent, { open: true, onClose: vi.fn() })); await tick(); }); }
async function type(text: string) { await act(async () => { const input = host.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await tick(); }); }
async function settle() { for (let count = 0; count < 20 && acquireAssistantChat({ surface: "global" }).view.pending; count++) await act(tick); }
function deferredFailure() { let release!: (value: Response) => void; fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; })); return () => release(new Response("synthetic error", { status: 503 })); }
it("restores a valid same-owner same-tab draft before empty persistence, without renewing its original TTL", async () => {
  saveWorkspaceSession("agent:draft:v2", "Synthetic unfinished question", 5000);
  const prior = JSON.parse(sessionStorage.getItem(`${WORKSPACE_SESSION_PREFIX}agent:draft:v2`)!);
  await mount(); expect(host.querySelector("textarea")!.value).toBe("Synthetic unfinished question");
  expect(getWorkflowDrafts()[0].expiresAt).toBeLessThanOrEqual(prior.expiresAt);
  expect(sessionStorage.getItem(`${WORKSPACE_SESSION_PREFIX}agent:draft:v2`)).toBeNull();
});
it("restores a rejected real SDK request and keeps it recoverable through remount without reload", async () => {
  await mount(); await type("保留这段合成输入"); await submit(); await settle();
  expect(host.querySelector("textarea")!.value).toBe("保留这段合成输入"); expect(getWorkflowDrafts()).toHaveLength(1);
  await act(async () => root.render(null)); await mount(); expect(host.querySelector("textarea")!.value).toBe("保留这段合成输入");
});
it("preserves a newer edit when the installed SDK reports an earlier HTTP failure", async () => {
  const fail = deferredFailure(); await mount(); await type("第一条合成问题"); await submit(); await type("新写的合成草稿");
  await act(async () => { fail(); await tick(); }); await settle(); expect(host.querySelector("textarea")!.value).toBe("新写的合成草稿");
});
it("retires unowned bare legacy localStorage without adopting private body text", async () => {
  localStorage.setItem("personal-os:agent:draft:v1", "Unowned legacy body"); await mount();
  expect(host.querySelector("textarea")!.value).toBe(""); expect(localStorage.getItem("personal-os:agent:draft:v1")).toBeNull(); expect(getWorkflowDrafts()).toEqual([]);
});
it("does not recreate an old owner's draft when a rejected request arrives after identity eviction", async () => {
  const fail = deferredFailure(); await mount(); await type("旧身份的合成草稿"); await submit();
  await act(async () => { reconcileWorkspaceScope("synthetic-owner-after", "1"); fail(); await tick(); });
  expect(getWorkflowDrafts()).toEqual([]); expect(host.querySelector("textarea")!.value).toBe("");
});
it("keeps a failed draft recoverable when only the panel unmounts in the same owner scope", async () => {
  const fail = deferredFailure(); await mount(); await type("关闭面板后的合成草稿"); await submit(); await act(async () => root.render(null));
  await act(async () => { fail(); await tick(); }); await settle(); await mount(); expect(host.querySelector("textarea")!.value).toBe("关闭面板后的合成草稿");
});
it("ignores a late SDK transport result after logout clears the workspace scope", async () => {
  const fail = deferredFailure(); await mount(); await type("退出前的合成草稿"); await submit();
  await act(async () => { clearWorkspaceResources(); fail(); await tick(); });
  expect(getWorkflowDrafts()).toEqual([]); expect(host.querySelector("textarea")!.value).toBe("");
});
it("does not send an old draft or persist a late run after identity changes during run creation", async () => {
  mode.action = true; let release!: (response: Response) => void;
  fetcher.mockImplementationOnce(() => new Promise<Response>(resolve => { release = resolve; }));
  await mount(); await type("旧身份的合成行动请求"); await submit();
  await act(async () => { reconcileWorkspaceScope("new-owner", "1"); release(Response.json({ runId: "00000000-0000-4000-8000-000000000001" })); await tick(); });
  expect(fetcher).toHaveBeenCalledTimes(1); expect(getWorkflowDrafts()).toEqual([]); expect(acquireAssistantChat({ surface: "global" }).view.runId).toBeNull();
});
it("leaves generating state on real SDK error and sends the edited draft when retrying", async () => {
  await mount(); await type("最初的合成问题"); await submit(); await settle(); await type("编辑后的合成问题");
  const retry = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("重试"))!;
  await act(async () => { retry.click(); await tick(); }); await settle();
  expect(fetcher).toHaveBeenCalledTimes(2);
  const body = JSON.parse(String(fetcher.mock.calls[1][1].body)); expect(body.messages.at(-1).parts[0].text).toBe("编辑后的合成问题");
});
it("does not lose an explicit Today prompt before the first lazy GlobalAgent mount and sends it exactly once",async()=>{const {requestAssistantSubmission}=await import("@/features/assistant/pending-submission");requestAssistantSubmission("Cold Today synthetic prompt");expect(fetcher).not.toHaveBeenCalled();await mount();await settle();expect(fetcher).toHaveBeenCalledTimes(1);await act(async()=>root.render(null));await mount();expect(fetcher).toHaveBeenCalledTimes(1);expect(host.querySelector("textarea")!.value).toBe("Cold Today synthetic prompt");});
it("discards a queued Today prompt across owner replacement before its lazy panel mounts",async()=>{const {requestAssistantSubmission}=await import("@/features/assistant/pending-submission");requestAssistantSubmission("Old owner prompt");reconcileWorkspaceScope("replacement-owner","1");await mount();expect(fetcher).not.toHaveBeenCalled();expect(host.querySelector("textarea")!.value).toBe("");});
it("preserves newer raw input when a queued Today command waits behind an active SDK request",async()=>{const fail=deferredFailure();await mount();await type("Active original");await submit();const {requestAssistantSubmission}=await import("@/features/assistant/pending-submission");await act(async()=>requestAssistantSubmission("Queued explicit Today question"));await type("Newer unsent raw input\n");await act(async()=>{fail();await tick();});await settle();expect(host.querySelector("textarea")!.value).toBe("Newer unsent raw input\n");expect(fetcher).toHaveBeenCalledTimes(2);expect(JSON.parse(String(fetcher.mock.calls[1][1].body)).messages.at(-1).parts[0].text).toBe("Queued explicit Today question");});
