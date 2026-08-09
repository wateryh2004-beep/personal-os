import { describe, expect, it } from "vitest";
import { clipBatch, matchedExcerpt } from "@/features/assistant/retrieval/excerpts";
import { findRecurringTopics } from "@/features/assistant/retrieval/topics";

describe("Personal Intelligence retrieval", () => {
  it("returns text around the lexical match instead of the document beginning", () => {
    const body = `${"开头内容。".repeat(80)}我在这里重新评估量化学习路线和投入。${"结尾。".repeat(40)}`;
    const excerpt = matchedExcerpt(body, ["量化学习"], 180);
    expect(excerpt).toContain("量化学习");
    expect(excerpt.startsWith("开头内容")).toBe(false);
  });

  it("recognizes a topic repeated in four of ten notes", () => {
    const documents = Array.from({ length: 10 }, (_, index) => ({
      id: `note-${index}`,
      title: `记录 ${index}`,
      content: index < 4 ? `今天继续研究量化学习，并记录第 ${index} 次判断。` : `这是关于生活主题 ${index} 的独立记录。`,
    }));
    const topics = findRecurringTopics(documents, 20);
    const quantitative = topics.find((topic) => topic.topic.includes("量化"));
    expect(quantitative?.occurrences).toBe(4);
  });

  it("does not promote a one-note signal to a recurring topic", () => {
    const topics = findRecurringTopics([
      { id: "one", title: "A", content: "只在这里提到独角兽方向" },
      { id: "two", title: "B", content: "另一篇讨论做饭" },
      { id: "three", title: "C", content: "第三篇讨论学习" },
    ]);
    expect(topics.some((topic) => topic.topic.includes("独角兽"))).toBe(false);
  });

  it("enforces batch note and character budgets", () => {
    const clipped = clipBatch(
      Array.from({ length: 8 }, (_, index) => ({ id: String(index), bodyMarkdown: "x".repeat(1_000) })),
      { maxNotes: 3, maxCharsPerNote: 500, maxTotalChars: 1_100 },
    );
    expect(clipped).toHaveLength(3);
    expect(clipped.reduce((total, note) => total + note.bodyMarkdown.length, 0)).toBe(1_100);
    expect(clipped.every((note) => note.truncated)).toBe(true);
  });
});
