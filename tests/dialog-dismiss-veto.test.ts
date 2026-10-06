// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";

it.each([true, false])("keeps a busy %s-controlled dialog over repeated mobile Back", async (controlled) => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  window.history.replaceState({ preserved: true }, "", "/tasks");
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  let busy = true;
  const onChange = vi.fn();
  function Example() {
    const [open, setOpen] = useState(true);
    return createElement(Dialog, { ...(controlled ? { open } : { defaultOpen: true }), onOpenChange(next) {
      onChange(next);
      if (busy) return false;
      setOpen(next);
    } });
  }
  const back = async () => act(async () => { history.back(); await vi.runOnlyPendingTimersAsync(); await vi.runOnlyPendingTimersAsync(); });
  try {
    await act(async () => root.render(createElement(Example)));
    const marker = history.state.__personalOsMobileLayer;
    for (let i = 0; i < 2; i++) { await back(); expect(history.state.__personalOsMobileLayer).toBe(marker); }
    expect(onChange).toHaveBeenCalledTimes(2);
    busy = false;
    await back();
    expect(history.state.__personalOsMobileLayer).toBeUndefined();
    expect(history.state.preserved).toBe(true);
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals();
  }
});
