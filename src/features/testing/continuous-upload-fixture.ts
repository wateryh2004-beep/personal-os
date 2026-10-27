import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { FileRecord } from "@/features/files/queries";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureTimestamp } from "./continuous-fixture-data";
const uploadInput = z.object({ filename: z.string().min(1).max(255), title: z.string().trim().min(1).max(240), requestId: z.uuid(), folderId: z.uuid().nullable(), contentType: z.string().max(100), size: z.number().int().min(1).max(10 * 1024 * 1024), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type SyntheticUpload = { input: z.infer<typeof uploadInput>; signature: string; bytes: Uint8Array | null; file: FileRecord; available: boolean };
async function readSmallJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader(); if (!reader) throw Error("synthetic_input_invalid");
  let text = "", bytes = 0; const decoder = new TextDecoder();
  try { while (true) { const part = await reader.read(); if (part.done) break; bytes += part.value.length; if (bytes > 32768) throw Error("synthetic_input_capacity"); text += decoder.decode(part.value, { stream: true }); } text += decoder.decode(); } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return JSON.parse(text);
}
function payload(upload: SyntheticUpload) {
  // Next's internal request URL may use localhost while the browser uses
  // 127.0.0.1. A relative synthetic endpoint retains the actual browser origin
  // without trusting Host/forwarded headers or widening the network gate.
  return { documentId: upload.file.id, ...(upload.available || upload.bytes ? {} : { uploadUrl: `/api/continuous-workflows-fixture/upload-bytes/${upload.file.id}` }), file: { id: upload.file.id, title: upload.file.title, originalFilename: upload.input.filename, mimeType: upload.input.contentType, fileSize: upload.input.size, folderId: upload.input.folderId, textExtractionStatus: upload.file.text_extraction_status } };
}
export async function syntheticUploadHttp(state: FixtureState, path: string, request: Request): Promise<{ data?: unknown; bytes?: Uint8Array; status: number } | null> {
  if (path.startsWith("upload-bytes/")) {
    if (request.method !== "PUT") return { status: 405 };
    const id = path.split("/")[1], upload = state.uploads.get(id); if (!upload || upload.available) return { status: 409 };
    const reader = request.body?.getReader(); if (!reader) return { status: 400 };
    const chunks: Uint8Array[] = []; let size = 0; const hash = createHash("sha256");
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > upload.input.size || size > 10 * 1024 * 1024) return { status: 413 }; chunks.push(part.value); hash.update(part.value); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    if (size !== upload.input.size || hash.digest("hex") !== upload.input.checksum) return { status: 409 };
    if (upload.bytes) return { data: { stored: true, duplicate: true, size, checksum: upload.input.checksum }, status: 200 };
    if (state.uploadFailures.delete(upload.input.filename)) { state.calls["upload-bytes-failed"]=(state.calls["upload-bytes-failed"]??0)+1; return { status: 503 }; }
    const storedBytes = [...state.uploads.values()].reduce((sum, value) => sum + (value.bytes?.length ?? 0), 0);
    if (storedBytes + size > 64 * 1024 * 1024) return { status: 429 };
    upload.bytes = new Uint8Array(size); let cursor = 0; for (const chunk of chunks) { upload.bytes.set(chunk, cursor); cursor += chunk.length; }
    state.writes["upload-bytes"] = (state.writes["upload-bytes"] ?? 0) + 1; return { data: { stored: true, size, checksum: upload.input.checksum }, status: 200 };
  }
  if (path === "api/files/upload-url") {
    if (request.method === "GET") { const upload = state.uploads.get(new URL(request.url).searchParams.get("documentId") ?? ""); return upload ? { data: payload(upload), status: 200 } : { status: 404 }; }
    const input: unknown = await readSmallJson(request);
    if (request.method === "POST") {
      const parsed = uploadInput.parse(input), previous = state.uploads.get(parsed.requestId), signature = JSON.stringify(parsed);
      if (previous) return previous.signature === signature ? { data: payload(previous), status: 200 } : { status: 409 };
      if (state.uploads.size >= 50 || parsed.folderId !== null) return { status: 429 };
      const upload: SyntheticUpload = { input: parsed, signature, bytes: null, available: false, file: { id: parsed.requestId, title: parsed.title, original_filename: parsed.filename, mime_type: parsed.contentType, file_size: parsed.size, folder_id: null, created_at: fixtureTimestamp, uploaded_at: fixtureTimestamp, archived_at: null, ai_visibility: "normal", text_extraction_status: "pending", extracted_character_count: 0, mutation_revision: 1 } };
      state.uploads.set(parsed.requestId, upload); state.writes["upload-plan"] = (state.writes["upload-plan"] ?? 0) + 1; return { data: payload(upload), status: 200 };
    }
    if (request.method === "PATCH") {
      const { documentId } = z.object({ documentId: z.uuid() }).strict().parse(input), upload = state.uploads.get(documentId);
      if (!upload?.bytes) return { status: 409 };
      if (!upload.available) { if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); if (!upload.available) { upload.available = true; state.writes["upload-complete"] = (state.writes["upload-complete"] ?? 0) + 1; } }
      return state.mode === "save-unknown" ? { status: 503 } : { data: { ok: true, documentId }, status: 200 };
    }
  }
  if (path === "api/files/upload-candidates" && request.method === "POST") {
    const { files } = z.object({ files: z.array(z.object({ id: z.string().max(80), name: z.string().max(255), size: z.number().int().positive(), checksum: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict()).min(1).max(50) }).strict().parse(await readSmallJson(request));
    state.calls["upload-candidates"] = (state.calls["upload-candidates"] ?? 0) + 1;
    return { data: { matches: files.map(file => ({ id: file.id, candidates: [...state.uploads.values()].filter(upload => upload.available && upload.input.size === file.size && (file.checksum ? upload.input.checksum === file.checksum : upload.input.filename === file.name)).slice(0, 4).map(upload => ({ id: upload.file.id, title: upload.file.title, folderId: null, match: file.checksum ? "content" : "possible" })) })) }, status: 200 };
  }
  const record = /^api\/files\/([0-9a-f-]{36})\/record$/.exec(path);
  if (record) { const upload = state.uploads.get(record[1]); return upload?.available ? { data: { file: upload.file }, status: 200 } : { status: 404 }; }
  return null;
}
