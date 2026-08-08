import type { ToolSet } from "ai";
import type { createClient } from "@/lib/supabase/server";
import type { AssistantToolGroup, AssistantToolRisk } from "../types";

export type AssistantSupabase = Awaited<ReturnType<typeof createClient>>;

export type AssistantToolContext = {
  supabase: AssistantSupabase;
  userId: string;
  timezone: string;
  runId?: string | null;
};

export type AssistantToolDefinition = {
  name: string;
  group: AssistantToolGroup;
  risk: AssistantToolRisk;
  description: string;
};

export type AssistantToolModule = {
  definitions: AssistantToolDefinition[];
  build: (context: AssistantToolContext) => ToolSet;
};
