// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewStructuredData } from "@/features/reviews/types";
import type { ReviewEvidence } from "@/features/reviews/evidence";
const mocks = vi.hoisted(() => ({ push: vi.fn(), createTrip: vi.fn(),readTrip:vi.fn(), completeReview: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("@/features/travel/create-intents",()=>({submitTravelCreationIntent:mocks.createTrip,readTravelCreationIntent:mocks.readTrip}));
vi.mock("@/features/reviews/actions", () => ({ completeReview: mocks.completeReview, generateReviewDraft: vi.fn() }));
vi.mock("@/components/reviews/review-editor", () => ({ ReviewEditor: ({ value, onChange }: { value: ReviewStructuredData; onChange: (value: ReviewStructuredData) => void }) => <textarea aria-label="复盘草稿" value={value.freeReflection} onChange={event => onChange({ ...value, freeReflection: event.target.value })} /> }));
vi.mock("@/components/reviews/review-evidence", () => ({ ReviewEvidencePanel: () => null }));
import { ReviewComposer } from "@/components/reviews/review-composer";
import { TravelWorkspace } from "@/components/travel/travel-workspace";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { beginSourceNavigation, captureSourceNavigation } from "@/features/workflow-continuity/source-trail";

let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const id = "00000000-0000-4000-8000-000000000001";
const initialValue: ReviewStructuredData = { wins: [], friction: [], openLoops: [], changes: [], lessons: [], nextFocus: [], freeReflection: "合成草稿" };
const evidence: ReviewEvidence = { reviewType: "daily", periodStart: "2026-10-27", periodEnd: "2026-10-27", generatedAt: "2026-10-27T00:00:00Z", calendar: [], tasksCompleted: [], tasksOpen: [], notes: [], inbox: [], career: [], projects: [], decisions: [] };
const scene = { version: 1 as const, main: { href: "/reviews/daily" }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" as const } };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); vi.clearAllMocks(); Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
async function start(domain: "review" | "travel") {
  if (domain === "review") {
    const result = deferred<{ reviewId: string }>(); mocks.completeReview.mockReturnValue(result.promise);
    await act(async () => root.render(<ReviewComposer type="daily" evidence={evidence} initialValue={initialValue} />));
    return { submit: async () => { await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "完成复盘")!.click()); }, finish: async () => { await act(async () => result.resolve({ reviewId: id })); } };
  }
  const result = deferred<{status:"saved";id:string}>(); mocks.createTrip.mockReturnValue(result.promise);
  await act(async () => root.render(<TravelWorkspace trips={[]} initialCreateOpen />));
  const input = document.querySelector<HTMLInputElement>('input[name="title"]')!; input.value = "合成旅行";
  return { submit: async () => { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }, finish: async () => { await act(async () => result.resolve({status:"saved",id})); } };
}
describe.each(["review", "travel"] as const)("%s save navigation freezes the original foreground intent", domain => {
  it("cancels an older pending source capture when the real submit handler begins", async () => {
    const operation = await start(domain); const previous = deferred<typeof scene>();
    const pending = captureSourceNavigation({ capture: () => previous.promise, destination: "/files", label: "旧来源", current: beginSourceNavigation(), navigate: mocks.push });
    await operation.submit();
    await act(async () => previous.resolve(scene)); await pending;
    expect(mocks.push).not.toHaveBeenCalled();
    await operation.finish(); expect(mocks.push.mock.calls).toEqual([[`/${domain === "review" ? "reviews" : "travel"}/${id}`]]);
  });
  it("does not turn an old save response into a new navigation after a newer source intent", async () => {
    const operation = await start(domain); await operation.submit();
    const next = deferred<typeof scene>(); const pending = captureSourceNavigation({ capture: () => next.promise, destination: "/files", label: "新来源", current: beginSourceNavigation(), navigate: mocks.push });
    if (domain === "review") {
      const input = host.querySelector("textarea")!;
      await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "保存中继续输入"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    }
    await operation.finish(); expect(mocks.push).not.toHaveBeenCalled();
    if (domain === "review") expect(host.querySelector("textarea")!.value).toBe("保存中继续输入");
    else {
      expect(document.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("合成旅行");
      expect(document.body.textContent).toContain("旅行灵感已保存");
      expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    }
    await act(async () => next.resolve(scene)); await pending;
    expect(mocks.push.mock.calls).toEqual([["/files"]]);
  });
  it.each(["unmount", "scope"] as const)("cannot navigate after %s even if the write completes", async interruption => {
    const operation = await start(domain); await operation.submit();
    await act(async () => { if (interruption === "unmount") root.render(null); else clearWorkspaceResources(); });
    await operation.finish(); expect(mocks.push).not.toHaveBeenCalled();
  });
});
it("keeps an uncertain travel creation input and requires checking before another save", async () => {
  mocks.createTrip.mockRejectedValue(new Error("synthetic lost response"));
  await act(async () => root.render(<TravelWorkspace trips={[]} initialCreateOpen />));
  const input = document.querySelector<HTMLInputElement>('input[name="title"]')!; input.value = "待核对旅行";
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(input.value).toBe("待核对旅行"); expect(document.body.textContent).toContain("保存结果尚未确认");
  mocks.readTrip.mockResolvedValue({status:"needs-check",message:"原旅行仍待核对"});await act(async()=>document.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));expect(mocks.readTrip).toHaveBeenCalledOnce();expect(mocks.createTrip).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled(); expect(mocks.createTrip).toHaveBeenCalledTimes(1);
});
