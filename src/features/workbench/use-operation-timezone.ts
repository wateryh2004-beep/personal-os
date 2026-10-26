"use client";
import { useEffect, useState } from "react";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { readWorkbenchTimezone } from "./operation-read-resource";
export function useOperationTimezone(){const [timezone,setTimezone]=useState<string|null>(null);useEffect(()=>{let active=true;const current=captureWorkspaceScope();void readWorkbenchTimezone().then(value=>{if(active&&current())setTimezone(value);}).catch(()=>{});return()=>{active=false;};},[]);return timezone;}
