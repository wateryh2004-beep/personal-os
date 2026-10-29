import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => createElement("a", { href, ...rest }, children) }));
vi.mock("@/features/experience-library/queries", () => ({ getExperienceEntry: async (id: string) => ({
  entry: { id, title: id.startsWith("a") ? "合成面试 A" : "合成面试 B", sourceUrl: null, tags: ["面试"], createdAt: "2026-10-28T00:00:00Z", captureCount: 1, mediaCount: 0, personalNote: "我的判断" },
  captures: [{ id: `${id}-capture`, rawContent: "不同来源的原始记录" }], media: [],
}) }));
import ComparePage from "@/app/(app)/experience-library/compare/page";
it("shows two owner-scoped originals side by side with source links and no invented agreement", async () => {
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const html = renderToStaticMarkup(await ComparePage({ searchParams: Promise.resolve({ ids: `${a},${b}` }) }));
  expect(html).toContain("合成面试 A"); expect(html).toContain("合成面试 B");
  expect((html.match(/不同来源的原始记录/g) ?? [])).toHaveLength(2);
  expect(html).toContain("共同标签");
  expect(html).toContain(`/experience-library/${a}`);
});
