"use client";

import { AppShell } from "@/components/layout/app-shell";
import { leisureArtwork } from "@/features/leisure/artwork";
import { useRef } from "react";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { LeisureDetail } from "@/components/leisure/leisure-detail";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackResult } from "@/features/leisure/types";

/** Explicit synthetic data, reachable only through the opt-in E2E route. */
export const leisureFixtureNow = Date.parse("2026-10-04T12:00:00Z");
const base: LeisureExperience = {
  id: "10000000-0000-4000-8000-000000000001", title: "雨后的城市 · Synthetic fixture", kind: "film", why: "给一个不赶时间的晚上。沿着城市的街道，看一段安静的虚构故事。此内容仅供界面测试。", body_markdown: "## 为什么留在这里\n\n这是一段用于验证排版的合成资料，不是真实推荐或个人经历。\n\n## 怎么开始\n\n先读作品介绍，再决定是否适合此刻。\n\n[测试官方入口](https://example.com/official) · [未核实链接](https://example.com/unverified)\n\n![不应加载远程图片](https://example.com/private-tracker.png)", how_to_start: "先看官方介绍，再留出完整的观影时间。", duration_minutes: 110, platform: "测试平台", location: null, starts_at: null, cost_text: "以官方页面为准", setting: "home", company: "either", budget: "paid", sources: [{ label: "测试官方入口", url: "https://example.com/official", kind: "official", verification: "verified", checked_at: "2026-10-03T12:00:00Z" }, { label: "历史入口", url: "https://example.com/old", kind: "official", verification: "verified", checked_at: "2026-01-01T00:00:00Z" }, { label: "测试评分页", url: "https://example.com/rating", kind: "rating", verification: "verified", checked_at: "2026-10-03T12:00:00Z" }], ratings: [{ platform: "合成评分平台", value: "8.2", scale: "10", checked_at: "2026-10-03T12:00:00Z", source_url: "https://example.com/rating" }], content_revision: 1, created_at: "2026-10-03T12:00:00Z", updated_at: "2026-10-03T12:00:00Z", feedback: null,
};
export const leisureFixtureExperiences: LeisureExperience[] = [base,
  { ...base, id: "10000000-0000-4000-8000-000000000002", title: "小小的解谜时间 · Synthetic fixture", kind: "game", why: "短短一局，可以随时放下。", how_to_start: "打开试玩介绍，先了解操作。", duration_minutes: 25, budget: "free", platform: null, sources: [], ratings: [] },
  { ...base, id: "10000000-0000-4000-8000-000000000003", title: "沿河走一段 · Synthetic fixture", kind: "outing", why: "去户外换一个视角，不设打卡路线。", how_to_start: "先核实开放情况和交通。", duration_minutes: 60, setting: "out", budget: "free", platform: null, location: "测试地点", sources: [], ratings: [] },
  { ...base, id: "10000000-0000-4000-8000-000000000004", title: "一张唱片的时间 · Synthetic fixture", kind: "music", why: "让声音陪着，不必做别的。", duration_minutes: 45, feedback: { status: "interested", reaction: "none", personal_note: "", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: base.updated_at }, sources: [], ratings: [] },
  { ...base, id: "10000000-0000-4000-8000-000000000005", title: "合成回忆 · 仅用于排版测试", kind: "book", feedback: { status: "completed", reaction: "liked", personal_note: "这不是用户的真实感受，只是测试较长中文段落在不同屏幕下的换行。", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: base.updated_at }, sources: [], ratings: [] },
];

/** Public title/artwork QA only: no real personal feedback, source claims or notes. */
const artworkFixtures: LeisureExperience[] = leisureArtwork.map((art, index) => ({
  ...base,
  id: `artwork-${index}`,
  title: art.title,
  kind: art.kind,
  why: "图片与排版预览。这里是公开作品信息的测试展示，不是用户的私人推荐、观看记录或感想。",
  how_to_start: "仅用于核对封面加载、键盘浏览和响应式布局。",
  duration_minutes: index % 3 === 0 ? 30 : 120,
  platform: null,
  feedback: null,
  sources: [],
  ratings: [],
}));

export function LeisureFixture({ item, mode }: { item?: string; mode?: string }) {
  const latestRevision = useRef(0);
  async function save(input: LeisureFeedbackInput): Promise<LeisureFeedbackResult> {
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (mode === "conflict") return { ok: false, error: "conflict" };
    if (mode === "failure") return { ok: false, error: "unavailable" };
    if (input.expected_revision !== latestRevision.current) return { ok: false, error: "conflict" };
    latestRevision.current += 1;
    return { ok: true, feedback: { status: input.status, reaction: input.reaction, personal_note: input.personal_note, linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: latestRevision.current, updated_at: new Date(leisureFixtureNow).toISOString() } };
  }
  const fixtures = mode === "gallery" ? artworkFixtures : leisureFixtureExperiences;
  const experience = fixtures.find((entry) => entry.id === item);
  const shownExperience = experience && mode === "long" ? { ...experience, title: "很长的体验标题用于验证窄屏阅读与自然换行".repeat(5), body_markdown: `${experience.body_markdown}\n\n${"一段很长的中文内容，保留正常阅读的行距与段落。".repeat(150)}\n\n| 字段 | 内容 |\n| --- | --- |\n| 链接 | ${"unbrokentext".repeat(70)} |` } : experience;
  return <AppShell presentationPathname={shownExperience ? `/leisure/${shownExperience.id}` : "/leisure"}><p className="border-b px-5 py-2 text-xs text-[var(--text-tertiary)]">Synthetic fixture · 仅供测试，不包含真实推荐、评分或个人记录</p>{shownExperience ? <LeisureDetail experience={shownExperience} now={leisureFixtureNow} onSave={save} backHref={`/mobile-native-e2e?scene=leisure${mode === "gallery" ? "&mode=gallery" : ""}`} /> : <LeisureHome experiences={mode === "empty" || mode === "error" ? [] : fixtures} unavailable={mode === "error"} detailBase={`/mobile-native-e2e?scene=leisure${mode === "gallery" ? "&mode=gallery" : ""}&item=`} />}</AppShell>;
}
