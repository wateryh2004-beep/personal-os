import { expect, it } from "vitest";
import { matchingExperienceImages } from "@/features/experience-library/image-search";
import type { ExperienceMedia } from "@/features/experience-library/types";
const image: ExperienceMedia = { id: "a", entryId: "entry", captureId: null, documentId: "doc", selectionStart: null, selectionEnd: null, selectionQuote: null, position: 0, caption: null, sourceKind: "file", createdAt: "2026-10-28", originalFilename: "x.png", mimeType: "image/png", available: true, ocrText: "图片里的秋招经验，截止时间是十月。" };
it("finds current OCR text and identifies its corresponding original image", () => {
  expect(matchingExperienceImages([image], "秋招")).toEqual([{ id: "a", order: 1, excerpt: "图片里的秋招经验，截止时间是十月。" }]);
  expect(matchingExperienceImages([image], "无关文字")).toEqual([]);
  expect(matchingExperienceImages([{ ...image, available: false }], "秋招")).toEqual([]);
  expect(matchingExperienceImages([{ ...image, ocrUnavailable: true }], "秋招")).toEqual([]);
  expect(matchingExperienceImages([image], "  ")).toEqual([]);
});
