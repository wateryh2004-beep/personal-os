"use client";
import { z } from "zod";
import { WORKSPACE_SESSION_PREFIX } from "@/lib/workspace-session";
import { workspaceOwnerIsCurrent } from "@/lib/workspace-resource-cache";
import type { ChatIdentity } from "./client-chat-contracts";
const textMessage = z.object({ id: z.string().min(1).max(200), role: z.enum(["user", "assistant"]), parts: z.array(z.unknown()).max(1000) });
const session = z.object({ input: z.string().max(10_000), model: z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]), messages: z.array(textMessage).max(200), interrupted: z.boolean().optional() });
export function legacyAssistantSessionKey(identity: ChatIdentity) { return identity.surface === "global" ? "agent:draft:v2" : identity.surface === "tasks" ? "tasks:assistant" : identity.surface === "calendar" ? "calendar:assistant" : null; }
/** Only owner-marked, bounded same-tab envelopes qualify. Bare localStorage is never claimed. */
export function loadLegacyAssistantRecovery(identity: ChatIdentity) {
  if (typeof window === "undefined") return null;
  const key = legacyAssistantSessionKey(identity); if (!key) return null;
  try {
    const owner = sessionStorage.getItem(`${WORKSPACE_SESSION_PREFIX}owner`);
    if (!owner || !workspaceOwnerIsCurrent(owner)) return null;
    const raw = sessionStorage.getItem(`${WORKSPACE_SESSION_PREFIX}${key}`); if (!raw || raw.length > 400_000) return null;
    const envelope = JSON.parse(raw) as { value?: unknown; expiresAt?: unknown };
    if (typeof envelope.expiresAt !== "number" || !Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= Date.now() || envelope.expiresAt > Date.now() + 900_000) return null;
    if (identity.surface === "global") { const input = z.string().min(1).max(10_000).parse(envelope.value); return { expiresAt: envelope.expiresAt, ttlMs: envelope.expiresAt - Date.now(), input, model: "deepseek-v4-flash" as const, messages: [], interrupted: false }; }
    const value = session.parse(envelope.value);
    const text = z.object({ type: z.literal("text"), text: z.string().max(400_000) });
    const messages = value.messages.map(message => ({ ...message, parts: message.parts.flatMap(part => { const parsed = text.safeParse(part); return parsed.success ? [parsed.data] : []; }) }));
    return { ...value, messages, ttlMs: envelope.expiresAt - Date.now(), expiresAt: envelope.expiresAt };
  } catch { return null; }
}
export function retireLegacyAssistantRecovery(identity: ChatIdentity) {
  try { const key = legacyAssistantSessionKey(identity); if (key) sessionStorage.removeItem(`${WORKSPACE_SESSION_PREFIX}${key}`); } catch { /* Unavailable storage never blocks typing. */ }
  if (identity.surface === "global") try { localStorage.removeItem("personal-os:agent:draft:v1"); localStorage.removeItem("personal-os:agent:active-run:v1"); } catch { /* No old body is read or adopted. */ }
}

export function remainingLegacyAssistantLifetime(expiresAt: number) { return Math.max(0, expiresAt - Date.now()); }
