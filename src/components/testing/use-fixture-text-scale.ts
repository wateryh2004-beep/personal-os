"use client";

import { useEffect } from "react";

/** Only used by fixtures behind the E2E_MOBILE_HARNESS route gate. */
export function useFixtureTextScale(textScale?: "200") {
  useEffect(() => {
    if (textScale !== "200") return;
    const style = document.documentElement.style;
    const previous = style.getPropertyValue("font-size");
    const priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%", "important");
    return () => {
      if (previous) style.setProperty("font-size", previous, priority);
      else style.removeProperty("font-size");
    };
  }, [textScale]);
}
