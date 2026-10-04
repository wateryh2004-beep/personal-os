import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import type { GatewayGrant, GatewayScope } from "@/features/content-gateway/contracts";

const connectionPath = "/settings/connections/codex";
const controlClass = "inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] px-4 py-2 text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";
const scopeDescriptions: Record<GatewayScope, string> = {
  "notes:read": "读取普通笔记",
  "notes:write": "创建和修订普通笔记，并保留版本历史",
  "interview:read": "读取面试问题与回答草稿",
  "interview:append": "追加口述回答草稿",
};

export type CodexConsentState =
  | { status: "ready"; requestId: string; clientName: string; scopes: GatewayScope[]; resource: string; expiresAt: string }
  | { status: "unavailable" | "invalid" | "expired" | "consumed" };

function timestamp(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}

function ConnectionLink() {
  return <Link href={connectionPath} className={`${controlClass} text-[var(--accent)] hover:underline`}>管理 Codex 授权</Link>;
}

export function CodexConsentView({ state }: { state: CodexConsentState }) {
  if (state.status !== "ready") {
    const notices = {
      unavailable: { title: "Codex 授权暂不可用", body: "连接服务尚未完成配置，或暂时无法读取授权请求。请完成服务器配置后，从 Codex 重新发起登录。" },
      invalid: { title: "无法确认这次授权请求", body: "请回到 Codex 重新发起登录，再打开新的授权页面。" },
      expired: { title: "授权请求已过期", body: "这次请求已失效。请回到 Codex 重新发起登录，再确认新的请求。" },
      consumed: { title: "授权请求已处理", body: "这次请求不能再次提交。如需重新连接，请回到 Codex 重新发起登录。" },
    };
    const notice = notices[state.status];
    return <div className="max-w-2xl space-y-6 text-base leading-7" data-testid="codex-consent-view">
      <PageHeader title={notice.title} />
      <p role="status" className="text-[var(--text-secondary)]">{notice.body}</p>
      <ConnectionLink />
    </div>;
  }

  return <div className="max-w-2xl space-y-6 text-base leading-7" data-testid="codex-consent-view">
    <PageHeader title="连接 Codex" />
    <p><strong className="font-semibold">{state.clientName}</strong> 请求访问你的 PersonalOS 内容。请逐项确认要允许的权限。</p>
    <form action="/api/oauth/decision" method="POST" className="space-y-6">
      <input type="hidden" name="request_id" value={state.requestId} />
      <fieldset className="space-y-2">
        <legend className="mb-3 font-semibold">本次申请的权限</legend>
        <p className="pb-2 text-[var(--text-secondary)]">可取消不需要的权限；允许连接时至少保留一项。</p>
        {state.scopes.map((scope) => <label key={scope} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--separator)] p-3 hover:bg-[var(--surface-control)]">
          <input type="checkbox" name="scope" value={scope} defaultChecked className="mt-1 size-5 shrink-0 accent-[var(--accent)]" />
          <span className="min-w-0"><span className="block">{scopeDescriptions[scope]}</span><span className="block break-all text-base text-[var(--text-secondary)]">{scope}</span></span>
        </label>)}
      </fieldset>
      <div className="space-y-2 border-y border-[var(--separator)] py-4 text-[var(--text-secondary)]">
        <p>授权有效期为 1 小时，不自动续期。到期后需要重新登录授权。</p>
        <p>普通笔记不包括标记为敏感或“永不供 AI 使用”的笔记。</p>
        <p>口述回答只会追加为草稿，采用前仍需你在 PersonalOS 中确认。</p>
        <p>你可以随时在连接设置中撤销授权。</p>
        <p className="break-all">连接目标：{state.resource}</p>
        <p>本次请求需在 <time dateTime={state.expiresAt}>{timestamp(state.expiresAt)} UTC</time> 前确认。</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="submit" name="decision" value="approve" className={`${controlClass} bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]`}>允许选中权限</button>
        <button type="submit" name="decision" value="deny" className={`${controlClass} border border-[var(--separator)] bg-[var(--surface)] hover:bg-[var(--surface-control)]`}>拒绝授权</button>
      </div>
    </form>
    <ConnectionLink />
  </div>;
}

export function CodexAuthorizationsView({ grants, available, configured, revokeAction, revokeError = false, now }: {
  grants: GatewayGrant[];
  available: boolean;
  configured: boolean;
  revokeAction: (formData: FormData) => Promise<void>;
  revokeError?: boolean;
  now: number;
}) {
  return <div className="max-w-2xl space-y-6 text-base leading-7" data-testid="codex-authorizations-view">
    <PageHeader title="Codex 连接" />
    <p className="text-[var(--text-secondary)]">在独立运行的 Codex 中发起 PersonalOS 登录，然后在浏览器逐项确认权限。每次授权有效期为 1 小时，不自动续期。</p>
    {!configured && <p role="status" className="rounded-[var(--radius-md)] border border-[var(--separator)] p-4">Codex 连接尚未完成服务器配置。已有授权仍可在这里撤销。</p>}
    {revokeError && <p role="alert" className="text-[var(--destructive)]">未能撤销授权。请刷新页面检查状态后重试。</p>}
    {!available ? <p role="status">暂时无法读取授权记录。请确认连接服务已完成配置后重试。</p> : grants.length === 0 ? <section className="border-y border-[var(--separator)] py-5"><h2 className="font-semibold">还没有 Codex 授权</h2><p className="mt-2 text-[var(--text-secondary)]">从 Codex 发起登录后，授权记录会显示在这里。</p></section> : <ul className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
      {grants.map((grant) => {
        const active = !grant.revokedAt && new Date(grant.expiresAt).getTime() > now;
        const status = grant.revokedAt ? "已撤销" : active ? "有效" : "已过期";
        return <li key={grant.id} className="space-y-3 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{grant.clientName}</h2><span className="text-[var(--text-secondary)]">{status}</span></div>
          <ul className="list-inside list-disc text-[var(--text-secondary)]">{grant.scope.map((scope) => <li key={scope}>{scopeDescriptions[scope]}（{scope}）</li>)}</ul>
          <p className="break-all text-[var(--text-secondary)]">连接目标：{grant.resource}</p>
          <p className="text-[var(--text-secondary)]">授权于 <time dateTime={grant.createdAt}>{timestamp(grant.createdAt)} UTC</time><br />到期于 <time dateTime={grant.expiresAt}>{timestamp(grant.expiresAt)} UTC</time></p>
          {grant.revokedAt && <p className="text-[var(--text-secondary)]">撤销于 <time dateTime={grant.revokedAt}>{timestamp(grant.revokedAt)} UTC</time></p>}
          {active && <form action={revokeAction}><input type="hidden" name="grant_id" value={grant.id} /><button type="submit" className={`${controlClass} border border-[var(--separator)] hover:bg-[var(--surface-control)]`}>撤销这次授权</button></form>}
        </li>;
      })}
    </ul>}
    <Link href="/settings" className={`${controlClass} text-[var(--accent)] hover:underline`}>返回设置</Link>
  </div>;
}
