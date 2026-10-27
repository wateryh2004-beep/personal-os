"use client";
import { createContext, useContext, type ReactNode } from "react";
import type { applyLifeFieldOperation, readLifeReceiptState, readLifeRequestOutcome } from "./actions";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
export type LifeVerificationTransport = { apply: typeof applyLifeFieldOperation; read: typeof readLifeReceiptState; readRequest: typeof readLifeRequestOutcome };
const LifeVerificationContext = createContext<LifeVerificationTransport | undefined>(undefined);
/** Only the gated synthetic layout supplies this boundary; controllers stay real. */
export function LifeVerificationProvider({ transport, children }: { transport: LifeVerificationTransport; children: ReactNode }) {
  assertContinuousFixtureTransport(transport);
  return <LifeVerificationContext.Provider value={transport}>{children}</LifeVerificationContext.Provider>;
}
export function useLifeVerificationTransport() { const value = useContext(LifeVerificationContext); assertContinuousFixtureTransport(value); return value; }
