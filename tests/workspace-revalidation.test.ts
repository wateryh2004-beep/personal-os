import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
const mocks = vi.hoisted(() => ({ revalidate: vi.fn(), set: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/headers", () => ({ cookies: async () => ({ set: mocks.set }) }));
import { revalidatePath, workspaceRevisionCookie } from "@/lib/workspace-revalidation";

beforeEach(() => vi.clearAllMocks());
describe("server mutations invalidate tab resources", () => {
  it.each(["/today", "/tasks", "/calendar", "/notes", "/notes/abc"])("bridges %s with an opaque private cache revision", async (path) => {
    await revalidatePath(path);
    expect(mocks.revalidate).toHaveBeenCalledWith(path, undefined);
    expect(mocks.set).toHaveBeenCalledWith(workspaceRevisionCookie, expect.stringMatching(/^[0-9a-f-]{36}$/), expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }));
  });
  it("keeps unrelated invalidation unchanged", async () => {
    await revalidatePath("/projects");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledWith("/projects", undefined);
  });
  it("uses awaited revision invalidation for every existing primary-workspace writer", () => {
    for (const path of ["projects/actions", "tasks/microsoft-todo", "inbox/actions", "calendar/actions", "briefing/actions", "notes/actions", "today/focus-actions", "assistant/actions"]) {
      const source = readFileSync(`src/features/${path}.ts`, "utf8");
      expect(source).toContain('from "@/lib/workspace-revalidation"');
      expect(source).not.toMatch(/(?<!await )revalidatePath\(/);
    }
  });
});
