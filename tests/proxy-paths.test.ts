import { describe, expect, it } from "vitest";
import { isProtectedApplicationPath } from "@/lib/supabase/proxy";

describe("application proxy paths", () => {
  it("protects private pages, including the application home", () => {
    expect(isProtectedApplicationPath("/")).toBe(true);
    expect(isProtectedApplicationPath("/notes")).toBe(true);
    expect(isProtectedApplicationPath("/career/skills")).toBe(true);
  });

  it("leaves login and route handlers to their own authentication flows", () => {
    expect(isProtectedApplicationPath("/login")).toBe(false);
    expect(isProtectedApplicationPath("/api/exports/notes/note-id")).toBe(false);
  });
});
