// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

vi.mock("@/components/shared/motion-boundary", () => ({ MotionBoundary: ({ name, children }: { name: string; children: React.ReactNode }) => <div data-shared-name={name}>{children}</div> }));
import { NoteMotionScopeContext, NotePaperMotion, NoteTitleMotion, NotesSurfaceMotion } from "@/components/notes/notes-motion";

it("keeps route identities unique when the same note is also open in reference and quicklook", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const note = <NotesSurfaceMotion><article><NotePaperMotion noteId="same-note" /><NoteTitleMotion noteId="same-note" editableTitle="同一篇笔记"><input aria-label="真实笔记标题" defaultValue="同一篇笔记" /></NoteTitleMotion><p>同一正文</p></article></NotesSurfaceMotion>;
  try {
    await act(async () => root.render(<>{note}<NoteMotionScopeContext.Provider value="reference">{note}{note}</NoteMotionScopeContext.Provider></>));
    const names = [...host.querySelectorAll<HTMLElement>("[data-shared-name]")].map(node => node.dataset.sharedName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(["note-paper-same-note", "note-title-same-note"]);
    expect(host.querySelectorAll("article")).toHaveLength(3);
    expect(host.querySelectorAll(".note-title-anchor")).toHaveLength(3);
    // The live form control must never be inside a named participant.
    for (const input of host.querySelectorAll("input")) expect(input.closest("[data-shared-name]")).toBeNull();
    expect(host.querySelector('.note-title-motion-face')?.getAttribute("aria-hidden")).toBe("true");
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
