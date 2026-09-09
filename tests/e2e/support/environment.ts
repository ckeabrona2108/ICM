import path from "node:path";

export type CommunityActorName = "A" | "B" | "C";

export type CommunityActorCredentials = {
  email: string;
  password: string;
};

type CommunityE2EEnvironment = {
  allow: "1";
  databaseUrl: string;
  storageRoot: string;
};

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[community-e2e] ${name} is required; refusing to use an implicit/shared environment.`);
  }
  return value;
}

function databaseName(databaseUrl: URL): string {
  return decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ""));
}

export function communityE2EBaseUrl(): string {
  const raw = requiredEnvironmentValue("E2E_BASE_URL");
  const url = new URL(raw);
  if (url.protocol !== "http:") {
    throw new Error("[community-e2e] E2E_BASE_URL must use http:// for a local disposable app.");
  }
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("[community-e2e] E2E_BASE_URL must target localhost; remote applications are forbidden.");
  }
  if (!url.port) {
    throw new Error("[community-e2e] E2E_BASE_URL must contain an explicit isolated port.");
  }
  return url.href.replace(/\/$/u, "");
}

export function assertCommunityE2EEnvironment(): CommunityE2EEnvironment {
  const allow = requiredEnvironmentValue("COMMUNITY_E2E_ALLOW");
  if (allow !== "1") {
    throw new Error("[community-e2e] COMMUNITY_E2E_ALLOW=1 is required.");
  }
  if (requiredEnvironmentValue("E2E_DISPOSABLE_DATABASE") !== "1") {
    throw new Error("[community-e2e] E2E_DISPOSABLE_DATABASE=1 is required.");
  }
  if (requiredEnvironmentValue("E2E_DISPOSABLE_STORAGE") !== "1") {
    throw new Error("[community-e2e] E2E_DISPOSABLE_STORAGE=1 is required.");
  }

  const databaseUrlValue = requiredEnvironmentValue("DATABASE_URL");
  const parsedDatabaseUrl = new URL(databaseUrlValue);
  const name = databaseName(parsedDatabaseUrl);
  if (!/(?:^|[_-])e2e(?:[_-]|$)/iu.test(name)) {
    throw new Error(`[community-e2e] Disposable database name must contain an e2e segment; received ${JSON.stringify(name)}.`);
  }

  const storageRoot = path.resolve(requiredEnvironmentValue("E2E_STORAGE_ROOT"));
  if (!/(?:^|[\\/._-])e2e(?:[\\/._-]|$)/iu.test(storageRoot)) {
    throw new Error("[community-e2e] E2E_STORAGE_ROOT must be a run-specific path containing an e2e segment.");
  }

  communityE2EBaseUrl();
  requiredEnvironmentValue("NEXTAUTH_SECRET");
  for (const actor of ["A", "B", "C"] as const) {
    communityActorCredentials(actor);
  }

  return {
    allow: "1",
    databaseUrl: databaseUrlValue,
    storageRoot
  };
}

export function communityActorCredentials(actor: CommunityActorName): CommunityActorCredentials {
  return {
    email: requiredEnvironmentValue(`E2E_USER_${actor}_EMAIL`).toLowerCase(),
    password: requiredEnvironmentValue(`E2E_USER_${actor}_PASSWORD`)
  };
}

export function communityAuthStatePath(actor: CommunityActorName): string {
  return path.join(process.cwd(), "test-results", ".auth", `community-user-${actor.toLowerCase()}.json`);
}
