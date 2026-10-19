import React, { useSyncExternalStore } from "react";
export default function Link({ href, children, prefetch, ...props }) { return <a href={href} data-prefetch={prefetch || undefined} {...props}>{children}</a>; }
const listeners = new Set();
for (const method of ["pushState", "replaceState"]) { const original = history[method].bind(history); history[method] = (...args) => { original(...args); listeners.forEach(listener => listener()); }; }
window.addEventListener("popstate", () => listeners.forEach(listener => listener()));
export function useSearchParams() { const raw=useSyncExternalStore(listener => { listeners.add(listener);return () => listeners.delete(listener); }, () => location.search); return new URLSearchParams(raw); }
export function usePathname() { return location.pathname; }
export function unstable_rethrow() {}
export function useRouter() { return { refresh() {} }; }
export async function submitCareerForm(action, form) { if (form.get("title") === "失败测试") return { status:"error",message:"合成保存失败，输入保留。" }; return { status:"success",message:action }; }

export async function createInterviewQuestion() { throw new Error("隔离预览不执行真实保存"); }

export async function createPracticeAttempt() { throw new Error("合成保存失败，无真实写入"); }
export function notFound() { throw new Error("合成详情不存在"); }
export async function createInterviewStory() { throw new Error("合成创建失败，无真实写入"); }
export async function updateInterviewStory() { throw new Error("合成保存失败，无真实写入"); }
export async function archiveInterviewStory() { throw new Error("合成归档失败，无真实写入"); }
