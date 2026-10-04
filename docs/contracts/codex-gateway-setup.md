# Independent Codex login: scoped MCP gateway

## Current state

The code proposal implements a dedicated OAuth authorization-code flow using `@node-oauth/oauth2-server` 5.3.0 and a native MCP endpoint using `@modelcontextprotocol/server` 2.3.0. PostgreSQL access uses `pg` 8.23.1. Versions are pinned with the lockfile. This is not a live connection until the separately reviewed database, hosting and owner-consent steps below are completed.

The feature is off by default. No password, login role credential, OAuth grant, production migration or external-client configuration is created by building or deploying the code alone. There is no owner Supabase JWT custody, token copying from a browser, service-role substitution, or password/OTP grant.

## User flow

1. Configure Codex with the public MCP URL and pre-registered public client ID
2. Run Codex's ordinary MCP login command
3. The browser opens PersonalOS. If needed, the existing owner signs in normally; the OAuth request is preserved across login
4. The browser lists exactly the requested permissions and one-hour expiration. The user may reduce permissions, approve, or deny
5. Codex exchanges the one-use code with S256 PKCE and receives an opaque access token. It is not a Supabase token and cannot authenticate direct Data API table calls
6. The owner can revoke access under Settings → Codex connection. Every content operation revalidates revocation inside its database transaction

This initial release issues no refresh token. Access expires within one hour of approval; another login requires another browser confirmation. Codex handles its own local OAuth credential storage under its configuration. We do not write or read its credential files.

The supported bootstrap commands, after activation, are:

```sh
codex mcp add personalos --url https://YOUR_PERSONALOS_ORIGIN/api/mcp --oauth-client-id personalos-codex
codex mcp login personalos --scopes notes:read,notes:write,interview:read,interview:append
```

Verify the actual callback displayed by the installed Codex version. This server supports the registered `http://127.0.0.1/callback` path with a varying numeric loopback port only. It advertises issuer-bound authorization responses and returns the exact issuer. The user's computer must be connected or the user must run these commands themselves; code preparation in a cloud workspace does not configure a disconnected local Codex installation.

Official sources: [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli), [OpenAI OAuth requirements](https://developers.openai.com/plugins/build/auth), [node-oauth 5.3.0 security release](https://github.com/node-oauth/node-oauth2-server/releases/tag/v5.3.0), [MCP HTTP integration](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/http.md).

## Actual authorization scope

- `notes:read`: bounded title search and selected ordinary Note bodies/revisions/source history. Sensitive, never-AI, deleted and archived notes are excluded
- `notes:write`: create chosen Markdown or revise an existing ordinary Note with expected revision/timestamp and retained history
- `interview:read`: bounded question/preparation lookup and selected answer/version metadata
- `interview:append`: append a spoken-answer draft to the same preparation/variant using expected version/base checks

No deletion, current-answer promotion, mastery marking, arbitrary SQL, arbitrary table access, external messaging, document-file export, or unrelated PersonalOS domains are offered. Authorship and original/curated capture labels remain explicit; transport identity does not establish factual truth. The registered client controls the source identity; external input cannot select another owner or client.

## Protocol and storage

- Issuer: exact HTTPS `APP_URL`, never Host/forwarded-header derived
- Resource/audience: `${APP_URL}/api/mcp`
- Public client: `personalos-codex`, authentication method `none`; no dynamic registration or client secret
- Required `response_type=code`, nonempty state, S256 challenge, exact resource and allowed scope subset
- Request-bound HttpOnly/Secure/SameSite=Lax consent nonce; owner session and same-origin POST required
- Code lifetime: five minutes; single-use consumption, including failed PKCE as implemented by the maintained library
- Access grant: at most one hour from owner approval; raw random credentials returned once, hashes stored
- Revocation synchronizes with content operations using grant-level transaction locks; completed writes are not retroactively undone
- Token errors expose no SQL, credentials or internal state. Public protocol paths have exact proxy exceptions; protected consent and revocation management do not

## Database proposal and security gates

`content-gateway.sql` prepares three **NOLOGIN** roles (`content_gateway_runtime`, `content_gateway_auth_owner`, `content_gateway_executor`), two unexposed schemas, five auth-state tables, bounded routines and scoped RLS/ACLs. The runtime role can execute only selected routines and has no content table access or authenticated/service-role membership. The non-login executor is NOBYPASSRLS and owns no business tables. Its privilege set includes the existing Notes search-index and Interview readiness-trigger dependencies.

The existing `public.write_content(jsonb)` remains the canonical atomic writer. The bridge derives identity from a validated grant, enforces scope/resource/expiry/revocation, installs transaction-local identity only for that operation, and restores it afterward. Caller-provided user IDs are never accepted.

**Preflight fails closed** if the runtime inherits unsafe PUBLIC table/definer, database CREATE/TEMP, or schema CREATE privileges. Revoking a grant from one role cannot negate PUBLIC privileges. Any needed compatibility-preserving PUBLIC ACL adjustment must be reviewed and approved explicitly; the proposal does not silently rewrite unrelated ACLs. Every new privileged routine uses a safe search path and has default PUBLIC execution revoked.

## Exact activation approvals, kept separate

1. Review and approve installation of the canonical content transaction and gateway schema/roles/functions/RLS on the named production database
2. Review any inherited PUBLIC privilege blocker and its precise compatibility plan before changing that ACL
3. Provision a credential for `content_gateway_runtime` and enable its LOGIN only after explicit approval. Keep the secret in hosting's server-only configuration; never put it in chat, Git, shell arguments, client bundles or Codex. Do not substitute postgres/service_role credentials
4. Register the exact owner UUID, client ID, callback policy, HTTPS audience, allowed scopes and one-hour lifetime, then enable the registry row
5. Configure exact `APP_URL`, server-only `CONTENT_GATEWAY_DATABASE_URL` (dedicated role, verified TLS), and `CONTENT_GATEWAY_ENABLED=true` in the approved deployment
6. Configure the intended Codex installation and let the user complete the actual browser consent. Generic prior approval is not a substitute for this access-grant confirmation

## Verification and rollback

Mock protocol tests exercise the maintained OAuth engine, PKCE, code reuse, resource/redirect/scope rejection, state preservation, no refresh leakage, expiry and error redaction. MCP tests use the actual SDK and prove narrow tool discovery and per-operation reauthorization. UI fixtures are synthetic and suppress real submission. These are not evidence of a live user login.

The gateway's isolated SQL assertion suite is `tests/database/content-gateway.sql`; its role/schema/ACL test must be explicitly approved and run only against the verified validation database, in a transaction ending ROLLBACK. Capture before/after ACLs as well as zero residual roles, schemas, users and grants. Live PostgreSQL, concurrency, real Codex callback exchange and production credential setup remain distinct gates until actually verified.

`content-gateway-rollback.sql` is a separately reviewed rollback proposal. Disable the feature first and revoke grants before removing its private auth machinery; preserve Notes, Interview answers, versions and audit history. Never use CASCADE to erase unexpected dependencies. Restoring an altered PUBLIC ACL requires its separately captured baseline and approval.
