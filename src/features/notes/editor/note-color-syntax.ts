import type { Root } from "mdast";
import { noteColorTones, parseNoteColorTone, type NoteColorTone } from "./note-color-palette";

type ColorNode = {
  type: string;
  value?: string;
  children?: ColorNode[];
  data?: Record<string, unknown>;
};

export type NoteInlineColor = {
  from: number;
  to: number;
  contentFrom: number;
  contentTo: number;
  text: string;
  role: "text" | "highlight";
  tone: NoteColorTone;
};

/**
 * Canonical Notes-only inline syntax:
 *   {{ink:info|plain text}}
 *   {{mark:important|plain text}}
 *
 * A span cannot contain a newline, nested color delimiter or Markdown
 * structure. Other Markdown implementations show readable source text.
 * This parser never touches code nodes, arbitrary HTML or URLs.
 */
const inlinePattern = /\{\{(ink|mark):(info|warning|important|idea|quote)\|([^{}\r\n]{1,1000})\}\}/g;

export function noteInlineColorsInText(source: string): NoteInlineColor[] {
  const result: NoteInlineColor[] = [];
  inlinePattern.lastIndex = 0;
  for (const match of source.matchAll(inlinePattern)) {
    const tone = parseNoteColorTone(match[2]);
    if (!tone) continue;
    const from = match.index;
    const to = from + match[0].length;
    const contentFrom = from + match[0].indexOf("|") + 1;
    result.push({
      from, to, contentFrom, contentTo: to - 2, text: match[3],
      role: match[1] === "ink" ? "text" : "highlight", tone,
    });
  }
  return result;
}

const calloutTypes: Readonly<Record<string, NoteColorTone>> = {
  NOTE: "info",
  WARNING: "warning",
  IMPORTANT: "important",
  TIP: "idea",
  QUOTE: "quote",
};

export type NoteCallout = { tone: NoteColorTone; label: string; markerLength: number };

export function noteCalloutFromHeader(value: string): NoteCallout | null {
  const match = /^\[!(NOTE|WARNING|IMPORTANT|TIP|QUOTE)\](?=\s|$)/.exec(value);
  if (!match) return null;
  const tone = calloutTypes[match[1]];
  const label = noteColorTones.find(item => item.id === tone)?.label;
  return label ? { tone, label, markerLength: match[0].length } : null;
}

export function noteCalloutFromSourceLine(value: string): NoteCallout | null {
  const match = /^ {0,3}>\s?(\[!(?:NOTE|WARNING|IMPORTANT|TIP|QUOTE)\])(?=\s|$)/.exec(value);
  return match ? noteCalloutFromHeader(match[1]) : null;
}

/**
 * Restricted remark AST transformer shared by the live Notes reading view,
 * the raster PDF snapshot and the portable HTML/print export. Runs only for
 * Notes; generic task/calendar Markdown does not adopt Notes extensions.
 *
 * We mutate mdast's presentation data, not the original Markdown string.
 * Raw HTML is *never* parsed: rehype-sanitize remains mandatory downstream.
 */
export function remarkNoteColors() {
  return (tree: Root) => {
    const walk = (node: ColorNode) => {
      if (node.type === "blockquote" && node.children?.length) {
        const paragraph = node.children[0];
        const text = paragraph?.type === "paragraph" ? paragraph.children?.[0] : undefined;
        const callout = text?.type === "text" ? noteCalloutFromHeader(text.value ?? "") : null;
        if (callout && text) {
          node.data = {
            ...node.data,
            hName: "blockquote",
            hProperties: { className: ["note-color-callout"], dataNoteTone: callout.tone },
          };
          const remaining = (text.value ?? "").slice(callout.markerLength).trimStart();
          if (remaining) text.value = remaining;
          else paragraph.children?.shift();
          if (!paragraph.children?.length) node.children.shift();
          node.children.unshift({
            type: "paragraph",
            data: { hProperties: { dataNoteCalloutHeading: "true" } },
            children: [{ type: "text", value: callout.label }],
          });
        }
      }

      // Split only literal text nodes. A code span, fenced block, URL,
      // link label spanning AST nodes, or a partially written token keeps its
      // original source-visible contents without risky reparsing.
      if (!node.children) return;
      const result: ColorNode[] = [];
      for (const child of node.children) {
        if (child.type === "text" && child.value) {
          const matches = noteInlineColorsInText(child.value);
          if (matches.length) {
            let consumed = 0;
            for (const span of matches) {
              if (span.from > consumed)
                result.push({ type: "text", value: child.value.slice(consumed, span.from) });
              result.push({
                type: "emphasis",
                data: {
                  hName: "span",
                  hProperties: {
                    className: [span.role === "text" ? "note-color-text" : "note-color-highlight"],
                    dataNoteTone: span.tone,
                  },
                },
                children: [{ type: "text", value: span.text }],
              });
              consumed = span.to;
            }
            if (consumed < child.value.length)
              result.push({ type: "text", value: child.value.slice(consumed) });
            continue;
          }
        }
        walk(child);
        result.push(child);
      }
      node.children = result;
    };
    walk(tree as unknown as ColorNode);
  };
}
