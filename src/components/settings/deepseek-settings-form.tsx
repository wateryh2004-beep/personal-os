"use client";

import { useState } from "react";
import { removeDeepSeekKey, saveDeepSeekKey } from "@/features/ai/actions";

export function DeepSeekSettingsForm({ configured, updatedAt }: { configured: boolean; updatedAt?: string }) {
  const [editing, setEditing] = useState(!configured);
  return <section className="border-b pb-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-medium">AI · DeepSeek</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-500">API Key 只在提交时通过加密连接发送到服务端，之后不会显示或返回浏览器。Calendar 助手只会在你发起对话时把必要的日历查询结果发送给 DeepSeek。</p>{configured && !editing ? <p className="mt-2 text-xs text-[#365F78]">已配置 · 模型：DeepSeek V4 Flash{updatedAt ? ` · 更新于 ${new Date(updatedAt).toLocaleDateString("zh-CN")}` : ""}</p> : null}</div>{configured && !editing ? <div className="flex gap-2"><button type="button" className="border px-3 py-2 text-sm" onClick={() => setEditing(true)}>更换 Key</button><form action={removeDeepSeekKey}><button className="border px-3 py-2 text-sm">移除</button></form></div> : null}</div>{editing ? <form action={saveDeepSeekKey} className="mt-4 flex max-w-xl flex-wrap gap-2"><label className="sr-only" htmlFor="deepseek-api-key">DeepSeek API Key</label><input id="deepseek-api-key" name="api_key" type="password" autoComplete="off" required minLength={20} maxLength={500} placeholder="粘贴 DeepSeek API Key" className="min-w-0 flex-1 border bg-white px-3 py-2 text-sm" /><button className="bg-[#365F78] px-3 py-2 text-sm text-white">加密保存</button>{configured ? <button type="button" className="border px-3 py-2 text-sm" onClick={() => setEditing(false)}>取消</button> : null}</form> : null}</section>;
}
