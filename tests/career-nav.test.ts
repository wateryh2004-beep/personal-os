// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CareerNav } from "@/components/career/career-nav";

function render(current: string) {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(CareerNav, { current }));
  return host;
}

describe("Career reading navigation", () => {
  it("exposes three everyday entries while keeping every existing workspace reachable", () => {
    const host = render("/career");
    expect([...host.querySelectorAll("nav > a")].map(link => link.textContent)).toEqual(["目标岗位", "面试学习", "简历与经历"]);
    expect(host.querySelector("details")?.open).toBe(false);
    expect([...host.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual([
      "/career", "/career/interview", "/career/experiences", "/career/resumes", "/career/opportunities",
      "/career/roadmap", "/career/skills", "/career/directions", "/career/certifications", "/career/capital", "/career/profile", "/career/materials",
    ]);
  });

  it.each([
    ["/career/interview/questions/example", "/career/interview", null],
    ["/career/experiences/example", "/career/experiences", null],
    ["/career/applications", "/career/opportunities", "机会与申请"],
    ["/career/resumes", "/career/resumes", "简历版本"],
    ["/career/materials", "/career/materials", "证明材料"],
  ])("retains the active route and management label on %s", (current, href, label) => {
    const host = render(current);
    const active = host.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("href")).toBe(href);
    expect(host.querySelector("summary")?.textContent).toContain(label ?? "更多");
  });
});
