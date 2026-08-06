import { describe, expect, it } from "vitest";
import { isAuthCallbackPath, isPrivateAppPath, isPublicPath, safeRedirectPath } from "@/lib/supabase/proxy";

describe("application proxy paths", () => {
  it("classifies every app route as private except the explicit login route", () => {
    expect(isPrivateAppPath("/")).toBe(true);
    expect(isPrivateAppPath("/today")).toBe(true);
    expect(isPrivateAppPath("/notes/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPrivateAppPath("/career/experiences/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPrivateAppPath("/calendar")).toBe(true);
    expect(isPrivateAppPath("/login")).toBe(false);
  });

  it("keeps only intended protocol paths public and leaves APIs to handler authentication", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/today")).toBe(false);
    expect(isPrivateAppPath("/api/exports/notes/note-id")).toBe(false);
    expect(isAuthCallbackPath("/api/auth/callback")).toBe(true);
    expect(isAuthCallbackPath("/api/integrations/microsoft/callback")).toBe(true);
    expect(isAuthCallbackPath("/api/calendar/assistant")).toBe(false);
  });

  it("never accepts an external or protocol-relative return URL", () => {
    expect(safeRedirectPath("/notes?query=private")).toBe("/notes?query=private");
    expect(safeRedirectPath("https://evil.example")).toBe("/today");
    expect(safeRedirectPath("//evil.example")).toBe("/today");
    expect(safeRedirectPath("\\\\evil.example")).toBe("/today");
  });
});
