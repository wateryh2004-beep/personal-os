// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/features/experience-library/actions", () => ({ recordExperienceActionOutcome: state.save }));
import { ExperienceTaskOutcome } from "@/components/experience-library/experience-task-outcome";
it("records an outcome only on explicit save and shows earlier outcomes", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("crypto", { randomUUID: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  state.save.mockResolvedValue(undefined);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<ExperienceTaskOutcome entryId="entry" taskId="task" reviews={[{ taskId: "task", verdict: "partly", note: "之前有帮助", createdAt: "2026-10-28T00:00:00Z" }]} />));
  expect(state.save).not.toHaveBeenCalled();
  expect(host.textContent).toContain("之前有帮助");
  await act(async () => host.querySelector("button")!.click());
  expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ entryId: "entry", taskId: "task", requestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }));
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
