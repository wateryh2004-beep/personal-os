import { z } from "zod";
import { workspaceSceneSchema, type WorkspaceScene } from "./contracts";

const maximumScenes = 20;
/** Read-only identity. An unsupported snapshot never crosses this boundary. */
export const workspaceSceneMetadataSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80).refine(value => !/[\u0000-\u001f\u007f]/.test(value)),
  revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1),
  created_at: z.iso.datetime({ offset: true }).max(64),
  updated_at: z.iso.datetime({ offset: true }).max(64),
  archived_at: z.null(),
}).strict();
export type WorkspaceSceneMetadata = z.infer<typeof workspaceSceneMetadataSchema>;
export type WorkspaceSceneList = {
  scenes: WorkspaceScene[];
  // Optional to preserve the existing { scenes } transport and fixture contract.
  unsupportedScenes?: WorkspaceSceneMetadata[];
  unavailableCount?: number;
};

const listEnvelopeSchema = z.object({
  scenes: z.array(z.unknown()).max(maximumScenes),
  unsupportedScenes: z.array(z.unknown()).max(maximumScenes).optional(),
  unavailableCount: z.number().int().min(0).max(maximumScenes).optional(),
}).strict().refine(value => value.scenes.length + (value.unsupportedScenes?.length ?? 0) + (value.unavailableCount ?? 0) <= maximumScenes);
const rowArraySchema = z.array(z.unknown()).max(maximumScenes);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

function metadataOf(value: Record<string, unknown>) {
  return workspaceSceneMetadataSchema.safeParse({
    id: value.id, name: value.name, revision: value.revision,
    created_at: value.created_at, updated_at: value.updated_at, archived_at: value.archived_at,
  });
}

/** Isolate malformed rows and duplicate identities, never relax the execution schema. */
function projectRows(rows: unknown[], unsupportedRows: unknown[] = [], initialUnavailable = 0): WorkspaceSceneList {
  const result: WorkspaceSceneList = { scenes: [] };
  const unsupported: WorkspaceSceneMetadata[] = [];
  let unavailable = initialUnavailable;
  const candidates = [
    ...rows.map(value => ({ value, metadataOnly: false })),
    ...unsupportedRows.map(value => ({ value, metadataOnly: true })),
  ].map(({ value, metadataOnly }) => {
    const metadata = !record(value) ? null : metadataOnly ? workspaceSceneMetadataSchema.safeParse(value) : metadataOf(value);
    return { value, metadataOnly, metadata };
  });
  const counts = new Map<string, number>();
  for (const { metadata } of candidates) if (metadata?.success) counts.set(metadata.data.id, (counts.get(metadata.data.id) ?? 0) + 1);
  for (const { value, metadataOnly, metadata } of candidates) {
    if (!metadata?.success || counts.get(metadata.data.id) !== 1 || !record(value)) { unavailable += 1; continue; }
    const known = metadataOnly ? null : workspaceSceneSchema.safeParse({ ...metadata.data, snapshot: value.snapshot });
    if (known?.success) result.scenes.push(known.data);
    else unsupported.push(metadata.data);
  }
  if (unsupported.length) result.unsupportedScenes = unsupported;
  if (unavailable) result.unavailableCount = unavailable;
  return result;
}

/** Server read projection: the verified owner is checked before any metadata is exposed. */
export function projectOwnerWorkspaceScenes(input: unknown, ownerId: string): WorkspaceSceneList {
  const rows = rowArraySchema.parse(input);
  return projectRows(rows.filter(value => record(value) && value.user_id === ownerId));
}

/** Accept old { scenes } responses, but retain only strict known snapshots or safe metadata. */
export function parseWorkspaceSceneListResponse(input: unknown): WorkspaceSceneList {
  const envelope = listEnvelopeSchema.parse(input);
  return projectRows(envelope.scenes, envelope.unsupportedScenes, envelope.unavailableCount);
}
