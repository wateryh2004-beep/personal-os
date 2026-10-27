// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AssistantUIMessage } from "@/features/assistant/stream-metadata";

const engine = vi.hoisted(() => ({ loaded: vi.fn(), initialized: vi.fn(), send: vi.fn(), stop: vi.fn(), completion: Promise.resolve(), loading: Promise.resolve() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/today", useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, onNavigate: _onNavigate, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: unknown; prefetch?: boolean }) => { void _onNavigate; void _prefetch; return createElement("a", props, children); } }));
vi.mock("next/dynamic", async () => {
  const { lazy, Suspense, createElement } = await import("react");
  return { default: (load: () => Promise<ComponentType<{ open: boolean; onClose: () => void }>>) => {
    const Lazy = lazy(async () => { engine.loaded(); const pending = load(); engine.loading = pending.then(() => {}); return { default: await pending }; });
    return (props: { open: boolean; onClose: () => void }) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
  } };
});
// The SDK transport is the external boundary. Keep GlobalAgent, its scope and
// background runner, AppShell and the real panel coordinator/surface mounted.
vi.mock("@ai-sdk/react", async () => {
  const { useCallback, useEffect, useRef, useState } = await import("react");
  return { useChat: (callbacks: { onFinish?: () => void; onError?: () => void }) => {
    const currentCallbacks = useRef(callbacks); currentCallbacks.current = callbacks;
    const [messages, setMessages] = useState<AssistantUIMessage[]>([]);
    const [status, setStatus] = useState("ready");
    useEffect(() => { engine.initialized(); return () => { engine.stop(); }; }, []);
    const sendMessage = useCallback(async (input: { text: string }) => {
      engine.send(input);
      setMessages([{ id: "synthetic-question", role: "user", parts: [{ type: "text", text: input.text }] }]);
      setStatus("streaming");
      await engine.completion;
      setMessages(before => [...before, { id: "synthetic-answer", role: "assistant", parts: [{ type: "text", text: "合成请求的同一份完成结果" }] }]);
      setStatus("ready"); currentCallbacks.current.onFinish?.();
    }, []);
    return { messages, setMessages, sendMessage, status, error: undefined, stop: engine.stop, clearError: () => {} };
  } };
});
vi.mock("@/features/assistant/kernel/context-gate", () => ({ decideContextGate: () => ({ mode: "answer" }) }));
vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/workbench/workbench-provider", () => ({ WorkbenchProvider: ({ children }: { children: ReactNode }) => children, WorkbenchLayout: ({ children }: { children: ReactNode }) => children, WorkbenchToolbar: () => null }));
vi.mock("@/components/workflow-continuity/provider", () => ({ WorkflowNavigationBoundary: ({ children }: { children: ReactNode }) => children, WorkflowContinuityControls: () => null, WorkflowSourceTrail: () => null }));
vi.mock("@/components/workbench/operation-history", () => ({ OperationHistory: () => null }));
vi.mock("@/components/layout/workspace-route-surface", () => ({ WorkspaceRouteSurface: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/layout/navigation-rail", () => ({ NavigationRail: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/layout/mobile-tab-bar", () => ({ MobileTabBar: () => null }));
vi.mock("@/components/search/global-command-palette", () => ({ GlobalCommandPalette: () => null }));
vi.mock("@/components/shared/global-create-layer", () => ({ GlobalCreateLayer: () => null }));
vi.mock("@/features/tasks/workspace-resource", () => ({ tasksWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn() } }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn() } }));
vi.mock("@/features/calendar/workspace-resource", () => ({ calendarWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn() } }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn() } }));

import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getBackgroundOperations } from "@/features/workflow-continuity/background-operations";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources(); vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });

it("loads Agent on intent, continues one answer while closed and reopens its completed result without resending", async () => {
  let finish!: () => void;
  engine.completion = new Promise<void>(resolve => { finish = resolve; });
  await act(async () => root.render(createElement(TooltipProvider, null, createElement(AppShell, null, "合成首页"))));
  expect(engine.loaded).not.toHaveBeenCalled();
  expect(engine.initialized).not.toHaveBeenCalled();
  expect(document.querySelector('[aria-label="AI 助手"]')).toBeNull();
  const open = host.querySelector<HTMLButtonElement>('[aria-label="询问 Personal OS"]')!;
  await act(async () => open.click());
  await act(async () => engine.loading);
  // The actual first-open restore is timer scheduled by GlobalAgent.
  await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
  expect(engine.loaded).toHaveBeenCalledTimes(1);
  expect(engine.initialized).toHaveBeenCalled();
  const input = document.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "只发送一次的合成问题");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => input.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(engine.send).toHaveBeenCalledExactlyOnceWith({ text: "只发送一次的合成问题" });
  expect(getBackgroundOperations()[0].status).toBe("running");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭AI 助手"]')!.click());
  expect(document.querySelector('[aria-label="AI 助手"]')).toBeNull();
  expect(engine.stop).not.toHaveBeenCalled();
  expect(getBackgroundOperations()[0].status).toBe("running");
  await act(async () => finish());
  expect(getBackgroundOperations()[0].status).toBe("succeeded");
  await act(async () => open.click());
  expect(document.querySelector('[aria-label="AI 助手"]')?.textContent).toContain("合成请求的同一份完成结果");
  expect(engine.send).toHaveBeenCalledTimes(1);
  expect(engine.stop).not.toHaveBeenCalled();
});
