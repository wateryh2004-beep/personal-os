import { describe, expect, it } from "vitest";
import {
  commandPaletteNavigation,
  contextualCreateKindForPath,
  desktopNavigationGroups,
  getMobileRecentNavigation,
  mergeRecentNavigation,
  mobileTabNavigation,
  navigationItemForPath,
  navigationRegistry,
  parseRecentNavigation,
} from "@/lib/navigation-registry";

describe("navigation registry", () => {
  it("keeps route definitions unique and derives every navigation surface", () => {
    const hrefs = navigationRegistry.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(desktopNavigationGroups.flatMap((group) => group.items).map((item) => item.href)).toEqual([
      "/today", "/inbox", "/calendar", "/tasks", "/projects", "/reviews", "/notes", "/files", "/briefing", "/shopping", "/travel", "/career",
    ]);
    expect(mobileTabNavigation.map((item) => item.href)).toEqual(["/today", "/calendar", "/tasks", "/notes"]);
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/settings");
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/reviews");
    expect(commandPaletteNavigation.map((item) => item.href)).toContain("/briefing");
  });

  it("resolves descendants to their owning navigation module", () => {
    expect(navigationItemForPath("/career/roadmap")?.href).toBe("/career");
    expect(navigationItemForPath("/notes/123")?.href).toBe("/notes");
    expect(navigationItemForPath("/today")?.href).toBe("/today");
  });

  it("derives contextual create behavior from the same registry", () => {
    expect(contextualCreateKindForPath("/notes/123")).toBe("note");
    expect(contextualCreateKindForPath("/travel/ideas")).toBe("travel");
    expect(contextualCreateKindForPath("/calendar")).toBe("calendar");
    expect(contextualCreateKindForPath("/career")).toBeUndefined();
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

  it("returns recent non-tab modules without duplicating a module", () => {
    const recents = [
      { href: "/career/roadmap", label: "Career" },
      { href: "/projects", label: "Projects" },
      { href: "/today", label: "Now" },
      { href: "/career/experiences", label: "Career" },
      { href: "/reviews", label: "Reviews" },
    ];
    expect(getMobileRecentNavigation(recents, "/today")).toEqual([
      { targetHref: "/career/roadmap", item: navigationItemForPath("/career/roadmap") },
      { targetHref: "/projects", item: navigationItemForPath("/projects") },
      { targetHref: "/reviews", item: navigationItemForPath("/reviews") },
    ]);
  });
});
