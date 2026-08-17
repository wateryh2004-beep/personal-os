import { uniqueEntityLinkTargets } from "@/features/links/parser";
import { parseInternalNoteLinkOccurrences, parseWikiNoteLinkOccurrences } from "./parser";

/** A private, deterministic fingerprint of only relationship-relevant Markdown. */
export function noteRelationSignature(markdown: string) {
  const noteLinks = [
    ...parseInternalNoteLinkOccurrences(markdown).map((link) => `m:${link.noteId}:${link.label}:${link.from}:${link.to}`),
    ...parseWikiNoteLinkOccurrences(markdown).map((link) => `w:${link.targetTitle}:${link.label}:${link.from}:${link.to}`),
  ].sort();
  const entityLinks = uniqueEntityLinkTargets(markdown)
    .filter((target) => target.type !== "note")
    .map((target) => `${target.type}:${target.id}`)
    .sort();
  return JSON.stringify({ noteLinks, entityLinks });
}
