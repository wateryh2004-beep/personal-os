// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { useChat } from "@ai-sdk/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireAssistantChat, submitAssistantChat, resetAssistantChat } from "@/features/assistant/client-chat-runtime";
import { getAiContinuitySnapshot } from "@/features/assistant/ai-continuity";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";

const encoder = new TextEncoder();
let controller: ReadableStreamDefaultController<Uint8Array>;
function sse(value: object | "done") { controller.enqueue(encoder.encode(value === "done" ? "data: [DONE]\n\n" : `data: ${JSON.stringify(value)}\n\n`)); }
function begin() { sse({ type: "start", messageId: "answer" }); sse({ type: "text-start", id: "text" }); }
function finish() { sse({ type: "text-end", id: "text" }); sse({ type: "finish", finishReason: "stop" }); sse("done"); controller.close(); }
const tick = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { clearWorkspaceResources(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });

describe("installed SDK external engine continuity", () => {
  it("continues real HTTP/SSE after unmount and remounts the exact same result without resend", async () => {
    const fetcher = vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } }));
    vi.stubGlobal("fetch", fetcher);
    const entry = acquireAssistantChat({ surface: "global" });
    function View() { const { messages } = useChat({ chat: entry.chat }); return <p>{messages.flatMap(value => value.parts.map(part => part.type === "text" ? part.text : "")).join("")}</p>; }
    await act(async () => root.render(<View />));
    let pending!: Promise<boolean>;
    await act(async () => { pending = submitAssistantChat(entry, { text: "hello", currentPath: "/today" }); await tick(); begin(); sse({ type: "text-delta", id: "text", delta: "First" }); await tick(); });
    expect(host.textContent).toContain("First");
    await act(async () => root.unmount());
    sse({ type: "text-delta", id: "text", delta: " and final" }); finish();
    await expect(pending).resolves.toBe(true);
    root = createRoot(host);
    await act(async () => root.render(<View />));
    expect(host.textContent).toContain("First and final");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(getAiContinuitySnapshot()[0]).toMatchObject({ status: "succeeded", target: { kind: "chat", identity: { surface: "global" } } });
  });
  it("does not turn an SDK fulfilled sendMessage error into success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"error":"not available"}', { status: 503 })));
    const entry = acquireAssistantChat({ surface: "global" });
    await expect(submitAssistantChat(entry, { text: "hello", currentPath: "/today" })).resolves.toBe(false);
    expect(entry.chat.status).toBe("error");
    expect(entry.view.outcome).toBe("failed");
    expect(entry.view.lastFailedText).toBe("hello");
    expect(getAiContinuitySnapshot()[0].status).toBe("failed");
  });
  it("freezes model, path and entity before the first ensure-run await", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    let release!: (response: Response) => void;
    let submitted: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/assistant/runs") return new Promise<Response>(resolve => { release = resolve; });
      if (url.startsWith("/api/assistant/runs/")) return Response.json({ run: { surface: "tasks", current_entity_type: null, current_entity_id: null }, messages: [], steps: [], actions: [] });
      submitted = JSON.parse(String(options?.body));
      return new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; begin(); finish(); } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
    }));
    const entry = acquireAssistantChat({ surface: "tasks" });
    const input = { text: "hello", model: "deepseek-v4-flash" as const, currentPath: "/tasks", currentEntity: null };
    const request = submitAssistantChat(entry, input);
    input.currentPath = "/calendar";
    release(Response.json({ runId: id }));
    expect(await request).toBe(true);
    expect(submitted).toMatchObject({ surface: "tasks", model: "deepseek-v4-flash", currentPath: "/tasks", currentEntity: null, runId: id });
  });
  it("keeps Career engines isolated by experience and resets without resurrecting an older generation", () => {
    const a = acquireAssistantChat({ surface: "career", experienceId: "11111111-1111-4111-8111-111111111111" });
    const b = acquireAssistantChat({ surface: "career", experienceId: "22222222-2222-4222-8222-222222222222" });
    a.chat.messages = [{ id: "a", role: "assistant", parts: [{ type: "text", text: "A only" }] }];
    expect(b.chat.messages).toEqual([]);
    expect(acquireAssistantChat(a.identity)).toBe(a);
    resetAssistantChat(a);
    expect(a.chat.messages).toEqual([]);
    expect(a.view.generation).toBe(1);
  });
});

it("keeps real SDK partial output at 18.5s timeout and reconciles a late server proposal before any resend", async () => {
  vi.useFakeTimers();
  try {
    const runId = "11111111-1111-4111-8111-111111111111";
    let state = "running";
    const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
      if (url === "/api/assistant/runs") return Response.json({ runId });
      if (url.startsWith("/api/assistant/runs/")) return Response.json({ run: { id: runId, surface: "tasks", status: state, generation_expires_at: new Date(Date.now() + 45_000).toISOString() }, messages: [], steps: [], actions: state === "awaiting_approval" ? [{ id: "proposal", status: "proposed" }] : [] });
      return new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; options?.signal?.addEventListener("abort", () => value.error(new DOMException("Aborted", "AbortError")), { once: true }); } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
    });
    vi.stubGlobal("fetch", fetcher);
    const entry = acquireAssistantChat({ surface: "tasks" });
    const pending = submitAssistantChat(entry, { text: "帮我创建任务买牛奶", currentPath: "/tasks" });
    await vi.advanceTimersByTimeAsync(0); begin(); sse({ type: "text-delta", id: "text", delta: "已准备部分结果" }); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(18_499); expect(entry.view.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(1); await expect(pending).resolves.toBe(false);
    expect(entry.view.outcome).toBe("interrupted"); expect(JSON.stringify(entry.chat.messages)).toContain("已准备部分结果");
    await expect(submitAssistantChat(entry, { text: "帮我创建任务买牛奶", currentPath: "/tasks" })).resolves.toBe(false);
    expect(entry.view.outcome).toBe("needs-check");
    state = "awaiting_approval";
    await expect(submitAssistantChat(entry, { text: "帮我创建任务买牛奶", currentPath: "/tasks" })).resolves.toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => url === "/api/assistant")).toHaveLength(1);
    expect(entry.view.run?.actions[0].id).toBe("proposal");
    expect(entry.view.lastFailedText).toBe("帮我创建任务买牛奶");
  } finally { vi.useRealTimers(); }
});
it("aborts the actual SDK stream on owner eviction and cannot publish old output into a replacement engine", async () => {
  const fetcher = vi.fn(async (_url: string, options?: RequestInit) => new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; options?.signal?.addEventListener("abort", () => value.error(new DOMException("Aborted", "AbortError")), { once: true }); } }), { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } }));
  vi.stubGlobal("fetch", fetcher);
  const old = acquireAssistantChat({ surface: "global" }); const request = submitAssistantChat(old, { text: "owner A", currentPath: "/today" });
  await tick(); begin(); sse({ type: "text-delta", id: "text", delta: "A private partial" }); await tick();
  clearWorkspaceResources(); await request;
  const next = acquireAssistantChat({ surface: "global" }); expect(next).not.toBe(old); expect(next.chat.messages).toEqual([]); expect(old.current()).toBe(false); expect(getAiContinuitySnapshot()).toEqual([]);
});
it("restores the exact requested shorter historical run instead of keeping a longer unrelated transcript",async()=>{const {refreshAssistantChatRun}=await import("@/features/assistant/client-chat-runtime");const entry=acquireAssistantChat({surface:"global"});entry.view={...entry.view,runId:"11111111-1111-4111-8111-111111111111"};entry.chat.messages=[{id:"new-a",role:"user",parts:[{type:"text",text:"Unrelated newer question"}]},{id:"new-b",role:"assistant",parts:[{type:"text",text:"Unrelated newer answer"}]}];const fetcher=vi.fn(async()=>Response.json({run:{surface:"global",current_entity_type:null,current_entity_id:null},messages:[{id:"old",role:"assistant",parts:[{type:"text",text:"Exact older answer"}]}],steps:[],actions:[]}));vi.stubGlobal("fetch",fetcher);await refreshAssistantChatRun(entry,"22222222-2222-4222-8222-222222222222");expect(entry.chat.messages).toHaveLength(1);expect(JSON.stringify(entry.chat.messages)).toContain("Exact older answer");expect(JSON.stringify(entry.chat.messages)).not.toContain("Unrelated");expect(fetcher).toHaveBeenCalledTimes(1);});
