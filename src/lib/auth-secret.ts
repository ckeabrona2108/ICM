const DEV_FALLBACK_SECRET = "icm-dev-nextauth-secret-change-me";

// Values that are public (in the repo) and therefore let anyone forge a session cookie.
const KNOWN_PUBLIC_SECRETS = new Set([DEV_FALLBACK_SECRET, "replace_with_long_secret"]);

/**
 * The NextAuth secret signs every session cookie, including the admin role inside it.
 * Outside production a fixed fallback keeps local setup simple; in production a missing or
 * publicly known secret returns undefined, so NextAuth refuses to sign or read sessions
 * instead of silently accepting cookies anyone could forge.
 */
export function resolveNextAuthSecret(env: Record<string, string | undefined> = process.env): string | undefined {
  const configured = env.NEXTAUTH_SECRET?.trim();
  const isProduction = env.NODE_ENV === "production";

  if (configured && !(isProduction && KNOWN_PUBLIC_SECRETS.has(configured))) return configured;
  if (!isProduction) return DEV_FALLBACK_SECRET;

  console.error(
    configured
      ? "[auth] NEXTAUTH_SECRET is a publicly known placeholder; sessions are disabled until it is replaced"
      : "[auth] NEXTAUTH_SECRET is not set; sessions are disabled until it is configured"
  );
  return undefined;
}
