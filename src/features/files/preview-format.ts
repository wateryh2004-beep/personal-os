/** Metadata hint only; server decoders must still validate actual bytes. */
const rasterByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif" };
const rasterMimes = new Set(Object.values(rasterByExtension));
export function photoPreviewMime(mime: string, filename = "") {
  const raw = mime.toLowerCase().trim();
  const normalized = ({ "image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/x-png": "image/png" } as Record<string, string>)[raw] ?? raw;
  if (rasterMimes.has(normalized)) return normalized;
  if (!["application/octet-stream", ""].includes(normalized)) return null;
  return rasterByExtension[filename.split(".").pop()?.toLowerCase() ?? ""] ?? null;
}
export function isPdfFile(file: { mime_type: string; original_filename: string }) {
  return file.mime_type.toLowerCase() === "application/pdf" || (["application/octet-stream", ""].includes(file.mime_type.toLowerCase()) && /\.pdf$/i.test(file.original_filename));
}
