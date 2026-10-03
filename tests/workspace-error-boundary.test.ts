// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import WorkspaceError from "@/app/(app)/error";

it("offers recovery without disclosing a server error or private diagnostic", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const retry = vi.fn();
  try {
    await act(async () => root.render(createElement(WorkspaceError, { error: new Error("private-server-diagnostic"), retry })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("这个页面暂时无法打开");
    expect(host.textContent).not.toContain("private-server-diagnostic");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/today");
    await act(async () => host.querySelector("button")!.click());
    expect(retry).toHaveBeenCalledTimes(1);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
