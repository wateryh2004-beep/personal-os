"use client";
import { createContext, useContext } from "react";
export const WorkbenchActivityContext = createContext(true);
export const useWorkbenchActive = () => useContext(WorkbenchActivityContext);
