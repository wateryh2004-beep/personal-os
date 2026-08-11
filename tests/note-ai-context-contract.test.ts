import { describe, expect, it } from "vitest";
import { decideContextGate } from "@/features/assistant/kernel/context-gate";

describe("Note AI current surface contract", () => {
  it("keeps current surface mandatory when personal context is enabled", () => {
    expect(decideContextGate({ message: "润色全文", surface: "notes", hasCurrentSurface: true, requiresCurrentSurface: true, usePersonalContext: true })).toMatchObject({ needsCurrentSurface: true, needsPersonalData: true, needsTools: true });
  });

  it("keeps current surface mandatory when personal context is disabled", () => {
    expect(decideContextGate({ message: "润色全文", surface: "notes", hasCurrentSurface: true, requiresCurrentSurface: true, usePersonalContext: false })).toMatchObject({ needsCurrentSurface: true, needsPersonalData: false, needsTools: false });
  });
});
