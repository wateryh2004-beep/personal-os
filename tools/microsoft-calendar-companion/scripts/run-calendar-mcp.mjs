import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const companionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = process.env.PERSONAL_OS_MS365_DATA_DIR
  || join(homedir(), "Library", "Application Support", "Life of HANG", "microsoft-calendar");
const logDir = join(dataRoot, "logs");
const tokenDir = join(dataRoot, "tokens");

mkdirSync(logDir, { recursive: true, mode: 0o700 });
mkdirSync(tokenDir, { recursive: true, mode: 0o700 });

const commandArgs = process.argv.slice(2);
const permittedCommands = new Set([
  "--list-permissions",
  "--login",
  "--verify-login",
  "--list-accounts",
  "--logout",
]);

if (commandArgs.length > 1 || (commandArgs.length === 1 && !permittedCommands.has(commandArgs[0]))) {
  console.error("Unsupported command. Use npm run permissions|login|verify|accounts|start|logout.");
  process.exit(2);
}

const serverEntrypoint = join(
  companionRoot,
  "node_modules",
  "@softeria",
  "ms-365-mcp-server",
  "dist",
  "index.js",
);

const result = spawnSync(process.execPath, [
  serverEntrypoint,
  "--preset", "calendar",
  "--allowed-scopes", "User.Read Calendars.ReadWrite offline_access",
  ...commandArgs,
], {
  env: {
    ...process.env,
    // Personal Microsoft accounts need `consumers`; using `common` can cause
    // refresh tokens from the bundled public client to fail after about an hour.
    MS365_MCP_TENANT_ID: "consumers",
    MS365_MCP_LOG_DIR: logDir,
    // The upstream server uses macOS Keychain through keytar when available.
    // These are a private, mode-0600 fallback only if Keychain is unavailable.
    MS365_MCP_TOKEN_CACHE_PATH: join(tokenDir, "token-cache.json"),
    MS365_MCP_SELECTED_ACCOUNT_PATH: join(tokenDir, "selected-account.json"),
  },
  stdio: "inherit",
});

if (result.error) {
  console.error("Unable to start the local Microsoft Calendar Companion.");
  process.exit(1);
}

process.exit(result.status ?? 1);
