// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/features/files/file-checksum", () => ({ checksumFile: async () => "a".repeat(64) }));
import { UploadStaging } from "@/components/files/upload-staging";
import { beginFileStaging, readFileStaging, updateFileStaging, discardFileStaging } from "@/features/files/staging-runtime";
import { getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
const folder = "11111111-1111-4111-8111-111111111111";
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); HTMLElement.prototype.scrollIntoView = vi.fn(); vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => setTimeout(() => fn(0),0)); vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { const input=JSON.parse(String(init.body)); return Response.json({matches:[{id:input.files[0].id,candidates:[]}]}); })); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function typeTitle(value: string) { const input=host.querySelector<HTMLInputElement>('input[aria-label^="显示名称"]')!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value); input.dispatchEvent(new Event("input",{bubbles:true})); }); }
it("keeps original handles, stable distinct copy IDs and edited staging across unmount, with zero upload writes", async () => {
  const first=new File(["private-original"],"same.txt",{type:"text/plain",lastModified:100}), second=new File(["private-original"],"same.txt",{type:"text/plain",lastModified:100});
  const session=beginFileStaging([first,second],null).session, confirmed=vi.fn(), close=vi.fn();
  await act(async () => root.render(<UploadStaging session={session} files={[first,second]} folderId={null} folders={[{id:folder,name:"目标",parent_id:null}]} onConfirm={confirmed} onCancel={close} />));
  await typeTitle("显示名称 已整理"); await act(async () => { const select=host.querySelector("select")!; select.value=folder; select.dispatchEvent(new Event("change",{bubbles:true})); });
  const ids=session.plans.map(plan=>plan.id); expect(new Set(ids).size).toBe(2);
  await act(async () => root.render(null)); const restored=readFileStaging(session.id)!;
  expect(restored.plans[0].file).toBe(first); expect(restored.plans[1].file).toBe(second); expect(restored.plans.map(plan=>plan.id)).toEqual(ids); expect(restored.plans[0].title).toBe("显示名称 已整理"); expect(restored.plans.every(plan=>plan.folderId===folder)).toBe(true);
  expect(JSON.stringify(getWorkflowDrafts())).not.toContain("private-original"); expect(JSON.stringify(getWorkflowDrafts())).not.toContain("same.txt");
  await act(async () => root.render(<UploadStaging session={restored} files={[first,second]} folderId={null} folders={[{id:folder,name:"目标",parent_id:null}]} onConfirm={confirmed} onCancel={close} />));
  expect(host.querySelector<HTMLInputElement>('input[aria-label^="显示名称"]')!.value).toBe("显示名称 已整理");
  expect(vi.mocked(fetch).mock.calls.every(([url])=>url==="/api/files/upload-candidates")).toBe(true); expect(confirmed).not.toHaveBeenCalled();
  await act(async () => [...host.querySelectorAll("button")].find(node=>node.textContent?.startsWith("确认上传"))!.click());
  expect(confirmed.mock.calls[0][0].map((plan:{id:string})=>plan.id)).toEqual(ids); expect(confirmed.mock.calls[0][0][0].file).toBe(first); expect(readFileStaging(session.id)).toBeNull();
});
it("keeps an existing unfinished batch instead of silently replacing native originals", () => {
  const a=new File(["a"],"a.txt"), b=new File(["b"],"b.txt"); const first=beginFileStaging([a],null), second=beginFileStaging([b],null);
  expect(second.status).toBe("existing"); expect(second.session.plans[0].file).toBe(a);
  discardFileStaging(first.session.id); expect(beginFileStaging([b],null).session.plans[0].file).toBe(b);
});
it("bounds native staging at fifty originals and expires future recovery after fifteen minutes", async () => {
  vi.useFakeTimers(); const files=Array.from({length:51},(_,index)=>new File(["x"],`${index}.txt`)); const session=beginFileStaging(files,null).session;
  expect(session.plans).toHaveLength(50); expect(session.overflow).toBe(1);
  await vi.advanceTimersByTimeAsync(15*60000); expect(readFileStaging(session.id)).toBeNull(); expect(getWorkflowDrafts()).toHaveLength(0);
});
it("rejects same-name replacement bytes and stale owner/session updates", () => {
  const file=new File(["a"],"same.txt",{type:"text/plain",lastModified:1}); const a=beginFileStaging([file],null).session;
  expect(updateFileStaging(a.id,a.plans.map(plan=>({...plan,file:new File(["b"],"same.txt",{type:"text/plain",lastModified:1})})))).toBe(false);
  clearWorkspaceResources(); const b=beginFileStaging([new File(["new"],"new.txt")],null).session;
  expect(updateFileStaging(a.id,a.plans)).toBe(false); expect(readFileStaging(b.id)?.plans[0].file.name).toBe("new.txt");
});
