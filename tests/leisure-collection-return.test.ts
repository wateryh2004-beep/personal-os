// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
vi.mock("next/link", () => ({ default: ({ onNavigate, scroll, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: (event: { preventDefault: () => void }) => void; scroll?: boolean }) => { void scroll; return createElement("a", { ...props, onClick: (event: React.MouseEvent) => { if (!event.metaKey && !event.ctrlKey) onNavigate?.(event); event.preventDefault(); } }); } }));
import { LeisureCollectionLink, collectionReturnHref, focusCollectionReturn, markCollectionReturn } from "@/components/leisure/leisure-collection-link";
import { LeisureDetailLink } from "@/components/leisure/leisure-detail-link";
it("restores only the matching same-tab collection card and preserves navigation guards", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    window.history.replaceState(null, "", "/leisure?kind=game&minutes=60");
    await act(async () => root.render(createElement(LeisureCollectionLink, { href: "/leisure/a", itemId: "a" }, "Open")));
    await act(async () => host.querySelector("a")!.click());
    expect(collectionReturnHref("/leisure?minutes=60&kind=game#leisure-collection")).toBe("/leisure?minutes=60&kind=game#leisure-item-a");
    expect(collectionReturnHref("/leisure?kind=film")).toBe("/leisure?kind=film");
    expect(collectionReturnHref("https://example.com/leisure?kind=game&minutes=60")).toContain("example.com");
    await act(async () => root.render(createElement(LeisureDetailLink, { href: "/leisure?kind=game&minutes=60", returnToCollection: true }, "Back")));
    expect(host.querySelector("a")!.hash).toBe("#leisure-item-a");
    const blocker = document.createElement("div"); blocker.dataset.leisureNavigationBlock = "draft"; host.append(blocker);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await act(async () => host.querySelector("a")!.click());
    expect(confirm).toHaveBeenCalledOnce();
    confirm.mockRestore(); blocker.remove();
    await act(async () => root.render(createElement(LeisureCollectionLink, { href: "/leisure/b", itemId: "b" }, "Other")));
    host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));
    expect(collectionReturnHref("/leisure?kind=game&minutes=60")).toContain("#leisure-item-a");
    // Only an explicit, accepted return restores focus, and missing cards fall back.
    window.history.replaceState(null, "", "/leisure?kind=game&minutes=60#leisure-item-a");
    const card = document.createElement("a"); card.id = "leisure-item-a"; card.href = "/leisure/a"; card.scrollIntoView = vi.fn(); host.append(card);
    markCollectionReturn(window.location.href); focusCollectionReturn();
    expect(document.activeElement).toBe(card);
    expect(card.scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "instant" });
    card.remove();
    const heading = document.createElement("h2"); heading.id = "leisure-collection-heading"; heading.tabIndex = -1; heading.scrollIntoView = vi.fn(); host.append(heading);
    markCollectionReturn(window.location.href); focusCollectionReturn();
    expect(document.activeElement).toBe(heading);
    expect(heading.scrollIntoView).toHaveBeenCalledOnce();
    heading.remove();
    // Opening from the hero should not resurrect a previous gallery origin.
    await act(async () => root.render(createElement(LeisureCollectionLink, { href: "/leisure/b" }, "Featured")));
    await act(async () => host.querySelector("a")!.click());
    expect(collectionReturnHref("/leisure?kind=game&minutes=60")).not.toContain("#leisure-item");
  } finally { await act(async () => root.unmount()); host.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; }
});
