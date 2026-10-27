"use client";

import { useEffect } from "react";

/** Engines are acquired by actual surfaces. This host never preloads private data. */
export function AssistantRuntimeHost() {
  useEffect(() => {
    // Legacy Notes Library values carry neither an owner nor an original TTL.
    try {
      localStorage.removeItem("personal-os:agent:notes-library:draft:v1");
      localStorage.removeItem("personal-os:agent:notes-library:run:v1");
    } catch { /* A blocked storage area cannot prevent the current input. */ }
  }, []);
  return null;
}
