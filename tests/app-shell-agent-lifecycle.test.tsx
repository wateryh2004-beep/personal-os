// @vitest-environment jsdom
import { act, createElement, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ChatInit } from "ai";
import type { AssistantUIMessage } from "@/features/assistant/stream-metadata";

const engine = vi.hoisted(() => ({ loaded: vi.fn(), initialized: vi.fn(), send: vi.fn(), stop: vi.fn(), completion: Promise.resolve(), loading: Promise.resolve(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/today", useRouter: () => ({ push: engine.push, prefetch: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, onNavigate: _onNavigate, prefetch: _prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: unknown; prefetch?: boolean }) => { void _onNavigate; void _prefetch; return createElement("a", props, children); } }));
vi.mock("next/dynamic", async () => {
  const { lazy, Suspense, createElement } = await import("react");
  return { default: (load: () => Promise<ComponentType<{ open: boolean; onClose: () => void }>>) => {
    const Lazy = lazy(async () => { engine.loaded(); const pending = load(); engine.loading = pending.then(() => {}); return { default: await pending }; });
    return (props: { open: boolean; onClose: () => void }) => createElement(Suspense, { fallback: null }, createElement(Lazy, props));
  } };
});
// Keep the installed SDK and real external engine; only count construction and
// control HTTP/SSE at the transport boundary. No UI/controller lifecycle mock.
vi.mock("@ai-sdk/react", async importOriginal => {
  const actual = await importOriginal<typeof import("@ai-sdk/react")>();
  class ObservedChat extends actual.Chat<AssistantUIMessage> {
    constructor(init: ChatInit<AssistantUIMessage>) { super(init); engine.initialized(); }
  }
  return { ...actual, Chat: ObservedChat };
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
vi.mock("@/features/tasks/workspace-resource", () => ({ tasksWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn(async () => {}) } }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn(async () => {}) } }));
vi.mock("@/features/calendar/workspace-resource", () => ({ calendarWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn(async () => {}) } }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { get: () => ({}), subscribe: () => () => {}, prefetch: vi.fn(async () => {}) } }));

import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getBackgroundOperations } from "@/features/workflow-continuity/background-operations";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources(); vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)) as { messages: AssistantUIMessage[] };
    const question = body.messages.findLast(message => message.role === "user")?.parts.filter(part => part.type === "text").map(part => part.text).join("");
    engine.send({ text: question });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      const write = (value: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
      write({ type: "start", messageId: "synthetic-answer" }); write({ type: "text-start", id: "answer" });
      options?.signal?.addEventListener("abort", () => { engine.stop(); controller.error(new DOMException("Aborted", "AbortError")); }, { once: true });
      void engine.completion.then(() => { write({ type: "text-delta", id: "answer", delta: "合成请求的同一份完成结果" }); write({ type: "text-end", id: "answer" }); write({ type: "finish", finishReason: "stop" }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close(); });
    } });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  }));
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
  await act(async () => { finish(); await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(getBackgroundOperations()[0].status).toBe("succeeded");
  await act(async () => open.click());
  expect(document.querySelector('[aria-label="AI 助手"]')?.textContent).toContain("合成请求的同一份完成结果");
  expect(engine.send).toHaveBeenCalledTimes(1);
  expect(engine.stop).not.toHaveBeenCalled();
});


it("the real shell leaves source navigation preflight to its caller, preserving save refusal and the source trail", async () => {
  const { registerWorkflowNavigationProtection, commitPreparedWorkflowNavigation } = await import("@/features/workflow-continuity/navigation-protection");
  const { beginSourceNavigation, captureSourceNavigation, getSourceTrail } = await import("@/features/workflow-continuity/source-trail");
  window.history.replaceState({}, "", "/today");
  await act(async () => root.render(createElement(TooltipProvider, null, createElement(AppShell, null, "合成首页"))));
  const scene = { version: 1 as const, main: { href: "/today", position: { scrollTop: 42 } }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" as const } };
  let release!: (accepted: boolean) => void;
  const guard = vi.fn(() => new Promise<boolean>(resolve => { release = resolve; }));
  const stop = registerWorkflowNavigationProtection(guard);
  const fallback = vi.fn();
  const navigate = vi.fn((href: string) => commitPreparedWorkflowNavigation(href, fallback));
  try {
    let pending!: Promise<void>;
    await act(async () => { pending = captureSourceNavigation({ capture: async () => scene, destination: "/notes", label: "今日", current: beginSourceNavigation(), navigate }); await Promise.resolve(); });
    expect(guard).toHaveBeenCalledTimes(1); expect(engine.push).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(getSourceTrail()).toHaveLength(0);
    await act(async () => { release(false); await pending; });
    expect(engine.push).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(getSourceTrail()).toHaveLength(0);
    await act(async () => { pending = captureSourceNavigation({ capture: async () => scene, destination: "/notes", label: "今日", current: beginSourceNavigation(), navigate }); await Promise.resolve(); });
    await act(async () => { release(true); await pending; });
    expect(engine.push).toHaveBeenCalledExactlyOnceWith("/notes", { transitionTypes: ["navigation-forward"] }); expect(fallback).not.toHaveBeenCalled(); expect(guard).toHaveBeenCalledTimes(2); expect(navigate).toHaveBeenCalledExactlyOnceWith("/notes"); expect(getSourceTrail()).toHaveLength(1); expect(getSourceTrail()[0].scene.main.position?.scrollTop).toBe(42);
    await act(async () => window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { cancelable: true, detail: { href: "/projects" } })));
    expect(engine.push).toHaveBeenCalledWith("/projects", { transitionTypes: ["navigation-forward"] });
  } finally { stop(); }
});

it("settles responsive sidebar dimensions without cancelling a deliberate collapse or paint animation", async () => {
  await act(async () => root.render(createElement(TooltipProvider, null, createElement(AppShell, null, "合成首页"))));
  const width = { transitionProperty: "width", cancel: vi.fn() }, margin = { transitionProperty: "margin-left", cancel: vi.fn() }, paint = { transitionProperty: "opacity", cancel: vi.fn() };
  const sidebar = host.querySelector<HTMLElement>(".app-sidebar")!, frame = host.querySelector<HTMLElement>(".app-workspace-frame")!;
  sidebar.getAnimations = vi.fn(() => [width, paint] as unknown as Animation[]); frame.getAnimations = vi.fn(() => [margin] as unknown as Animation[]);
  expect(width.cancel).not.toHaveBeenCalled(); expect(margin.cancel).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(width.cancel).toHaveBeenCalledTimes(1); expect(margin.cancel).toHaveBeenCalledTimes(1); expect(paint.cancel).not.toHaveBeenCalled();
});

it("does not push twice when another committed command handler already owns the navigation", async () => {
  const mapped = vi.fn();
  const mapper = (event: Event) => { const detail = (event as CustomEvent).detail; if (detail.phase === "commit") { event.preventDefault(); mapped(detail.href); } };
  window.addEventListener("personal-os:navigation-start", mapper);
  try {
    await act(async () => root.render(createElement(TooltipProvider, null, createElement(AppShell, null, "合成首页"))));
    const { commitPreparedWorkflowNavigation } = await import("@/features/workflow-continuity/navigation-protection");
    const fallback = vi.fn(); await act(async () => commitPreparedWorkflowNavigation("/notes", fallback));
    expect(mapped).toHaveBeenCalledExactlyOnceWith("/notes"); expect(engine.push).not.toHaveBeenCalled(); expect(fallback).not.toHaveBeenCalled();
  } finally { window.removeEventListener("personal-os:navigation-start", mapper); }
});
