"use client";

import type { ReactElement } from "react";
import { Presence } from "@radix-ui/react-presence";

/** Heavy panel children mount on first opening, remain only for the close
 * animation, and unmount immediately when reduced motion disables animation. */
export function PanelPresence({ open, children }: { open: boolean; children: ReactElement }) {
  return <Presence present={open}><div className="panel-lifecycle" data-state={open ? "open" : "closed"}>{children}</div></Presence>;
}
