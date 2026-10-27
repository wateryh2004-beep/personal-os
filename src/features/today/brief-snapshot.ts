import { sha256 } from "@noble/hashes/sha2.js";
import type { TodayBriefItem } from "./types";

/** Same bounded evidence actually supplied to synthesis; no text enters URLs or metadata. */
export function todayBriefFingerprint(items: TodayBriefItem[]) {
  const value = items.slice(0, 4).map(item => ({ title: item.title.slice(0, 240), reason: item.reason.slice(0, 500), sources: item.sourceRefs.map(source => ({ domain: source.domain, id: source.id, title: source.title.slice(0, 240) })) }));
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(value))), byte => byte.toString(16).padStart(2, "0")).join("");
}
