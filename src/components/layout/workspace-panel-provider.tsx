"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  initialWorkspacePanelState,
  workspacePanelReducer,
  type WorkspacePanelId,
} from "./workspace-panel-state";

export type WorkspacePanelContextValue = {
  activePanel: WorkspacePanelId | null;
  openPanel: (id: WorkspacePanelId) => void;
  closePanel: (id?: WorkspacePanelId) => void;
  togglePanel: (id: WorkspacePanelId) => void;
  isPanelOpen: (id: WorkspacePanelId) => boolean;
};

const WorkspacePanelContext = createContext<WorkspacePanelContextValue | null>(null);

export function WorkspacePanelProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const [activePanel, dispatch] = useReducer(workspacePanelReducer, initialWorkspacePanelState);
  const openPanel = useCallback((id: WorkspacePanelId) => dispatch({ type: "open", id }), []);
  const closePanel = useCallback((id?: WorkspacePanelId) => dispatch({ type: "close", id }), []);
  const togglePanel = useCallback((id: WorkspacePanelId) => dispatch({ type: "toggle", id }), []);
  const isPanelOpen = useCallback((id: WorkspacePanelId) => activePanel === id, [activePanel]);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    dispatch({ type: "route-change" });
  }, [pathname]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      dispatch({ type: "escape" });
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  const value = useMemo<WorkspacePanelContextValue>(() => ({
    activePanel,
    openPanel,
    closePanel,
    togglePanel,
    isPanelOpen,
  }), [activePanel, closePanel, isPanelOpen, openPanel, togglePanel]);

  return <WorkspacePanelContext.Provider value={value}>{children}</WorkspacePanelContext.Provider>;
}

export function useWorkspacePanel(id: WorkspacePanelId) {
  const context = useContext(WorkspacePanelContext);
  if (!context) throw new Error("useWorkspacePanel must be used inside WorkspacePanelProvider");
  const { activePanel, openPanel, closePanel, togglePanel } = context;
  const open = useCallback(() => openPanel(id), [id, openPanel]);
  const close = useCallback(() => closePanel(id), [closePanel, id]);
  const toggle = useCallback(() => togglePanel(id), [id, togglePanel]);
  const isOpen = activePanel === id;
  return useMemo(() => ({
    isOpen,
    open,
    close,
    toggle,
  }), [close, isOpen, open, toggle]);
}
