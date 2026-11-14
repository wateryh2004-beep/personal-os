import { z } from "zod";
import { multipartPartSize } from "@/features/files/multipart-upload";

export const innerByteLimit = 2 * 1024 ** 3;
export const innerPartLimit = Math.ceil(innerByteLimit / multipartPartSize);
export const innerArchiveType = "application/zip";
export const innerArchiveSchema = z.object({
  resumeId: z.uuid().optional(),
  filename: z.string().min(1).max(255),
  size: z.number().int().min(1).max(innerByteLimit),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().refine(value => /\.zip$/i.test(value.filename.trim()));
export type InnerArchive = {
  id: string;
  filename: string;
  size: number;
  status: "initializing" | "uploading" | "completing" | "completed" | "failed" | "expired" | "aborting";
  expiresAt: string;
  parts: { partNumber: number; size: number }[];
};
