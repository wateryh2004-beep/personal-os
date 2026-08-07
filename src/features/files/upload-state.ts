export function canAbortPendingUpload(document: { storage_provider: string; storage_state: string }) {
  return document.storage_provider === "cloudflare_r2" && document.storage_state === "pending";
}

export function stalePendingCutoff(now = new Date()) {
  return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
}
