import { describe, expect, it } from "vitest";
import {
  commandPaletteNavigation,
  contextualCreateKindForPath,
  desktopNavigationGroups,
  getMobileRecentNavigation,
  mergeRecentNavigation,
  mobileTabNavigation,
  mobileMoreNavigationGroups,
  navigationItemForPath,
  navigationRegistry,
  parseRecentNavigation,
} from "@/lib/navigation-registry";

describe("navigation registry", () => {
  it("keeps route definitions unique and derives every navigation surface", () => {
    const hrefs = navigationRegistry.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(desktopNavigationGroups.flatMap((group) => group.items).map((item) => item.href)).toEqual([
      "/today", "/notes", "/career", "/inbox", "/calendar", "/tasks", "/files", "/briefing", "/investments", "/leisure", "/shopping", "/travel",
    ]);
    expect(mobileTabNavigation.map((item) => item.href)).toEqual(["/today", "/notes", "/career"]);
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/settings");
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/reviews");
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/tasks/projects");
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/briefing");
  });

  it("keeps every secondary module reachable in More without duplicating frequent tabs", () => {
    expect(mobileMoreNavigationGroups[0].items.map((item) => item.href)).toContain("/calendar");
    const more = mobileMoreNavigationGroups.flatMap((group) => group.items).map((item) => item.href);
    expect(new Set(more).size).toBe(more.length);
    expect(more).not.toContain("/career");
    expect(more).not.toContain("/notes");
    expect(more).toContain("/tasks");
    expect(more).not.toContain("/tasks/projects");
    expect(more).not.toContain("/reviews");
    expect(more).toContain("/leisure");
    expect(more).toContain("/investments");
    expect(mobileTabNavigation.map((item) => item.href)).toContain("/career");
    expect(new Set([...more, ...mobileTabNavigation.map((item) => item.href)])).toEqual(new Set(desktopNavigationGroups.flatMap((group) => group.items).map((item) => item.href)));
  });

  it("resolves descendants to their owning navigation module", () => {
    expect(navigationItemForPath("/career/roadmap")?.href).toBe("/career");
    expect(navigationItemForPath("/notes/123")?.href).toBe("/notes");
    expect(navigationItemForPath("/leisure/123")?.href).toBe("/leisure");
    expect(navigationItemForPath("/today")?.href).toBe("/today");
    expect(navigationItemForPath("/files/materials")?.href).toBe("/files");
    expect(navigationItemForPath("/tasks/projects")?.href).toBe("/tasks/projects");
  });

  it("derives contextual create behavior from the same registry", () => {
    expect(contextualCreateKindForPath("/today")).toBe("inbox");
    expect(contextualCreateKindForPath("/notes/123")).toBe("note");
    expect(contextualCreateKindForPath("/travel/ideas")).toBe("travel");
    expect(contextualCreateKindForPath("/calendar")).toBe("calendar");
    expect(contextualCreateKindForPath("/career")).toBeUndefined();
    expect(contextualCreateKindForPath("/tasks/projects")).toBe("project");
    expect(contextualCreateKindForPath("/tasks")).toBe("task");
  });

  it("parses and merges recent navigation defensively", () => {
    expect(parseRecentNavigation(null)).toEqual([]);
    expect(parseRecentNavigation("not-json")).toEqual([]);
    expect(parseRecentNavigation(JSON.stringify([
      { href: "/career", label: "Career" },
      { href: 123, label: "bad" },
    ]))).toEqual([{ href: "/career", label: "Career" }]);

    expect(mergeRecentNavigation([
      { href: "/career", label: "Career" },
      { href: "/projects", label: "Projects" },
    ], { href: "/projects", label: "Projects" })).toEqual([
      { href: "/projects", label: "Projects" },
      { href: "/career", label: "Career" },
    ]);
  });

  it("returns recent primary modules without promoting folded secondary views", () => {
    const recents = [
      { href: "/career/roadmap", label: "Career" },
      { href: "/notes/123", label: "Notes" },
      { href: "/projects", label: "Projects" },
      { href: "/today", label: "Now" },
      { href: "/career/experiences", label: "Career" },
      { href: "/reviews", label: "Reviews" },
      { href: "/tasks/projects", label: "Projects" },
      { href: "/investments", label: "Investments" },
      { href: "/investments?mode=paper", label: "Investments" },
      { href: "/calendar", label: "Calendar" },
    ];
    expect(getMobileRecentNavigation(recents, "/today")).toEqual([
      { targetHref: "/investments", item: navigationItemForPath("/investments") },
      { targetHref: "/calendar", item: navigationItemForPath("/calendar") },
    ]);
  });
});
