"use client";

import { useState } from "react";
import { removeDeepSeekKey, saveDeepSeekKey } from "@/features/ai/actions";

type Settings = { model: "deepseek-v4-flash" | "deepseek-v4-pro"; default_event_duration_minutes: number; updated_at: string } | null;

export function DeepSeekSettingsForm({ configured, settings }: { configured: boolean; settings: Settings }) {
  const [editing, setEditing] = useState(!configured);
  const model = settings?.model || "deepseek-v4-flash";
  const duration = settings?.default_event_duration_minutes || 30;
  return <section className="border-b pb-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">AI · DeepSeek</h2><p className="mt-2 text-sm leading-6 text-zinc-500">用于 Calendar、Tasks 和 Notes 的 AI 助手。</p>{configured && !editing ? <p className="mt-2 text-xs text-[#365F78]">已配置 · {model === "deepseek-v4-flash" ? "V4 Flash" : "V4 Pro"}</p> : null}</div>{configured && !editing ? <div className="flex gap-2"><button type="button" className="border px-3 py-2 text-sm" onClick={() => setEditing(true)}>调整设置</button><form action={removeDeepSeekKey}><button className="border px-3 py-2 text-sm">移除</button></form></div> : null}</div>{editing ? <form action={saveDeepSeekKey} className="mt-4 grid max-w-xl gap-3"><label className="grid gap-1 text-sm">DeepSeek API Key<input name="api_key" type="password" autoComplete="off" required={!configured} minLength={20} maxLength={500} placeholder={configured ? "留空则保持当前 Key" : "粘贴 DeepSeek API Key"} className="border bg-white px-3 py-2 text-sm" /></label><label className="grid gap-1 text-sm">模型<select name="model" defaultValue={model} className="border bg-white px-3 py-2 text-sm"><option value="deepseek-v4-flash">V4 Flash</option><option value="deepseek-v4-pro">V4 Pro</option></select></label><label className="grid gap-1 text-sm">默认日程时长<select name="default_event_duration_minutes" defaultValue={String(duration)} className="border bg-white px-3 py-2 text-sm">{[15, 30, 45, 60, 90, 120].map((minutes) => <option key={minutes} value={minutes}>{minutes} 分钟</option>)}</select></label><div className="flex gap-2"><button className="bg-[#365F78] px-3 py-2 text-sm text-white">保存</button>{configured ? <button type="button" className="border px-3 py-2 text-sm" onClick={() => setEditing(false)}>取消</button> : null}</div></form> : null}</section>;
}
