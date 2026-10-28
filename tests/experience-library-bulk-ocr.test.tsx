// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ recognize: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/features/experience-library/browser-image-ocr", () => ({ recognizeExperienceImage: state.recognize }));
import { ExperienceBulkOcr } from "@/components/experience-library/experience-bulk-ocr";
import type { ExperienceMedia } from "@/features/experience-library/types";
it("recognizes old unindexed images and leaves completed or unavailable images alone", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const base: ExperienceMedia = { id: "one", entryId: "entry", captureId: null, documentId: "doc1", selectionStart: null, selectionEnd: null, selectionQuote: null, position: 0, caption: null, sourceKind: "file", createdAt: "2026-10-28", originalFilename: "one.png", mimeType: "image/png", available: true, fileSize: 123, ocrText: null };
  state.recognize.mockResolvedValue("completed");
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<ExperienceBulkOcr media={[base, { ...base, id: "two", documentId: "doc2", ocrText: "已识别" }, { ...base, id: "three", available: false }]} />));
  expect(host.textContent).toContain("识别本篇未识别图片（1）");
  await act(async () => host.querySelector("button")!.click());
  expect(state.recognize).toHaveBeenCalledOnce(); expect(state.recognize.mock.calls[0][1]).toBe("doc1");
  expect(host.textContent).toContain("1 张已加入搜索"); expect(state.refresh).toHaveBeenCalledOnce();
  await act(async () => root.unmount()); host.remove();
});
