export const experienceCaptureTypes = ["auto", "post", "comment", "document"] as const;
export type ExperienceCaptureChoice = (typeof experienceCaptureTypes)[number];
export type ExperienceCaptureType = Exclude<ExperienceCaptureChoice, "auto" | "document"> | "mixed" | "unknown";

export const experienceAiProviders = ["deepseek", "qwen"] as const;
export type ExperienceAiProvider = (typeof experienceAiProviders)[number];

export type ExperienceSegment = {
  kind: "post" | "comment" | "unknown";
  text: string;
  start: number;
  end: number;
  label: string | null;
};

export type ExperienceAiKeyPoint = {
  text: string;
  kind: "reported" | "opinion" | "inference";
  sourceCaptureId: string | null;
  sourceMediaId?: string | null;
  sourceQuote: string | null;
};

export type ExperienceAiAnalysis = {
  summary: string;
  tags: string[];
  keyPoints: ExperienceAiKeyPoint[];
};

export type ExperienceReviewStatus = "unmarked" | "to_read" | "useful" | "outdated";

export type ExperienceEntrySummary = {
  id: string;
  sourceUrl: string | null;
  title: string;
  tags: string[];
  summary: string | null;
  aiStatus: "not_requested" | "completed" | "failed";
  aiErrorCode: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiAnalyzedAt: string | null;
  updatedAt: string;
  createdAt: string;
  captureCount: number;
  mediaCount: number;
  personalNote?: string;
  reviewStatus?: ExperienceReviewStatus;
  matchExcerpt?: string | null;
};

export type ExperienceCapture = {
  id: string;
  captureType: ExperienceCaptureType;
  rawContent: string;
  segments: ExperienceSegment[];
  speaker: string | null;
  createdAt: string;
};

export type ExperienceMedia = {
  id: string;
  entryId: string;
  captureId: string | null;
  documentId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionQuote: string | null;
  position: number;
  caption: string | null;
  sourceKind: "clipboard" | "drop" | "file";
  createdAt: string;
  originalFilename: string | null;
  mimeType: string | null;
  available: boolean;
  fileSize?: number;
  ocrText?: string | null;
  ocrSourceSha256?: string | null;
  ocrCorrectionId?: string | null;
  ocrExtractedAt?: string | null;
  aiVisibility?: "normal" | "sensitive" | "never";
};

export type ExperienceEntryDetail = {
  entry: ExperienceEntrySummary;
  captures: ExperienceCapture[];
  media: ExperienceMedia[];
  aiKeyPoints: ExperienceAiKeyPoint[];
  tasks?: { id: string; title: string; status: string }[];
};

export type ExperienceAiConfig = {
  configured: boolean;
  provider: ExperienceAiProvider | null;
  modelId: string | null;
  lastTestedAt: string | null;
};

export type AppendExperienceResult = {
  entryId: string;
  captureId: string | null;
  title: string;
  createdEntry: boolean;
  appended: boolean;
};

export type DraftImageAssociation = {
  captureId: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionQuote: string | null;
};
