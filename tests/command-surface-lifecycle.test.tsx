// @vitest-environment jsdom
import { act, createElement, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GlobalCommandPalette } from "@/components/search/global-command-palette";
import { useDialogReturnFocus } from "@/components/shared/use-dialog-return-focus";

const runtime = vi.hoisted(() => ({ loaded: 0 }));
vi.mock("@/components/search/global-command-palette-impl", async () => {
  runtime.loaded++;
  const { createElement } = await import("react");
  return { GlobalCommandPalette: () => createElement("input", { "aria-label": "合成搜索输入" }) };
});

function Harness() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const focus = useDialogReturnFocus();
  return <div>
    <button ref={anchor} onClick={event => { focus.rememberTrigger(event.currentTarget); setOpen(true); }}>打开搜索</button>
    <GlobalCommandPalette open={open} onOpenChange={setOpen} anchorRef={anchor} onCloseAutoFocus={focus.restoreFocus} />
  </div>;
}

it("leaves the search runtime unloaded while closed, then opens one surface and returns focus", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(Harness)));
    expect(runtime.loaded).toBe(0);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const launcher = host.querySelector("button")!;
    await act(async () => { launcher.focus(); launcher.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(runtime.loaded).toBe(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(document.querySelector('input[aria-label="合成搜索输入"]')).not.toBeNull();
    const close = document.querySelector<HTMLButtonElement>('[data-slot="dialog-close"]')!;
    await act(async () => close.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(launcher);
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
