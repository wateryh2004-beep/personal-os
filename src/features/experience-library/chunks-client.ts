"use client";
import { experienceChunkCount, experienceChunkSize } from "./chunks";
import { mapWithConcurrency } from "./parallel-upload";

/** Two chunks per image, bounded by the outer image concurrency. */
export async function uploadExperienceChunks(file: File, documentId: string, signal: AbortSignal, onProgress: (completed: number, total: number) => void) {
  const count = experienceChunkCount(file.size);
  const cancellation = new AbortController();
  const combined = AbortSignal.any([signal, cancellation.signal]);
  let completed = 0;
  let failure: Error | null = null;
  await mapWithConcurrency(Array.from({ length: count }, (_, index) => index), 2, async (index) => {
    if (combined.aborted) return;
    try {
      const response = await fetch("/api/experience-library/upload-chunks", {
        method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Experience-Document-Id": documentId, "X-Experience-Chunk-Index": String(index) },
        body: file.slice(index * experienceChunkSize, (index + 1) * experienceChunkSize), signal: combined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(typeof payload.error === "string" ? payload.error : "图片上传中断，请重试。");
      }
      completed += 1; onProgress(completed, count);
    } catch (error) {
      if (!failure && !signal.aborted) failure = error instanceof Error ? error : new Error("图片上传中断，请重试。");
      cancellation.abort();
    }
  });
  signal.throwIfAborted();
  if (failure) throw failure;
  if (completed !== count) throw new Error("图片上传中断，请重试。");
}
