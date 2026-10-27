import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseWorkspaceSceneListResponse, projectOwnerWorkspaceScenes } from "@/features/workbench/scene-read-contracts";
import { workspaceSceneSnapshotSchema } from "@/features/workbench/contracts";

const auth = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwnerApi: auth.owner,
  requireOwner: auth.owner,
  apiAuthenticationFailure: (error: unknown) => error === "anonymous" || error === "foreign"
    ? Response.json({ error: "auth" }, { status: error === "anonymous" ? 401 : 403, headers: { "Cache-Control": "private, no-store" } }) : null,
}));
import { GET } from "@/app/api/workbench/scenes/route";
import { saveWorkspaceScene } from "@/features/workbench/scenes";

const ownerId = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const otherId = "20000000-0000-4000-8000-000000000002";
const snapshot = () => ({ version: 1, main: { href: "/notes" }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" } });
const scene = (sceneId = id) => ({ id: sceneId, name: "合成旧现场", revision: 1, created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z", archived_at: null, snapshot: snapshot() });
const metadata = <T extends { snapshot: unknown }>(value: T) => { const { snapshot: omitted, ...result } = value; void omitted; return result; };
const future = () => ({ ...scene(otherId), name: "合成未知格式", snapshot: { version: 99, body: "PRIVATE FUTURE BODY", signedUrl: "https://secret.test/signed?token=SECRET" } });

function database(rows: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn(), limit: vi.fn().mockResolvedValue({ data: rows, error }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query); query.is.mockReturnValue(query); query.order.mockReturnValue(query);
  const from = vi.fn().mockReturnValue(query);
  auth.owner.mockResolvedValue({ userId: ownerId, supabase: { from } });
  return { from, query };
}
beforeEach(() => vi.clearAllMocks());

describe("scene read compatibility without future execution", () => {
  it("keeps legacy known scenes while projecting one future row to metadata", () => {
    const unknown = future();
    const result = parseWorkspaceSceneListResponse({ scenes: [scene(), unknown] });
    expect(result).toEqual({ scenes: [scene()], unsupportedScenes: [metadata(unknown)] });
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE|signedUrl|SECRET|version.*99/);
    expect(parseWorkspaceSceneListResponse({ scenes: [scene()] })).toEqual({ scenes: [scene()] });
    expect(workspaceSceneSnapshotSchema.safeParse(unknown.snapshot).success).toBe(false);
  });
  it.each([
    { ...snapshot(), main: { href: "/future-workspace" } },
    { ...snapshot(), main: { href: "/notes", viewState: { kind: "future-filter", body: "PRIVATE" } } },
    { ...snapshot(), main: { href: "/notes?token=SECRET" } },
    { ...snapshot(), body: "x".repeat(40_000) },
    null,
  ])("isolates an unsupported path, kind, unsafe URL or malformed snapshot", value => {
    const row = { ...scene(otherId), snapshot: value };
    const result = parseWorkspaceSceneListResponse({ scenes: [scene(), row] });
    expect(result.scenes).toEqual([scene()]); expect(result.unsupportedScenes).toEqual([metadata(row)]);
    expect(workspaceSceneSnapshotSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    { name: "x".repeat(81) }, { name: "bad\u0000name" }, { revision: "1" },
    { id: "bad-id" }, { updated_at: "not-time" }, { created_at: `2026-10-27T00:00:00.${"1".repeat(1000)}Z` }, { archived_at: "2026-10-27T00:00:00Z" },
  ])("reports invalid metadata separately without calling it a new format", patch => {
    const result = parseWorkspaceSceneListResponse({ scenes: [scene(), { ...future(), ...patch }] });
    expect(result).toEqual({ scenes: [scene()], unavailableCount: 1 });
  });
  it("accepts the metadata-only DTO but refuses duplicate identities and hidden snapshots in it", () => {
    expect(parseWorkspaceSceneListResponse({ scenes: [scene()], unsupportedScenes: [metadata(future())], unavailableCount: 1 })).toEqual({ scenes: [scene()], unsupportedScenes: [metadata(future())], unavailableCount: 1 });
    expect(parseWorkspaceSceneListResponse({ scenes: [scene()], unsupportedScenes: [{ ...metadata(future()), snapshot: future().snapshot }] })).toEqual({ scenes: [scene()], unavailableCount: 1 });
    expect(parseWorkspaceSceneListResponse({ scenes: [scene(), { ...scene(), revision: 2 }] })).toEqual({ scenes: [], unavailableCount: 2 });
    expect(() => parseWorkspaceSceneListResponse({ scenes: [], unsupportedScenes: [], unavailableCount: 21 })).toThrow();
    expect(() => parseWorkspaceSceneListResponse({ scenes: Array.from({ length: 21 }, () => scene()) })).toThrow();
    expect(() => parseWorkspaceSceneListResponse({ scenes: null })).toThrow();
  });
  it("checks verified row ownership before publishing even metadata or counts", () => {
    expect(projectOwnerWorkspaceScenes([{ ...scene(), user_id: ownerId }, { ...future(), user_id: otherId }, { ...future(), user_id: undefined }], ownerId)).toEqual({ scenes: [scene()] });
  });
  it.each([future().snapshot, { ...snapshot(), main: { href: "/future-workspace" } }, { ...snapshot(), main: { href: "/notes?token=SECRET" } }])("still rejects unsupported snapshots at the real save action before any RPC", async unsupportedSnapshot => {
    const rpc = vi.fn(); auth.owner.mockResolvedValue({ userId: ownerId, supabase: { rpc } });
    expect(await saveWorkspaceScene({ id, requestId: otherId, expectedRevision: 1, name: "保留原记录", snapshot: unsupportedSnapshot, archive: true })).toEqual({ status: "invalid" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("real scene GET handler", () => {
  it("returns partial 200 with old scenes and safe unsupported metadata under verified owner filters", async () => {
    const raw = [scene(), future(), { ...scene("20000000-0000-4000-8000-000000000003"), name: "" }].map(row => ({ ...row, user_id: ownerId }));
    const { from, query } = database([...raw, { ...scene("20000000-0000-4000-8000-000000000004"), user_id: otherId, name: "OTHER OWNER SECRET" }]);
    const response = await GET(); const data = await response.json();
    expect(response.status).toBe(200); expect(data).toEqual({ scenes: [scene()], unsupportedScenes: [metadata(future())], unavailableCount: 1 });
    expect(JSON.stringify(data)).not.toMatch(/PRIVATE|SECRET|signedUrl|user_id/);
    expect(from).toHaveBeenCalledExactlyOnceWith("workspace_scenes");
    expect(query.eq).toHaveBeenCalledExactlyOnceWith("user_id", ownerId); expect(query.is).toHaveBeenCalledExactlyOnceWith("archived_at", null);
    expect(query.limit).toHaveBeenCalledExactlyOnceWith(20);
    expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it.each(["anonymous", "foreign"])("authenticates %s before any database projection", async reason => {
    const { from } = database([]); auth.owner.mockRejectedValue(reason);
    const response = await GET(); expect(response.status).toBe(reason === "anonymous" ? 401 : 403); expect(from).not.toHaveBeenCalled();
  });
  it.each([{ data: null, error: null }, { data: [], error: "failure" }, { data: Array.from({ length: 21 }, () => ({ ...scene(), user_id: ownerId })), error: null }])("does not disguise failed or over-budget reads as an empty list", async ({ data, error }) => {
    database(data, error); const response = await GET(); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "现场暂时无法读取。" });
  });
});
