"use client";
import { useActionState } from "react";
import { loginAction, type LoginState } from "@/features/auth/actions";
const initial:LoginState={};
export default function Login(){const [state,action,pending]=useActionState(loginAction,initial);return <main className="grid min-h-screen place-items-center p-6"><form action={action} className="w-full max-w-sm space-y-5 border bg-white p-7"><h1 className="text-xl font-semibold">Personal OS</h1><p className="text-sm text-zinc-500">私人空间，仅限所有者登录。</p><label className="block text-sm">邮箱<input required name="email" type="email" className="mt-1 w-full border p-2"/></label><label className="block text-sm">密码<input required name="password" type="password" minLength={8} className="mt-1 w-full border p-2"/></label>{state.error&&<p role="alert" className="text-sm text-red-700">{state.error}</p>}<button disabled={pending} className="w-full bg-[#365F78] p-2 text-white">{pending?'正在登录…':'登录'}</button></form></main>}
