// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { PanelPresence } from "@/components/shared/panel-presence";

it("never initializes a closed heavy panel and releases it after a motion-free close", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const mount = vi.fn(), cleanup = vi.fn();
  function Heavy() { useEffect(() => { mount(); return cleanup; }, []); return createElement("p", null, "Synthetic panel"); }
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  // Required children keeps the production signature intact in this non-JSX test.
  // eslint-disable-next-line react/no-children-prop
  const render = (open: boolean) => act(async () => root.render(createElement(PanelPresence, { open, children: createElement(Heavy) })));
  try {
    await render(false); expect(mount).not.toHaveBeenCalled();
    await render(true); expect(mount).toHaveBeenCalledOnce();
    await render(false); expect(cleanup).toHaveBeenCalledOnce(); expect(host.textContent).toBe("");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
