// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("@/components/shared/motion-boundary", () => ({ MotionBoundary: ({ children }: { children: ReactNode }) => <div data-native-participant>{children}</div> }));
import { WorkspaceRouteSurface } from "@/components/layout/workspace-route-surface";
function InteractiveBody() { const [count, setCount] = useState(0); return <><input defaultValue="draft"/><button onClick={() => setCount(value => value + 1)}>{count}</button></>; }
it("keeps controls out of native participants and preserves the Notes subtree across details", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const consoleError = vi.spyOn(console, "error");
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const render = (pathname: string) => root.render(<WorkspaceRouteSurface pathname={pathname}><main><InteractiveBody/></main></WorkspaceRouteSurface>);
  try {
    await act(async () => render("/notes"));
    const input = host.querySelector("input")!; input.value = "unsaved";
    expect(host.querySelector('[data-native-participant]')?.querySelector('main,input,button')).toBeNull();
    await act(async () => render("/notes/10000000-0000-4000-8000-000000000001"));
    expect(host.querySelector('input')).toBe(input); expect(input.value).toBe("unsaved");
    await act(async () => render("/career"));
    expect(host.querySelector('.workspace-live-surface')?.getAttribute('data-navigation-motion')).toBe('navigation-forward');
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')?.textContent).toBe('1');
    await act(async () => render("/today"));
    expect(host.querySelector('.workspace-live-surface')?.getAttribute('data-navigation-motion')).toBe('navigation-backward');
    expect(host.querySelector('[data-native-participant]')?.textContent).toBe('');
    expect(consoleError).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); consoleError.mockRestore(); vi.unstubAllGlobals(); }
});
