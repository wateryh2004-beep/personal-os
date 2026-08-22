import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync("src/components/calendar/calendar-workspace.tsx", "utf8");
const fullView = readFileSync("src/components/calendar/calendar-full-view.tsx", "utf8");
const createForm = readFileSync("src/components/calendar/calendar-create-form.tsx", "utf8");
const editForm = readFileSync("src/components/calendar/calendar-event-edit-form.tsx", "utf8");
const css = readFileSync("src/components/calendar/calendar-native.module.css", "utf8");

describe("calendar native workspace visual contract", () => {
  it("keeps calendar behavior while removing segmented and badge-heavy chrome", () => {
    expect(workspace).toContain("CalendarFullView");
    expect(workspace).toContain("syncAndBackupMicrosoftAction");
    expect(workspace).toContain("updateCalendarEvent");
    expect(workspace).toContain("selectedCategories");
    expect(workspace).toContain("after:bg-[var(--accent)]");
    expect(workspace).not.toContain('bg-emerald-50');
    expect(workspace).not.toContain('bg-red-50');
  });

  it("renders month events as quiet dot-and-title rows", () => {
    expect(fullView).toContain('dayGridMonth');
    expect(fullView).toContain('visual.dot');
    expect(css).toContain('.fc-dayGridMonth-view .fc-daygrid-event');
    expect(css).toContain('background: transparent !important');
  });

  it("keeps create and edit forms on the same neutral control system", () => {
    for (const source of [createForm, editForm]) {
      expect(source).toContain('var(--surface-control)');
      expect(source).toContain('color-mix(in_srgb,var(--accent)_18%,transparent)');
    }
  });
});
