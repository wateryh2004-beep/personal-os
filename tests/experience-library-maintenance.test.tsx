// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ find: vi.fn(), merge: vi.fn(), undo: vi.fn(), mark: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/features/experience-library/actions", () => ({ findExperienceMergeCandidates: state.find, mergeExperienceEntries: state.merge, undoExperienceMerge: state.undo, markExperienceReviewed: state.mark }));
import { ExperienceMaintenance } from "@/components/experience-library/experience-maintenance";
it("shows a source preview and requires an explicit merge decision", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  state.find.mockResolvedValue([{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "候选经验", sourceUrl: null, createdAt: "2026-10-28", excerpt: "候选原文摘要" }]);
  state.merge.mockResolvedValue(undefined); vi.stubGlobal("confirm", vi.fn(() => false));
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(<ExperienceMaintenance entryId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" title="主记录" createdAt="2026-10-28" sources={[]} />));
  const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.includes(label))!;
  await act(async () => button("检查重复资料").click());
  expect(document.body.textContent).toContain("候选原文摘要");
  expect(document.querySelector('a[href="/experience-library/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]')).toBeTruthy();
  await act(async () => button("归入本篇").click()); expect(state.merge).not.toHaveBeenCalled();
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});
