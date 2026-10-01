import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/interview/actions", () => ({ createPracticeAttempt: vi.fn() }));
vi.mock("@/features/interview/queries", () => ({
  getPracticeDetail: vi.fn(async () => ({
    preparation: {
      id: "preparation",
      question_id: "question",
      interview_questions: { canonical_prompt: "既有题目" },
      interview_contexts: null,
      target_language: "zh",
      next_focus: "先说结论",
      next_practice_at: "2026-10-04T08:00:00Z",
    },
    answers: [],
    linkedStories: [],
    attempts: [{
      id: "saved-attempt",
      practiced_at: "2026-10-01T08:00:00Z",
      duration_seconds: 90,
      issue_tags: ["late_conclusion"],
      next_focus: "先说结论",
    }],
  })),
}));

import PracticeDetailPage from "@/app/(app)/career/interview/practice/[preparationId]/page";

async function renderPage(searchParams: { saved?: string; review?: string }) {
  return renderToStaticMarkup(await PracticeDetailPage({
    params: Promise.resolve({ preparationId: "preparation" }),
    searchParams: Promise.resolve(searchParams),
  }));
}

describe("Interview practice receipt", () => {
  it("confirms only a saved attempt present in the user's retrieved history", async () => {
    expect(await renderPage({ saved: "saved-attempt" })).toContain("这次练习已保存");
    expect(await renderPage({ saved: "unrelated-attempt" })).not.toContain("这次练习已保存");
  });

  it("shows the persisted review schedule and reflection metadata", async () => {
    const html = await renderPage({ saved: "saved-attempt" });
    expect(html).toContain("下次复习：");
    expect(html).toContain("2026年10月4日");
    expect(html).toContain("这次先练：");
    expect(html).toContain("90 秒");
    expect(html).toContain("卡点：结论出现太晚");
    expect(html).toContain("下次重点：先说结论");
    expect(html).toContain("回到练习队列");
  });

  it("warns about a partial save instead of claiming the review schedule was updated", async () => {
    const html = await renderPage({ saved: "saved-attempt", review: "not_updated" });
    expect(html).toContain("这次练习已保存");
    expect(html).toContain("复习安排未能更新");
    expect(html).toContain("无需重复提交练习");
    expect(html).not.toContain("下次复习：");
  });
});
