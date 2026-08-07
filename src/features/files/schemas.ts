import { z } from "zod";

export const maxFileSize = 100 * 1024 * 1024;
const dangerousExtensions = new Set(["app", "bat", "cmd", "com", "dmg", "exe", "js", "msi", "pkg", "ps1", "sh", "vbs"]);

export function safeFilename(input: string) {
  const cleaned = input.normalize("NFKC").replace(/[\\/\u0000-\u001f<>:"|?*]/g, "_").replace(/\s+/g, " ").trim();
  return (cleaned || "untitled-file").slice(0, 180);
}

export function fileExtension(input: string) {
  const name = safeFilename(input);
  const match = /\.([a-z0-9]{1,16})$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "";
}

export function canUpload(filename: string, contentType: string, size: number) {
  const extension = fileExtension(filename);
  return size > 0 && size <= maxFileSize && !dangerousExtensions.has(extension)
    && /^[a-z][a-z0-9.+-]*\/[a-z0-9.+-]+$/i.test(contentType)
    && !contentType.startsWith("application/x-msdownload");
}

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(160),
  size: z.number().int().positive().max(maxFileSize),
  folderId: z.string().uuid().nullable().optional(),
});

export const completeUploadSchema = z.object({ documentId: z.string().uuid() });
export const fileIdSchema = z.object({ documentId: z.string().uuid() });
export const folderSchema = z.object({ name: z.string().trim().min(1).max(160), parentId: z.string().uuid().nullable().optional() });
export const renameFileSchema = z.object({ documentId: z.string().uuid(), title: z.string().trim().min(1).max(240) });
export const moveFileSchema = z.object({ documentId: z.string().uuid(), folderId: z.string().uuid().nullable() });

