// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("@/features/experience-library/actions", () => ({ saveExperiencePersonalNote: state.save }));
import { ExperiencePersonalNote } from "@/components/experience-library/experience-personal-note";
it("saves the owner's note and status separately from original content", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  state.save.mockResolvedValue(undefined);
  await act(async () => root.render(<ExperiencePersonalNote entryId="11111111-1111-4111-8111-111111111111" initialNote="" initialStatus="unmarked" />));
  const note = host.querySelector("textarea")!;
  const select = host.querySelector("select")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(note, "需要核实"); note.dispatchEvent(new Event("input", { bubbles: true })); select.value = "useful"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => host.querySelector("button")!.click());
  expect(state.save).toHaveBeenCalledWith({ entryId: "11111111-1111-4111-8111-111111111111", note: "需要核实", status: "useful" });
  expect(host.textContent).toContain("已保存");
  await act(async () => root.unmount()); host.remove();
});
