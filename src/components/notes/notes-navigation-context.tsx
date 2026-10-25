"use client";

import { createContext } from "react";

/** The persistent workspace owns the drawer; opening it never replaces the editor. */
export const NotesNavigationContext = createContext<(() => void) | null>(null);
