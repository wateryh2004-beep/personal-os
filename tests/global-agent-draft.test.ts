// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(), setMessages: vi.fn(), stop: vi.fn(), clear: vi.fn(),
  callbacks: {} as { onError?: (error: Error) => void },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("@ai-sdk/react", () => ({ useChat: (options: { onError: (error: Error) => void }) => {
  mocks.callbacks = options;
  return { messages: [], setMessages: mocks.setMessages, sendMessage: mocks.send, status: "ready", stop: mocks.stop, clearError: mocks.clear };
} }));
vi.mock("@/features/assistant/kernel/context-gate", () => ({ decideContextGate: () => ({ mode: "answer" }) }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: ({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) => createElement("section", null, children, footer) }));
import { GlobalAgent } from "@/components/assistant/global-agent";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); window.sessionStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function mount() { await act(async () => root.render(createElement(GlobalAgent, { open: true, onClose: vi.fn() }))); await act(async () => new Promise(resolve => setTimeout(resolve, 10))); }
async function type(text: string) {
  await act(async () => { const input = host.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

it("restores a same-tab draft before persistence can overwrite it with an empty input", async () => {
  saveWorkspaceSession("agent:draft:v2", "Synthetic unfinished question");
  await mount();
  expect(host.querySelector("textarea")!.value).toBe("Synthetic unfinished question");
  expect(loadWorkspaceSession("agent:draft:v2")).toBe("Synthetic unfinished question");
});
it("restores a rejected request and keeps it recoverable without a page reload", async () => {
  mocks.send.mockRejectedValueOnce(new Error("synthetic network failure"));
  await mount(); await type("保留这段合成输入"); await submit();
  expect(host.querySelector("textarea")!.value).toBe("保留这段合成输入");
  expect(loadWorkspaceSession("agent:draft:v2")).toBe("保留这段合成输入");
});
it("preserves a newer edit when the streaming SDK reports an earlier request error", async () => {
  mocks.send.mockResolvedValueOnce(undefined);
  await mount(); await type("第一条合成问题"); await submit(); await type("新写的合成草稿");
  await act(async () => mocks.callbacks.onError?.(new Error("synthetic stream failure")));
  expect(host.querySelector("textarea")!.value).toBe("新写的合成草稿");
});

it("migrates the existing same-owner draft to bounded same-tab recovery", async () => {
  window.localStorage.setItem("personal-os:agent:draft:v1", "Legacy synthetic draft");
  await mount();
  expect(host.querySelector("textarea")!.value).toBe("Legacy synthetic draft");
  expect(window.localStorage.getItem("personal-os:agent:draft:v1")).toBeNull();
  expect(loadWorkspaceSession("agent:draft:v2")).toBe("Legacy synthetic draft");
});
