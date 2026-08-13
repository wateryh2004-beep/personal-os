import { describe, expect, it } from "vitest";
import { expandedFolderPath, visibleExpandedFolders } from "@/features/notes/folder-tree";

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

  it("opens a newly selected path once without making it impossible to collapse", () => {
    const opened = visibleExpandedFolders(folders, new Set(), "08", new Set());
    expect([...opened]).toEqual(["08", "2026", "journal"]);

    const manuallyCollapsed = visibleExpandedFolders(folders, new Set(), "08", new Set(["journal"]));
    expect(manuallyCollapsed.has("journal")).toBe(false);
  });
});
