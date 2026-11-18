import { defaultSchema } from "rehype-sanitize";
import { parseNoteColorTone, type NoteColorRole, type NoteColorTone } from "./note-color-palette";

/** 
 * Allow only known color classes and five tone values in the sanitized HAST.
 * Do not enable rehype-raw or CSS style attributes.
 * The same schema is used by React reading, raster PDF and HTML export.
 */
const allowedTones = ["info", "warning", "important", "idea", "quote"];
const attributeRule = (name: string, ...values: string[]): [string, ...string[]] => [name, ...values];

export const noteColorSanitizeSchema: typeof defaultSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    blockquote: [
      ...(defaultSchema.attributes?.blockquote ?? []),
      attributeRule("className", "note-color-callout"),
      attributeRule("dataNoteTone", ...allowedTones),
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      attributeRule("className", "note-color-text", "note-color-highlight"),
      ["dataNoteTone", ...allowedTones],
    ],
    p: [
      ...(defaultSchema.attributes?.p ?? []),
      attributeRule("dataNoteCalloutHeading", "true"),
    ],
  },
};

type ElementNode = { tagName?: string; properties?: Record<string, unknown> } | null | undefined;

function classNames(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((x): x is string => typeof x === "string");
  return typeof value === "string" ? value.split(/\s+/) : [];
}

/** Only a sanctioned role + tone may reach rendering props. */
export function noteColorElement(node: ElementNode): { tone: NoteColorTone; role: NoteColorRole } | null {
  if (!node?.properties) return null;
  const tone = parseNoteColorTone(node.properties.dataNoteTone);
  if (!tone) return null;
  const names = classNames(node.properties.className);
  if (node.tagName === "blockquote" && names.includes("note-color-callout"))
    return { role: "callout", tone };
  if (node.tagName === "span" && names.includes("note-color-text"))
    return { role: "text", tone };
  if (node.tagName === "span" && names.includes("note-color-highlight"))
    return { role: "highlight", tone };
  return null;
}

export function noteCalloutHeading(node: ElementNode): boolean {
  return node?.tagName === "p" && node.properties?.dataNoteCalloutHeading === "true";
}
