import { describe, expect, it } from "vitest";
import { canonicalizeArticleUrl, identityKey, normalizeTitle } from "@/features/briefing/normalize";
import { parseFeedXml } from "@/features/briefing/parser";
import { diversifyCandidates, rankBriefingCandidates } from "@/features/briefing/ranking";
import { assertPublicHttpUrl } from "@/features/briefing/safe-fetch";

describe("Briefing RSS-first pipeline", () => {
  it("只移除跟踪参数，保留业务 query", () => expect(canonicalizeArticleUrl("https://EXAMPLE.com/a/?id=7&utm_source=x&fbclid=y#part")).toBe("https://example.com/a?id=7"));
  it("稳定规范化中英文标题和 identity", () => { expect(normalizeTitle("AI：市场！  Update")).toBe("ai 市场 update"); expect(identityKey({ title: "同一标题", publishedAt: "2026-08-08T01:00:00Z" })).toBe(identityKey({ title: "同一标题", publishedAt: "2026-08-08T01:00:00Z" })); });
  it("用成熟 parser 统一 RSS 与 Atom", () => { const rss=parseFeedXml(`<?xml version="1.0"?><rss version="2.0"><channel><title>示例</title><link>https://example.com</link><item><guid>x1</guid><title>第一条</title><link>https://example.com/1</link><description><![CDATA[<p>摘要</p>]]></description></item></channel></rss>`); expect(rss.type).toBe("rss"); expect(rss.items[0]).toMatchObject({externalId:"x1",title:"第一条",contentText:"摘要"}); const atom=parseFeedXml(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>a1</id><title>Hello</title><link href="https://example.com/a"/><summary>Text</summary></entry></feed>`); expect(atom.type).toBe("atom"); expect(atom.items[0].url).toBe("https://example.com/a"); });
  it("拒绝 DTD / entity", () => expect(()=>parseFeedXml(`<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss></rss>`)).toThrow("unsafe_xml"));
  it("拒绝本机、私网和非 HTTP Feed 地址", async()=>{await expect(assertPublicHttpUrl("http://127.0.0.1/feed")).rejects.toThrow("blocked_host");await expect(assertPublicHttpUrl("http://192.168.1.20/rss")).rejects.toThrow("blocked_host");await expect(assertPublicHttpUrl("file:///tmp/feed.xml")).rejects.toThrow("invalid_url");});
  it("确定性排序并限制同一 Feed 的占比", () => { const now=new Date("2026-08-08T10:00:00Z"); const candidates=[0,1,2].map((index)=>({clusterId:`c${index}`,itemId:`i${index}`,feedId:index<2?"f1":"f2",title:index===2?"量化研究更新":"普通新闻",excerpt:"有足够长度的资讯摘要，用于测试内容质量与稳定排序。".repeat(2),url:null,publishedAt:"2026-08-08T09:00:00Z",firstSeenAt:"2026-08-08T09:00:00Z",feedPriority:50,feedTitle:index<2?"源一":"源二"})); const ranked=rankBriefingCandidates(candidates,[{name:"量化",keywords:["量化"],excludedKeywords:[],weight:80}],now); expect(ranked[0].feedId).toBe("f2"); expect(diversifyCandidates(ranked,3).filter((item)=>item.feedId==="f1")).toHaveLength(2); });
});
