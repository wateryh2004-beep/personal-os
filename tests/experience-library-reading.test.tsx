// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ExperienceMediaManager, ExperienceMediaProvider } from "@/components/experience-library/experience-entry-actions";
import type { ExperienceMedia } from "@/features/experience-library/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/experience-library/actions", () => ({ archiveExperienceMedia: vi.fn(), moveExperienceMedia: vi.fn(), updateExperienceMedia: vi.fn() }));
let root: Root; let host: HTMLDivElement;
const records: ExperienceMedia[] = [1, 2].map((index) => ({ id: `media-${index}`, entryId: "entry", captureId: null, documentId: `document-${index}`, selectionStart: null, selectionEnd: null, selectionQuote: null, position: index - 1, caption: `合成图片 ${index}`, sourceKind: "file", createdAt: "2026-10-28T00:00:00Z", originalFilename: `image-${index}.png`, mimeType: "image/png", available: true }));

beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} })); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

it("keeps image controls hidden while reading and opens a keyboard-navigable gallery", async () => {
  await act(async () => root.render(<ExperienceMediaProvider media={records}>{records.map((media, index) => <ExperienceMediaManager key={media.id} media={media} captures={[]} order={index + 1} />)}</ExperienceMediaProvider>));
  expect(host.textContent).not.toContain("保存关联");
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.includes(text))!;
  await act(async () => button("管理图片").click());
  expect(host.textContent).toContain("保存关联");
  await act(async () => button("完成管理").click());
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="放大查看图片 1"]')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("1 / 2");
  await act(async () => button("下一张").click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("2 / 2");
  expect(document.querySelector<HTMLImageElement>('[role="dialog"] img')?.getAttribute("src")).toContain("document-2");
  await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
});
