import { describe, expect, it } from "vitest";
import {
  initialWorkspacePanelState,
  workspacePanelReducer,
} from "@/components/layout/workspace-panel-state";

describe("workspace panel state", () => {
  it("starts with no active panel", () => {
    expect(initialWorkspacePanelState).toBeNull();
  });

  it("opens the global agent", () => {
    expect(workspacePanelReducer(null, { type: "open", id: "global-agent" })).toBe("global-agent");
  });

  it("replaces the current panel when another panel opens", () => {
    const global = workspacePanelReducer(null, { type: "open", id: "global-agent" });
    expect(workspacePanelReducer(global, { type: "open", id: "note-ai:note-1" })).toBe("note-ai:note-1");
  });

  it("toggles the active panel closed", () => {
    expect(workspacePanelReducer("note-ai:note-1", { type: "toggle", id: "note-ai:note-1" })).toBeNull();
  });

  it("closes on Escape", () => {
    expect(workspacePanelReducer("global-agent", { type: "escape" })).toBeNull();
  });

  it("closes on route change", () => {
    expect(workspacePanelReducer("note-inspector:note-1", { type: "route-change" })).toBeNull();
  });

  it("does not let a stale panel close a newer active panel", () => {
    expect(workspacePanelReducer("global-agent", { type: "close", id: "note-ai:note-1" })).toBe("global-agent");
  });
});
