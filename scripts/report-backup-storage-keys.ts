import { probeStorageKeyDiagnostics, resolveRenderableStoredFileUrl } from "@/lib/s3";

import {
  buildTempDatabaseName,
  buildTempDatabaseUrl,
  createBackupPrismaClient,
  createTempDatabase,
  csvEscape,
  dropTempDatabase,
  getBackupPathFromArgs,
  getCurrentDatabaseInfo,
  restoreBackupToTempDatabase
} from "./restore-media-from-backup.shared";

type RowRecord = Record<string, unknown>;

type FoundMatch = {
  sourceTable: string;
  sourceField: string;
  rowPrimaryKey: string;
  extractedKey: string | null;
  normalizedUrl: string | null;
  publicHttpStatus: number | null;
  sdkHeadExists: boolean | null;
  appRouteHttpStatus: number | null;
  finalDiagnosis: string;
  canUse: boolean;
};

const PATTERN = /\/api\/uploads\/object\/|uploads\/|previews\/|covers\/|tracks\/|release-cover|\.jpe?g\b|\.png\b|\.webp\b|\.wav\b|\.mp3\b|\.flac\b/iu;

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function decodePath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
}

function extractKey(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;

  const apiMatch = normalized.match(/\/api\/uploads\/object\/(.+)$/iu);
  if (apiMatch?.[1]) {
    return decodePath(apiMatch[1].split("?")[0]?.split("#")[0] ?? "");
  }

  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    try {
      const parsed = new URL(normalized);
      const parsedMatch = parsed.pathname.match(/\/api\/uploads\/object\/(.+)$/iu);
      if (parsedMatch?.[1]) {
        return decodePath(parsedMatch[1].split("?")[0]?.split("#")[0] ?? "");
      }
      return null;
    } catch {
      return null;
    }
  }

  const pathCandidate = normalized.replace(/^\/+/u, "");
  if (
    pathCandidate.startsWith("uploads/") ||
    pathCandidate.startsWith("previews/") ||
    pathCandidate.startsWith("covers/") ||
    pathCandidate.startsWith("tracks/") ||
    pathCandidate.startsWith("audio/") ||
    pathCandidate.startsWith("audios/")
  ) {
    return decodePath(pathCandidate.split("?")[0]?.split("#")[0] ?? "");
  }

  const fileMatch = pathCandidate.match(/([^/\\]+\.(?:jpe?g|png|webp|wav|mp3|flac))$/iu);
  if (!fileMatch?.[1]) return null;
  return pathCandidate;
}

function normalizeUrlFromKey(key: string | null): string | null {
  if (!key) return null;
  return resolveRenderableStoredFileUrl({ storageKey: key }) ?? `/api/uploads/object/${key.split("/").map(encodeURIComponent).join("/")}`;
}

function walkValue(
  value: unknown,
  path: string,
  rowPrimaryKey: string,
  sourceTable: string,
  matches: FoundMatch[]
): void {
  if (typeof value === "string") {
    if (!PATTERN.test(value)) return;
    const extracted = extractKey(value);
    const normalizedUrl = extracted ? normalizeUrlFromKey(extracted) : null;
    matches.push({
      sourceTable,
      sourceField: path,
      rowPrimaryKey,
      extractedKey: extracted,
      normalizedUrl,
      publicHttpStatus: null,
      sdkHeadExists: null,
      appRouteHttpStatus: null,
      finalDiagnosis: "broken_db_path",
      canUse: false
    });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => walkValue(item, `${path}[${index}]`, rowPrimaryKey, sourceTable, matches));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as RowRecord)) {
      walkValue(child, path ? `${path}.${key}` : key, rowPrimaryKey, sourceTable, matches);
    }
  }
}

async function getTables(client: ReturnType<typeof createBackupPrismaClient>, schema: string): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = ${quoteLiteral(schema)} AND table_type = 'BASE TABLE' ORDER BY table_name`
  );
  return rows.map((row) => row.table_name);
}

async function getPrimaryKeyColumns(
  client: ReturnType<typeof createBackupPrismaClient>,
  schema: string,
  table: string
): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<Array<{ column_name: string }>>(
    [
      "SELECT kcu.column_name",
      "FROM information_schema.table_constraints tc",
      "JOIN information_schema.key_column_usage kcu",
      "  ON tc.constraint_name = kcu.constraint_name",
      " AND tc.table_schema = kcu.table_schema",
      "WHERE tc.constraint_type = 'PRIMARY KEY'",
      `  AND tc.table_schema = ${quoteLiteral(schema)}`,
      `  AND tc.table_name = ${quoteLiteral(table)}`,
      "ORDER BY kcu.ordinal_position"
    ].join(" ")
  );
  return rows.map((row) => row.column_name);
}

function stringifyRowPrimaryKey(row: RowRecord, pkColumns: string[]): string {
  if (pkColumns.length === 0) {
    if (typeof row.id === "string" && row.id.trim()) return row.id.trim();
    return "";
  }
  return pkColumns
    .map((column) => {
      const value = row[column];
      return value == null ? "" : String(value);
    })
    .join("|");
}

async function main() {
  const backupPath = getBackupPathFromArgs();
  const currentDb = getCurrentDatabaseInfo();
  const tempDbName = buildTempDatabaseName("icecream_restore_tmp");
  const tempDbUrl = buildTempDatabaseUrl(currentDb, tempDbName);
  const schema = currentDb.schema ?? "icecream";

  let tempDbCreated = false;
  let backupPrisma: ReturnType<typeof createBackupPrismaClient> | null = null;

  try {
    await createTempDatabase(currentDb, tempDbName);
    tempDbCreated = true;
    await restoreBackupToTempDatabase(currentDb, tempDbName, backupPath);
    backupPrisma = createBackupPrismaClient(tempDbUrl);

    const tables = await getTables(backupPrisma, schema);
    const matches: FoundMatch[] = [];

    for (const table of tables) {
      const pkColumns = await getPrimaryKeyColumns(backupPrisma, schema, table);
      const rows = await backupPrisma.$queryRawUnsafe<RowRecord[]>(
        `SELECT to_jsonb(t) AS row_json FROM ${quoteIdent(schema)}.${quoteIdent(table)} AS t`
      );

      for (const rowWrapper of rows) {
        const row = (rowWrapper.row_json as RowRecord) ?? {};
        const rowPrimaryKey = stringifyRowPrimaryKey(row, pkColumns);

        for (const [field, value] of Object.entries(row)) {
          walkValue(value, field, rowPrimaryKey, table, matches);
        }
      }
    }

    const seen = new Set<string>();
    const output = matches.filter((match) => {
      const signature = `${match.sourceTable}:${match.rowPrimaryKey}:${match.sourceField}:${match.extractedKey ?? ""}:${match.normalizedUrl ?? ""}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });

    for (const match of output) {
      if (match.extractedKey) {
        const probe = await probeStorageKeyDiagnostics({
          storageKey: match.extractedKey,
          publicUrl: match.normalizedUrl
        });
        match.publicHttpStatus = probe.publicHttpStatus;
        match.sdkHeadExists = probe.sdkHeadExists;
        match.appRouteHttpStatus = probe.appRouteHttpStatus;
        match.finalDiagnosis = probe.finalDiagnosis;
        match.canUse = probe.finalDiagnosis === "ok";
      }
    }

    process.stdout.write(
      [
        "sourceTable",
        "sourceField",
        "rowPrimaryKey",
        "extractedKey",
        "normalizedUrl",
        "publicHttpStatus",
        "sdkHeadExists",
        "appRouteHttpStatus",
        "finalDiagnosis",
        "canUse"
      ].join(",") + "\n"
    );

    for (const match of output.sort((left, right) =>
      left.sourceTable.localeCompare(right.sourceTable) ||
      left.rowPrimaryKey.localeCompare(right.rowPrimaryKey) ||
      left.sourceField.localeCompare(right.sourceField)
    )) {
      process.stdout.write(
        [
          csvEscape(match.sourceTable),
          csvEscape(match.sourceField),
          csvEscape(match.rowPrimaryKey),
          csvEscape(match.extractedKey ?? ""),
          csvEscape(match.normalizedUrl ?? ""),
          csvEscape(match.publicHttpStatus ?? ""),
          csvEscape(match.sdkHeadExists ?? ""),
          csvEscape(match.appRouteHttpStatus ?? ""),
          csvEscape(match.finalDiagnosis),
          csvEscape(match.canUse)
        ].join(",") + "\n"
      );
    }
  } finally {
    if (backupPrisma) {
      await backupPrisma.$disconnect().catch(() => undefined);
    }
    if (tempDbCreated) {
      await dropTempDatabase(currentDb, tempDbName).catch(() => undefined);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
