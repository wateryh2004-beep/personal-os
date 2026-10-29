// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ keep: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/features/experience-library/actions", () => ({ keepExperienceReadingDocument: state.keep }));
import { ExperienceReadingDocuments } from "@/components/experience-library/experience-reading-documents";
import type { ExperienceReadingDocument } from "@/features/experience-library/types";
const first: ExperienceReadingDocument = { captureId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", entryId: "entry", title: "值得读", bodyMarkdown: "先核对岗位要求。", sourceRefs: [{ type: "capture", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quote: "岗位要求", valid: true }], qualityStatus: "keep", qualityReason: "", coverageStatus: "complete", revision: 1, updatedAt: "2026-10-29" };
it("shows useful reading first and folds pending-delete material while source links open the original", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true, requestAnimationFrame: (callback: FrameRequestCallback) => { callback(0); return 0; } });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const source = document.createElement("details"); source.id = "experience-originals"; host.append(source);
  await act(async () => root.render(<><details id="experience-originals"><summary>原文</summary><p id="experience-capture-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa">岗位要求</p></details><ExperienceReadingDocuments documents={[first, { ...first, captureId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "噪音", bodyMarkdown: "重复内容", qualityStatus: "pending_delete", qualityReason: "重复" }]} captureCount={2} /></>));
  expect(host.querySelector(".experience-reading-heading")?.textContent).toContain("1 篇值得保留");
  const pending = host.querySelector<HTMLDetailsElement>(".experience-pending-delete")!;
  expect(pending.open).toBe(false);
  expect(host.textContent).toContain("待删除的 1 篇");
  state.keep.mockResolvedValue(undefined);
  await act(async () => { pending.open = true; pending.querySelector<HTMLButtonElement>("button")!.click(); });
  expect(state.keep).toHaveBeenCalledWith("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1);
  await act(async () => host.querySelector<HTMLAnchorElement>('a[href="#experience-capture-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]')!.click());
  expect(host.querySelector<HTMLDetailsElement>("#experience-originals")?.open).toBe(true);
  await act(async () => root.unmount()); host.remove();
});
