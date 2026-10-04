import { describe, expect, it } from "vitest";
import { isAuthCallbackPath, isIndependentGatewayPath, isPrivateAppPath, isPublicPath, safeRedirectPath } from "@/lib/supabase/proxy";

describe("application proxy paths", () => {
  it("classifies every app route as private except explicit recovery/public routes", () => {
    expect(isPrivateAppPath("/")).toBe(true);
    expect(isPrivateAppPath("/today")).toBe(true);
    expect(isPrivateAppPath("/notes/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPrivateAppPath("/career/experiences/00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPrivateAppPath("/calendar")).toBe(true);
    expect(isPrivateAppPath("/update-password")).toBe(true);
    expect(isPrivateAppPath("/login")).toBe(false);
    expect(isPrivateAppPath("/forgot-password")).toBe(false);
  });

  it("keeps only intended protocol paths public and leaves APIs to handler authentication", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/manifest.webmanifest")).toBe(true);
    expect(isPublicPath("/update-password")).toBe(false);
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
    expect(safeRedirectPath("/\\evil.example")).toBe("/today");
    expect(safeRedirectPath("/path\\next")).toBe("/today");
    expect(safeRedirectPath("/%5cevil.example")).toBe("/today");
    expect(safeRedirectPath("/notes?query=private#revision")).toBe("/notes?query=private#revision");
    expect(safeRedirectPath("/\n/evil.example")).toBe("/today");
  });

  it("makes only the registered discovery routes public", () => {
    for (const path of ["/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-authorization-server"]) {
      expect(isPublicPath(path)).toBe(true);
      expect(isPrivateAppPath(path)).toBe(false);
      expect(isIndependentGatewayPath(path)).toBe(true);
      expect(isPublicPath(`${path}/other`)).toBe(false);
    }
    for (const path of ["/.well-known/other", "/api/oauth/decision", "/api/oauth/authorize/other", "/api/mcp/other", "/settings/connections/codex/authorize"]) expect(isIndependentGatewayPath(path)).toBe(false);
  });

  it.each(["/login", "/login?next=/login", "/login/", "/login#form", "/notes/../login", "/%6cogin"])("prevents %s from becoming a login redirect loop", (next) => {
    expect(safeRedirectPath(next)).toBe("/today");
  });
});
