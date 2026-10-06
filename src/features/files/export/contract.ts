/** Browser-safe metadata contract. No provider locations, signed URLs, or credentials. */
export const exportPlanFormat = "personal-os-files-plan/v1";
export const exportPartFormat = "personal-os-files-part/v1";
export const maxExportPartBytes = 256 * 1024 * 1024;
export const maxExportParts = 256;
export const maxExportPlanMetadataBytes = 64 * 1024 * 1024;

export type ExportPlanPart = {
  partIndex: number;
  documentOffset: number;
  documentCount: number;
  firstDocumentId: string | null;
  lastDocumentId: string | null;
  originalBytes: number;
  pendingUploadOriginals: number;
  estimatedBytes: number;
  /** Documents after this ordered part; does not establish earlier downloads. */
  remainingDocuments: number;
};
export type ExportPlan = {
  format: typeof exportPlanFormat;
  planId: string;
  metadataSha256: string;
  counts: { folders: number; documents: number; relationships: number; objects: number; objectBytes: number; pending: number };
  limits: { maxPartBytes: number; maxOriginalBytes: number; maxRows: number; maxParts: number; maxMetadataBytes: number };
  parts: ExportPlanPart[];
  storage: {
    scope: "document_metadata_only_not_provider_usage";
    availableBytes: number;
    archivedBytes: number;
    pendingBytes: number;
    totalLogicalBytes: number;
    recordedChecksumDuplicateGroups: number;
    /** Possible duplication inferred from recorded SHA256 + size, not newly verified bytes. */
    possibleDuplicateBytes: number;
  };
  consistency: "live_read_with_metadata_recheck_not_database_snapshot";
  downloadStatus: "not_verified";
};
export type ExportCollectionDescriptor = {
  planId: string;
  metadataSha256: string;
  partIndex: number;
  partCount: number;
  documentOffset: number;
  documentCount: number;
  totalDocuments: number;
  originalBytes: number;
  totalOriginalBytes: number;
  pendingUploadOriginals: number;
  totalPendingUploadOriginals: number;
  firstDocumentId: string | null;
  lastDocumentId: string | null;
  remainingDocuments: number;
  sharedFolders: number;
  sharedRelationships: number;
};
