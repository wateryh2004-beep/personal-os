import { describe, expect, it } from "vitest";
import { mapPersonalContextSources } from "@/features/context/formatter";
import type { PersonalContextPack } from "@/features/context/types";

function makePack(sources: PersonalContextPack["sources"]): PersonalContextPack {
  return {
    version: "personal-context/v1",
    generatedAt: "2026-08-16T00:00:00.000Z",
    timezone: "Asia/Shanghai",
    request: { surface: "notes", intent: "recall" },
    plan: {} as PersonalContextPack["plan"],
    sources,
    diagnostics: {} as PersonalContextPack["diagnostics"],
  };
}

describe("mapPersonalContextSources", () => {
  it("returns [] for a null pack", () => {
    expect(mapPersonalContextSources(null)).toEqual([]);
  });

  it("maps each source to the id/title/domain/href/reasons subset", () => {
    const pack = makePack([
      {
        id: "S1",
        entityType: "note",
        entityId: "note-1",
        domain: "notes",
        title: "关于 REITs 的想法",
        content: "正文",
        href: "/notes/note-1",
        timestamp: "2026-08-10T00:00:00.000Z",
        origins: ["recent_notes"],
        reasons: ["最近 21 天更新的笔记"],
      },
      {
        id: "S2",
        entityType: null,
        entityId: null,
        domain: "memory",
        title: "Working · 华夏REITs实习",
        content: "正文",
        href: null,
        timestamp: null,
        origins: ["memory"],
        reasons: ["当前有效的 Working Memory"],
      },
    ]);
    expect(mapPersonalContextSources(pack)).toEqual([
      {
        id: "S1",
        title: "关于 REITs 的想法",
        domain: "notes",
        href: "/notes/note-1",
        reasons: ["最近 21 天更新的笔记"],
      },
      {
        id: "S2",
        title: "Working · 华夏REITs实习",
        domain: "memory",
        href: null,
        reasons: ["当前有效的 Working Memory"],
      },
    ]);
  });

  it("returns [] when the pack has no sources", () => {
    expect(mapPersonalContextSources(makePack([]))).toEqual([]);
  });
});
