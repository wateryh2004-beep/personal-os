import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workspacePath = new URL("../src/components/tasks/task-workspace.tsx", import.meta.url);

describe("Tasks workspace interaction contracts", () => {
  it("uses the selected list state to resolve the Quick Add target", async () => {
    const source = await readFile(workspacePath, "utf8");

    expect(source).toContain("resolveQuickAddTarget(lists, listId)");
    expect(source).toContain("listId={quickAddTarget.id}");
    expect(source).toContain("listLabel={quickAddTarget.displayName}");
    expect(source).toContain("添加到 {listLabel}");
  });

  it("turns the row More icon into a real menu without activating the row", async () => {
    const source = await readFile(workspacePath, "utf8");

    expect(source).toContain("<DropdownMenuTrigger asChild>");
    expect(source).toContain("aria-label={`${task.title} 更多操作`}");
    expect(source).toContain("onClick={(event) => event.stopPropagation()}");
    expect(source).toContain("onPointerDown={(event) => event.stopPropagation()}");
    expect(source).toContain("if (event.target !== event.currentTarget) return;");
    expect(source).toContain("设为今天");
    expect(source).toContain("设为明天");
    expect(source).toContain("设为高优先级");
  });

  it("keeps one list state while exposing a compact selector below xl", async () => {
    const source = await readFile(workspacePath, "utf8");

    expect(source).toContain('const [listId, setListId] = useState<string | null>(null);');
    expect(source).toContain('className="mt-3 xl:hidden"');
    expect(source).toContain("onSelect={() => setListId(null)}");
    expect(source).toContain("onSelect={() => setListId(list.id)}");
    expect(source).toContain('className="hidden border-l border-[var(--border-subtle)] px-4 py-5 xl:block"');
  });
});
