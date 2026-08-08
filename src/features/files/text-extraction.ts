import "server-only";

import { readR2ObjectBytes } from "@/lib/adapters/cloudflare-r2";

export const MAX_EXTRACTABLE_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_EXTRACTED_CHARACTERS = 300_000;

export type TextExtractionStatus =
  | "not_requested"
  | "pending"
  | "processing"
  | "completed"
  | "unsupported"
  | "too_large"
  | "failed";

type ExtractionKind = "plain" | "pdf" | "docx";

function extension(filename: string) {
  return filename.toLocaleLowerCase().split(".").at(-1) ?? "";
}

export function extractionKind(filename: string, mimeType: string): ExtractionKind | null {
  const mime = mimeType.toLocaleLowerCase().split(";")[0].trim();
  const ext = extension(filename);
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === "docx"
  ) return "docx";
  if (
    mime.startsWith("text/") ||
    ["application/json", "application/xml", "application/x-yaml", "application/yaml"].includes(mime) ||
    ["txt", "md", "markdown", "csv", "json", "xml", "yaml", "yml", "log"].includes(ext)
  ) return "plain";
  return null;
}

export function initialExtractionStatus(filename: string, mimeType: string, size: number): TextExtractionStatus {
  if (!extractionKind(filename, mimeType)) return "unsupported";
  if (size > MAX_EXTRACTABLE_FILE_BYTES) return "too_large";
  return "pending";
}

export function normalizeExtractedText(value: string) {
  return value
    .replaceAll("\u0000", "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, MAX_EXTRACTED_CHARACTERS);
}

export async function parseDocumentBytes(input: {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
}) {
  const kind = extractionKind(input.filename, input.mimeType);
  if (!kind) throw new Error("unsupported_file_type");
  if (kind === "plain")
    return normalizeExtractedText(new TextDecoder("utf-8", { fatal: false }).decode(input.bytes));
  if (kind === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: Buffer.from(input.bytes) });
    return normalizeExtractedText(result.value);
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const document = await getDocumentProxy(input.bytes);
  const result = await extractText(document, { mergePages: true });
  return normalizeExtractedText(String(result.text ?? ""));
}

export async function extractPrivateDocument(input: {
  storagePath: string;
  filename: string;
  mimeType: string;
  fileSize: number;
  userId: string;
}) {
  if (!input.storagePath.startsWith(`${input.userId}/files/`))
    throw new Error("invalid_storage_path");
  const status = initialExtractionStatus(input.filename, input.mimeType, input.fileSize);
  if (status !== "pending") throw new Error(status === "too_large" ? "file_too_large" : "unsupported_file_type");
  const bytes = await readR2ObjectBytes(input.storagePath, MAX_EXTRACTABLE_FILE_BYTES);
  const text = await parseDocumentBytes({
    bytes,
    filename: input.filename,
    mimeType: input.mimeType,
  });
  if (!text) throw new Error("no_extractable_text");
  return { text, characterCount: text.length };
}

export function safeExtractionError(error: unknown) {
  const code = error instanceof Error ? error.message : "extraction_failed";
  return [
    "unsupported_file_type",
    "file_too_large",
    "r2_object_too_large",
    "no_extractable_text",
    "invalid_storage_path",
  ].includes(code) ? code : "extraction_failed";
}
