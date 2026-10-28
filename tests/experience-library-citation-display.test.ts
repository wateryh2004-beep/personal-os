import { expect, it } from "vitest";
import { resolveExperienceCitation } from "@/features/experience-library/citation-display";
import type { ExperienceAiKeyPoint, ExperienceCapture, ExperienceMedia } from "@/features/experience-library/types";
const capture: ExperienceCapture = { id: "capture", captureType: "post", rawContent: "这是原文", segments: [{ kind: "post", text: "这是原文", start: 0, end: 4, label: null }], speaker: null, createdAt: "2026-10-28" };
const image: ExperienceMedia = { id: "image", entryId: "entry", captureId: null, documentId: "doc", selectionStart: null, selectionEnd: null, selectionQuote: null, position: 0, caption: null, sourceKind: "file", createdAt: "2026-10-28", originalFilename: "x.png", mimeType: "image/png", available: true, ocrText: "截图原文" };
const point: ExperienceAiKeyPoint = { text: "建议", kind: "opinion", sourceCaptureId: "capture", sourceMediaId: null, sourceQuote: "原文" };
it("only links quotes that still exist in the current original or available image", () => {
  expect(resolveExperienceCitation(point, [capture], [image])).toMatchObject({ href: "#experience-segment-capture-0", kind: "capture" });
  expect(resolveExperienceCitation({ ...point, sourceCaptureId: null, sourceMediaId: "image", sourceQuote: "截图" }, [capture], [image])).toMatchObject({ href: "#experience-media-image", kind: "image" });
  expect(resolveExperienceCitation({ ...point, sourceQuote: "已更改" }, [capture], [image])).toBeNull();
  expect(resolveExperienceCitation({ ...point, sourceCaptureId: null, sourceMediaId: "image", sourceQuote: "截图" }, [capture], [{ ...image, available: false }])).toBeNull();
});
