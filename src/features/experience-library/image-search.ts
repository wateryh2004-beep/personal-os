import type { ExperienceMedia } from "./types";

/** Only available, current recognized text is used; never fall back to a stale image. */
export function matchingExperienceImages(media: ExperienceMedia[], query: string) {
  const needle = query.trim().slice(0, 120).toLowerCase();
  if (!needle) return [];
  return media.flatMap((item, index) => {
    if (!item.available || item.ocrUnavailable || !item.ocrText) return [];
    const position = item.ocrText.toLowerCase().indexOf(needle);
    if (position < 0) return [];
    return [{ id: item.id, order: index + 1, excerpt: item.ocrText.slice(Math.max(0, position - 40), Math.min(item.ocrText.length, position + needle.length + 80)) }];
  });
}
