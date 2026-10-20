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
  it("exposes four disjoint career layers while keeping other resources reachable", () => {
    const host = render("/career");
    expect([...host.querySelectorAll("nav > a")].map(link => link.textContent)).toEqual(["职业目标", "招聘机会", "投递记录", "面试准备"]);
    expect(host.querySelector("details")?.open).toBe(false);
    expect([...host.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual([
      "/career", "/career/opportunities", "/career/applications", "/career/interview", "/career/experiences",
      "/career/roadmap", "/career/skills", "/career/directions", "/career/certifications", "/career/capital", "/career/profile", "/career/materials",
    ]);
  });

  it.each([
    ["/career/interview/questions/example", "/career/interview", null],
    ["/career/interview/targets/example", "/career/interview", null],
    ["/career/experiences/example", "/career/experiences", null],
    ["/career/applications", "/career/applications", null],
    ["/career/resumes", "/career/resumes", null],
    ["/career/materials", "/career/materials", "证明材料"],
  ])("retains the active route and management label on %s", (current, href, label) => {
    const host = render(current);
    const active = host.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("href")).toBe(href);
    expect(host.querySelector("summary")?.textContent).toContain(label ?? "更多");
  });
});
