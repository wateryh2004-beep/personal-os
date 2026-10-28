import type { ExperienceAiKeyPoint, ExperienceCapture, ExperienceMedia } from "./types";

/** A previously saved citation may become stale after a source is changed or archived. */
export function resolveExperienceCitation(point: ExperienceAiKeyPoint, captures: ExperienceCapture[], media: ExperienceMedia[]) {
  if (!point.sourceQuote) return null;
  const captureIndex = captures.findIndex((item) => item.id === point.sourceCaptureId && item.rawContent.includes(point.sourceQuote!));
  if (captureIndex >= 0) {
    const capture = captures[captureIndex];
    const segment = capture.segments.find((item) => item.text.includes(point.sourceQuote!));
    return { kind: "capture" as const, href: segment ? `#experience-segment-${capture.id}-${segment.start}` : `#experience-capture-${capture.id}`, label: `查看原文 ${captureIndex + 1}` };
  }
  const imageIndex = media.findIndex((item) => item.id === point.sourceMediaId && item.available && item.ocrText?.includes(point.sourceQuote!));
  if (imageIndex >= 0) return { kind: "image" as const, href: `#experience-media-${media[imageIndex].id}`, label: `查看图片 ${imageIndex + 1}` };
  return null;
}
