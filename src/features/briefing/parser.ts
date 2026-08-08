import { XMLParser } from "fast-xml-parser";
import type { ParsedFeed, ParsedFeedItem } from "./types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text", processEntities: false, trimValues: true, parseTagValue: false });
const array = <T>(value: T | T[] | undefined): T[] => value === undefined ? [] : Array.isArray(value) ? value : [value];
function text(value: unknown): string { if (value == null) return ""; if (typeof value === "string" || typeof value === "number") return String(value); if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) return text((value as Record<string, unknown>)["#text"]); return ""; }
function plain(value: unknown, limit: number) { return text(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim().slice(0, limit); }
function date(value: unknown) { const raw = text(value); if (!raw) return null; const parsed = new Date(raw); if (Number.isNaN(parsed.getTime()) || parsed.getTime() > Date.now() + 86400000) return null; return parsed.toISOString(); }
function atomLink(value: unknown, rel = "alternate") { const links = array(value as Record<string, unknown> | Record<string, unknown>[] | undefined); const match = links.find((item) => String(item?.["@_rel"] ?? "alternate") === rel) ?? links[0]; return match ? String(match["@_href"] ?? "") || null : null; }
function rssItem(item: Record<string, unknown>): ParsedFeedItem { const description = item.description ?? item["content:encoded"] ?? ""; return { externalId: text(item.guid) || null, url: text(item.link) || null, title: plain(item.title, 1000) || "未命名条目", author: plain(item.author ?? item["dc:creator"], 300) || null, publishedAt: date(item.pubDate ?? item.date), updatedAt: date(item["dc:date"]), excerpt: plain(item.description, 2000), contentText: plain(description, 20000) }; }
function atomItem(item: Record<string, unknown>): ParsedFeedItem { return { externalId: text(item.id) || null, url: atomLink(item.link), title: plain(item.title, 1000) || "未命名条目", author: plain((item.author as Record<string, unknown> | undefined)?.name ?? item.author, 300) || null, publishedAt: date(item.published ?? item.updated), updatedAt: date(item.updated), excerpt: plain(item.summary, 2000), contentText: plain(item.content ?? item.summary, 20000) }; }
export function parseFeedXml(xml: string): ParsedFeed {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("unsafe_xml");
  const document = parser.parse(xml) as Record<string, unknown>;
  if (document.rss) { const channel = (document.rss as Record<string, unknown>).channel as Record<string, unknown>; if (!channel) throw new Error("invalid_feed"); return { title: plain(channel.title, 500) || "未命名订阅", siteUrl: text(channel.link) || null, description: plain(channel.description, 2000), type: "rss", items: array(channel.item as Record<string, unknown> | Record<string, unknown>[]).slice(0, 100).map(rssItem) }; }
  if (document.feed) { const feed = document.feed as Record<string, unknown>; return { title: plain(feed.title, 500) || "未命名订阅", siteUrl: atomLink(feed.link), description: plain(feed.subtitle, 2000), type: "atom", items: array(feed.entry as Record<string, unknown> | Record<string, unknown>[]).slice(0, 100).map(atomItem) }; }
  throw new Error("unsupported_feed");
}
