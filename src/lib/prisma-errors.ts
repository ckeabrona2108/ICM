import { Prisma } from "@prisma/client";

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? "");
}

export function isPrismaTableMissingError(
  error: unknown,
  tableName?: string
): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code !== "P2021") {
      return false;
    }

    if (!tableName) {
      return true;
    }

    const metaTable = String(error.meta?.table ?? "");
    if (metaTable.toLowerCase().includes(tableName.toLowerCase())) {
      return true;
    }
  }

  const message = extractErrorMessage(error);
  const tableHint = tableName
    ? message.toLowerCase().includes(tableName.toLowerCase())
    : true;

  return (
    tableHint &&
    /does not exist|not exist|relation .* does not exist|model .* unavailable/i.test(message)
  );
}

export function isAnyPrismaTableMissingError(
  error: unknown,
  tableNames: string[]
): boolean {
  return tableNames.some((tableName) => isPrismaTableMissingError(error, tableName));
}

export function isPrismaColumnMissingError(
  error: unknown,
  columnName?: string
): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code !== "P2022") {
      return false;
    }

    if (!columnName) {
      return true;
    }

    const metaColumn = String(error.meta?.column ?? "");
    if (metaColumn.toLowerCase().includes(columnName.toLowerCase())) {
      return true;
    }
  }

  const message = extractErrorMessage(error);
  const columnHint = columnName
    ? message.toLowerCase().includes(columnName.toLowerCase())
    : true;

  return (
    columnHint &&
    /column .* does not exist|unknown column|has no column|missing column/i.test(message)
  );
}

export function isAnyPrismaColumnMissingError(
  error: unknown,
  columnNames: string[]
): boolean {
  return columnNames.some((columnName) => isPrismaColumnMissingError(error, columnName));
}

export function isPrismaConnectionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("can't reach database server") ||
    message.includes("can't reach database") ||
    message.includes("connection refused") ||
    message.includes("timed out") ||
    message.includes("getaddrinfo") ||
    message.includes("econnrefused") ||
    message.includes("prismaclientinitializationerror")
  );
}

export function isPrismaPoolTimeoutError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2024";
  }

  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("timed out fetching a new connection from the connection pool") ||
    message.includes("connection pool timeout")
  );
}

/** PostgreSQL may abort a serializable transaction when a concurrent request wins.
 * This is expected contention, so callers can retry the whole transaction safely. */
export function isPrismaSerializationConflictError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2034";
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  ) {
    return true;
  }
  return /transaction failed due to a write conflict|could not serialize access/i.test(
    extractErrorMessage(error)
  );
}

export async function retryPrismaSerializationConflict<T>(
  execute: () => Promise<T>,
  attempts = 3
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await execute();
    } catch (error) {
      if (!isPrismaSerializationConflictError(error) || attempt >= attempts) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 25));
    }
  }
}
