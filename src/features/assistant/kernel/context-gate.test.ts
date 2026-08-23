import { describe, expect, it } from "vitest";
import { decideContextGate } from "./context-gate";

describe("decideContextGate", () => {
  it("uses the active workspace for an otherwise ambiguous mutation", () => {
    const gate = decideContextGate({
      message: "把这个改一下",
      surface: "global",
      currentPath: "/calendar",
      hasCurrentSurface: false,
    });
    expect(gate.mode).toBe("action");
    expect(gate.likelyModules).toEqual(["calendar"]);
  });

  it("does not let the active workspace override an explicit module", () => {
    const gate = decideContextGate({
      message: "帮我查一下笔记里写过什么",
      surface: "global",
      currentPath: "/calendar",
      hasCurrentSurface: false,
    });
    expect(gate.likelyModules).toContain("notes");
    expect(gate.likelyModules).not.toContain("calendar");
  });

  it("treats Notes Library organization commands as actions", () => {
    const gate = decideContextGate({
      message: "把这些散件整理归类",
      surface: "notes-library",
      currentPath: "/notes",
      hasCurrentSurface: false,
    });
    expect(gate.mode).toBe("action");
    expect(gate.likelyModules).toEqual(["notes"]);
  });
});
