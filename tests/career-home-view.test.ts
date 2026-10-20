// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CareerHomeView, type CareerHomeData } from "@/components/career/career-home-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh() {} }), unstable_rethrow() {} }));
vi.mock("@/components/career/career-nav", () => ({ CareerNav: () => null }));
vi.mock("@/components/career/career-continue", () => ({ CareerContinue: () => null }));

const base: CareerHomeData = {
  ownerId: "synthetic-owner",
  now: Date.parse("2026-10-04T00:30:00Z"),
  timezone: "America/Los_Angeles",
  profile: null,
  directions: [],
  experienceCount: 0, skillCount: 0, resumeCount: 0,
  opportunities: [], applications: [], milestones: [], pastMilestoneCount: 0, unavailable: false,
};
function render(data: CareerHomeData) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(CareerHomeView, { data, showContinue: false }));
  return host;
}

describe("Career home four-layer boundary", () => {
  it("never presents interview learning contexts as live vacancies or applications", () => {
    const host = render(base);
    expect(host.querySelector("h1")?.textContent).toBe("职业中心");
    expect([...host.querySelectorAll("h2")].slice(0, 4).map(node => node.textContent))
      .toEqual(["职业目标", "真实招聘机会", "投递记录", "面试准备情境"]);
    expect(host.textContent).toContain("历史题库");
    expect(host.textContent).toContain("保存草稿不等于已申请");
    expect(host.textContent).toContain("尚无记录的开放机会");
    expect(host.querySelector('a[href="/career/interview/targets"]')).not.toBeNull();
    expect(host.textContent).not.toContain("全部目标岗位");
  });

  it("shows actual job opportunities and submitted applications using different records", () => {
    const host = render({
      ...base,
      directions: [{ id: "d", name: "不动产金融", status: "active", current_decision: "继续主攻" }],
      opportunities: [{
        id: "o", organization: "Synthetic bank", role_title: "Credit intern", status: "watching",
        deadline_at: "2026-10-08T00:00:00Z", recruitment_cycle: "2027暑期",
        source_url: "https://example.com/official-job",
      }],
      applications: [
        { id: "draft", status: "preparing", applied_at: null, opportunity_id: "o" },
        { id: "inaccurate", status: "submitted", applied_at: null, opportunity_id: "o" },
        { id: "submitted", status: "submitted", applied_at: "2026-10-03T10:00:00Z", opportunity_id: "o" },
      ],
    });
    expect(host.textContent).toContain("继续主攻");
    expect(host.textContent).toContain("Synthetic bank");
    expect(host.textContent).toContain("2027暑期");
    expect(host.textContent).toContain("1 条尚未提交的草稿");
    expect(host.textContent).toContain("1 有投递时间的申请");
    expect(host.textContent).not.toContain("2 有投递时间的申请");
    expect(host.querySelector('a[href="/career/opportunities#opportunity-o"]')).not.toBeNull();
  });

  it("promotes real unsubmitted opportunity deadlines but never historical interview preparations", () => {
    const host = render({
      ...base,
      opportunities: [{
        id: "unsubmitted", organization: "Example Bank", role_title: "Summer internship",
        status: "watching", deadline_at: "2026-10-08T00:00:00Z", recruitment_cycle: "2027暑期",
        source_url: "https://example.com/jobs/role",
      }],
    });
    const action = [...host.querySelectorAll("a")].find(node => node.textContent?.includes("招聘投递截止"))!;
    expect(action).toBeDefined();
    expect(action.getAttribute("href")).toBe("/career/opportunities#opportunity-unsubmitted");
    const completed = render({
      ...base,
      opportunities: [{
        id: "submitted", organization: "Example Bank", role_title: "Already submitted",
        status: "watching", deadline_at: "2026-10-08T00:00:00Z", recruitment_cycle: "2027暑期",
        source_url: "https://example.com/jobs/role",
      }],
      applications: [{ id: "a", status: "submitted", applied_at: "2026-10-03T04:00:00Z", opportunity_id: "submitted" }],
    });
    expect(completed.textContent).not.toContain("招聘投递截止");
  });

  it("keeps partial-load feedback and overdue milestone review outside interview metrics", () => {
    const host = render({ ...base, unavailable: true, pastMilestoneCount: 7 });
    expect(host.textContent).toContain("部分职业数据暂时不可用");
    const management = host.querySelector("details")!;
    expect(management.open).toBe(false);
    for (const href of ["/career/experiences", "/career/resumes", "/career/skills", "/career/applications"]) {
      expect(management.querySelector(`a[href="${href}"]`)).not.toBeNull();
    }
    const review = [...host.querySelectorAll("a")].find(node => node.textContent?.includes("历史路线计划"))!;
    expect(review.textContent).toContain("7 项历史路线计划状态待确认");
    expect(review.getAttribute("href")).toBe("/career/roadmap");
  });
});
