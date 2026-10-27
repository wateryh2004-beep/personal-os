"use client";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";
// Server layout verifies the build/runtime/cookie gate. Transport overrides still
// reject outside an actual selected browser; no SSR exception weakens that gate.
const BrowserFixtureShell = dynamic(() => import("./continuous-fixture-shell").then(module => module.ContinuousFixtureShell), { ssr: false });
export function ContinuousFixtureClientShell({ children }: { children: ReactNode }) {
  return <BrowserFixtureShell>{children}</BrowserFixtureShell>;
}
