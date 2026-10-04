"use client";

import { AppShell } from "@/components/layout/app-shell";
import { CodexAuthorizationsView, CodexConsentView } from "@/components/settings/codex-authorization-view";
import type { GatewayGrant } from "@/features/content-gateway/contracts";

export type CodexFixtureScene = "codex-consent" | "codex-grants" | "codex-expired" | "codex-unavailable";
const scopes = ["notes:read", "notes:write", "interview:read", "interview:append"] as const;
const resource = "https://synthetic-personalos.example.test/api/mcp";
const baseGrant: GatewayGrant = { id: "10000000-0000-4000-8000-000000000001", clientName: "PersonalOS Codex", scope: [...scopes], resource, createdAt: "2026-10-04T18:30:00Z", expiresAt: "2026-10-04T19:30:00Z", revokedAt: null };

/** Synthetic-only UI; this is never an authenticated connection. Capture-phase
 * submission blocking keeps browser QA away from the real OAuth endpoints. */
export function CodexAuthorizationFixture({ scene }: { scene: CodexFixtureScene }) {
  return <div data-testid="codex-authorization-fixture" onSubmitCapture={(event) => event.preventDefault()}>
    <AppShell presentationPathname="/settings/connections/codex">
      <p className="mb-4 text-base text-[var(--text-secondary)]">Synthetic fixture · 仅用于授权界面验证</p>
      {scene === "codex-grants" ? <CodexAuthorizationsView grants={[
        baseGrant,
        { ...baseGrant, id: "10000000-0000-4000-8000-000000000002", createdAt: "2026-10-04T17:00:00Z", expiresAt: "2026-10-04T18:00:00Z" },
        { ...baseGrant, id: "10000000-0000-4000-8000-000000000003", revokedAt: "2026-10-04T18:45:00Z" },
      ]} available configured now={Date.parse("2026-10-04T19:00:00Z")} revokeAction={async () => {}} /> : <CodexConsentView state={scene === "codex-consent" ? {
        status: "ready", requestId: "20000000-0000-4000-8000-000000000001", clientName: "PersonalOS Codex", scopes: [...scopes], resource, expiresAt: "2026-10-04T19:05:00Z",
      } : { status: scene === "codex-expired" ? "expired" : "unavailable" }} />}
    </AppShell>
  </div>;
}
