// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, createElement, type AnchorHTMLAttributes, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { lastNotesListSessionKey } from "@/features/notes/navigation";
import type { NoteListItem } from "@/features/notes/types";
import type { NoteAttachment } from "@/features/notes/attachments";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  navigateLink: vi.fn(),
  search: vi.fn(),
  remote: [] as NoteListItem[],
  searchState: "idle" as "idle" | "loading" | "error",
  retrySearch: vi.fn(),
  canonicalHref: "",
  deferHistoryUpdate: false,
}));

// Next integrates native history writes with useSearchParams. Subscribe to the
// actual URL (and real popstate), rather than returning a mutable fixed fixture.
vi.mock("next/navigation", async () => {
  const { useMemo, useSyncExternalStore } = await import("react");
  const subscribe = (notify: () => void) => {
    const onPopState = () => { mocks.canonicalHref = window.location.href; notify(); };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("test:next-history", notify);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("test:next-history", notify);
    };
  };
  function useHref() {
    return useSyncExternalStore(subscribe, () => mocks.canonicalHref, () => "http://localhost:3000/notes");
  }
  return {
    useRouter: () => mocks.router,
    usePathname: () => new URL(useHref()).pathname,
    useSearchParams: () => {
      const href = useHref();
      return useMemo(() => new URL(href).searchParams, [href]);
    },
    unstable_rethrow: () => {},
  };
});

vi.mock("next/link", () => ({
  default: ({ onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", {
    ...props,
    "data-next-link": "true",
    onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (!event.defaultPrevented) mocks.navigateLink(props.href);
      // Next owns the actual route mount, which is outside this component test.
      event.preventDefault();
    },
  }),
}));
vi.mock("@/features/notes/actions", () => ({
  createNoteInFolder: vi.fn(), moveNote: vi.fn(), renameNote: vi.fn(), toggleNotePinned: vi.fn(), trashNote: vi.fn(),
  createFolder: vi.fn(), moveFolder: vi.fn(), renameFolder: vi.fn(), openDailyNote: vi.fn(),
}));
vi.mock("@/features/notes/use-notes-listing", () => ({
  useNotesListing: ({ notes }: { notes: NoteListItem[] }) => ({
    notes, hasMore: false, loaded: true, refreshing: false, loadingMore: false, error: null,
    retry: vi.fn(), loadMore: vi.fn(),
  }),
}));
vi.mock("@/features/notes/use-notes-search", () => ({
  useNotesSearch: (query: string, folder: string | null) => {
    mocks.search(query, folder);
    return { results: mocks.remote, state: mocks.searchState, retry: mocks.retrySearch };
  },
}));
vi.mock("@/lib/workspace-resource-cache", () => ({
  useWorkspaceResourceLease: () => ({ invalidate: vi.fn(), revalidate: vi.fn() }),
}));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: {} }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: vi.fn() }) }));
vi.mock("@/components/layout/workspace-panel-provider", () => ({
  useWorkspacePanel: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }),
}));
vi.mock("@/components/shared/inspector", () => ({ Inspector: () => null }));

const folder = { id: "fixture-folder", name: "Fixture folder", parent_id: null };
const note: NoteListItem = {
  id: "00000000-0000-4000-8000-000000000001", title: "Alpha", excerpt: null,
  updated_at: "2026-10-01T08:00:00Z", pinned_at: null, folder_id: folder.id, content_origin: "human",
};
const notes: NoteListItem[] = [note, { ...note, id: "00000000-0000-4000-8000-000000000002", title: "Alpha follow-up" }];
const pdf: NoteAttachment = {
  id: "00000000-0000-4000-8000-000000000003", title: "Fixture PDF", original_filename: "fixture.pdf",
  mime_type: "application/pdf", file_size: 1024, role: "pdf_snapshot",
};
const workspaceProps: ComponentProps<typeof NotesWorkspace> = {
  notes, folders: [folder], timezone: "UTC", state: "ready", selectedFolder: folder,
  initialView: "all", dailyError: false, initialHasMore: false,
};
const shellProps: ComponentProps<typeof NotesWorkspaceShell> = { notes, folders: [folder], children: null };
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.remote = [];
  mocks.searchState = "idle";
  mocks.deferHistoryUpdate = false;
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: "fixture-tree" }, "", "/notes?folder=fixture-folder");
  mocks.canonicalHref = window.location.href;
  for (const method of ["replaceState", "pushState"] as const) {
    const original = window.history[method].bind(window.history);
    vi.spyOn(window.history, method).mockImplementation((...args) => {
      const [data, unused, url] = args;
      // Next 16 app-router.js bypasses notifications for its own internal
      // writes. Reusing history.state here would silently break controlled q.
      if (data?.__NA || data?._N) return original(...args);
      original({
        ...data,
        __NA: window.history.state?.__NA,
        __PRIVATE_NEXTJS_INTERNALS_TREE: window.history.state?.__PRIVATE_NEXTJS_INTERNALS_TREE,
      }, unused, url);
      if (url && !mocks.deferHistoryUpdate) {
        mocks.canonicalHref = window.location.href;
        window.dispatchEvent(new Event("test:next-history"));
      }
    });
  }
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  localStorage.clear();
});

async function renderWorkspace(props: Partial<ComponentProps<typeof NotesWorkspace>> = {}, withShell = false) {
  const workspace = createElement(NotesWorkspace, { ...workspaceProps, ...props });
  await act(async () => root.render(withShell
    ? createElement(NotesWorkspaceShell, shellProps, workspace)
    : workspace));
  await act(async () => vi.runOnlyPendingTimers());
}
function input() { return container.querySelector<HTMLInputElement>("#notes-library-search")!; }
function resultLinks() { return [...container.querySelectorAll<HTMLAnchorElement>("a[data-note-result]")]; }
function button(label: string) { return [...container.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === label)!; }
async function changeInput(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function key(target: Element, value: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...init });
  await act(async () => { target.dispatchEvent(event); });
  return event;
}
async function setUrl(href: string, method: "replaceState" | "pushState" = "replaceState") {
  await act(async () => window.history[method](null, "", href));
}

describe("Notes URL-driven search", () => {
  it("uses stable row geometry for search, including remount, and restores browsing estimates on clear", async () => {
    const stylesheet = document.createElement("style");
    stylesheet.textContent = readFileSync("src/app/workspaces.css", "utf8");
    document.head.append(stylesheet);
    const visibility = () => getComputedStyle(container.querySelector(".notes-list-row")!).contentVisibility;
    try {
      await renderWorkspace();
      expect(visibility()).toBe("auto");
      const input = container.querySelector<HTMLInputElement>("#notes-library-search")!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Alpha");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      expect(visibility()).toBe("visible");
      await act(async () => root.render(createElement("div", null, "Document")));
      await renderWorkspace();
      expect(visibility()).toBe("visible");
      await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="清空搜索"]')!.click());
      expect(visibility()).toBe("auto");
    } finally { stylesheet.remove(); }
  });
  it("keeps folder-aware creation in the header instead of covering mobile results", async () => {
    await renderWorkspace();
    const create = container.querySelector<HTMLButtonElement>('header button[aria-label="新建笔记"]')!;
    expect(create).not.toBeNull();
    expect(create.className).toContain("max-md:size-11");
    expect(create.closest("form")?.querySelector<HTMLInputElement>('input[name="folder_id"]')?.value).toBe(folder.id);
    expect(container.querySelectorAll('button[aria-label="新建笔记"]')).toHaveLength(1);
    expect(container.querySelector('form.fixed')).toBeNull();
  });

  it("reads the current q and scope, replacing native URL state without a router navigation", async () => {
    await setUrl("/notes?folder=fixture-folder&view=recent&q=Alpha&scope=all#position");
    await renderWorkspace();
    expect(input().value).toBe("Alpha");
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha", null);
    expect(button("全部笔记")).toBeDefined();
    const length = history.length;
    await changeInput("  Alpha follow-up  ");
    expect(input().value).toBe("  Alpha follow-up  ");
    expect(new URL(location.href).searchParams.get("q")).toBe("  Alpha follow-up  ");
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha follow-up", null);
    expect(location.hash).toBe("#position");
    expect(new URL(location.href).searchParams.get("view")).toBe("recent");
    expect(history.replaceState).toHaveBeenLastCalledWith(null, "", `${location.pathname}${location.search}${location.hash}`);
    expect(history.state).toEqual({ __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: "fixture-tree" });
    expect(history.length).toBe(length);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.router.replace).not.toHaveBeenCalled();
    await act(async () => button("全部笔记").click());
    expect(new URL(location.href).searchParams.has("scope")).toBe(false);
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha follow-up", folder.id);
  });

  it("follows real Back and Forward changes without stale input or scope state", async () => {
    await setUrl("/notes?folder=fixture-folder&q=Alpha");
    await renderWorkspace();
    await setUrl("/notes?folder=fixture-folder&q=Alpha+follow-up&scope=all", "pushState");
    expect(input().value).toBe("Alpha follow-up");
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha follow-up", null);
    await act(async () => { history.back(); await vi.runAllTimersAsync(); });
    expect(input().value).toBe("Alpha");
    expect(button("当前文件夹")).toBeDefined();
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha", folder.id);
    await act(async () => { history.forward(); await vi.runAllTimersAsync(); });
    expect(input().value).toBe("Alpha follow-up");
    expect(button("全部笔记")).toBeDefined();
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha follow-up", null);
    expect(resultLinks().map((link) => link.textContent)).toEqual(["Alpha follow-up"]);
  });

  it("keeps typed text urgent while Next's canonical URL update is deferred", async () => {
    await renderWorkspace();
    mocks.deferHistoryUpdate = true;
    await changeInput("Al");
    expect(input().value).toBe("Al");
    await changeInput("Alpha follow-up");
    expect(input().value).toBe("Alpha follow-up");
    expect(new URL(mocks.canonicalHref).searchParams.has("q")).toBe(false);
    expect(new URL(location.href).searchParams.get("q")).toBe("Alpha follow-up");
    expect(resultLinks().map((link) => link.textContent)).toEqual(["Alpha follow-up"]);
    await act(async () => {
      mocks.canonicalHref = location.href;
      window.dispatchEvent(new Event("test:next-history"));
    });
    expect(input().value).toBe("Alpha follow-up");
    mocks.deferHistoryUpdate = false;
    await setUrl("/notes?folder=fixture-folder&q=Alpha", "pushState");
    expect(input().value).toBe("Alpha");
  });

  it("clears only q, keeping the current folder, scope and hash", async () => {
    await setUrl("/notes?folder=fixture-folder&q=Alpha&scope=all#position");
    await renderWorkspace();
    input().focus();
    expect((await key(input(), "Escape")).defaultPrevented).toBe(true);
    expect(input().value).toBe("");
    expect(location.pathname + location.search + location.hash).toBe("/notes?folder=fixture-folder&scope=all#position");
    expect(document.activeElement).toBe(input());
    expect(container.querySelector('[aria-label="笔记列表"]')).not.toBeNull();
    await changeInput("Alpha");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="清空搜索"]')!.click());
    expect(input().value).toBe("");
    expect(new URL(location.href).searchParams.has("q")).toBe(false);
  });

  it("renders title and snippet highlights as safe literal text", async () => {
    const maliciousTitle = '<img src=x onerror="alert(1)"> Alpha <script>test</script>';
    const maliciousExcerpt = '<svg onload="alert(1)"> alpha & <b>ALPHA</b>';
    const fixture = { ...note, title: maliciousTitle };
    mocks.remote = [{ ...fixture, excerpt: maliciousExcerpt }];
    await setUrl("/notes?q=alpha");
    await renderWorkspace({ notes: [fixture], selectedFolder: null });
    const row = container.querySelector("article")!;
    expect(resultLinks()[0].textContent).toBe(maliciousTitle);
    expect(row.querySelector("p")!.textContent).toBe(maliciousExcerpt);
    expect([...row.querySelectorAll("mark")].map((mark) => mark.textContent)).toEqual(["Alpha", "alpha", "ALPHA"]);
    expect(row.querySelector("img, script, [onerror], [onload], b")).toBeNull();
    expect(row.querySelector("p")!.innerHTML).toContain("&lt;svg");
  });
});

describe("Notes keyboard result navigation", () => {
  beforeEach(async () => { await setUrl("/notes?folder=fixture-folder&q=Alpha"); });

  it("moves focus between the input and real result links, with bounded arrow navigation", async () => {
    await renderWorkspace();
    const [first, second] = resultLinks();
    input().focus();
    expect((await key(input(), "ArrowDown")).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    await key(first, "ArrowDown");
    expect(document.activeElement).toBe(second);
    await key(second, "ArrowDown");
    expect(document.activeElement).toBe(second);
    await key(second, "ArrowUp");
    expect(document.activeElement).toBe(first);
    await key(first, "ArrowUp");
    expect(document.activeElement).toBe(input());
    await key(input(), "ArrowUp");
    expect(document.activeElement).toBe(second);
    await key(second, "Escape");
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("Alpha");
    expect(container.querySelector('[role="listbox"]')).toBeNull();
    expect(first.getAttribute("href")).toBe(`/notes/${note.id}`);
  });

  it("opens the first result from input Enter and leaves focused-link Enter native", async () => {
    await renderWorkspace();
    expect((await key(input(), "Enter")).defaultPrevented).toBe(true);
    expect(mocks.navigateLink).toHaveBeenCalledExactlyOnceWith(`/notes/${note.id}`);
    mocks.navigateLink.mockClear();
    const second = resultLinks()[1];
    second.focus();
    expect((await key(second, "Enter")).defaultPrevented).toBe(false);
    expect(mocks.navigateLink).not.toHaveBeenCalled();
    // jsdom has no native keyboard activation; an anchor click is its browser default.
    await act(async () => second.click());
    expect(mocks.navigateLink).toHaveBeenCalledExactlyOnceWith(`/notes/${notes[1].id}`);
  });

  it.each(["ArrowDown", "ArrowUp", "Escape", "Enter"])("does not handle %s during IME composition", async (value) => {
    await renderWorkspace();
    input().focus();
    expect((await key(input(), value, { isComposing: true })).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("Alpha");
    const first = resultLinks()[0];
    first.focus();
    expect((await key(first, value, { isComposing: true })).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(mocks.navigateLink).not.toHaveBeenCalled();
  });

  it.each(["ArrowDown", "ArrowUp", "Escape", "Enter"])("ignores Safari's final %s after compositionend while keyCode is 229", async (value) => {
    await renderWorkspace();
    input().focus();
    await act(async () => input().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
    const event = await key(input(), value, { isComposing: false, keyCode: 229 });
    expect(event.isComposing).toBe(false);
    expect(event.keyCode).toBe(229);
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("Alpha");
    const first = resultLinks()[0];
    first.focus();
    expect((await key(first, value, { isComposing: false, keyCode: 229 })).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(first);
    expect(mocks.navigateLink).not.toHaveBeenCalled();
  });

  it("leaves unrelated controls alone and handles an empty result list safely", async () => {
    await renderWorkspace();
    const manage = container.querySelector<HTMLButtonElement>('[aria-label="管理 Alpha"]')!;
    manage.focus();
    expect((await key(manage, "ArrowUp")).defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(manage);
    await changeInput("no-match");
    input().focus();
    expect(resultLinks()).toHaveLength(0);
    expect((await key(input(), "ArrowDown")).defaultPrevented).toBe(false);
    await key(input(), "Enter");
    expect(mocks.navigateLink).not.toHaveBeenCalled();
  });
});

describe("Notes open and return context", () => {
  it("saves the exact list URL and scroll before opening, then returns to that context", async () => {
    const href = "/notes?folder=fixture-folder&view=recent&q=Alpha&scope=all#position";
    await setUrl(href);
    await renderWorkspace();
    const list = container.querySelector("main")!;
    list.scrollTop = 487;
    mocks.navigateLink.mockImplementationOnce(() => {
      expect(loadWorkspaceSession(lastNotesListSessionKey)).toEqual({ href });
      expect(loadWorkspaceSession(`scroll:notes:list:${location.pathname}${location.search}`)).toEqual({ scrollTop: 487 });
    });
    await act(async () => resultLinks()[0].click());
    expect(mocks.navigateLink).toHaveBeenCalledExactlyOnceWith(`/notes/${note.id}`);
    await setUrl(`/notes/${note.id}`);
    await act(async () => root.render(createElement(NoteDocumentShell, {
      noteId: note.id, editor: createElement("textarea", { defaultValue: "Unsaved fixture draft" }), inspector: null,
      location: { href: `/notes?folder=${folder.id}`, label: folder.name },
    })));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="返回笔记列表"]')!.click());
    expect(mocks.router.replace).toHaveBeenCalledExactlyOnceWith(href);
    await setUrl(href);
    await renderWorkspace();
    expect(container.querySelector("main")!.scrollTop).toBe(487);
    expect(input().value).toBe("Alpha");
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha", null);
  });

  it("keeps the folder breadcrumb a Next link and preserves editor/PDF identity across switches", async () => {
    const location = { href: `/notes?folder=${folder.id}`, label: `Fixture root / ${folder.name}` };
    await act(async () => root.render(createElement(NoteDocumentShell, {
      noteId: note.id, editor: createElement("textarea", { defaultValue: "Original fixture draft", "aria-label": "Fixture draft" }),
      inspector: null, attachments: [pdf], location,
    })));
    const breadcrumb = container.querySelector<HTMLAnchorElement>('nav[aria-label="文档位置"] a')!;
    expect(breadcrumb.getAttribute("href")).toBe(location.href);
    expect(breadcrumb.getAttribute("data-next-link")).toBe("true");
    expect(breadcrumb.textContent).toBe(location.label);
    expect(breadcrumb.getAttribute("aria-label")).toBe(`返回文件夹：${location.label}`);
    const editor = container.querySelector("textarea")!;
    editor.value = "Unsaved fixture draft";
    await act(async () => button("PDF").click());
    const reader = container.querySelector("iframe")!;
    expect(reader.getAttribute("src")).toBe(`/api/files/${pdf.id}/download?inline=1#view=FitH`);
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.parentElement!.hidden).toBe(true);
    await act(async () => button("正文").click());
    expect(container.querySelector("textarea")).toBe(editor);
    expect(editor.value).toBe("Unsaved fixture draft");
    expect(editor.parentElement!.hidden).toBe(false);
    expect(container.querySelector("iframe")).toBe(reader);
    expect(reader.parentElement!.hidden).toBe(true);
    expect(container.querySelector('nav[aria-label="文档位置"] a')).toBe(breadcrumb);
  });
});

describe("Notes shell shortcut integration", () => {
  it("focuses the existing content search without adding a parallel search surface", async () => {
    await renderWorkspace({}, true);
    const searchInputs = container.querySelectorAll("input").length;
    expect((await key(document.body, "/")).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(container.querySelectorAll("input")).toHaveLength(searchInputs);
    expect(container.querySelectorAll("#notes-library-search")).toHaveLength(1);
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect((await key(input(), "/")).defaultPrevented).toBe(false);
  });

  it("does not focus search for a Safari composition-completion slash", async () => {
    await renderWorkspace({}, true);
    expect((await key(document.body, "/", { isComposing: false, keyCode: 229 })).defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(input());
    expect(mocks.router.push).not.toHaveBeenCalled();
  });

  it.each(["dialog", "menu"])("leaves a global %s overlay in charge of keyboard input", async (role) => {
    await renderWorkspace({}, true);
    const overlay = document.createElement("div");
    overlay.setAttribute("role", role);
    document.body.append(overlay);
    try {
      expect((await key(document.body, "/")).defaultPrevented).toBe(false);
      expect(document.activeElement).not.toBe(input());
      expect(mocks.router.push).not.toHaveBeenCalled();
    } finally { overlay.remove(); }
  });

  it("routes document slash to the saved list and consumes focusSearch on arrival", async () => {
    saveWorkspaceSession(lastNotesListSessionKey, { href: "/notes?folder=fixture-folder&q=Alpha&scope=all" });
    await setUrl(`/notes/${note.id}`);
    await act(async () => root.render(createElement(NotesWorkspaceShell, {
      ...shellProps, documentView: true,
    }, createElement("div", null, "Fixture document"))));
    expect((await key(document.body, "/")).defaultPrevented).toBe(true);
    const href = "/notes?folder=fixture-folder&q=Alpha&scope=all&focusSearch=1";
    expect(mocks.router.push).toHaveBeenCalledExactlyOnceWith(href);
    await setUrl(href);
    await renderWorkspace({}, true);
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe("Alpha");
    expect(new URL(location.href).searchParams.has("focusSearch")).toBe(false);
    expect(mocks.search).toHaveBeenLastCalledWith("Alpha", null);
  });
});

describe("Notes parent folder navigation", () => {
  const child = { id: "fixture-child", name: "用于窄屏验证的很长子文件夹名称LongUnbrokenFolderName", parent_id: folder.id };
  const grandchild = { id: "fixture-grandchild", name: "下一层", parent_id: child.id };
  it("shows child folders for an empty parent without claiming its contents are empty", async () => {
    await renderWorkspace({ notes: [], folders: [folder, child, grandchild] });
    const navigation = container.querySelector('section[aria-label="子文件夹"]')!;
    expect(navigation.textContent).toContain(child.name);
    expect(navigation.textContent).not.toContain(grandchild.name);
    expect(navigation.querySelector("a")?.getAttribute("href")).toBe("/notes?folder=fixture-child");
    expect(container.textContent).toContain("1 个子文件夹 · 当前层级 0 篇笔记");
    expect(container.textContent).toContain("当前层级没有直接存放的笔记");
    expect(container.textContent).not.toContain("这里还没有笔记");
    await act(async () => navigation.querySelector<HTMLAnchorElement>("a")!.click());
    expect(mocks.navigateLink).toHaveBeenLastCalledWith("/notes?folder=fixture-child");
    expect(container.querySelector('input[name="folder_id"]')?.getAttribute("value")).toBe(folder.id);
  });
  it("provides a parent trail and retains direct-note counts without inferring descendant counts", async () => {
    await setUrl("/notes?folder=fixture-child");
    await renderWorkspace({ notes: [{ ...note, folder_id: child.id }], selectedFolder: child, folders: [folder, child, grandchild] });
    const crumbs = container.querySelector('nav[aria-label="文件夹路径"]')!;
    expect([...crumbs.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual(["/notes", "/notes?folder=fixture-folder"]);
    expect(crumbs.querySelector('[aria-current="page"]')?.textContent).toBe(child.name);
    expect(container.textContent).toContain("1 个子文件夹 · 当前层级 1 篇笔记");
    expect(container.textContent).toContain("当前层级的笔记");
  });
  it("keeps folder navigation out of search results and restores it when search clears", async () => {
    await renderWorkspace({ folders: [folder, child] });
    await changeInput("Alpha");
    expect(container.querySelector('section[aria-label="子文件夹"]')).toBeNull();
    expect(resultLinks()).toHaveLength(2);
    await changeInput("");
    expect(container.querySelector('section[aria-label="子文件夹"]')).not.toBeNull();
  });
  it("keeps a saved parent scroll position when returning from a child", async () => {
    await renderWorkspace({ folders: [folder, child] });
    const list = container.querySelector<HTMLElement>(".notes-list-workspace")!;
    list.scrollTop = 240;
    list.dispatchEvent(new Event("scroll"));
    await setUrl("/notes?folder=fixture-child");
    await renderWorkspace({ selectedFolder: child, folders: [folder, child] });
    await setUrl("/notes?folder=fixture-folder");
    await renderWorkspace({ folders: [folder, child] });
    expect(list.scrollTop).toBe(240);
  });
});
