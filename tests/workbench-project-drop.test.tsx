// @vitest-environment jsdom
import { act, lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const service = vi.hoisted(() => ({ link: vi.fn(), targets: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: (load: () => Promise<ComponentType>) => lazy(async () => ({ default: await load() })) }));
vi.mock("@/features/workbench/operation-links", () => ({ linkWorkbenchRecords: service.link, readWorkbenchLinkTargets: service.targets }));
import { WorkbenchProvider, WorkbenchLayout, useWorkbenchHost } from "@/components/workbench/workbench-provider";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { OperationLinkDialog } from "@/components/workbench/operation-links";
import { workbenchEntityResource } from "@/features/workbench/resource";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { workbenchDragMime } from "@/features/workbench/contracts";
const source = { kind: "note" as const, id: "10000000-0000-4000-8000-000000000001" };
const project = { kind: "project" as const, id: "20000000-0000-4000-8000-000000000001" };
let host: HTMLDivElement; let root: Root;
function Harness() {
  const workbench = useWorkbenchHost(); const [intent, setIntent] = useState<Event>();
  useEffect(() => { const accept = (event: Event) => setIntent(event); window.addEventListener("personal-os:link-preview", accept); return () => window.removeEventListener("personal-os:link-preview", accept); }, []);
  return <><button onClick={() => workbench.setReference({ ref: project })}>Project reference</button><WorkbenchLayout><WorkbenchRecord entity={source} title="Synthetic note" group="notes"><p>Source note remains in place</p></WorkbenchRecord></WorkbenchLayout><OperationLinkDialog initialIntent={intent} /></>;
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); clearWorkspaceResources();
  window.history.replaceState(null, "", "/notes"); vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  service.targets.mockReset().mockResolvedValue([]); service.link.mockReset().mockResolvedValue({ status: "success", receiptId: "30000000-0000-4000-8000-000000000001", message: "关联已保存" });
  workbenchEntityResource(project).set({ status: "ready", entity: { ref: project, title: "Synthetic project", href: "/projects", fields: [], subtitle: null, sourceUrls: [], asOf: null } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><Harness /></WorkbenchProvider></Suspense>));
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Project reference")!.click());
  for (let attempt = 0; attempt < 30 && !host.textContent?.includes("拖入笔记或文件"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });
async function drop() {
  let payload = "";
  const transfer = { types: [workbenchDragMime], effectAllowed: "copy", getData: () => payload, setData: (type: string, value: string) => { expect(type).toBe(workbenchDragMime); payload = value; } };
  const drag = new Event("dragstart", { bubbles: true, cancelable: true }); Object.defineProperty(drag, "dataTransfer", { value: transfer });
  await act(async () => host.querySelector<HTMLButtonElement>('button[draggable="true"]')!.dispatchEvent(drag));
  expect(JSON.parse(payload)).toEqual(source);
  const target = [...host.querySelectorAll("p")].find((node) => node.textContent === "拖入笔记或文件建立关联")!.parentElement!;
  const event = new Event("drop", { bubbles: true, cancelable: true }); Object.defineProperty(event, "dataTransfer", { value: transfer });
  await act(async () => target.dispatchEvent(event));
}
it("lets a main note drop on the real Project reference target, cancel, then confirm through the shared link action", async () => {
  await drop(); expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Synthetic project"); expect(service.link).not.toHaveBeenCalled();
  await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "取消")!.click()); expect(service.link).not.toHaveBeenCalled();
  await drop(); await act(async () => [...document.querySelectorAll("button")].find((button) => button.textContent === "确认建立关联")!.click());
  expect(service.link).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), source: { type: "note", id: source.id }, target: { type: "project", id: project.id } }));
  expect(host.textContent).toContain("Source note remains in place"); expect(document.querySelector('[role="dialog"]')).toBeNull();
});
