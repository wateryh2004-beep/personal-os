import { readFileSync } from "node:fs";
import postcss, { type Declaration, type Rule } from "postcss";
import { describe, expect, it } from "vitest";
import {
  noteColorClassName,
  noteColorTones,
  parseNoteColorTone,
} from "@/features/notes/editor/note-color-palette";

const css = readFileSync("src/app/notes-colors.css", "utf8");
const root = postcss.parse(css);

function variableMap(selector: (selector: string) => boolean) {
  const values = new Map<string, string>();
  root.walkRules((rule: Rule) => {
    if (!selector(rule.selector)) return;
    rule.walkDecls((declaration: Declaration) => {
      if (declaration.prop.startsWith("--")) values.set(declaration.prop, declaration.value);
    });
  });
  return values;
}

const light = variableMap((selector) => selector === ":root");
const dark = variableMap((selector) => selector.includes(":root.dark"));

function hex(variable: string, values: Map<string, string>) {
  const color = values.get(variable);
  expect(color, `missing token ${variable}`).toMatch(/^#[a-f\d]{6}$/i);
  return color!;
}

function luminance(color: string) {
  const channels = [1, 3, 5].map(start => Number.parseInt(color.slice(start, start + 2), 16) / 255);
  const linear = channels.map(channel => channel <= 0.04045
    ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const lo = Math.min(luminance(a), luminance(b));
  const hi = Math.max(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

describe("Notes 3.0 P1.1 semantic color palette", () => {
  it("exposes exactly five stable choices and rejects arbitrary or invalid styling", () => {
    const ids = noteColorTones.map(({ id }) => id);
    expect(ids).toEqual(["info", "warning", "important", "idea", "quote"]);
    expect(noteColorTones.every(({ label, usage }) => label.length > 0 && usage.length > 0)).toBe(true);
    for (const id of ids) expect(parseNoteColorTone(id)).toBe(id);
    for (const input of [
      undefined, null, "", "red", "alert", "#ff0000", "INFO",
      "info;color:red", "<img src=x onerror=alert(1)>",
    ]) expect(parseNoteColorTone(input)).toBeNull();
    expect(noteColorClassName("callout")).toBe("note-color-callout");
    expect(noteColorClassName("text")).toBe("note-color-text");
    expect(noteColorClassName("highlight")).toBe("note-color-highlight");
  });

  it.each([
    ["light", light, "#FFFEFA"],
    ["dark", dark, "#171D1A"],
  ] as const)("%s: preserves AA reading and 3:1 structural rails for every tone", (_name, palette, canvas) => {
    const markInk = hex("--note-color-highlight-ink", palette);
    for (const { id } of noteColorTones) {
      const prefix = `--note-color-${id}`;
      const surface = hex(`${prefix}-surface`, palette);
      const ink = hex(`${prefix}-ink`, palette);
      const edge = hex(`${prefix}-edge`, palette);
      const mark = hex(`${prefix}-mark`, palette);
      expect(contrast(ink, surface), `${id} text vs callout surface`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(ink, canvas), `${id} inline ink vs editor canvas`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(edge, surface), `${id} rail vs callout surface`).toBeGreaterThanOrEqual(3);
      expect(contrast(markInk, mark), `${id} highlight foreground vs mark`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("maps each semantic value to all three visual roles, without freeform style injection", () => {
    for (const { id } of noteColorTones) {
      expect(css).toContain(`[data-note-tone="${id}"]`);
      const names = ["surface", "ink", "edge", "mark"];
      for (const name of names) expect(css).toContain(`var(--note-color-${id}-${name})`);
    }
    expect(css).toContain(".note-color-callout");
    expect(css).toContain(".note-reading-prose .note-color-callout");
    expect(css).toContain(".note-color-text[data-note-tone]");
    expect(css).toContain(".note-color-highlight[data-note-tone]");
    expect(css).toContain("overflow-wrap: anywhere");
    expect(css).toContain("box-decoration-break: clone");
    expect(css).not.toContain("!important");
  });

  it("provides explicit dark-theme and OS forced-color fallback without changing ordinary Markdown", () => {
    expect(css).toContain(":root.dark");
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("CanvasText");
    expect(css).toContain("HighlightText");
    const layout = readFileSync("src/app/layout.tsx", "utf8");
    expect(layout).toContain('import "./notes-colors.css";');
    expect(layout.indexOf('import "./notes-colors.css";')).toBeGreaterThan(layout.indexOf('import "./note-editor-layout.css";'));
    const reading = readFileSync("src/components/notes/note-reading-view.tsx", "utf8");
    expect(reading).toContain("<EntityMarkdown");
    const editor = readFileSync("src/components/notes/visual-markdown-editor.tsx", "utf8");
    expect(editor).toContain("markdownEditorTheme");
  });
});
