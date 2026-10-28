import { requireOwner } from "@/lib/auth/require-owner";
import type {
  ExperienceAiConfig,
  ExperienceAiKeyPoint,
  ExperienceAiProvider,
  ExperienceCapture,
  ExperienceEntryDetail,
  ExperienceEntrySummary,
  ExperienceMedia,
  ExperienceSegment,
} from "./types";

const entryColumns = "id,source_url,title,tags,ai_summary,ai_status,ai_error_code,ai_provider,ai_model,ai_analyzed_at,updated_at,created_at,personal_note,review_status";

type SearchEntryRow = {
  id: string;
  source_url: string | null;
  title: string;
  tags: string[];
  ai_summary: string | null;
  ai_status: string;
  ai_error_code: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_analyzed_at: string | null;
  updated_at: string;
  created_at: string;
  capture_count: number;
  media_count: number;
  personal_note: string;
  review_status: ExperienceEntrySummary["reviewStatus"];
  match_excerpt: string | null;
};

function asSegments(value: unknown): ExperienceSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((segment) => {
    if (!segment || typeof segment !== "object") return [];
    const item = segment as Record<string, unknown>;
    if (
      !["post", "comment", "unknown"].includes(String(item.kind))
      || typeof item.text !== "string"
      || typeof item.start !== "number"
      || typeof item.end !== "number"
    ) return [];
    return [{
      kind: item.kind as ExperienceSegment["kind"],
      text: item.text,
      start: item.start,
      end: item.end,
      label: typeof item.label === "string" ? item.label : null,
    }];
  });
}

function asKeyPoints(value: unknown): ExperienceAiKeyPoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const item = point as Record<string, unknown>;
    if (
      typeof item.text !== "string"
      || !["reported", "opinion", "inference"].includes(String(item.kind))
    ) return [];
    return [{
      text: item.text,
      kind: item.kind as ExperienceAiKeyPoint["kind"],
      sourceCaptureId: typeof item.sourceCaptureId === "string" ? item.sourceCaptureId : null,
      sourceMediaId: typeof item.sourceMediaId === "string" ? item.sourceMediaId : null,
      sourceQuote: typeof item.sourceQuote === "string" ? item.sourceQuote : null,
    }];
  });
}

function summary(
  row: {
    id: string;
    source_url: string | null;
    title: string;
    tags: string[];
    ai_summary: string | null;
    ai_status: string;
    ai_error_code: string | null;
    ai_provider: string | null;
    ai_model: string | null;
    ai_analyzed_at: string | null;
    updated_at: string;
    created_at: string;
    personal_note?: string;
    review_status?: ExperienceEntrySummary["reviewStatus"];
    match_excerpt?: string | null;
  },
  captureCount = 0,
  mediaCount = 0,
): ExperienceEntrySummary {
  return {
    id: row.id,
    sourceUrl: row.source_url,
    title: row.title,
    tags: row.tags ?? [],
    summary: row.ai_summary,
    aiStatus: row.ai_status as ExperienceEntrySummary["aiStatus"],
    aiErrorCode: row.ai_error_code,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    aiAnalyzedAt: row.ai_analyzed_at,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
    captureCount,
    mediaCount,
    personalNote: row.personal_note ?? "",
    reviewStatus: row.review_status ?? "unmarked",
    matchExcerpt: row.match_excerpt ?? null,
  };
}

export type ExperienceFilters = { tag?: string; status?: string; hasMedia?: boolean; analyzed?: boolean; sort?: string };

export async function getExperienceLibraryWorkspace(query = "", filters: ExperienceFilters = {}) {
  try {
    const { supabase } = await requireOwner();
    const needle = query.trim().slice(0, 120);
    const [search, entries, captures, media, tags] = await Promise.all([
      supabase.rpc("search_experience_library_v2", { p_query: needle, p_tag: filters.tag ?? "", p_status: filters.status ?? "", p_has_media: !!filters.hasMedia, p_analyzed: !!filters.analyzed, p_sort: filters.sort === "created" ? "created" : "updated" }),
      supabase.from("experience_library_entries").select("*", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("experience_library_captures").select("*", { count: "exact", head: true }),
      supabase.from("experience_library_media").select("*", { count: "exact", head: true }).is("archived_at", null),
      supabase.from("experience_library_entries").select("tags").is("archived_at", null).limit(1000),
    ]);
    if (search.error || entries.error || captures.error || media.error || tags.error) {
      throw new Error("experience_library_read_failed");
    }
    const result = ((search.data ?? []) as SearchEntryRow[]).map((entry) => summary(
      entry,
      Number(entry.capture_count),
      Number(entry.media_count),
    ));
    return {
      available: true,
      query: needle,
      entries: result,
      tags: Array.from(new Set((tags.data ?? []).flatMap((row) => row.tags ?? []))).sort(),
      filters,
      total: entries.count ?? 0,
      captureTotal: captures.count ?? 0,
      mediaTotal: media.count ?? 0,
    };
  } catch {
    return {
      available: false,
      query,
      entries: [] as ExperienceEntrySummary[],
      tags: [] as string[],
      filters,
      total: 0,
      captureTotal: 0,
      mediaTotal: 0,
    };
  }
}

export async function getExperienceAiConfig(): Promise<ExperienceAiConfig> {
  try {
    const { supabase, userId } = await requireOwner();
    const { data, error } = await supabase.from("experience_library_ai_settings")
      .select("provider,model_id,last_tested_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return { configured: false, provider: null, modelId: null, lastTestedAt: null };
    return {
      configured: true,
      provider: data.provider as ExperienceAiProvider,
      modelId: data.model_id,
      lastTestedAt: data.last_tested_at,
    };
  } catch {
    return { configured: false, provider: null, modelId: null, lastTestedAt: null };
  }
}

export async function getExperienceEntry(entryId: string): Promise<ExperienceEntryDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) return null;
  try {
    const { supabase, userId } = await requireOwner();
    const { data: entry, error: entryError } = await supabase.from("experience_library_entries")
      .select(`${entryColumns},ai_key_points`)
      .eq("id", entryId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle();
    if (entryError || !entry) return null;
    const [{ data: captureRows, error: captureError }, { data: mediaRows, error: mediaError }] = await Promise.all([
      supabase.from("experience_library_captures")
        .select("id,capture_type,raw_content,segments,speaker,created_at")
        .eq("entry_id", entryId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true }),
      supabase.from("experience_library_media")
        .select("id,entry_id,capture_id,document_id,selection_start,selection_end,selection_quote,position,caption,source_kind,created_at")
        .eq("entry_id", entryId)
        .eq("user_id", userId)
        .is("archived_at", null)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    if (captureError || mediaError) return null;
    const documentIds = (mediaRows ?? []).flatMap((item) => item.document_id ? [item.document_id] : []);
    const { data: documents, error: documentError } = documentIds.length
      ? await supabase.from("documents")
        .select("id,original_filename,mime_type,file_size,storage_state,archived_at,ai_visibility,extracted_text,text_extraction_method,text_extraction_source_sha256,text_extracted_at")
        .eq("user_id", userId)
        .in("id", documentIds)
      : { data: [], error: null };
    if (documentError) return null;
    const documentsById = new Map((documents ?? []).map((document) => [document.id, document]));
    const mediaIds = (mediaRows ?? []).map((item) => item.id);
    type OcrCorrection = { id: string; media_id: string; document_id: string; source_sha256: string; text_content: string; created_at: string };
    let correctionRows: OcrCorrection[] = [];
    let correctionsUnavailable = false;
    if (mediaIds.length) {
      try {
        const result = await supabase.from("experience_library_ocr_corrections").select("id,media_id,document_id,source_sha256,text_content,created_at").eq("user_id", userId).in("media_id", mediaIds).order("created_at", { ascending: false }).order("id", { ascending: false });
        if (result.error) correctionsUnavailable = true;
        else correctionRows = result.data ?? [];
      } catch { correctionsUnavailable = true; }
    }
    const corrections = new Map<string, OcrCorrection>();
    for (const row of correctionRows ?? []) {
      const document = documentsById.get(row.document_id);
      if (document?.text_extraction_source_sha256 === row.source_sha256 && !corrections.has(row.media_id)) corrections.set(row.media_id, row);
    }
    const captures: ExperienceCapture[] = (captureRows ?? []).map((capture) => ({
      id: capture.id,
      captureType: capture.capture_type as ExperienceCapture["captureType"],
      rawContent: capture.raw_content,
      segments: asSegments(capture.segments),
      speaker: capture.speaker,
      createdAt: capture.created_at,
    }));
    const media: ExperienceMedia[] = (mediaRows ?? []).map((item) => {
      const document = item.document_id ? documentsById.get(item.document_id) : undefined;
      return {
        id: item.id,
        entryId: item.entry_id,
        captureId: item.capture_id,
        documentId: document ? item.document_id : null,
        selectionStart: item.selection_start,
        selectionEnd: item.selection_end,
        selectionQuote: item.selection_quote,
        position: item.position,
        caption: item.caption,
        sourceKind: item.source_kind as ExperienceMedia["sourceKind"],
        createdAt: item.created_at,
        originalFilename: document?.original_filename ?? null,
        mimeType: document?.mime_type ?? null,
        available: Boolean(document && document.storage_state === "available" && !document.archived_at),
        fileSize: document?.file_size ?? 0,
        ocrText: !correctionsUnavailable && document?.text_extraction_method === "ocr_local" ? corrections.get(item.id)?.text_content ?? document.extracted_text ?? null : null,
        ocrUnavailable: correctionsUnavailable,
        ocrSourceSha256: document?.text_extraction_method === "ocr_local" ? document.text_extraction_source_sha256 : null,
        ocrCorrectionId: corrections.get(item.id)?.id ?? null,
        ocrExtractedAt: document?.text_extracted_at ?? null,
        aiVisibility: document?.ai_visibility ?? "sensitive",
      };
    });
    let tasksUnavailable = false;
    let tasks: { id: string; title: string; status: string }[] = [];
    try {
      const links = await supabase.from("experience_library_task_links")
        .select("todo_task_id").eq("entry_id", entryId).eq("user_id", userId).order("created_at", { ascending: false });
      if (links.error) tasksUnavailable = true;
      else {
        const taskIds = (links.data ?? []).map((link) => link.todo_task_id);
        if (taskIds.length) {
          const result = await supabase.from("microsoft_todo_tasks").select("id,title,status").eq("user_id", userId).is("archived_at", null).in("id", taskIds);
          if (result.error) tasksUnavailable = true;
          else tasks = (result.data ?? []).map((task) => ({ id: task.id, title: task.title, status: task.status }));
        }
      }
    } catch { tasksUnavailable = true; }
    return {
      tasks,
      tasksUnavailable,
      entry: summary(
        entry,
        captures.length,
        media.filter((item) => item.available).length,
      ),
      captures,
      media,
      aiKeyPoints: asKeyPoints(entry.ai_key_points),
    };
  } catch {
    return null;
  }
}
