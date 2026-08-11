import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDateKeyInTimeZone } from "@/features/today/utils";
import { canonicalizeArticleUrl, digest, identityKey, normalizeTitle } from "./normalize";
import { parseFeedXml } from "./parser";
import { rankBriefingCandidates } from "./ranking";
import { evaluateBriefingWithAi } from "./ai";
import {
  createBriefingRun,
  findRecentGeneratingRun,
  markBriefingRunCompleted,
  markBriefingRunFailed,
} from "./runs";
import { safeFetchFeed } from "./safe-fetch";
import type {
  BriefingFeedRefreshSummary,
  BriefingGenerationResult,
  FeedCandidate,
} from "./types";

export function publicFeedError(error: unknown) { const code = error instanceof Error ? error.message : "unknown"; if (["invalid_url","invalid_feed_url","blocked_host"].includes(code)) return "订阅地址不安全或不可访问。"; if (code === "response_too_large") return "订阅响应超过 2MB 上限。"; if (["unsafe_xml","invalid_feed","unsupported_feed","not_xml"].includes(code)) return "该地址没有返回受支持的 RSS/Atom 内容。"; if (code.startsWith("http_")) return `订阅源返回 HTTP ${code.slice(5)}。`; return "订阅源暂时无法读取，请稍后重试。"; }
export async function refreshFeedForOwner(supabase:SupabaseClient,userId:string,feedId:string,{ignoreCooldown=false}:{ignoreCooldown?:boolean}={}){const {data:feed,error:feedError}=await supabase.from("feeds").select("*").eq("id",feedId).eq("user_id",userId).is("archived_at",null).maybeSingle();if(feedError||!feed)throw new Error("找不到订阅或无权访问。");if(!ignoreCooldown&&feed.last_fetched_at&&Date.now()-new Date(feed.last_fetched_at).getTime()<60_000)throw new Error("刚刚已经抓取过，请一分钟后再试。");try{const response=await safeFetchFeed(feed.feed_url,{etag:feed.etag,lastModified:feed.last_modified});const now=new Date().toISOString();if(response.status===304){await supabase.from("feeds").update({last_fetched_at:now,last_successful_fetch_at:now,last_http_status:304,consecutive_error_count:0,last_error_code:null}).eq("id",feedId);return;}const parsed=parseFeedXml(response.body);const limit=feed.last_successful_fetch_at?30:60;for(const source of parsed.items.slice(0,limit)){const canonicalUrl=canonicalizeArticleUrl(source.url);const normalized=normalizeTitle(source.title);if(!normalized)continue;const contentHash=source.contentText?digest(source.contentText):null;const key=identityKey({externalId:source.externalId,canonicalUrl,title:source.title,publishedAt:source.publishedAt});const {data:existing}=await supabase.from("feed_items").select("id").eq("feed_id",feedId).eq("identity_key",key).maybeSingle();let itemId:string;const record={external_id:source.externalId,url:source.url,canonical_url:canonicalUrl,title:source.title,normalized_title:normalized,author:source.author,published_at:source.publishedAt,updated_at_source:source.updatedAt,excerpt:source.excerpt,content_text:source.contentText,content_hash:contentHash,last_seen_at:now,fetched_at:now};if(existing){itemId=existing.id;const {error}=await supabase.from("feed_items").update(record).eq("id",itemId);if(error)throw error;}else{const {data:inserted,error}=await supabase.from("feed_items").insert({...record,user_id:userId,feed_id:feedId,identity_key:key}).select("id").single();if(error||!inserted)throw error??new Error("ingest_failed");itemId=inserted.id;}const {data:member}=await supabase.from("feed_item_cluster_members").select("cluster_id").eq("feed_item_id",itemId).maybeSingle();if(member)continue;const fingerprint=canonicalUrl?`url:${digest(canonicalUrl)}`:contentHash?`content:${contentHash}`:`title:${digest(`${normalized}|${source.publishedAt?.slice(0,10)??"undated"}`)}`;const method=canonicalUrl?"canonical_url":contentHash?"content_hash":"normalized_title";let {data:cluster}=await supabase.from("feed_item_clusters").select("id").eq("fingerprint",fingerprint).is("archived_at",null).maybeSingle();if(!cluster){const result=await supabase.from("feed_item_clusters").insert({user_id:userId,fingerprint,representative_item_id:itemId,canonical_url:canonicalUrl,normalized_title:normalized,earliest_published_at:source.publishedAt,latest_published_at:source.publishedAt}).select("id").single();if(result.error||!result.data)throw result.error??new Error("cluster_failed");cluster=result.data;}const {error:memberError}=await supabase.from("feed_item_cluster_members").insert({user_id:userId,cluster_id:cluster.id,feed_item_id:itemId,match_method:method});if(memberError)throw memberError;const {count}=await supabase.from("feed_item_cluster_members").select("feed_item_id",{count:"exact",head:true}).eq("cluster_id",cluster.id);await supabase.from("feed_item_clusters").update({source_count:count??1,latest_published_at:source.publishedAt}).eq("id",cluster.id);}const {error}=await supabase.from("feeds").update({title:feed.title||parsed.title,site_url:parsed.siteUrl,description:parsed.description,feed_type:parsed.type,etag:response.etag,last_modified:response.lastModified,last_fetched_at:now,last_successful_fetch_at:now,last_http_status:200,consecutive_error_count:0,last_error_code:null,status:feed.verification_status==="verified"?"active":"paused"}).eq("id",feedId);if(error)throw error;}catch(error){const count=Number(feed.consecutive_error_count??0)+1;await supabase.from("feeds").update({last_fetched_at:new Date().toISOString(),last_error_at:new Date().toISOString(),last_error_code:error instanceof Error?error.message.slice(0,80):"unknown",consecutive_error_count:count,status:count>=5?"error":feed.status}).eq("id",feedId);throw new Error(publicFeedError(error));}}

const MANUAL_REFRESH_STALE_MS = 15 * 60_000;
const DEFAULT_REFRESH_CONCURRENCY = 4;
const DEFAULT_MAX_REFRESH_FEEDS = 20;

export const briefingRefreshDefaults = {
  maxFeeds: DEFAULT_MAX_REFRESH_FEEDS,
  concurrency: DEFAULT_REFRESH_CONCURRENCY,
};

type BriefingFeed = {
  status: string | null;
  archived_at: string | null;
  verification_status?: string | null;
};

export function isFeedEligibleForBriefing(feed: BriefingFeed | null | undefined) {
  return feed?.status === "active" && feed.archived_at === null && feed.verification_status === "verified";
}

export function passesHardExclusions(
  item: Pick<FeedCandidate, "title" | "excerpt">,
  exclusions: string[],
) {
  const text = `${item.title} ${item.excerpt}`.toLocaleLowerCase().normalize("NFKC");
  return !exclusions.some((phrase) => text.includes(phrase.toLocaleLowerCase().normalize("NFKC").trim()));
}

export function getBriefingItemHref(item: { canonical_url?: string | null; url?: string | null }) {
  return item.canonical_url || item.url || undefined;
}

export function shouldRefreshBriefingFeed(lastFetchedAt: string | null, now = new Date()) {
  if (!lastFetchedAt) return true;
  const fetchedAt = new Date(lastFetchedAt).getTime();
  return Number.isNaN(fetchedAt) || now.getTime() - fetchedAt >= MANUAL_REFRESH_STALE_MS;
}

export async function refreshBriefingFeedsForOwner(
  supabase: SupabaseClient,
  userId: string,
  {
    now = new Date(),
    maxFeeds = DEFAULT_MAX_REFRESH_FEEDS,
    staleAfterMs = MANUAL_REFRESH_STALE_MS,
    includeStatuses = ["active", "error"],
    concurrency = DEFAULT_REFRESH_CONCURRENCY,
  }: {
    now?: Date;
    maxFeeds?: number;
    staleAfterMs?: number;
    includeStatuses?: string[];
    concurrency?: number;
  } = {},
): Promise<BriefingFeedRefreshSummary> {
  const { data: feeds, error } = await supabase
    .from("feeds")
    .select("id,last_fetched_at")
    .eq("user_id", userId)
    .in("status", includeStatuses)
    .eq("verification_status", "verified")
    .is("archived_at", null)
    .order("priority", { ascending: false })
    .limit(maxFeeds);

  if (error) throw new Error("无法读取订阅源。");

  const dueFeeds = (feeds ?? []).filter((feed) =>
    !feed.last_fetched_at ||
    Number.isNaN(new Date(feed.last_fetched_at).getTime()) ||
    now.getTime() - new Date(feed.last_fetched_at).getTime() >= staleAfterMs,
  );
  let feedsRefreshed = 0;
  let feedsFailed = 0;

  for (let index = 0; index < dueFeeds.length; index += concurrency) {
    const results = await Promise.allSettled(
      dueFeeds
        .slice(index, index + concurrency)
        .map((feed) => refreshFeedForOwner(supabase, userId, feed.id, { ignoreCooldown: true })),
    );
    feedsRefreshed += results.filter((result) => result.status === "fulfilled").length;
    feedsFailed += results.filter((result) => result.status === "rejected").length;
  }

  return {
    activeFeedCount: feeds?.length ?? 0,
    feedsDue: dueFeeds.length,
    feedsRefreshed,
    feedsFailed,
  };
}

export const refreshBriefingSourcesForOwner = refreshBriefingFeedsForOwner;

export async function generateBriefingForOwner(
  supabase: SupabaseClient,
  userId: string,
  now = new Date(),
  triggerType: "manual" | "scheduled" = "manual",
): Promise<BriefingGenerationResult> {
  const recentRun = await findRecentGeneratingRun(supabase, userId, now);
  if (recentRun) throw new Error("今日 Briefing 正在生成，请稍后刷新。");

  const [{ data: profile }, { data: interests }, { data: exclusions }, { data: items, error: itemError }] = await Promise.all([
      supabase.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
      supabase
        .from("briefing_interests")
        .select("name,keywords,excluded_keywords,weight")
        .eq("user_id", userId)
        .eq("status", "active")
        .is("archived_at", null),
      supabase
        .from("briefing_exclusions")
        .select("phrase")
        .eq("user_id", userId)
        .is("archived_at", null),
      supabase
        .from("feed_items")
        .select(
          "id,title,excerpt,content_hash,url,published_at,first_seen_at,feed_id,feeds(title,priority,category,personal_priority,source_quality,status,archived_at,verification_status),feed_item_cluster_members(cluster_id)",
        )
        .eq("user_id", userId)
        .is("archived_at", null)
        .gte("first_seen_at", new Date(now.getTime() - 96 * 36e5).toISOString())
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(200),
    ]);

  if (itemError) throw new Error("无法读取候选资讯。");

  const timezone = profile?.timezone || "Asia/Shanghai";
  const briefingDate = getDateKeyInTimeZone(now, timezone)!;
  const candidates: FeedCandidate[] = (items ?? []).flatMap((item) => {
    const feed = Array.isArray(item.feeds) ? item.feeds[0] : item.feeds;
    const member = Array.isArray(item.feed_item_cluster_members)
      ? item.feed_item_cluster_members[0]
      : item.feed_item_cluster_members;
    if (!isFeedEligibleForBriefing(feed) || !member) return [];
    return [
      {
        clusterId: member.cluster_id,
        itemId: item.id,
        feedId: item.feed_id,
        title: item.title,
        excerpt: item.excerpt ?? "",
        url: item.url,
        publishedAt: item.published_at,
        firstSeenAt: item.first_seen_at,
        feedPriority: feed.priority,
        feedTitle: feed.title,
        category: feed.category,
        personalPriority: feed.personal_priority,
        sourceQuality: feed.source_quality,
        contentHash: item.content_hash,
      },
    ];
  });
  const eligibleCandidates = candidates.filter((item) =>
    passesHardExclusions(item, (exclusions ?? []).map((exclusion) => exclusion.phrase)),
  );
  const unique = [...new Map(eligibleCandidates.map((item) => [item.clusterId, item])).values()];
  const ranked = rankBriefingCandidates(
    unique,
    (interests ?? []).map((item) => ({
      name: item.name,
      keywords: item.keywords ?? [],
      excludedKeywords: item.excluded_keywords ?? [],
      weight: item.weight,
    })),
    now,
  );
  const filteredCount = unique.length - ranked.length;
  const windowStart = new Date(now.getTime() - 96 * 36e5).toISOString();
  const briefing = await createBriefingRun(supabase, {
    user_id: userId,
    briefing_date: briefingDate,
    timezone,
    status: "generating",
    trigger_type: triggerType,
    ranking_method: "deterministic_fallback",
    source_window_start: windowStart,
    source_window_end: now.toISOString(),
    candidate_count: unique.length,
    cluster_count: unique.length,
    selected_count: 0,
    filtered_count: filteredCount,
    error_code: null,
  });

  try {
    const ai = await evaluateBriefingWithAi({ supabase, userId, candidates: unique, interests: (interests ?? []).map((item) => ({ name: item.name, keywords: item.keywords ?? [], excludedKeywords: item.excluded_keywords ?? [], weight: item.weight })), now });
    const selected = ai.selected;
    const { error: runError } = await supabase.from("briefings").update({ ranking_method: ai.method, ai_model: ai.model, prompt_version: ai.model ? "briefing-ranking-v1" : null, ai_call_count: ai.calls, input_tokens: ai.inputTokens, output_tokens: ai.outputTokens, ai_usage_reported: ai.usageReported, ai_failure_code: ai.failureCode }).eq("id", briefing.id).eq("user_id", userId);
    if (runError) throw new Error("无法保存 Briefing AI 运行信息。");
    if (selected.length) {
      const { error } = await supabase.from("briefing_entries").insert(
        selected.map((item, index) => ({
          user_id: userId,
          briefing_id: briefing.id,
          cluster_id: item.clusterId,
          representative_item_id: item.itemId,
          section:
            item.score >= 78 && index < 2
              ? "must_know"
              : item.score >= 62 && index < 5
                ? "worth_reading"
                : "optional",
          position: index,
          relevance_reason: item.relevanceReason ?? item.reason,
          summary: (item.summary ?? item.excerpt.slice(0, 400)) || null,
          ranking_metadata: {
            deterministic_score: Math.round(item.score),
            matched_interests: item.matchedInterests,
            ai: item.ai ? { personal_relevance: item.ai.personalRelevance, information_value: item.ai.informationValue, novelty: item.ai.novelty, timeliness: item.ai.timeliness, confidence: item.ai.confidence, matched_topics: item.ai.matchedTopics } : null,
          },
        })),
      );
      if (error) throw new Error("无法保存今日 Briefing。");
    }

    await markBriefingRunCompleted(supabase, userId, briefing.id, selected.length, now.toISOString());

    return {
      briefingId: briefing.id,
      selected: selected.length,
      candidateCount: unique.length,
      filteredCount,
      date: briefingDate,
      rankingMethod: ai.method,
      aiCallCount: ai.calls,
      inputTokens: ai.inputTokens,
      outputTokens: ai.outputTokens,
    };
  } catch (error) {
    await markBriefingRunFailed(supabase, userId, briefing.id);
    throw error;
  }
}
