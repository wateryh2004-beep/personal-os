// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TodayShell } from "@/components/today/today-workspace-loader";

describe("Today loading presentation", () => {
  it("reserves the date-led desk while announcing loading instead of fabricated dates, records or actions", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(createElement(TodayShell));
    const loading = host.querySelector('[aria-busy="true"]')!;
    expect(loading.getAttribute("aria-label")).toBe("正在载入今天");
    expect(host.querySelector(".today-desk-container .today-desk-main .today-header .today-calendar-mark")).not.toBeNull();
    expect(host.querySelector(".today-header .today-header-copy .today-title")).not.toBeNull();
    expect(host.querySelectorAll(".today-desk-main[aria-hidden=true],.today-desk-agenda[aria-hidden=true],.today-desk-context[aria-hidden=true]")).toHaveLength(3);
    expect(loading.textContent?.trim()).toBe("");
    expect(loading.querySelector("time,h1,h2,button,a,input,select")).toBeNull();
  });
});
