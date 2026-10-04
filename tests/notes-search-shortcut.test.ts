// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { isNotesSearchShortcut } from "@/features/notes/search-shortcut";

function shortcut(target: Element = document.body, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => { document.body.replaceChildren(); });

describe("Notes slash search shortcut", () => {
  it("recognizes an unmodified slash outside an interactive control", () => {
    expect(isNotesSearchShortcut(shortcut())).toBe(true);
    expect(isNotesSearchShortcut(shortcut(document.body, { key: "k" }))).toBe(false);
  });

  it.each(["metaKey", "ctrlKey", "altKey"] as const)("leaves %s combinations native", (modifier) => {
    expect(isNotesSearchShortcut(shortcut(document.body, { [modifier]: true }))).toBe(false);
  });

  it("accepts a slash produced with Shift on international keyboard layouts", () => {
    expect(isNotesSearchShortcut(shortcut(document.body, { shiftKey: true }))).toBe(true);
  });

  it("ignores composition, repeats and events already handled elsewhere", () => {
    expect(isNotesSearchShortcut(shortcut(document.body, { isComposing: true }))).toBe(false);
    expect(isNotesSearchShortcut(shortcut(document.body, { repeat: true }))).toBe(false);
    const handled = shortcut();
    handled.preventDefault();
    expect(isNotesSearchShortcut(handled)).toBe(false);
  });

  it("ignores Safari's final composition key even after isComposing resets", () => {
    const event = shortcut(document.body, { isComposing: false, keyCode: 229 });
    expect(event.isComposing).toBe(false);
    expect(event.keyCode).toBe(229);
    expect(isNotesSearchShortcut(event)).toBe(false);
  });

  it.each([
    "input", "textarea", "select", "button", "a",
    '[contenteditable="true"]', '[contenteditable=""]', '[contenteditable="plaintext-only"]',
    '[role="textbox"]', '[role="dialog"]', '[role="menu"]',
  ])("does not steal slash from %s or its descendants", (selector) => {
    const wrapper = document.createElement(selector.startsWith("[") ? "div" : selector);
    if (selector.startsWith("[")) {
      const [, attribute, value] = /^\[([^=]+)="([^"]*)"\]$/.exec(selector)!;
      wrapper.setAttribute(attribute, value);
    }
    document.body.append(wrapper);
    expect(isNotesSearchShortcut(shortcut(wrapper))).toBe(false);
    if (!["input", "textarea", "select"].includes(selector)) {
      const child = document.createElement("span");
      wrapper.append(child);
      expect(isNotesSearchShortcut(shortcut(child))).toBe(false);
    }
  });

  it("allows search from explicitly noneditable document text", () => {
    const text = document.createElement("div");
    text.setAttribute("contenteditable", "false");
    document.body.append(text);
    expect(isNotesSearchShortcut(shortcut(text))).toBe(true);
  });
});
