// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("unpdf/pdfjs", () => ({ getDocument: mocks.getDocument }));
vi.mock("@/features/files/reading-progress-actions", () => ({ getReadingProgress: vi.fn(), saveReadingProgress: vi.fn() }));
import { VaultPdfPreview } from "@/components/vault/vault-pdf-preview";
let host: HTMLDivElement, root: Root;
let pdf: { numPages: number; getPage: ReturnType<typeof vi.fn> };
let task: { promise: Promise<typeof pdf>; destroy: ReturnType<typeof vi.fn> };
let paint: { promise: Promise<void>; cancel: ReturnType<typeof vi.fn> };
const source = (size=8) => ({ size, arrayBuffer: vi.fn(async () => new Uint8Array([37,80,68,70,45,49,46,55]).buffer) } as unknown as Blob);
async function show(blob=source()) { await act(async () => root.render(createElement(VaultPdfPreview,{blob,title:"合成暗格 PDF"}))); }
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
  vi.stubGlobal("ResizeObserver",undefined);
  vi.stubGlobal("fetch",vi.fn(() => { throw new Error("must use verified bytes only"); }));
  vi.spyOn(HTMLCanvasElement.prototype,"getContext").mockReturnValue({} as CanvasRenderingContext2D);
  vi.spyOn(Element.prototype,"getBoundingClientRect").mockReturnValue({width:400} as DOMRect);
  paint={promise:Promise.resolve(),cancel:vi.fn()};
  pdf={numPages:2,getPage:vi.fn(async () => ({getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),render:vi.fn(()=>paint),cleanup:vi.fn()}))};
  task={promise:Promise.resolve(pdf),destroy:vi.fn(async()=>{})};
  mocks.getDocument.mockReset().mockImplementation(()=>task);
  host=document.createElement("div");document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
it("renders verified bytes locally without a new network request or native PDF iframe",async()=>{
  await show();
  expect(mocks.getDocument).toHaveBeenCalledWith(expect.objectContaining({data:expect.any(Uint8Array),enableXfa:false,useWorkerFetch:false,useWasm:false}));
  expect(fetch).not.toHaveBeenCalled();expect(host.querySelector("iframe")).toBeNull();
  expect(host.querySelector('canvas[data-pdf-rendered="true"]')).not.toBeNull();
  expect(host.textContent).toContain("第 1 / 2 页");
  const next=[...host.querySelectorAll("button")].find(b=>b.textContent==="下一页")!;
  await act(async()=>next.click());expect(pdf.getPage).toHaveBeenLastCalledWith(2);
});
it.each([7,25*1024*1024+1])("rejects out-of-budget source bytes: %s",async size=>{
  const blob=source(size);await show(blob);expect(blob.arrayBuffer).not.toHaveBeenCalled();
  expect(mocks.getDocument).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("waits for actual canvas paint and cancels it when locked or closed",async()=>{
  let finish!:()=>void;paint.promise=new Promise(resolve=>{finish=resolve;});
  await show();const canvas=host.querySelector("canvas")!;
  expect(canvas.dataset.pdfRendered).toBeUndefined();expect(canvas.style.visibility).toBe("hidden");
  await act(async()=>root.render(null));await act(async()=>finish());
  expect(paint.cancel).toHaveBeenCalled();expect(task.destroy).toHaveBeenCalled();
});
it("destroys over-limit PDFs and shows a bounded failure",async()=>{
  pdf.numPages=501;await show();expect(task.destroy).toHaveBeenCalled();
  expect(host.querySelector("canvas")).toBeNull();expect(host.textContent).toContain("页数超出");
});
it("ignores bytes that finish loading after close",async()=>{
  let finish!:(v:ArrayBuffer)=>void;
  const blob={size:8,arrayBuffer:()=>new Promise<ArrayBuffer>(resolve=>{finish=resolve;})} as Blob;
  await show(blob);await act(async()=>root.render(null));await act(async()=>finish(new ArrayBuffer(8)));
  expect(mocks.getDocument).not.toHaveBeenCalled();
});
