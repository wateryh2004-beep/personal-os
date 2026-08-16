import type { InternalEntityLink, LinkableEntityType } from "./types";

const uuidSource = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

/** 与 types.ts 的 entityHrefFor / search entityHref 保持一致。 */
const entityHrefPatterns: Array<{ type: LinkableEntityType; pattern: RegExp }> = [
  { type: "note", pattern: new RegExp(`^/notes/(${uuidSource})$`, "i") },
  { type: "todo_task", pattern: new RegExp(`^/tasks\\?task=(${uuidSource})$`, "i") },
  { type: "calendar_event", pattern: new RegExp(`^/calendar\\?event=(${uuidSource})$`, "i") },
  { type: "document", pattern: new RegExp(`^/files\\?file=(${uuidSource})$`, "i") },
];

/** 解析 markdown 链接,排除图片(! 前缀)。href 不允许含空格。 */
const markdownLinkPattern = /(^|[^!])\[([^\]\n]+)\]\(([^)\s]+)\)/gim;

export function resolveInternalEntityHref(href: string): { type: LinkableEntityType; id: string } | null {
  for (const { type, pattern } of entityHrefPatterns) {
    const match = pattern.exec((href ?? "").trim());
    if (match) return { type, id: match[1].toLowerCase() };
  }
  return null;
}

export function isInternalEntityHref(href: string | null | undefined): boolean {
  return resolveInternalEntityHref(href ?? "") !== null;
}

export function parseInternalEntityLinks(markdown: string): InternalEntityLink[] {
  const links: InternalEntityLink[] = [];
  for (const match of markdown.matchAll(markdownLinkPattern)) {
    const prefix = match[1] ?? "";
    const label = (match[2] ?? "").trim();
    const href = (match[3] ?? "").trim();
    if (!label || !href) continue;
    const resolved = resolveInternalEntityHref(href);
    if (!resolved) continue;
    const index = match.index ?? 0;
    const from = index + prefix.length;
    links.push({ ...resolved, label, from, to: from + match[0].length - prefix.length });
  }
  return links;
}

/** 去重后的目标实体集合。note→note 由 note_links 维护,不在 entity_links 范畴。 */
export function uniqueEntityLinkTargets(markdown: string): Array<{ type: LinkableEntityType; id: string }> {
  const seen = new Set<string>();
  const targets: Array<{ type: LinkableEntityType; id: string }> = [];
  for (const link of parseInternalEntityLinks(markdown)) {
    const key = `${link.type}:${link.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ type: link.type, id: link.id });
  }
  return targets;
}
