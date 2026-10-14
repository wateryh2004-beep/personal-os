// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PwaLifecycle } from "@/components/pwa/pwa-lifecycle";

let host: HTMLDivElement, root: Root;
const originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubEnv("NODE_ENV", "development");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers();
  if (originalWorker) Object.defineProperty(navigator, "serviceWorker", originalWorker);
  else Reflect.deleteProperty(navigator, "serviceWorker");
});
const render = () => act(async () => root.render(createElement(PwaLifecycle, { currentVersion: "local" })));

it("reflects offline and online events without losing its subscription on reconnect", async () => {
  let online = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  await render(); expect(host.textContent).toContain("当前离线");
  await act(async () => { online = true; window.dispatchEvent(new Event("online")); });
  expect(host.textContent).toBe("");
  await act(async () => { online = false; window.dispatchEvent(new Event("offline")); });
  expect(host.textContent).toContain("当前离线");
});

it("removes service-worker listeners and pending update timers on unmount", async () => {
  vi.stubEnv("NODE_ENV", "production"); vi.useFakeTimers();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const worker = Object.assign(new EventTarget(), { state: "installing" });
  const postMessage = vi.fn();
  const registration = Object.assign(new EventTarget(), { installing: worker, waiting: { postMessage } });
  const service = Object.assign(new EventTarget(), { controller: {}, register: vi.fn(async () => registration) });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: service });
  const stopWorker = vi.spyOn(worker, "removeEventListener");
  const stopRegistration = vi.spyOn(registration, "removeEventListener");
  const stopController = vi.spyOn(service, "removeEventListener");
  await render();
  await act(async () => host.querySelector("button")!.click());
  expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  expect(vi.getTimerCount()).toBeGreaterThan(0);
  await act(async () => root.unmount());
  expect(stopWorker).toHaveBeenCalledWith("statechange", expect.any(Function));
  expect(stopRegistration).toHaveBeenCalledWith("updatefound", expect.any(Function));
  expect(stopController).toHaveBeenCalledWith("controllerchange", expect.any(Function));
  expect(vi.getTimerCount()).toBe(0);
});
