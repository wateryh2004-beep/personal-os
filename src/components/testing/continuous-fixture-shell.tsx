"use client";
import { useState } from "react";
import { ReadingVerificationProvider } from "@/features/files/reading-verification-context";
import { LifeVerificationProvider } from "@/features/life/verification-context";
import { fixtureCalendarCreate, fixtureGlobalCreate } from "@/features/testing/continuous-domain-transports";
import { fixtureShell, fixtureLife, fixtureReading } from "@/features/testing/continuous-fixture-transports";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
const shellTransport={...fixtureShell,calendarCreate:fixtureCalendarCreate,globalCreate:fixtureGlobalCreate};
/** One real persistent layout, canonical Next navigation and a synthetic owner. */
export function ContinuousFixtureShell({ children }: { children: React.ReactNode }) {
  const [instance] = useState(() => crypto.randomUUID());
  return <WorkspaceIdentityBoundary ownerId="e1000000-0000-4000-8000-000000000001" revision="continuous-fixture-v3"><ReadingVerificationProvider transport={fixtureReading}><LifeVerificationProvider transport={fixtureLife}><AppShell verificationTransport={shellTransport}><div data-continuous-fixture-layout={instance} className="contents">{children}</div></AppShell></LifeVerificationProvider></ReadingVerificationProvider></WorkspaceIdentityBoundary>;
}
