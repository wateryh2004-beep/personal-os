import { expect, it } from "vitest";
import { experienceSegmentHighlights } from "@/features/experience-library/segment-highlights";
import type { ExperienceMedia, ExperienceSegment } from "@/features/experience-library/types";
it("preserves both image selection and multiple AI quotations, merging overlapping ranges", () => {
  const segment: ExperienceSegment = { kind: "comment", text: "图片选区和第一个引用以及第二个引用", start: 10, end: 28, label: null };
  const media = { selectionStart: 10, selectionEnd: 14 } as ExperienceMedia;
  const ranges = experienceSegmentHighlights(segment, media, ["第一个引用", "第二个引用", "一个引用"]);
  expect(ranges).toEqual([{ start: 0, end: 4 }, { start: 5, end: 10 }, { start: 12, end: 17 }]);
  expect(ranges.map((range) => segment.text.slice(range.start, range.end))).toEqual(["图片选区", "第一个引用", "第二个引用"]);
});
