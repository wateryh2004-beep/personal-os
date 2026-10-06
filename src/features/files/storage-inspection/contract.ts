export type LogicalStorage = { status: "complete" | "unavailable"; records: number; activeBytes: number; archivedBytes: number; pendingBytes: number };
export type StorageInspection = {
  checkedAt: string;
  health: { configured: boolean; endpointValid: boolean; bucket: string | null; credentialsReachR2: boolean; status: "ok" | "misconfigured" | "unreachable"; reason?: "not_configured" | "access_denied" | "not_found" | "network_or_service" };
  logical: LogicalStorage;
  usage: { status: "complete" | "partial" | "unavailable"; objectCount: number; objectBytes: number; pagesScanned: number; reason?: "limit" | "not_configured" | "access_denied" | "network_or_service" } | null;
};

/** Refuse malformed responses rather than render a false healthy/zero state. */
export function isStorageInspection(value: unknown): value is StorageInspection {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<StorageInspection>;
  const validNumber = (number: unknown) => Number.isSafeInteger(number) && (number as number) >= 0;
  if (typeof input.checkedAt !== "string" || !Number.isFinite(Date.parse(input.checkedAt))) return false;
  const { health, logical, usage } = input;
  if (!health || !["ok", "misconfigured", "unreachable"].includes(health.status) ||
    typeof health.configured !== "boolean" || typeof health.endpointValid !== "boolean" || typeof health.credentialsReachR2 !== "boolean" ||
    (health.bucket !== null && typeof health.bucket !== "string")) return false;
  if (!logical || !["complete", "unavailable"].includes(logical.status) ||
    ![logical.records, logical.activeBytes, logical.archivedBytes, logical.pendingBytes].every(validNumber)) return false;
  return usage === null || Boolean(usage && ["complete", "partial", "unavailable"].includes(usage.status) &&
    [usage.objectCount, usage.objectBytes, usage.pagesScanned].every(validNumber));
}
