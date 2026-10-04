import type { CareerMaterialDocument } from "./materials";

/** Owner UI access is independent of AI visibility. Never send these rows to an AI service. */
export function careerMaterialReadHref(document: CareerMaterialDocument) {
  return document.storage_provider === "cloudflare_r2" && document.storage_state === "available"
    ? `/api/files/${encodeURIComponent(document.id)}/download?inline=1`
    : null;
}
