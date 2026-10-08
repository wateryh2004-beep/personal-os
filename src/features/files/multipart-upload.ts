import { z } from "zod";
import { maxFileSize, uploadRequestSchema } from "./schemas";
export const multipartPartSize = 8 * 1024 * 1024;
export const multipartThreshold = multipartPartSize;
export const multipartLifetimeMs = 6 * 24 * 60 * 60 * 1000;
export const multipartMaxParts = Math.ceil(maxFileSize / multipartPartSize);
export const multipartCreateSchema = uploadRequestSchema.omit({ noteId: true }).extend({ checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export const multipartOperationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("sign"), sessionId: z.string().uuid(), partNumber: z.number().int().min(1).max(multipartMaxParts) }).strict(),
  z.object({ action: z.literal("complete"), sessionId: z.string().uuid() }).strict(),
]);
export type MultipartStatus = "initializing" | "uploading" | "completing" | "uploaded" | "completed" | "aborting" | "aborted" | "expired" | "failed";
export type MultipartSnapshot = {
  sessionId: string; documentId: string; status: MultipartStatus; filename: string; contentType: string;
  size: number; checksum: string; folderId: string | null; partSize: number; expiresAt: string;
  parts: { partNumber: number; size: number }[];
  file: { id: string; title: string; originalFilename: string; mimeType: string; fileSize: number; folderId: string | null; textExtractionStatus: "pending" | "unsupported" | "too_large" | "not_requested" | "processing" | "completed" | "failed" };
};
export type MultipartPart = { partNumber: number; size: number; etag: string };
export function expectedPartSize(size: number, partNumber: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > maxFileSize || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > Math.ceil(size / multipartPartSize)) throw new Error("invalid_multipart_part");
  return Math.min(multipartPartSize, size - (partNumber - 1) * multipartPartSize);
}
/** Never complete using client ETags or a cached client list. */
export function validateMultipartParts(parts: MultipartPart[], size: number, complete = false) {
  if (parts.length > multipartMaxParts) throw new Error("invalid_multipart_parts");
  const seen = new Set<number>();
  for (const part of parts) {
    if (seen.has(part.partNumber) || part.size !== expectedPartSize(size, part.partNumber) || !/^"[a-f0-9]{32}"$/i.test(part.etag)) throw new Error("invalid_multipart_parts");
    seen.add(part.partNumber);
  }
  if (complete && parts.length !== Math.ceil(size / multipartPartSize)) throw new Error("incomplete_multipart_parts");
  return [...parts].sort((a,b) => a.partNumber-b.partNumber);
}
