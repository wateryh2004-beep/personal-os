# External authoring authentication options

Reviewed against official Supabase documentation and changelog on 2026-10-04. This is a design comparison, not enabled authentication or a production configuration change. The content transaction and its isolated database tests are separate rollout gates; see [external-content.md](./external-content.md).

## Recommendation

Keep the existing verified owner-cookie flow for the current pilot. For an independently authenticated Codex/Claude CLI, separately decide both identity/access boundaries and how to enforce transaction-only writes. OAuth with client-aware RLS can restrict domains, but does not alone enforce the content RPC's concurrency/history rules. Do not make email OTP the default merely because it is quicker: its access token carries the owner's ordinary database privileges.

No option here authorizes requesting email, creating clients/grants, changing templates/SMTP/signing keys, issuing credentials, or granting persistent access. No external-auth CLI or bearer acceptance has been implemented by this proposal.

## 1. Existing authorized browser session: smallest current option

Use the already authenticated PersonalOS browser and supported same-origin application flow for an explicitly selected content operation. Keep the existing owner verification, RLS, JSON validation, origin checks and atomic content RPC. Do not export cookies, extract tokens for a shell, or introduce a service-role key.

This reuses the user's current session; it does not independently connect an external CLI. A machine without an authorized authenticated browser remains unconnected. The user signs in through the normal application when needed. Browser automation and any actual content submission must be authorized for that operation. This is a PersonalOS architectural recommendation based on the current cookie-only boundary, not a Supabase CLI feature.

## 2. OAuth public client + client-aware RLS: separate integration candidate

Supabase's OAuth 2.1 server is currently beta. Setup requires enabling it, configuring Site URL and an authorization path, building an authenticated consent UI, and registering a public client with exact redirect URIs and token endpoint authentication method `none`. Public clients have no embedded client secret. The consent UI uses `auth.oauth.getAuthorizationDetails`, `approveAuthorization` and `denyAuthorization`. [Official setup](https://supabase.com/docs/guides/auth/oauth-server/getting-started)

Use authorization code with PKCE and validated state. The client goes to `/auth/v1/oauth/authorize` and exchanges its code at `/auth/v1/oauth/token`; Supabase performs issuance. The external-client OAuth flow is distinct from `signInWithOAuth`, which signs users in with upstream identity providers. Decide explicitly whether refresh-token retention is allowed. [Official OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows)

**OAuth alone does not reduce data access.** Current scopes are `openid`, `email`, `profile` and `phone`; custom scopes are unsupported. These scopes govern identity information, not content permissions. Access JWTs otherwise have normal user access plus `client_id`. A claimed `content:write` scope would be misleading. [Available scopes](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows#available-scopes)

Before enabling this client:

- Define allowed content tables, columns and operations, including sensitive/archived exclusions and history/receipt access
- Restrict every exposed table, view and RPC available to that client; an API owner check cannot prevent direct Data API use
- Separate ordinary owner policies with `client_id IS NULL`, or add appropriate restrictive policies. Merely adding a narrower permissive policy leaves broader policies effective
- Require verified owner identity and the approved `client_id`; preserve the current SECURITY INVOKER design unless a separate redesign is approved. Do not authorize from user-editable metadata
- Test direct table/RPC requests, unrelated-domain denial, guessed IDs, cross-owner access, archived/private records, refresh and revocation before rollout

The SQL policy examples and `auth.jwt() ->> 'client_id'` mechanism are documented in [Token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security). This requires a security review of existing owner-wide access, not just a new login screen.

### Domain restriction does not imply transaction-only writes

PostgreSQL runs a SECURITY INVOKER function with the caller's privileges. Its successful table writes therefore require the caller's underlying permissions and applicable RLS policies. [Function security](https://www.postgresql.org/docs/current/sql-createfunction.html) If those tables remain exposed, the same JWT can make direct PostgREST writes wherever those grants/policies allow. Restricting the client to Notes/Interview does not force it to invoke `write_content`; direct updates can bypass CAS, history snapshots and receipts implemented only inside that function. This is an architectural consequence, not a demonstrated production exploit. [Data API grants and RLS](https://supabase.com/docs/guides/api/securing-your-api)

Two designs to assess before claiming transaction-only external writes:

- **Scoped gateway with server-held owner session:** expose only bounded content commands under a separate, revocable gateway authorization. The external client must not receive a usable owner Supabase JWT; the gateway maps its approved authorization to the server-held owner session and invokes the existing atomic RPC. A gateway that merely forwards a client-held owner JWT does not close the bypass. This retains the invoker design but introduces credential custody, session renewal/expiry, consent, confused-deputy protections and a separate authorization boundary. Secure storage or browser-mediated short-lived session use needs explicit design and approval; no service-role substitution
- **Narrow audited SECURITY DEFINER RPC:** give a distinct client database role only the necessary schema usage and function execution, with no underlying table grants. The function must explicitly validate non-null `auth.uid()`, approved owner/client identity, record ownership and all input/CAS/history rules. Use a minimally privileged function owner, fixed safe `search_path`, schema-qualified relations, no uncontrolled dynamic SQL, and revoke default PUBLIC execution before selective grants. Definer ownership can bypass RLS, so ordinary owner policies cannot substitute for these checks. This changes the current invoker design and is not approved. [Supabase function guidance](https://supabase.com/docs/guides/database/functions)

Grants apply to database roles, not individual `client_id` values. If browser and OAuth sessions both use `authenticated`, revoking table grants affects both; an execute-only client needs a separately reviewed role/claim/privilege arrangement. [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html) Whichever design is chosen, test that raw table writes with the external client's actual credential fail while the intended atomic command succeeds. OAuth/RLS-only coverage is insufficient evidence.

## 3. Email OTP: temporary full-owner session, not recommended default

Email/password users can use the same enabled email provider. Request with `signInWithOtp({ email, options: { shouldCreateUser: false } })`, then `verifyOtp({ email, token, type: 'email' })`. Never request a code automatically. However, `signInWithOtp` sends a magic link by default: a numeric-code flow requires the Magic Link template to contain `{{ .Token }}`. Working password login does not prove OTP email/template readiness. [Passwordless email guide](https://supabase.com/docs/guides/auth/auth-email-passwordless)

Default SMTP sends only to project-team addresses and is currently limited to two messages per hour; production use requires suitable SMTP delivery. [SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp) New Free projects created from June 3, 2026 cannot customize default-SMTP templates; paid plans, earlier projects and custom-SMTP projects have different eligibility. [Template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)

If separately approved, a single-run CLI could use `persistSession: false`, `autoRefreshToken: false`, `detectSessionInUrl: false`, terminal-only user input, HTTPS with redirects refused, and no credentials in arguments/logs/files. [Client options](https://supabase.com/docs/reference/javascript/initializing) But verification still issues access and refresh tokens and creates a server session. Discarding refresh material only prevents this client from renewing; it does not narrow privileges or prove server-session revocation. JWT lifetime is project-configured, normally one hour. [Session semantics](https://supabase.com/docs/guides/auth/sessions)

Implementation trap: the installed SDK stores the complete session in memory even with `persistSession: false`. Dropping the returned refresh-token field is insufficient while the auth client remains alive. Any future implementation must account for that lifecycle and must not claim guaranteed memory erasure.

## Future bearer boundary, only after approval

Use the project's public key and validate the supplied JWT with `auth.getUser(jwt)` for a fresh server-confirmed user record, plus owner authorization. [getUser](https://supabase.com/docs/reference/javascript/auth-getuser) `auth.getClaims(jwt)` verifies JWTs, locally for asymmetric keys or through Auth for symmetric keys; enforce expected issuer/audience/expiry and approved client identity before using claims. [getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims) Do not authorize from a decoded-only token or `getSession()` user object. Claim validation alone does not establish that a session was not subsequently revoked. [Server-side guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide)

For a design retaining SECURITY INVOKER, forward the appropriately authorized user's access token to that operation, subject to the transaction-only boundary above. Keep content validation, concurrency checks, audit receipts and no-store responses. Never substitute a service-role token. These are future requirements; the current API remains cookie-only.
