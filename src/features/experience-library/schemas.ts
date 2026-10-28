import { z } from "zod";
import { experienceAiProviders, experienceCaptureTypes } from "./types";

export const appendExperienceInputSchema = z.object({
  requestId: z.uuid(),
  entryId: z.uuid().nullable().optional(),
  sourceUrl: z.string().trim().max(2048).nullable().optional(),
  title: z.string().trim().max(240).optional(),
  captureType: z.enum(experienceCaptureTypes).default("auto"),
  content: z.string().max(200_000).default(""),
  speaker: z.string().trim().max(120).nullable().optional(),
});

export const appendExperienceRpcResultSchema = z.object({
  entry_id: z.uuid(),
  capture_id: z.uuid().nullable(),
  title: z.string(),
  created_entry: z.boolean(),
  appended: z.boolean(),
});

export const attachExperienceMediaSchema = z.object({
  entryId: z.uuid(),
  captureId: z.uuid().nullable(),
  documentId: z.uuid(),
  selectionStart: z.number().int().nonnegative().nullable(),
  selectionEnd: z.number().int().nonnegative().nullable(),
  selectionQuote: z.string().max(20_000).nullable(),
  caption: z.string().trim().max(500).nullable().optional(),
  sourceKind: z.enum(["clipboard", "drop", "file"]).default("clipboard"),
});

export const updateExperienceMediaSchema = z.object({
  mediaId: z.uuid(),
  captureId: z.uuid().nullable(),
  caption: z.string().trim().max(500).nullable(),
});

export const experienceMediaMoveSchema = z.object({
  mediaId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const experienceMediaIdSchema = z.object({ mediaId: z.uuid() });

export const experienceAiSettingsSchema = z.object({
  provider: z.enum(experienceAiProviders),
  modelId: z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/),
  apiKey: z.string().trim().min(20).max(500).optional(),
});

export const experienceAiTestSchema = experienceAiSettingsSchema;
export const experienceEntryIdSchema = z.object({ entryId: z.uuid() });

export const experienceUploadRequestSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(3).max(160),
  size: z.number().int().positive(),
  checksum: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});

export const experienceAiAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  keyPoints: z.array(z.object({
    text: z.string().trim().min(1).max(1000),
    kind: z.enum(["reported", "opinion", "inference"]),
    sourceIndex: z.number().int().positive().nullable().default(null),
    sourceQuote: z.string().trim().max(2000).nullable().default(null),
  })).max(20).default([]),
});
