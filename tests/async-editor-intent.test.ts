import { describe, expect, it } from "vitest";
import { shouldRestoreAsyncEditorFocus } from "@/features/notes/editor/async-editor-intent";

describe("asynchronous editor cursor ownership", () => {
  it("restores only when the same focused interaction is still current", () => {
    expect(shouldRestoreAsyncEditorFocus(true, true, 4, 4)).toBe(true);
    expect(shouldRestoreAsyncEditorFocus(true, true, 4, 5)).toBe(false);
    expect(shouldRestoreAsyncEditorFocus(true, false, 4, 4)).toBe(false);
    expect(shouldRestoreAsyncEditorFocus(false, true, 4, 4)).toBe(false);
  });
});
