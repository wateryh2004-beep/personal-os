import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => createElement("a", { href, ...rest }, children) }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/components/experience-library/experience-task-action", () => ({ ExperienceTaskAction: () => null }));
vi.mock("@/components/experience-library/experience-maintenance", () => ({ ExperienceMaintenance: () => null }));
vi.mock("@/components/experience-library/experience-personal-note", () => ({ ExperiencePersonalNote: () => null }));
vi.mock("@/components/experience-library/experience-entry-actions", () => ({ ExperienceAiAnalyzeButton: () => null, ExperienceMediaProvider: ({ children }: { children: ReactNode }) => children, ExperienceMediaManager: ({ media }: { media: { id: string } }) => createElement("figure", { id: `experience-media-${media.id}` }) }));
vi.mock("@/features/experience-library/queries", () => ({ getExperienceAiConfig: async () => ({ configured: false }), getExperienceEntry: async () => ({
  entry: { id: "entry", title: "合成资料", sourceUrl: null, tags: [], createdAt: "2026-10-28T00:00:00Z", mediaCount: 1, aiStatus: "not_requested", summary: null },
  captures: [], aiKeyPoints: [], tasks: [],
  media: [{ id: "image", entryId: "entry", captureId: null, documentId: "doc", selectionStart: null, selectionEnd: null, selectionQuote: null, position: 0, caption: null, sourceKind: "file", createdAt: "2026-10-28T00:00:00Z", originalFilename: "test.png", mimeType: "image/png", available: true, ocrText: "秋招的截图内容" }],
}) }));
import ExperienceEntryPage from "@/app/(app)/experience-library/[entryId]/page";
it("shows a usable link from an OCR search match to the matching original", async () => {
  const page = await ExperienceEntryPage({ params: Promise.resolve({ entryId: "entry" }), searchParams: Promise.resolve({ q: "秋招" }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain("秋招的截图内容");
  expect(html).toContain('href="#experience-media-image"');
  expect(html).toContain('id="experience-media-image"');
  expect(html).toContain('/experience-library?q=%E7%A7%8B%E6%8B%9B');
});
