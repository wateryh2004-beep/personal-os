import "server-only";
import type { FileRecord } from "@/features/files/queries";
import type { SyntheticMetadataReceipt } from "./continuous-metadata-fixture";
import type { SyntheticUpload } from "./continuous-upload-fixture";
import { initialSyntheticLifeRows, type SyntheticLifeReceipt } from "./continuous-life-fixture";
import type { LifeFieldRow } from "@/features/life/contracts";
import type { AgentAction } from "@/features/assistant/types";
import type { CaptureOutcome } from "@/features/inbox/capture-intents";
import type { WorkspaceScene } from "@/features/workbench/contracts";
import { fixtureFiles, fixtureNoteDocuments, fixtureEvents, fixtureTimestamp } from "./continuous-fixture-data";
export type FixtureState = {
  notes: typeof fixtureNoteDocuments; events: typeof fixtureEvents; scenes: WorkspaceScene[];
  calls: Record<string, number>; writes: Record<string, number>; delay: number; mode: "normal" | "save-conflict" | "save-unknown" | "ai-error";
  sceneReceipts: Map<string, { payload: string; scene: WorkspaceScene }>;
  runs: Map<string, { surface: string; current_entity_type: string | null; current_entity_id: string | null; status: string; messages: unknown[] }>;
  captures: Map<string, { content: string; outcome: CaptureOutcome }>;
  actions: Map<string, AgentAction>;
  uploadFailures: Set<string>;
  files: FileRecord[]; metadataReceipts: Map<string,SyntheticMetadataReceipt>; metadataRevisions: Map<string,number>;
  uploads: Map<string, SyntheticUpload>;
  domainObjects: Map<string, unknown>;
  lifeRows: Map<string, LifeFieldRow>; lifeReceipts: Map<string, SyntheticLifeReceipt>;
  lastUsed: number;
};
// RSC pages and Route Handlers can load different compiled module instances.
// One bounded synthetic-only process registry keeps canonical router.refresh
// consistent with its HTTP transaction without relying on module-cache identity.
const runtime = globalThis as typeof globalThis & { __personalOsContinuousFixtureStatesV3?: Map<string, FixtureState> };
const states = runtime.__personalOsContinuousFixtureStatesV3 ??= new Map<string, FixtureState>();
export function continuousFixtureState(cookie: string | null) {
  const match = /(?:^|;\s*)personal-os-fixture-session=([0-9a-f-]{36})(?:;|$)/i.exec(cookie ?? "");
  const key = match?.[1] ?? "single-synthetic-session";
  for (const [id, state] of states) if (Date.now() - state.lastUsed > 20 * 60_000) states.delete(id);
  let state = states.get(key);
  if (!state) {
    if (states.size >= 20) throw new Error("fixture_session_limit");
    state = { notes: structuredClone(fixtureNoteDocuments), events: structuredClone(fixtureEvents), scenes: [], calls: {}, writes: {}, delay: 0, mode: "normal", sceneReceipts: new Map(), runs: new Map(), captures: new Map(), actions: new Map(), uploadFailures: new Set(), files: structuredClone(fixtureFiles), metadataReceipts: new Map(), metadataRevisions: new Map(), uploads: new Map(), domainObjects: new Map(), lifeRows: initialSyntheticLifeRows(), lifeReceipts: new Map(), lastUsed: Date.now() }; states.set(key, state);
  }
  state.lastUsed = Date.now(); return state;
}
export function countFixtureCall(state: FixtureState, name: string, write = false) {
  state.calls[name] = (state.calls[name] ?? 0) + 1;
  if (write) state.writes[name] = (state.writes[name] ?? 0) + 1;
}
export const syntheticTime = () => fixtureTimestamp;

export function discardContinuousFixtureState(cookie: string | null) {
  const key = /(?:^|;\s*)personal-os-fixture-session=([0-9a-f-]{36})(?:;|$)/i.exec(cookie ?? "")?.[1] ?? "single-synthetic-session";
  states.delete(key);
}
