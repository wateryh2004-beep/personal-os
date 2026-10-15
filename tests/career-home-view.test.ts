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
  it("prioritizes target preparation over next actions and folds administrative counts", () => {
    const host = render(base);
    expect(host.querySelector("h1")?.textContent).toBe("目标岗位");
    expect([...host.querySelectorAll("h2")].slice(0, 2).map(heading => heading.textContent)).toEqual(["正在准备", "下一步"]);
    const management = host.querySelector("details")!;
    expect(management.open).toBe(false);
    expect(management.querySelector("summary")?.textContent).toContain("职业资料与管理");
    for (const href of ["/career/experiences", "/career/resumes", "/career/skills", "/career/applications"]) {
      expect(management.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    expect(host.textContent).toContain("先阅读通用面试内容");
  });

  it("retains partial-load status and direction links inside the optional management section", () => {
    const host = render({ ...base, unavailable: true, directions: [{ id: "direction", name: "Synthetic direction", status: "active" }] });
    expect(host.textContent).toContain("部分职业数据暂时不可用");
    expect(host.querySelector("details")?.textContent).toContain("Synthetic direction");
    expect(host.querySelector('details a[href="/career/directions"]')).not.toBeNull();
  });

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
