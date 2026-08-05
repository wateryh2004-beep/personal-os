# Microsoft Calendar Companion

This is a local-only Calendar bridge for Life of HANG. It wraps the audited,
version-pinned `@softeria/ms-365-mcp-server@0.136.0`; it is **not** part of the
Next.js app and must never run on Vercel.

## Security boundary

- It enables only the upstream `calendar` preset.
- It limits the effective Graph scopes to `User.Read` and
  `Calendars.ReadWrite`; `offline_access` allows the local MSAL client to renew
  its own session.
- It forces the `consumers` authority for personal Microsoft accounts.
- Tokens are never sent to Supabase, Vercel, or Git. The upstream package uses
  macOS Keychain when possible. If Keychain is unavailable, its fallback files
  live under `~/Library/Application Support/Life of HANG/microsoft-calendar/`
  with private permissions.
- Do not add mail, files, contacts, or task scopes to this program.

## First-run validation

From this directory:

```bash
npm ci
npm run permissions
npm run login
```

`npm run login` displays a Microsoft Device Code. Open the Microsoft URL shown
in the terminal and enter the code yourself. Never paste a password, device
code, access token, or refresh token into chat, Git, or a `.env` file.

After approval:

```bash
npm run verify
npm run accounts
```

The command output must show one intended personal account. Do not create or
edit events yet: the next verification step must use a dedicated test calendar
and an explicit create/update/delete plan.

## MCP process

`npm run start` starts a stdio MCP process intended for a future local Personal
OS companion, not for Vercel. It has no network listener and opens no inbound
port. Stop it with `Ctrl+C`.

To revoke this local connection, first revoke the app in your Microsoft account
privacy/security settings, then run:

```bash
npm run logout
```

## Updating

Do not run `npx -y` or update the dependency automatically. Review the upstream
release, update `package.json` intentionally, regenerate `package-lock.json`,
review the diff, and repeat the permission check before accepting a new version.
