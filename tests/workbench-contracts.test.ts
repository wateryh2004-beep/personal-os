import { describe, expect, it } from "vitest";
import { safeWorkbenchHref, workbenchRefSchema, workspaceSceneSnapshotSchema, workspaceSceneSchema } from "@/features/workbench/contracts";
const id = "00000000-0000-4000-8000-000000000001";
const snapshot = () => ({ version: 1, main: { href: `/notes/${id}`, position: { sourceLine: 12, sourceOffset: 4, anchor: 20, head: 30, reading: false } }, reference: { ref: { kind: "document", id }, position: { pdfPage: 8 } }, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" } });
describe("workbench preference contract", () => {
  it("allows only finite UUID refs and explicit investment subtypes", () => {
    expect(workbenchRefSchema.safeParse({ kind: "opportunity", id }).success).toBe(true);
    expect(workbenchRefSchema.safeParse({ kind: "investment", id, investmentType: "ledger" }).success).toBe(true);
    for (const value of [{ kind: "note", id, investmentType: "ledger" }, { kind: "users", id }, { kind: "note", id: "javascript:alert(1)" }, { kind: "note", id, userId: id }]) expect(workbenchRefSchema.safeParse(value).success).toBe(false);
  });
  it("restores meaningful filter/entity state while discarding credentials and mutation triggers", () => {
    expect(safeWorkbenchHref(`/files?file=${id}&type=photo&view=grid&page=2&upload=1&token=private`)).toBe(`/files?file=${id}&type=photo&view=grid&page=2`);
    expect(safeWorkbenchHref(`/career/interview?answer=${id}&question=${id}&context=${id}`)).toContain(`answer=${id}`);
    expect(safeWorkbenchHref("/career/interview?answer=secret&question=raw-body&password=secret")).toBe("/career/interview");
    expect(safeWorkbenchHref("/investments?mode=field&tab=holdings")).toBe("/investments?tab=holdings");
    expect(safeWorkbenchHref("/shopping?mode=field")).toBe("/shopping?mode=field");
    expect(safeWorkbenchHref("/leisure?kind=book&minutes=45&setting=home&company=solo&budget=free&mode=field")).toContain("kind=book");
    expect(safeWorkbenchHref("/calendar?date=2026-02-30&view=timeGridWeek")).toBe("/calendar?view=timeGridWeek");
  });
  it.each(["https://evil.test/notes", "//evil.test/notes", "javascript:alert(1)", "/api/files/id/download", "/login", "/notes/../../login", "/notes/%2f%2fevil", "/notes/not-a-real-id", "/career/unknown", "/notes\\evil", "/notes\n"])("rejects unsafe destination %s", (value) => expect(safeWorkbenchHref(value)).toBeNull());
  it("keeps scenes strict, bounded and made only of numeric/view anchors", () => {
    expect(workspaceSceneSnapshotSchema.safeParse(snapshot()).success).toBe(true);
    for (const patch of [{ body: "private" }, { signedUrl: "https://secret" }, { reference: { ref: { kind: "document", id }, dto: { body: "private" } } }, { main: { href: "/notes", position: { scrollTop: Infinity } } }, { main: { href: "/notes", position: { pdfPage: 501 } } }, { main: { href: "/notes?token=secret" } }]) expect(workspaceSceneSnapshotSchema.safeParse({ ...snapshot(), ...patch }).success).toBe(false);
    expect(workspaceSceneSchema.safeParse({ id, name: "论文阅读", revision: 1, snapshot: snapshot(), created_at: "2026-10-25T12:00:00Z", updated_at: "2026-10-25T12:00:00Z", archived_at: null }).success).toBe(true);
    expect(workspaceSceneSchema.safeParse({ id, name: "论文阅读", revision: "1", snapshot: snapshot() }).success).toBe(false);
  });
});
