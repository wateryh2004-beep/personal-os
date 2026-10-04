import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/components/career/career-continue", () => ({ CareerContinue: () => createElement("p", null, "Stored reading position") }));
import { CareerNav, careerPrimaryNavigation, careerLegacyNavigation } from "@/components/career/career-nav";
import { CareerHomeView, type CareerHomeData } from "@/components/career/career-home-view";

const data: CareerHomeData = {
  now: Date.parse("2026-10-04T08:00:00Z"), profile: null, directions: [], experienceCount: 0, skillCount: 0, resumeCount: 0,
  applications: [], milestones: [], unavailable: false,
  interviewTargets: [{ id: "target", title: "Synthetic target", organization_snapshot: "Synthetic company", role_title_snapshot: "Synthetic role", status: "active", next_interview_at: "2026-10-05T08:00:00Z" }],
  interviewPreparations: [{ id: "prep", context_id: "target", status: "ready", next_practice_at: "2026-10-03T08:00:00Z" }],
  recentReadings: [{ id: "prep", questionId: "question", contextId: "target", title: "Synthetic learning question", summary: "Synthetic reading summary", updatedAt: "2026-10-04T08:00:00Z" }],
};

describe("Career reading-first navigation", () => {
  it("has three main reading destinations and retains every existing management route in disclosure navigation", () => {
    expect(careerPrimaryNavigation.map(([label]) => label)).toEqual(["目标岗位", "面试学习", "我的材料"]);
    const routes = [...careerPrimaryNavigation.map(([, href]) => href), ...careerLegacyNavigation.flatMap(([, links]) => links.map(([, href]) => href))];
    expect(routes).toEqual(expect.arrayContaining(["/career", "/career/interview", "/career/materials", "/career/experiences", "/career/opportunities", "/career/applications", "/career/resumes", "/career/roadmap", "/career/skills", "/career/directions", "/career/certifications", "/career/capital", "/career/profile"]));
    const html = renderToStaticMarkup(createElement(CareerNav, { current: "/career/interview/practice/p" }));
    expect(html).toContain('href="/career/interview" aria-current="page"');
    expect(html).toContain("<details");
    expect(html.indexOf('href="/career/resumes"')).toBeGreaterThan(html.indexOf("<details"));
  });
  it("shows actual target reading links, recent content and a concrete next practice instead of asset counters", () => {
    const html = renderToStaticMarkup(createElement(CareerHomeView, { data }));
    expect(html).toContain("Synthetic company");
    expect(html).toContain("Synthetic reading summary");
    expect(html).toContain('href="/career/interview?question=question&amp;context=target"');
    expect(html).toContain('href="/career/interview/practice/prep"');
    expect(html).toContain("Stored reading position");
    expect(html).not.toContain("关键资产");
    expect(html).not.toContain("已准备");
    expect(html).not.toContain("添加第一个目标岗位");
  });
  it("keeps empty/error states useful without requiring fixtures to invent content or suggesting failed data is complete", () => {
    const html = renderToStaticMarkup(createElement(CareerHomeView, { data: { ...data, interviewTargets: [], interviewPreparations: [], recentReadings: undefined, unavailable: true }, showContinue: false }));
    expect(html).toContain("可能不完整");
    expect(html).toContain("先阅读通用面试内容");
    expect(html).toContain("Codex / Claude");
    expect(html).not.toContain("Stored reading position");
    expect(html).not.toContain("Synthetic learning question");
  });
  it("does not recommend paused, future or unrelated preparations", () => {
    const html = renderToStaticMarkup(createElement(CareerHomeView, { data: { ...data, interviewPreparations: [
      { id: "paused", context_id: "target", status: "paused", next_practice_at: null },
      { id: "future", context_id: "target", status: "ready", next_practice_at: "2026-11-01T08:00:00Z" },
      { id: "unrelated", context_id: "elsewhere", status: "draft", next_practice_at: null },
    ] } }));
    for (const id of ["paused", "future", "unrelated"]) expect(html).not.toContain(`/career/interview/practice/${id}`);
    expect(html).toContain('href="/career/interview/practice?context=target"');
  });
});
