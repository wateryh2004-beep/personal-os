import { parseInternalEntityLinks, resolveInternalEntityHref } from "@/features/links/parser";
import { entityHrefFor, linkableEntityTable } from "@/features/links/types";

/** Keep a reusable reference tied to its exact entity, even after a title changes. */
export function noteReferenceMarkdown(title: string, href: string) {
  const target = resolveInternalEntityHref(href);
  if (!target) throw new Error("invalid_reference");
  // Entities preserve the visible title without introducing nested Markdown or
  // breaking canonical-link parsers on brackets in note titles.
  const label = (title.trim() || "无标题笔记").replace(/\s+/g, " ").replace(/[&<>[\]\\`*_]/g, (character) => `&#${character.charCodeAt(0)};`);
  return `[${label}](${entityHrefFor(target.type, target.id)})`;
}

export function relatedWorkFromNote(markdown: string) {
  const seen = new Set<string>();
  return parseInternalEntityLinks(markdown).flatMap((link) => {
    const key = `${link.type}:${link.id}`;
    if (link.type === "note" || seen.has(key)) return [];
    seen.add(key);
    const title = link.label.replace(/&#(38|60|62|91|93|92|96|42|95);/g, (_, code: string) => String.fromCharCode(Number(code)));
    return [{ id: key, title, href: entityHrefFor(link.type, link.id), source: linkableEntityTable[link.type].label }];
  });
}

export async function copyReferenceText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const field = document.createElement("textarea");
  field.value = value;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("copy_failed");
  } finally {
    field.remove();
  }
}
