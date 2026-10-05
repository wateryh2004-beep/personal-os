import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const css = read("src/app/globals.css");

function luminance(hex: string) {
  return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

describe("readable typography and workspace rhythm", () => {
  it("uses local CJK fallbacks without adding a font download", () => {
    for (const font of ["PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "system-ui"]) expect(css).toContain(font);
    expect(read("src/app/layout.tsx")).not.toContain("next/font/google");
  });

  it("keeps secondary text above 4.5:1 on the canvas and app backgrounds", () => {
    for (const token of ["text-secondary", "text-tertiary"]) {
      const foreground = css.match(new RegExp(`--${token}:#([0-9a-f]{6});`))![1];
      for (const background of ["ffffff", "f4f4f6", "f5f5f7"]) {
        expect((luminance(background) + 0.05) / (luminance(foreground) + 0.05)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("shares the page-title scale without a Notes override or forced shared-title truncation", () => {
    expect(css).toContain(".page-title { font-size:28px; font-weight:600; line-height:1.25; letter-spacing:-.015em;");
    expect(css).toContain(".page-title { font-size:24px; }");
    expect(css).not.toContain('header h1 { font-size:27px!important;');
    expect(read("src/components/shared/page-header.tsx")).toContain('className="page-title break-words"');
    for (const path of ["src/components/tasks/task-workspace.tsx", "src/components/notes/notes-workspace.tsx"]) expect(read(path)).toContain("page-title");
  });

  it("aligns Today columns and removes stale spacing overrides", () => {
    const columns = "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,.85fr)] lg:gap-12";
    for (const path of ["src/components/today/now-workspace.tsx", "src/components/today/today-secondary.tsx"]) { expect(read(path)).toContain(columns); }
    expect(read("src/app/(app)/today/loading.tsx")).toContain("<TodayShell />");
    expect(read("src/app/responsive.css")).not.toContain(".now-workspace > div.mt-16");
    for (const path of ["src/components/today/today-schedule.tsx", "src/components/today/today-focus-stack.tsx", "src/components/today/today-secondary.tsx"]) expect(read(path)).not.toContain("leading-[22px] leading-5");
  });

  it("keeps the existing memoized Interview reader with more comfortable body type", () => {
    const study = read("src/components/career/interview/interview-study-view.tsx");
    expect(study).toContain("memo(function InterviewStudyView");
    expect(study).toContain("memo(function StudyMarkdown");
    expect(study).toContain("text-[15px] leading-7");
    expect(study).toContain("参考答案 · 待确认");
  });
});
