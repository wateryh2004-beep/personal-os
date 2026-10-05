// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackResult, LeisureSource } from "@/features/leisure/types";
vi.mock("next/link", () => ({ default: (props: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props) }));
vi.mock("@/features/leisure/actions", () => ({ saveLeisureFeedback: vi.fn() }));
import { LeisureDetail } from "@/components/leisure/leisure-detail";
const experience: LeisureExperience = { id: "10000000-0000-4000-8000-000000000001", title: "Synthetic experience", kind: "film", why: "", body_markdown: "", how_to_start: null, duration_minutes: null, platform: null, location: null, starts_at: null, cost_text: null, setting: null, company: null, budget: "unknown", sources: [], ratings: [], content_revision: 1, created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", feedback: null };
let host: HTMLDivElement, root: Root;
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find((node) => node.textContent?.trim() === text)!;
const result = (input: LeisureFeedbackInput): LeisureFeedbackResult => ({ ok: true, feedback: { status: input.status, reaction: input.reaction, personal_note: input.personal_note, linked_note_id: input.linked_note_id, linked_note_title: null, linked_note_available: false, revision: input.expected_revision + 1, updated_at: experience.updated_at } });
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
async function render(item: LeisureExperience, onSave: (input: LeisureFeedbackInput) => Promise<LeisureFeedbackResult>) { await act(async () => root.render(createElement(LeisureDetail, { experience: item, now: Date.parse("2026-10-04T12:00:00Z"), onSave }))); }
async function editNote(text: string) { await act(async () => { const input = host.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
it("preserves an unsaved reflection across status save and server revision refresh", async () => {
  const save = vi.fn(async (input: LeisureFeedbackInput) => result(input));
  await render(experience, save); await editNote("Unsaved personal thought");
  expect(host.querySelector('[role="status"]')!.textContent).toBe("感想尚未保存");
  await act(async () => button("感兴趣").click());
  const saved = result(save.mock.calls[0][0]);
  if (!saved.ok) throw new Error("fixture");
  await render({ ...experience, feedback: saved.feedback }, save);
  expect(host.querySelector("textarea")!.value).toBe("Unsaved personal thought");
  expect(host.querySelector('[role="status"]')!.textContent).toBe("选择已保存，感想尚未保存");
  expect(save.mock.calls[0][0].personal_note).toBe("");
  expect(button("保存感想").disabled).toBe(false);
  await act(async () => button("保存感想").click());
  expect(save.mock.calls[1][0].expected_revision).toBe(1);
  expect(save.mock.calls[1][0].personal_note).toBe("Unsaved personal thought");
  expect(save.mock.calls[1][0].status).toBe("interested");
  expect(host.querySelector('[role="status"]')!.textContent).toBe("已保存");
  expect(button("保存感想").disabled).toBe(true);
});
it("keeps a dirty reflection warning after saving a reaction or clearing saved text", async () => {
  const original = "Previously saved thought";
  const save = vi.fn(async (input: LeisureFeedbackInput) => result(input));
  await render({ ...experience, feedback: { status: null, reaction: "none", personal_note: original, linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: experience.updated_at } }, save);
  await editNote("");
  await act(async () => button("喜欢，留着").click());
  expect(save.mock.calls[0][0].personal_note).toBe(original);
  expect(host.querySelector("textarea")!.value).toBe("");
  expect(host.querySelector('[role="status"]')!.textContent).toBe("选择已保存，感想尚未保存");
  await act(async () => button("保存感想").click());
  expect(save.mock.calls[1][0].personal_note).toBe("");
  expect(host.querySelector('[role="status"]')!.textContent).toBe("已保存");
});
it("serializes repeated clicks and leaves a failed draft intact", async () => {
  let resolve!: (value: LeisureFeedbackResult) => void;
  const save = vi.fn(() => new Promise<LeisureFeedbackResult>((done) => { resolve = done; }));
  await render(experience, save); await editNote("Keep this draft");
  await act(async () => { button("保存感想").click(); button("保存感想").click(); });
  expect(save).toHaveBeenCalledOnce();
  await act(async () => resolve({ ok: false, error: "conflict" }));
  expect(host.querySelector("textarea")!.value).toBe("Keep this draft");
  expect(host.querySelector('[role="alert"]')!.textContent).toContain("没有覆盖");
  expect(button("保存感想").disabled).toBe(true);
  expect(button("喜欢，留着").disabled).toBe(true);
});
it("keeps nullable status when liking and clears the same reaction on a second click", async () => {
  const save = vi.fn(async (input: LeisureFeedbackInput) => result(input));
  await render(experience, save);
  await act(async () => button("喜欢，留着").click());
  expect(save.mock.calls[0][0].status).toBeNull();
  expect(button("喜欢，留着").getAttribute("aria-pressed")).toBe("true");
  await act(async () => button("喜欢，留着").click());
  expect(save.mock.calls[1][0].reaction).toBe("none");
  expect(save.mock.calls[1][0].expected_revision).toBe(1);
});
it("never activates unverified manuscript links or loads remote images", async () => {
  await render({ ...experience, body_markdown: "[Unknown](https://example.com/unknown)\n\n![Tracker](https://example.com/tracker.png)" }, async (input) => result(input));
  expect(host.querySelector('a[href^="https://example.com"]')).toBeNull();
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("链接待核实");
});
it("preserves an unavailable linked note during unrelated feedback without showing a broken link", async () => {
  const linkedId = "20000000-0000-4000-8000-000000000001";
  const save = vi.fn(async (input: LeisureFeedbackInput) => result(input));
  await render({ ...experience, feedback: { status: null, reaction: "none", personal_note: "", linked_note_id: linkedId, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: experience.updated_at } }, save);
  expect(host.querySelector(`a[href="/notes/${linkedId}"]`)).toBeNull();
  expect(host.textContent).toContain("原有引用已保留");
  await act(async () => button("喜欢，留着").click());
  expect(save.mock.calls[0][0].linked_note_id).toBe(linkedId);
});
it.each([
  ["2026-01-01T00:00:00Z", "verified", "评分需重新核实"],
  ["2026-11-01T00:00:00Z", "verified", "评分待核实"],
  ["2026-10-03T00:00:00Z", "unverified", "评分待核实"],
  ["2026-10-03T00:00:00Z", "stale", "评分需重新核实"],
] as const)("labels a %s rating with a %s source beside the original score", async (checkedAt, verification, warning) => {
  const source: LeisureSource = { label: "Original source", url: "https://example.com/rating", kind: "rating", verification, checked_at: "2026-10-03T00:00:00Z" };
  await render({ ...experience, sources: [source], ratings: [{ platform: "Synthetic rating", value: "92%", scale: null, checked_at: checkedAt, source_url: source.url }] }, async (input) => result(input));
  const rating = [...host.querySelectorAll("p")].find((node) => node.textContent?.includes("Synthetic rating"))!;
  expect(rating.textContent).toContain("92%");
  expect(rating.textContent).toContain(checkedAt.slice(0, 10));
  expect(rating.textContent).toContain(warning);
});
