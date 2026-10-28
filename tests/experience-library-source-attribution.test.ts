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
