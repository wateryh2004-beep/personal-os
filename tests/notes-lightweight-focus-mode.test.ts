import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync(new URL("../src/components/notes/note-editor.tsx", import.meta.url), "utf8");

describe("Notes lightweight focus mode", () => {
  it("keeps one editor and the existing save/revision pipeline", () => {
    expect(source).toContain('data-focus-mode={focusMode ? "on" : "off"}');
    expect(source).toContain("const [focusMode, setFocusMode]");
    expect(source).toContain("onClick={toggleFocusMode}");
    expect(source).toContain("onChange={handleBodyChange}");
    expect(source).toContain("contentRevision={bodyRevision}");
    expect(source).toContain("const focusToolbar");
    expect(source).toContain("flushDraft(); void save()");
    expect(source).not.toContain("key={focusMode}");
  });
  it("keeps a visible exit action and Escape without changing source Markdown", () => {
    expect(source).toContain('aria-label="退出专注模式"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("requestAnimationFrame(() => fullscreenTriggerRef.current?.focus())");
    expect(source).toContain("if (reading) switchReading(false)");
    expect(source).toContain("noteAiPanel.close()");
  });
});
