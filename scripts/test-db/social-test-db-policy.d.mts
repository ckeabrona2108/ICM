export interface SocialTestDatabaseTarget {
  database: string;
  hostname: string;
  port: string;
  schema: string;
  url: string;
}

export interface SocialTestRuntimeMarker {
  version: 1;
  runtimeRoot: string;
  workspaceRoot: string;
  dataDir: string;
  socketDir: string;
}

export const SOCIAL_TEST_DATABASE_PREFIX: string;
export const SOCIAL_TEST_SCHEMA: string;

export function assertSocialTestDatabaseUrl(rawValue: unknown): Readonly<SocialTestDatabaseTarget>;

export function assertOwnedRuntimeDirectory(params: {
  runtimeRoot: string;
  expectedRoot: string;
  workspaceRoot: string;
  marker: SocialTestRuntimeMarker | null | undefined;
}): Readonly<{ dataDir: string; runtimeRoot: string; socketDir: string }>;
