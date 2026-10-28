"use client";

import { awaitOcr, OCR_TIMEOUT_MS, ocrKind } from "@/features/files/ocr-policy";
import type { OcrProgress } from "@/lib/adapters/private-ocr-browser";

/** Runs only after the original is sealed and linked. Failure never removes it. */
export async function recognizeExperienceImage(file: File, documentId: string, signal: AbortSignal, progress: (value: OcrProgress) => void) {
  if (ocrKind(file.name, file.type) !== "image") return "unsupported" as const;
  const local = new AbortController();
  const timeout = setTimeout(() => local.abort(), OCR_TIMEOUT_MS);
  const combined = AbortSignal.any([signal, local.signal]);
  const url = `/api/files/${documentId}/ocr`;
  let token: string | undefined;
  const patch = async (value: Record<string, unknown>, patchSignal?: AbortSignal) => {
    const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...value }), signal: patchSignal ? AbortSignal.any([patchSignal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.code ?? "ocr_failed");
    return result;
  };
  try {
    // The start request is allowed to settle so its lease can be cancelled.
    const response = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15_000) });
    const started = await response.json();
    if (!response.ok || typeof started.token !== "string") throw new Error(started.code ?? "ocr_failed");
    token = started.token;
    combined.throwIfAborted();
    const original = await fetch(`${url}?source=1`, { headers: { "X-Ocr-Run": started.token }, cache: "no-store", signal: combined });
    if (!original.ok) throw new Error("ocr_source_changed");
    const sha256 = original.headers.get("X-Ocr-Sha256");
    const bytes = await original.arrayBuffer();
    if (!sha256 || bytes.byteLength !== file.size) throw new Error("ocr_source_changed");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
    if (digest !== sha256) throw new Error("ocr_source_changed");
    const { recognizePrivateDocument } = await awaitOcr(import("@/lib/adapters/private-ocr-browser"), combined);
    const result = await awaitOcr(recognizePrivateDocument({ bytes: new Uint8Array(bytes), filename: file.name, mimeType: file.type, signal: combined, onProgress: progress,
      onPage: (pages, total) => patch({ action: "progress", pages, total }, combined).then(() => {}),
    }), combined);
    combined.throwIfAborted();
    await patch({ action: "complete", text: result.text, pages: result.pages, total: result.pages, emptyPages: result.emptyPages, sha256 }, combined);
    return "completed" as const;
  } catch (error) {
    if (token) await patch({ action: combined.aborted ? "cancel" : "fail", error: combined.aborted ? "ocr_cancelled" : "ocr_failed" }).catch(() => {});
    throw error;
  } finally { clearTimeout(timeout); }
}
