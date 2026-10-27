// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "NEXT_REDIRECT") throw error; } }));
import { CareerForm } from "@/components/career/career-form";
import { clearWorkspaceResources,reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { expireWorkflowDrafts, getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { getDraftResumeStatus, requestDraftResume } from "@/features/workflow-continuity/draft-resume";
import { parseDraftFields, type DeclaredDraftConfig } from "@/features/workflow-continuity/draft-contracts";
const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const config: DeclaredDraftConfig = { operation: "career.resume-content", id, href: "/career/resumes", label: "简历正文" };
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
async function write(name: string, value: string) { const node = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
function Form({ action = async () => ({ status: "success" as const, message: "已保存" }), identity = id, onSuccess }: { action?: (data: FormData) => Promise<{ status: "success" | "error"; message: string }>; identity?: string; onSuccess?: (data: FormData) => void }) { return <details><summary>编辑简历</summary><CareerForm action={action} draft={{ ...config, id: identity }} onSuccess={onSuccess}><input name="title" defaultValue="Original" /><textarea name="content_markdown" defaultValue="Original body" /><input name="password" type="password" defaultValue="never-copy" /><input type="hidden" name="user_id" value="never-trust" /><button>保存</button></CareerForm></details>; }
it("restores actual fields after unmount and opens the same native details with focused input", async () => {
  await act(async () => root.render(<Form />));
  await write("title", "  Raw unfinished 名称  "); await write("content_markdown", "# Draft\n\nBody");
  expect(getWorkflowDrafts()).toHaveLength(1); expect(JSON.stringify(getWorkflowDrafts())).not.toContain("Raw unfinished");
  await act(async () => root.render(null)); await act(async () => root.render(<Form />));
  expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("  Raw unfinished 名称  ");
  expect(host.textContent).toContain("已恢复未保存内容");
  await act(async () => { await requestDraftResume({ kind: "career.resume-content", id }); await new Promise(resolve => setTimeout(resolve, 15)); });
  expect(host.querySelector("details")!.open).toBe(true); expect(document.activeElement).toBe(host.querySelector('[name="title"]'));
  expect(getDraftResumeStatus().status).toBe("accepted");
});
it("confirmed submission A retains typing B and only passes the frozen A to onSuccess", async () => {
  const result = deferred<{ status: "success"; message: string }>(), onSuccess = vi.fn();
  await act(async () => root.render(<Form action={() => result.promise} onSuccess={onSuccess} />));
  await write("title", "A"); await submit(); await write("title", "B");
  await act(async () => result.resolve({ status: "success", message: "saved" }));
  expect(onSuccess.mock.calls[0][0].get("title")).toBe("A");
  await act(async () => root.render(null)); await act(async () => root.render(<Form />));
  expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("B");
});
it("old A submission cannot close or clear a later A instance after A to B to A", async () => {
  const result = deferred<{ status: "success"; message: string }>(), onSuccess = vi.fn();
  await act(async () => root.render(<Form action={() => result.promise} onSuccess={onSuccess} />)); await write("title", "first A"); await submit();
  await act(async () => root.render(<Form identity={secondId} />)); await write("title", "record B");
  await act(async () => root.render(<Form onSuccess={onSuccess} />)); await write("title", "new A");
  await act(async () => result.resolve({ status: "success", message: "saved" }));
  expect(onSuccess).not.toHaveBeenCalled(); expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("new A"); expect(getWorkflowDrafts().some(row => row.resumeTarget?.id === id)).toBe(true);
});
it("failed and uncertain saves retain the actual input and never show saved", async () => {
  const action = vi.fn().mockRejectedValue(new Error("lost_response"));
  await act(async () => root.render(<Form action={action} />)); await write("title", "Uncertain"); await submit();
  expect(host.textContent).toContain("未能确认保存结果"); expect(host.textContent).not.toContain("已保存。"); expect(getWorkflowDrafts()).toHaveLength(1);
});
it("quota failure does not constrain the mounted textarea or reset it on render", async () => {
  await act(async () => root.render(<Form />)); const large = "文".repeat(400001); await write("content_markdown", large);
  expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(large); expect(host.textContent).toContain("暂时无法在切页后恢复"); expect(getWorkflowDrafts()).toHaveLength(0);
  await act(async () => root.render(<Form />)); expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe(large);
});
it("expiry ends future recovery without changing current input", async () => {
  await act(async () => root.render(<Form />)); await write("title", "Still typing");
  await act(async () => expireWorkflowDrafts(Date.now() + 16 * 60000)); expect(getWorkflowDrafts()).toHaveLength(0); expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Still typing");
  await act(async () => root.render(null)); await act(async () => root.render(<Form />)); expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Original");
});
it("scope cleanup invalidates late submission callbacks", async () => {
  const result = deferred<{ status: "success"; message: string }>(), onSuccess = vi.fn();
  await act(async () => root.render(<Form action={() => result.promise} onSuccess={onSuccess} />)); await write("title", "old owner"); await submit();
  await act(async () => clearWorkspaceResources()); await act(async () => result.resolve({ status: "success", message: "saved" })); expect(onSuccess).not.toHaveBeenCalled(); expect(getWorkflowDrafts()).toHaveLength(0);
});
it("preserves repeated checkbox values and raw half decimals while rejecting undeclared sensitive fields", () => {
  expect(parseDraftFields("career.resume-bullets", { bullet_id: [id, secondId] })).toEqual({ bullet_id: [id, secondId] });
  expect(parseDraftFields("investment.entry", { quantity: "1.", price: "", occurred_on: "" })).toEqual({ quantity: "1.", price: "", occurred_on: "" });
  expect(parseDraftFields("career.resume-content", { title: "x", password: "secret" })).toBeNull();
});

it.each(["replacement", "logout", "owner-ABA"] as const)("revokes real mounted CareerForm submission and draft authority after %s", async mode => {
  reconcileWorkspaceScope("synthetic-A", "1");
  const action=vi.fn().mockResolvedValue({status:"success",message:"saved"});
  await act(async()=>root.render(<Form action={action}/>));await write("title","PRIVATE A");
  await act(async()=>{if(mode==="logout")clearWorkspaceResources();else {reconcileWorkspaceScope("synthetic-B","1");if(mode==="owner-ABA")reconcileWorkspaceScope("synthetic-A","1");}});
  await submit();await write("title","Attempted B");await submit();
  expect(action).not.toHaveBeenCalled();expect(getWorkflowDrafts()).toHaveLength(0);
});
it("same-owner server revision refresh keeps raw and original form authority",async()=>{
  reconcileWorkspaceScope("synthetic-A","1");const action=vi.fn().mockResolvedValue({status:"success",message:"saved"});
  await act(async()=>root.render(<Form action={action}/>));await write("title","Same owner raw");
  await act(async()=>reconcileWorkspaceScope("synthetic-A","2"));expect(getWorkflowDrafts()).toHaveLength(1);await submit();
  expect(action).toHaveBeenCalledOnce();expect(action.mock.calls[0][0].get("title")).toBe("Same owner raw");
});

it("changing a record key cannot revive a revoked mounted owner form; reopening creates only a fresh owner lease",async()=>{
 reconcileWorkspaceScope("A","1");const action=vi.fn().mockResolvedValue({status:"success",message:"saved"});await act(async()=>root.render(<Form action={action}/>));await write("title","Private original A");await act(async()=>reconcileWorkspaceScope("B","1"));await act(async()=>root.render(<Form action={action} identity={secondId}/>));await write("title","Rejected stale instance");await submit();expect(action).not.toHaveBeenCalled();expect(getWorkflowDrafts()).toHaveLength(0);
 await act(async()=>{await requestDraftResume({kind:"career.resume-content",id:secondId});});expect(getDraftResumeStatus().status).not.toBe("accepted");
 await act(async()=>root.render(null));await act(async()=>root.render(<Form action={action} identity={secondId}/>));expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Original");await write("title","Fresh B");await submit();expect(action).toHaveBeenCalledOnce();expect(action.mock.calls[0][0].get("title")).toBe("Fresh B");
});
