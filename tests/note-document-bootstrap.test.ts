import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: vi.fn() }));
vi.mock("@/features/notes/queries", () => ({ getNoteDocument: vi.fn(), getNotesWorkspace: vi.fn() }));
import { requireOwner } from "@/lib/auth/require-owner";
import { getNoteDocument } from "@/features/notes/queries";
import { getNoteDocumentBootstrap } from "@/features/notes/server-bootstrap";
beforeEach(() => vi.resetAllMocks());
it("returns a recoverable failed seed instead of dropping a warm document on a server read failure", async () => {
  vi.mocked(requireOwner).mockResolvedValue({ userId: "synthetic-owner" } as Awaited<ReturnType<typeof requireOwner>>);
  vi.mocked(getNoteDocument).mockRejectedValue(new Error("Synthetic database offline"));
  const seed = await getNoteDocumentBootstrap("synthetic-note");
  expect(seed).toMatchObject({ ownerId: "synthetic-owner", unavailable: true });
  expect(JSON.stringify(seed)).not.toContain("database offline");
});
it("keeps authentication redirects outside the recoverable database boundary", async () => {
  const redirect = new Error("Synthetic auth redirect");
  vi.mocked(requireOwner).mockRejectedValue(redirect);
  await expect(getNoteDocumentBootstrap("synthetic-note")).rejects.toBe(redirect);
  expect(getNoteDocument).not.toHaveBeenCalled();
});
