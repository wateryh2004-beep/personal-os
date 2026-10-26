"use client";

import { useState, type ReactNode } from "react";
import { MotionBoundary } from "@/components/shared/motion-boundary";
import { navigationTransitionType } from "./navigation-motion";

/** Native participants contain only paint. Real controls remain live during motion. */
export function WorkspaceRouteSurface({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [motion, setMotion] = useState<{ pathname: string; direction: ReturnType<typeof navigationTransitionType> }>({ pathname, direction: null });
  if (motion.pathname !== pathname) setMotion({ pathname, direction: navigationTransitionType(motion.pathname, pathname) });
  const routeKey = pathname.startsWith("/notes/") || pathname === "/notes" ? "notes" : pathname;
  return <div className="workspace-route-surface">
    <MotionBoundary key={`plane:${routeKey}`} name="workspace" share={{ "navigation-forward": "workspace-forward", "navigation-backward": "workspace-backward", default: "workspace-route" }} enter={{ "auth-entry": "workspace-entry", "navigation-forward": "workspace-forward", "navigation-backward": "workspace-backward", default: "workspace-enter" }} exit={{ "navigation-forward": "workspace-forward", "navigation-backward": "workspace-backward", default: "workspace-exit" }}><span aria-hidden="true" className="workspace-space-plane" /></MotionBoundary>
    <div key={`live:${routeKey}`} className="workspace-live-surface" data-navigation-motion={motion.direction ?? undefined}>{children}</div>
  </div>;
}
