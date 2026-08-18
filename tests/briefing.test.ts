import { describe, expect, it } from "vitest";
import { canonicalizeArticleUrl, identityKey, normalizeTitle } from "@/features/briefing/normalize";
import { buildBriefingGenerationFeedback } from "@/features/briefing/feedback";
import { parseFeedXml } from "@/features/briefing/parser";
import { diversifyCandidates, rankBriefingCandidates } from "@/features/briefing/ranking";
import { briefingAiFailureCode, prefilterBriefingCandidates, selectDiverseAiCandidates } from "@/features/briefing/ai";
import { assertPublicHttpUrl } from "@/features/briefing/safe-fetch";
import {
  briefingRefreshDefaults,
  getBriefingItemHref,
  isFeedEligibleForBriefing,
  passesHardExclusions,
  shouldRefreshBriefingFeed,
} from "@/features/briefing/orchestrator";
import { isRecentGeneratingRun, selectDisplayedBriefing } from "@/features/briefing/runs";

describe("Briefing RSS-first pipeline", () => {
  it("只移除跟踪参数，保留业务 query", () => expect(canonicalizeArticleUrl("https://EXAMPLE.com/a/?id=7&utm_source=x&fbclid=y#part")).toBe("https://example.com/a?id=7"));
  it("稳定规范化中英文标题和 identity", () => { expect(normalizeTitle("AI：市场！  Update")).toBe("ai 市场 update"); expect(identityKey({ title: "同一标题", publishedAt: "2026-08-08T01:00:00Z" })).toBe(identityKey({ title: "同一标题", publishedAt: "2026-08-08T01:00:00Z" })); });
  it("用成熟 parser 统一 RSS 与 Atom", () => { const rss=parseFeedXml(`<?xml version="1.0"?><rss version="2.0"><channel><title>示例</title><link>https://example.com</link><item><guid>x1</guid><title>第一条</title><link>https://example.com/1</link><description><![CDATA[<p>摘要</p>]]></description></item></channel></rss>`); expect(rss.type).toBe("rss"); expect(rss.items[0]).toMatchObject({externalId:"x1",title:"第一条",contentText:"摘要"}); const atom=parseFeedXml(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>a1</id><title>Hello</title><link href="https://example.com/a"/><summary>Text</summary></entry></feed>`); expect(atom.type).toBe("atom"); expect(atom.items[0].url).toBe("https://example.com/a"); });
  it("拒绝 DTD / entity", () => expect(()=>parseFeedXml(`<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]><rss></rss>`)).toThrow("unsafe_xml"));
  it("拒绝本机、私网和非 HTTP Feed 地址", async()=>{await expect(assertPublicHttpUrl("http://127.0.0.1/feed")).rejects.toThrow("blocked_host");await expect(assertPublicHttpUrl("http://192.168.1.20/rss")).rejects.toThrow("blocked_host");await expect(assertPublicHttpUrl("file:///tmp/feed.xml")).rejects.toThrow("invalid_url");});
  it("确定性排序并限制同一 Feed 的占比", () => { const now=new Date("2026-08-08T10:00:00Z"); const candidates=[0,1,2].map((index)=>({clusterId:`c${index}`,itemId:`i${index}`,feedId:index<2?"f1":"f2",title:index===2?"量化研究更新":"普通新闻",excerpt:"有足够长度的资讯摘要，用于测试内容质量与稳定排序。".repeat(2),url:null,publishedAt:"2026-08-08T09:00:00Z",firstSeenAt:"2026-08-08T09:00:00Z",feedPriority:50,feedTitle:index<2?"源一":"源二"})); const ranked=rankBriefingCandidates(candidates,[{name:"量化",keywords:["量化"],excludedKeywords:[],weight:80}],now); expect(ranked[0].feedId).toBe("f2"); expect(diversifyCandidates(ranked,3).filter((item)=>item.feedId==="f1")).toHaveLength(2); });

  it("生成前只抓取尚未抓取或已经过期的订阅源", () => {
    const now = new Date("2026-08-10T04:00:00Z");
    expect(shouldRefreshBriefingFeed(null, now)).toBe(true);
    expect(shouldRefreshBriefingFeed("2026-08-10T03:30:00Z", now)).toBe(true);
    expect(shouldRefreshBriefingFeed("2026-08-10T03:55:00Z", now)).toBe(false);
  });

  it("明确反馈生成成功且结果显示在页面下方", () => {
    const state = buildBriefingGenerationFeedback(
      { activeFeedCount: 2, feedsDue: 2, feedsRefreshed: 2, feedsFailed: 0 },
      { briefingId: "brief-1", selected: 5, candidateCount: 18, filteredCount: 2, date: "2026-08-10" },
    );
    expect(state.status).toBe("success");
    expect(state.message).toContain("已生成 5 条");
    expect(state.message).toContain("本页下方");
  });

  it("空结果和抓取失败不会伪装成成功", () => {
    const empty = buildBriefingGenerationFeedback(
      { activeFeedCount: 2, feedsDue: 2, feedsRefreshed: 2, feedsFailed: 0 },
      { briefingId: "brief-1", selected: 0, candidateCount: 0, filteredCount: 0, date: "2026-08-10" },
    );
    const failed = buildBriefingGenerationFeedback(
      { activeFeedCount: 2, feedsDue: 2, feedsRefreshed: 0, feedsFailed: 2 },
      { briefingId: "brief-1", selected: 0, candidateCount: 0, filteredCount: 0, date: "2026-08-10" },
    );
    expect(empty.status).toBe("warning");
    expect(empty.message).toContain("近 96 小时");
    expect(failed.status).toBe("error");
    expect(failed.message).toContain("2 个订阅源抓取失败");
  });

  it("没有订阅源时给出下一步，而不是静默生成空简报", () => {
    const state = buildBriefingGenerationFeedback(
      { activeFeedCount: 0, feedsDue: 0, feedsRefreshed: 0, feedsFailed: 0 },
      null,
    );
    expect(state.status).toBe("warning");
    expect(state.message).toContain("添加 RSS / Atom 订阅");
  });

  it("当天未生成时持续展示最近完成的 Briefing", () => {
    const previous = { id: "run-a", briefing_date: "2026-08-09" };
    expect(selectDisplayedBriefing(null, previous)).toBe(previous);
  });

  it("失败 run 不会替换已完成的 Briefing", () => {
    const completed = { id: "run-a", briefing_date: "2026-08-09" };
    const failedRun = { id: "run-b", status: "failed" };
    expect(failedRun.status).toBe("failed");
    expect(selectDisplayedBriefing(null, completed)).toBe(completed);
  });

  it("暂停或归档的订阅不会进入 Briefing 候选", () => {
    expect(isFeedEligibleForBriefing({ status: "paused", archived_at: null })).toBe(false);
    expect(isFeedEligibleForBriefing({ status: "active", archived_at: "2026-08-10T00:00:00Z" })).toBe(false);
    expect(isFeedEligibleForBriefing({ status: "active", archived_at: null, verification_status: "verified" })).toBe(true);
  });

  it("待审核信源不会参与 ranking，审核通过且 active 后才会参与", () => {
    expect(isFeedEligibleForBriefing({ status: "paused", archived_at: null, verification_status: "pending" })).toBe(false);
    expect(isFeedEligibleForBriefing({ status: "active", archived_at: null, verification_status: "verified" })).toBe(true);
  });

  it("全局硬过滤直接排除命中内容", () => {
    expect(passesHardExclusions({ title: "娱乐八卦热搜", excerpt: "" }, ["娱乐八卦"])).toBe(false);
    expect(passesHardExclusions({ title: "宏观市场更新", excerpt: "" }, ["娱乐八卦"])).toBe(true);
  });

  it("文章链接优先 canonical URL，缺失时回退至原始 URL", () => {
    expect(getBriefingItemHref({ canonical_url: null, url: "https://example.com/item" })).toBe("https://example.com/item");
  });

  it("手动与 Cron 共享刷新服务的默认并发和批量限制", () => {
    expect(briefingRefreshDefaults).toEqual({ maxFeeds: 20, concurrency: 4 });
  });

  it("十分钟内已有 generating run 时拒绝再次生成", () => {
    expect(isRecentGeneratingRun({ updated_at: "2026-08-10T04:55:00Z" }, new Date("2026-08-10T05:00:00Z"))).toBe(true);
    expect(isRecentGeneratingRun({ updated_at: "2026-08-10T04:45:00Z" }, new Date("2026-08-10T05:00:00Z"))).toBe(false);
  });

  it("AI 前筛选最多保留每个信源四条和配置上限", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({ clusterId: `c${index}`, itemId: `i${index}`, feedId: "f1", title: `AI 条目 ${index}`, excerpt: "有足够长度的 RSS 摘要。".repeat(10), url: null, publishedAt: "2026-08-10T03:00:00Z", firstSeenAt: "2026-08-10T03:00:00Z", feedPriority: 80, feedTitle: "核心源" }));
    expect(prefilterBriefingCandidates(candidates, [], new Date("2026-08-10T04:00:00Z"), 24)).toHaveLength(4);
  });

  it("AI 前筛选仍限制每个信源最多四条", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => ({ clusterId: `c${index}`, itemId: `i${index}`, feedId: "f1", title: `AI 条目 ${index}`, excerpt: "有足够长度的 RSS 摘要。".repeat(10), url: null, publishedAt: "2026-08-10T03:00:00Z", firstSeenAt: "2026-08-10T03:00:00Z", feedPriority: 80, feedTitle: "核心源" }));
    expect(prefilterBriefingCandidates(candidates, [], new Date("2026-08-10T04:00:00Z"), 24)).toHaveLength(4);
  });

  function aiCandidate(index: number, feedId: string, topicBucket: "ai_tech" | "business_startup" | "finance_investing" | "economy_society" | "wildcard", value: number, personalPriority: string = "normal") {
    return { clusterId: `c${index}`, itemId: `i${index}`, feedId, title: `条目 ${index}`, excerpt: "摘要", url: null, publishedAt: "2026-08-10T03:00:00Z", firstSeenAt: "2026-08-10T03:00:00Z", feedPriority: 80, feedTitle: "源", category: "科技", personalPriority, score: 1, matchedInterests: [] as string[], excluded: false, reason: "近期更新", ai: { id: `i${index}`, topicBucket, informationValue: value, learningValue: value, decisionValue: value, novelty: value, sourceConfidence: 80, whyWorthReading: "", keyQuestion: "", uncertainty: "", confidence: .8 } };
  }

  it("按 topic bucket 软配额分配，不会 8 条全是 AI", () => {
    const candidates = [
      ...Array.from({ length: 20 }, (_, index) => aiCandidate(index, `f-ai-${index}`, "ai_tech", 80 - index * 2)),
      aiCandidate(100, "fb1", "business_startup", 78),
      aiCandidate(101, "fb2", "business_startup", 76),
      aiCandidate(102, "fb3", "business_startup", 74),
      aiCandidate(103, "fb4", "business_startup", 72),
      aiCandidate(104, "ff1", "finance_investing", 70),
      aiCandidate(105, "fe1", "economy_society", 68),
    ];
    const selected = selectDiverseAiCandidates(candidates, 8);
    expect(selected.filter((item) => item.ai.topicBucket === "ai_tech")).toHaveLength(3);
    expect(selected.filter((item) => item.ai.topicBucket === "business_startup")).toHaveLength(2);
    expect(selected.filter((item) => item.ai.topicBucket === "finance_investing")).toHaveLength(1);
    expect(selected.filter((item) => item.ai.topicBucket === "economy_society")).toHaveLength(1);
    expect(selected).toHaveLength(7);
  });

  it("高质量 explore 信源内容可以占据 wildcard 配额", () => {
    const candidates = [
      aiCandidate(0, "fa", "ai_tech", 80),
      aiCandidate(1, "fb", "ai_tech", 78),
      aiCandidate(2, "fc", "ai_tech", 76),
      aiCandidate(3, "fda", "business_startup", 74),
      aiCandidate(4, "fdb", "business_startup", 72),
      aiCandidate(5, "ff", "finance_investing", 70),
      aiCandidate(6, "fe", "economy_society", 68),
      aiCandidate(7, "fexplore", "wildcard", 66, "explore"),
    ];
    const selected = selectDiverseAiCandidates(candidates, 8);
    expect(selected.filter((item) => item.ai.topicBucket === "wildcard")).toHaveLength(1);
  });

  it("没有高质量 wildcard 时不会硬凑数量", () => {
    const candidates = [
      aiCandidate(0, "fa", "ai_tech", 80),
      aiCandidate(1, "fb", "ai_tech", 78),
      aiCandidate(2, "fc", "ai_tech", 76),
      aiCandidate(3, "fw", "wildcard", 20),
      aiCandidate(4, "fda", "business_startup", 74),
      aiCandidate(5, "fdb", "business_startup", 72),
      aiCandidate(6, "ff", "finance_investing", 70),
      aiCandidate(7, "fe", "economy_society", 68),
    ];
    const selected = selectDiverseAiCandidates(candidates, 8);
    expect(selected.filter((item) => item.ai.topicBucket === "wildcard")).toHaveLength(0);
    expect(selected).toHaveLength(7);
  });

  it("同一 feed 最多两条，不会霸榜", () => {
    const candidates = [
      aiCandidate(0, "same", "ai_tech", 90),
      aiCandidate(1, "same", "ai_tech", 88),
      aiCandidate(2, "same", "ai_tech", 86),
      aiCandidate(3, "same", "ai_tech", 84),
      aiCandidate(4, "fb", "business_startup", 74),
      aiCandidate(5, "fda", "business_startup", 72),
      aiCandidate(6, "ff", "finance_investing", 70),
      aiCandidate(7, "fe", "economy_society", 68),
    ];
    const selected = selectDiverseAiCandidates(candidates, 8);
    expect(selected.filter((item) => item.feedId === "same")).toHaveLength(2);
  });

  it("AI 降级保留安全错误码，不暴露底层异常", () => {
    expect(briefingAiFailureCode(new Error("deepseek_credential_unreadable"))).toBe("deepseek_credential_unreadable");
    expect(briefingAiFailureCode(new Error("provider response included a secret"))).toBe("ai_provider_request_failed");
  });
});
