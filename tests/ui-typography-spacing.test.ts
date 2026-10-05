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

  it("uses a single warm Today reading surface and scoped responsive tokens", () => {
    const todayCss = read("src/app/today-calm.css");
    expect(todayCss).toContain("--today-paper:#f8f7f3");
    expect(todayCss).toContain("--today-muted:#687068");
    expect(todayCss).toContain("font-size:1.625rem");
    expect(todayCss).toContain("width:44px;min-width:44px;height:44px;min-height:44px");
    expect(todayCss).toContain("prefers-reduced-motion:reduce");
    expect(read("src/components/today/now-workspace.tsx")).toContain("TodayLedger");
    expect(read("src/components/today/now-workspace.tsx")).not.toContain("TodayCommitments");
    expect(read("src/app/(app)/today/loading.tsx")).toContain("<TodayShell />");
  });

  it("keeps the existing memoized Interview reader with more comfortable body type", () => {
    const study = read("src/components/career/interview/interview-study-view.tsx");
    expect(study).toContain("memo(function InterviewStudyView");
    expect(study).toContain("memo(function StudyMarkdown");
    expect(study).toContain("text-[15px] leading-7");
    expect(study).toContain("参考答案 · 待确认");
  });
});
