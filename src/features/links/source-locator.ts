import { z } from "zod";

const offset = z.number().int().min(0).max(200_000);
export const noteSourceLocatorSchema = z.object({ kind: z.literal("note"), noteId: z.uuid(), versionId: z.uuid(), revision: z.number().int().min(0).max(2_147_483_647), from: offset, to: offset, hash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().refine((value) => value.to > value.from);
export const pdfSourceLocatorSchema = z.object({ kind: z.literal("pdf"), documentId: z.uuid(), sourceVersion: z.uuid(), page: z.number().int().min(1).max(500) }).strict();
export type NoteSourceLocator = z.infer<typeof noteSourceLocatorSchema>;
export type PdfSourceLocator = z.infer<typeof pdfSourceLocatorSchema>;
export type SourceLocator = NoteSourceLocator | PdfSourceLocator;

export function sourceLocatorHref(locator: SourceLocator) {
  if (locator.kind === "note") {
    const value = noteSourceLocatorSchema.parse(locator);
    return `/notes/${value.noteId}?${new URLSearchParams({ nv: value.versionId, nr: String(value.revision), sf: String(value.from), st: String(value.to), sh: value.hash })}`;
  }
  const value = pdfSourceLocatorSchema.parse(locator);
  return `/files?${new URLSearchParams({ file: value.documentId, pdfPage: String(value.page), sourceVersion: value.sourceVersion })}`;
}

/** Identity and locator validation are separate: valid source links retain backlinks. */
export function parseSourceLocator(href: string): SourceLocator | null {
  if (!href.startsWith("/") || href.startsWith("//") || /[\\\u0000-\u0020]/.test(href)) return null;
  try {
    const url = new URL(href, "https://personal-os.local");
    if (url.origin !== "https://personal-os.local" || url.hash) return null;
    const keys = [...url.searchParams.keys()];
    if (new Set(keys).size !== keys.length) return null;
    const note = /^\/notes\/([a-f0-9-]{36})$/i.exec(url.pathname);
    if (note && keys.length === 5 && keys.every((key) => ["nv", "nr", "sf", "st", "sh"].includes(key))) {
      const numbers = ["nr", "sf", "st"].map((key) => url.searchParams.get(key) ?? "");
      if (numbers.some((value) => !/^(0|[1-9]\d*)$/.test(value))) return null;
      const parsed = noteSourceLocatorSchema.safeParse({ kind: "note", noteId: note[1], versionId: url.searchParams.get("nv"), revision: Number(numbers[0]), from: Number(numbers[1]), to: Number(numbers[2]), hash: url.searchParams.get("sh") });
      return parsed.success ? parsed.data : null;
    }
    if (url.pathname === "/files" && keys.length === 3 && keys.every((key) => ["file", "pdfPage", "sourceVersion"].includes(key))) {
      const page = url.searchParams.get("pdfPage") ?? "";
      if (!/^[1-9]\d{0,2}$/.test(page)) return null;
      const parsed = pdfSourceLocatorSchema.safeParse({ kind: "pdf", documentId: url.searchParams.get("file"), sourceVersion: url.searchParams.get("sourceVersion"), page: Number(page) });
      return parsed.success ? parsed.data : null;
    }
  } catch { /* Invalid URLs are not internal source references. */ }
  return null;
}
