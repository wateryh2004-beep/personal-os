import { describe, expect, it } from "vitest";
import { formatManagedTaxonomyForPrompt, primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";

describe("calendar taxonomy prompt formatter", () => {
  it("renders every primary category with its stable key and semantics", () => {
    const output = formatManagedTaxonomyForPrompt();
    for (const category of primaryCalendarCategories) {
      expect(output).toContain(category.key);
      expect(output).toContain(category.shortName);
      expect(output).toContain(category.aiDescription);
    }
  });

  it("labels the two groups so the model understands domain vs context", () => {
    const output = formatManagedTaxonomyForPrompt();
    expect(output).toContain("主分类");
    expect(output).toContain("场景分类");
  });

  it("stays within a bounded length for prompt injection", () => {
    expect(formatManagedTaxonomyForPrompt().length).toBeLessThan(4000);
  });
});
