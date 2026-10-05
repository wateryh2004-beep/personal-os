// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { readFileSync } from "node:fs";
import { DisclosureSummary } from "@/components/ui/disclosure";
import { TodayDisclosure } from "@/components/today/today-motion";
import { InterviewNav } from "@/components/career/interview/interview-nav";
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });
const source = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

it("keeps disclosure state, names and controlled panel in sync on repeated toggles", async () => {
  // Required children prop preserves the production component signature in this non-JSX test.
  // eslint-disable-next-line react/no-children-prop
  await act(async () => root.render(createElement(TodayDisclosure, { label: "其余 4 项", children: createElement("a", { href: "/calendar" }, "一个很长的日程标题".repeat(12)) })));
  const trigger = host.querySelector("button")!;
  const panel = document.getElementById(trigger.getAttribute("aria-controls")!)!;
  expect(trigger.type).toBe("button");
  expect(trigger.textContent).not.toContain("+");
  expect(trigger.querySelector(".ui-disclosure-label")!.textContent).toBe("其余 4 项");
  expect(trigger.querySelector(".ui-disclosure-indicator")!.getAttribute("aria-hidden")).toBe("true");
  trigger.focus();
  for (const expanded of [true, false, true, false]) {
    await act(async () => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe(String(expanded));
    expect(panel.getAttribute("aria-hidden")).toBe(String(!expanded));
    expect(panel.hasAttribute("inert")).toBe(!expanded);
    expect(document.activeElement).toBe(trigger);
    expect(host.querySelector("a")!.textContent).toBe("一个很长的日程标题".repeat(12));
  }
});

it("uses a native summary and preserves independent nested disclosure state", async () => {
  await act(async () => root.render(createElement("details", { "data-testid": "outer" },
    createElement(DisclosureSummary, null, "补充说明"),
    createElement("details", { "data-testid": "inner" }, createElement(DisclosureSummary, null, "原始题干"), "Exact source"))));
  const outer = host.querySelector<HTMLDetailsElement>('[data-testid="outer"]')!;
  const inner = host.querySelector<HTMLDetailsElement>('[data-testid="inner"]')!;
  expect(outer.firstElementChild!.tagName).toBe("SUMMARY");
  expect(outer.firstElementChild!.querySelector("button")).toBeNull();
  expect(outer.open).toBe(false); expect(inner.open).toBe(false);
  outer.open = true;
  expect(inner.open).toBe(false);
  const css = source("src/app/globals.css");
  expect(css).toContain("details[open] > .ui-disclosure-trigger");
  expect(css).toContain(".ui-disclosure-label { min-width:0; overflow-wrap:anywhere;");
});

it("shows one current interview destination, including session routes", async () => {
  for (const [current, label] of [["/career/interview/sessions/example", "练习"], ["/career/interview/insights", "复盘"], ["/career/interview", "学习库"]]) {
    await act(async () => root.render(createElement(InterviewNav, { current })));
    const active = host.querySelectorAll('[aria-current="page"]');
    expect(active).toHaveLength(1); expect(active[0].textContent).toBe(label);
    expect(active[0].classList.contains("ui-navigation-item")).toBe(true);
  }
});

it("keeps row menus discoverable without hover in tasks and notes", () => {
  for (const path of ["src/components/tasks/task-workspace.tsx", "src/components/notes/notes-workspace.tsx"]) {
    const code = source(path);
    expect(code).toContain("ui-more-action");
    expect(code).not.toContain("md:opacity-0");
  }
  expect(source("src/app/globals.css")).toContain(".ui-more-action { opacity:1;");
});

it("keeps shared control boundaries, touch targets and link identity at rest", () => {
  for (const file of ["input", "textarea", "select", "button"]) expect(source(`src/components/ui/${file}.tsx`)).toContain("var(--control-border)");
  const css = source("src/app/globals.css");
  expect(css).toContain("(pointer:coarse)");
  expect(css).toContain("[data-ui-button][data-size^=icon] { min-width:44px; }");
  expect(css).toContain(".ui-link { color:var(--accent); text-decoration-line:underline;");
  expect(css).toContain(".ui-navigation-item[aria-current=page]::after");
  expect(css).toContain("@media (forced-colors:active)");
});

it("gives control borders at least 3:1 against their intended light surfaces", () => {
  const luminance = (hex: string) => {
    const rgb = hex.match(/\w\w/g)!.map((v) => parseInt(v, 16) / 255).map((c) => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  for (const [border, surface] of [["818b85", "f3f4f3"], ["818b85", "ffffff"], ["788575", "eeeee7"], ["879787", "29322c"]]) {
    const [a, b] = [luminance(border), luminance(surface)].sort((x, y) => y - x);
    expect((a + .05) / (b + .05)).toBeGreaterThanOrEqual(3);
  }
});


it("retains a stable primitive marker when Radix asChild replaces data-slot", () => {
  const control = () => createElement(Button, { variant: "outline", size: "icon-sm", "aria-label": "测试动作" }, "⋯");
  const wrappers = [
    createElement(Dialog, null, createElement(DialogTrigger, { asChild: true }, control())),
    createElement(DropdownMenu, null, createElement(DropdownMenuTrigger, { asChild: true }, control())),
    createElement(TooltipProvider, null, createElement(Tooltip, null, createElement(TooltipTrigger, { asChild: true }, control()))),
  ];
  for (const wrapped of wrappers) {
    const target = document.createElement("div"); target.innerHTML = renderToStaticMarkup(wrapped);
    const button = target.querySelector("button")!;
    expect(button.hasAttribute("data-ui-button")).toBe(true);
    expect(button.getAttribute("data-variant")).toBe("outline");
    expect(button.getAttribute("data-size")).toBe("icon-sm");
    expect(button.getAttribute("data-slot")).not.toBe("button");
  }
});
