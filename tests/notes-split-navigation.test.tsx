// @vitest-environment jsdom
import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/notes/11111111-1111-4111-8111-111111111111", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, onNavigate: _onNavigate, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: unknown }) => { void _onNavigate; return <a {...props}>{children}</a>; } }));
vi.mock("@/features/notes/actions", () => ({ createFolder: vi.fn(), createNoteInFolder: vi.fn(), moveFolder: vi.fn(), moveNote: vi.fn(), renameFolder: vi.fn(), openDailyNote: vi.fn() }));
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesNavigationContext } from "@/components/notes/notes-navigation-context";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
const observers = new Set<{ node?: Element; callback: ResizeObserverCallback; disconnect: () => void }>();
let width = 900, root: ReturnType<typeof createRoot>, host: HTMLDivElement;
function Document() { const open = useContext(NotesNavigationContext); return <><button className="notes-navigation-trigger" aria-label="打开笔记文件" onClick={open ?? undefined}>文件夹</button><textarea aria-label="同一正文" defaultValue="原始正文" /></>; }
const render = () => root.render(<NotesWorkspaceShell folders={[]} notes={[]} documentView><Document /></NotesWorkspaceShell>);
async function resize(next: number) { width = next; await act(async () => { for (const observer of observers) if (observer.node?.classList.contains("notes-workspace-shell")) observer.callback([], observer as unknown as ResizeObserver); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); localStorage.clear(); observers.clear(); width = 900;
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.spyOn(Element.prototype, "clientWidth", "get").mockImplementation(function (this: Element) { return this.classList.contains("notes-workspace-shell") ? width : 0; });
  vi.stubGlobal("ResizeObserver", class {
    node?: Element; callback: ResizeObserverCallback; disconnect = vi.fn((): void => { observers.delete(this); });
    constructor(callback: ResizeObserverCallback) { this.callback = callback; observers.add(this); }
    observe(node: Element) { this.node = node; } unobserve() {}
  });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("uses actual pane width, retains its preferred navigator width, and keeps the same live input/caret through narrow/wide transitions", async () => {
  localStorage.setItem("personal-os:notes-navigator-width:v1", "324");
  await act(async () => render()); await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  const shell = host.querySelector<HTMLElement>(".notes-workspace-shell")!, navigator = shell.querySelector<HTMLElement>(".notes-navigator-panel")!, input = shell.querySelector("textarea")!;
  expect(shell.hasAttribute("data-compact-navigation")).toBe(false); expect(navigator.style.width).toBe("324px");
  input.value = "后续输入保留"; input.focus(); input.setSelectionRange(2, 4);
  await resize(260);
  expect(shell.dataset.compactNavigation).toBe("true"); expect(input.isConnected).toBe(true); expect(document.activeElement).toBe(input); expect(input.value).toBe("后续输入保留"); expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
  await resize(900);
  expect(shell.hasAttribute("data-compact-navigation")).toBe(false); expect(navigator.style.width).toBe("324px"); expect(document.activeElement).toBe(input); expect(input.value).toBe("后续输入保留");
  const observer = [...observers].find(row => row.node === shell)!; await act(async () => root.render(null)); expect(observer.disconnect).toHaveBeenCalledOnce();
});
it("keeps navigation discoverable in a narrow desktop pane and safely moves focus out of the collapsed navigator", async () => {
  await act(async () => render()); const shell = host.querySelector<HTMLElement>(".notes-workspace-shell")!;
  shell.querySelector<HTMLInputElement>('.notes-navigator-panel input[placeholder="快速打开…"]')!.focus();
  await resize(260); const trigger = shell.querySelector<HTMLButtonElement>('[aria-label="打开笔记文件"]')!;
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
  await resize(900); expect(document.querySelector('[data-slot="sheet-content"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector('[data-slot="sheet-content"]')).toBeNull(); expect(shell.querySelector("textarea")?.isConnected).toBe(true);
});
