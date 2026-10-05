// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CareerHomeView, type CareerHomeData } from "@/components/career/career-home-view";

vi.mock("@/components/career/career-nav", () => ({ CareerNav: () => null }));
vi.mock("@/components/career/career-continue", () => ({ CareerContinue: () => null }));

const base: CareerHomeData = {
  now: Date.parse("2026-10-04T00:30:00Z"), timezone: "America/Los_Angeles", profile: null,
  directions: [], experienceCount: 0, skillCount: 0, resumeCount: 0, applications: [],
  milestones: [], pastMilestoneCount: 0, interviewTargets: [], interviewPreparations: [], unavailable: false,
};
function render(data: CareerHomeData) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(CareerHomeView, { data, showContinue: false }));
  return host;
}

describe("career home workbench", () => {
  it("renders history as a separate review link without turning it into the primary next action", () => {
    const host = render({ ...base, pastMilestoneCount: 7 });
    expect(host.textContent).toContain("目前没有待推进的职业事项。");
    const review = [...host.querySelectorAll("a")].find((item) => item.textContent?.includes("历史路线计划"))!;
    expect(review.textContent).toContain("7 项历史路线计划状态待确认");
    expect(review.getAttribute("href")).toBe("/career/roadmap");
  });

  it("keeps undated preparation neutral and formats interview dates in the profile timezone", () => {
    const host = render({
      ...base,
      interviewTargets: [{ id: "target", title: "Fixture", organization_snapshot: "Example", role_title_snapshot: "Analyst", status: "active", next_interview_at: "2026-10-04T01:00:00Z" }],
      interviewPreparations: [{ id: "prep", context_id: "target", status: "developing", next_practice_at: null }],
    });
    expect(host.textContent).toContain("1 待安排练习");
    expect(host.textContent).not.toContain("到期练习");
    expect(host.textContent).toContain(new Date("2026-10-04T01:00:00Z").toLocaleString("zh-CN", { timeZone: base.timezone, dateStyle: "medium", timeStyle: "short" }));
    expect([...host.querySelectorAll("a")].filter((item) => item.getAttribute("href") === "/career/interview?context=target")).toHaveLength(2);
  });
});
