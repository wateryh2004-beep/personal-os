import { requireOwner } from "@/lib/auth/require-owner";
import { AppShell } from "@/components/layout/app-shell";
export default async function AppLayout({children}:{children:React.ReactNode}){const {email}=await requireOwner();return <AppShell email={email}>{children}</AppShell>}
