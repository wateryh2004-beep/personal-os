import { describe, expect, it } from "vitest";
import { assembleExperienceSources, verifiedExperienceCitation } from "@/features/experience-library/source-attribution";

describe("experience AI evidence", () => {
  const sources = [
    { type: "capture" as const, id: "capture", text: "秋招需要查看官网", label: "正文" },
    { type: "image" as const, id: "media", text: "截图中写着岗位要求", label: "图片识别" },
  ];
  it("points to the exact included capture or image only when the quotation is present", () => {
    const { included } = assembleExperienceSources(sources, 500);
    expect(verifiedExperienceCitation(1, "查看官网", included)).toEqual({ sourceCaptureId: "capture", sourceMediaId: null, sourceQuote: "查看官网" });
    expect(verifiedExperienceCitation(2, "岗位要求", included)).toEqual({ sourceCaptureId: null, sourceMediaId: "media", sourceQuote: "岗位要求" });
    expect(verifiedExperienceCitation(1, "不存在的内容", included).sourceCaptureId).toBeNull();
  });
  it("never cites omitted or truncated source text", () => {
    const { included, text } = assembleExperienceSources(sources, 15);
    expect(text.length).toBeLessThanOrEqual(15);
    expect(verifiedExperienceCitation(2, "岗位要求", included).sourceMediaId).toBeNull();
    expect(verifiedExperienceCitation(1, "需要查看官网", included).sourceCaptureId).toBeNull();
  });
});

it("reserves context for image evidence when a capture is much longer than the budget", () => {
  const result = assembleExperienceSources([
    { type: "capture", id: "capture", text: "原文".repeat(1000), label: "正文" },
    { type: "image", id: "image", text: "图片证据：报名截止时间", label: "图片识别" },
  ], 120);
  expect(result.text.length).toBeLessThanOrEqual(120);
  expect(result.truncated).toBe(true);
  expect(result.included).toHaveLength(2);
  expect(result.included[1].text).toContain("图片证据");
  expect(verifiedExperienceCitation(2, "图片证据", result.included).sourceMediaId).toBe("image");
});

it("does not let a long list of captures crowd all images out of a small context", () => {
  const captures = Array.from({ length: 100 }, (_, i) => ({ type: "capture" as const, id: String(i), label: "正文", text: "原文".repeat(100) }));
  const result = assembleExperienceSources([...captures, { type: "image", id: "img", label: "图片", text: "截图文字" }], 100);
  expect(result.included.some((source) => source.id === "img")).toBe(true);
  expect(result.text.length).toBeLessThanOrEqual(100);
});
