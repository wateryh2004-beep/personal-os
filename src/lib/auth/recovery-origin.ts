export type RecoveryOriginInput = {
  configuredAppUrl?: string;
  vercelEnv?: string;
  vercelProjectProductionUrl?: string;
  vercelUrl?: string;
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
};

function toOrigin(value: string | null | undefined, defaultScheme = "https") {
  const raw = value?.trim().replace(/\/$/, "");
  if (!raw) return undefined;

  try {
    const url = new URL(raw.includes("://") ? raw : `${defaultScheme}://${raw}`);
    return url.origin;
  } catch {
    return undefined;
  }
}

function isLoopbackOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

/**
 * Recovery emails must never point at a developer machine from a production
 * deployment. Prefer an explicitly configured non-loopback APP_URL, otherwise
 * use Vercel's canonical production domain, then the trusted forwarded host.
 */
export function resolveRecoveryOrigin(input: RecoveryOriginInput) {
  const isProduction = input.vercelEnv === "production";
  const configured = toOrigin(input.configuredAppUrl);

  if (configured && (!isProduction || !isLoopbackOrigin(configured))) {
    return configured;
  }

  const vercelProduction = toOrigin(input.vercelProjectProductionUrl);
  if (vercelProduction) return vercelProduction;

  const requestHost = input.forwardedHost ?? input.host;
  if (requestHost) {
    const proto = input.forwardedProto
      ?? (requestHost.startsWith("localhost") || requestHost.startsWith("127.0.0.1") ? "http" : "https");
    const requestOrigin = toOrigin(`${proto}://${requestHost}`, proto);
    if (requestOrigin && (!isProduction || !isLoopbackOrigin(requestOrigin))) {
      return requestOrigin;
    }
  }

  const deploymentOrigin = toOrigin(input.vercelUrl);
  if (deploymentOrigin && (!isProduction || !isLoopbackOrigin(deploymentOrigin))) {
    return deploymentOrigin;
  }

  return isProduction ? undefined : configured;
}
