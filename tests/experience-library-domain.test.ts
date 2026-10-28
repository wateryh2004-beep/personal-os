import { describe, expect, it } from "vitest";
import {
  experienceSelection,
  extractExperienceTags,
  normalizeExperienceSourceUrl,
  splitExperienceSegments,
  suggestExperienceTitle,
} from "@/features/experience-library/parsing";

describe("Experience Library source preservation", () => {
  it("keeps a 50,000-character paste byte-for-byte while identifying post and comment segments", () => {
    const postPrefix = "留学申请复盘 #留学 #申请\n";
    const commentPrefix = "\n评论 1：GPA 截图如下\n";
    const payloadSize = 50_000 - postPrefix.length - commentPrefix.length;
    const raw = `${postPrefix}${"A".repeat(Math.ceil(payloadSize / 2))}${commentPrefix}${"B".repeat(Math.floor(payloadSize / 2))}`;
    expect(raw.length).toBe(50_000);
    const parsed = splitExperienceSegments(raw, "auto");
    expect(parsed.captureType).toBe("mixed");
    expect(parsed.segments.map((segment) => segment.text).join("")).toBe(raw);
    expect(parsed.segments[0]).toMatchObject({ kind: "post", start: 0 });
    expect(parsed.segments[1]).toMatchObject({ kind: "comment", label: "评论 1" });
    expect(extractExperienceTags(raw)).toEqual(["留学", "申请"]);
    expect(suggestExperienceTitle(raw)).toContain("留学申请复盘");
  });

  it("preserves the exact selected quote and rejects stale or empty ranges", () => {
    const raw = "正文\n评论：GPA 3.8";
    const start = raw.indexOf("GPA");
    expect(experienceSelection(raw, start, raw.length)).toEqual({
      selectionStart: start,
      selectionEnd: raw.length,
      selectionQuote: "GPA 3.8",
    });
    expect(() => experienceSelection(raw, start, raw.length + 1)).toThrow("选区已失效");
    expect(() => experienceSelection(raw, 4, 4)).toThrow("选区已失效");
  });

  it("normalizes only the source URL and never modifies pasted content", () => {
    expect(normalizeExperienceSourceUrl(" https://www.xiaohongshu.com/explore/abc#comments ")).toBe(
      "https://www.xiaohongshu.com/explore/abc",
    );
    expect(() => normalizeExperienceSourceUrl("javascript:alert(1)")).toThrow("来源链接格式不正确");
    expect(splitExperienceSegments("  原样空格  \n", "post").segments[0].text).toBe(
      "  原样空格  \n",
    );
  });

  it("extracts a link from a Xiaohongshu share message without dropping query tokens", () => {
    const link = "https://www.xiaohongshu.com/discovery/item/synthetic?source=webshare&xsec_token=synthetic%2Btoken%3D&xsec_source=pc_share";
    const share = `40 【合成的经验分享 - 用户 | 小红书】 😆 ABC123 😆 ${link}`;
    expect(normalizeExperienceSourceUrl(share)).toBe(link);
    expect(normalizeExperienceSourceUrl(`查看：${link}，更多信息`)).toBe(link);
    expect(normalizeExperienceSourceUrl(" https://xhslink.com/synthetic ")).toBe("https://xhslink.com/synthetic");
    expect(() => normalizeExperienceSourceUrl("没有链接的分享文字")).toThrow("来源链接格式不正确");
    expect(() => normalizeExperienceSourceUrl("https://user:password@example.test/secret")).toThrow("不能包含用户名或密码");
  });
});
