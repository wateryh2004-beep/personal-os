import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { isOwnerEmail } from "@/lib/auth/owner";
import { LoginForm } from "./login-form";
export default async function Login(){if(isSupabaseConfigured){const client=await createClient();const {data}=await client.auth.getClaims();if(isOwnerEmail(data?.claims.email as string|undefined)) redirect('/today')}return <main className="grid min-h-screen place-items-center p-6"><LoginForm/></main>}
