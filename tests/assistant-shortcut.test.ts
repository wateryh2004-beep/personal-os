import { describe, expect, it } from "vitest";
import { isAssistantShortcut } from "@/features/assistant/shortcuts";

describe("Global Agent shortcut", () => {
  it("opens on Command J and Control J, but not plain J", () => {
    expect(isAssistantShortcut({ key: "j", metaKey: true })).toBe(true);
    expect(isAssistantShortcut({ key: "J", ctrlKey: true })).toBe(true);
    expect(isAssistantShortcut({ key: "j" })).toBe(false);
    expect(isAssistantShortcut({ key: "k", metaKey: true })).toBe(false);
  });
});
