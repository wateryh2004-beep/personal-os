import { describe, expect, it } from "vitest";
import { canMoveFolderTo, expandedFolderPath, isFolderDescendant, visibleExpandedFolders } from "@/features/notes/folder-tree";
import { notesDragAutoScrollDelta } from "@/features/notes/drag-auto-scroll";

const folders = [
  { id: "journal", parent_id: null },
  { id: "2026", parent_id: "journal" },
  { id: "08", parent_id: "2026" },
  { id: "projects", parent_id: null },
];

describe("notes folder tree", () => {
  it("only opens the selected folder path by default", () => {
    expect([...expandedFolderPath(folders, "08")]).toEqual(["08", "2026", "journal"]);
  });

  it("keeps the tree collapsed when no folder is selected", () => {
    expect([...expandedFolderPath(folders, null)]).toEqual([]);
  });

  it("never permits nesting a folder inside itself or one of its descendants", () => {
    expect(isFolderDescendant(folders, "journal", "08")).toBe(true);
    expect(canMoveFolderTo(folders, "journal", "08")).toBe(false);
    expect(canMoveFolderTo(folders, "2026", "2026")).toBe(false);
    expect(canMoveFolderTo(folders, "08", "journal")).toBe(true);
  });

  it("opens a newly selected path once without making it impossible to collapse", () => {
    const opened = visibleExpandedFolders(folders, new Set(), "08", new Set());
    expect([...opened]).toEqual(["08", "2026", "journal"]);

    const manuallyCollapsed = visibleExpandedFolders(folders, new Set(), "08", new Set(["journal"]));
    expect(manuallyCollapsed.has("journal")).toBe(false);
  });
});

describe("Notes navigator folder actions", () => {
  it("uses a direct menu action for creating a note, since menus unmount their nested forms on close", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile("src/components/notes/notes-workspace-shell.tsx", "utf8"));
    expect(source).toContain("onSelect={() => createNoteForFolder(folder)}");
    expect(source).not.toContain('<DropdownMenuItem asChild><form action={createNoteInFolder}');
  });
});

describe("notes drag auto-scroll", () => {
  it("scrolls only near the tree edges and accelerates closer to them", () => {
    expect(notesDragAutoScrollDelta(200, 100, 500)).toBe(0);
    expect(notesDragAutoScrollDelta(145, 100, 500)).toBeLessThan(0);
    expect(notesDragAutoScrollDelta(105, 100, 500)).toBeLessThan(notesDragAutoScrollDelta(145, 100, 500));
    expect(notesDragAutoScrollDelta(455, 100, 500)).toBeGreaterThan(0);
    expect(notesDragAutoScrollDelta(495, 100, 500)).toBeGreaterThan(notesDragAutoScrollDelta(455, 100, 500));
  });
});
