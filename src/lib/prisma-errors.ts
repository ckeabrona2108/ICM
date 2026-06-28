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
    if (metaTable.includes(tableName)) {
      return true;
    }
  }

  const message = extractErrorMessage(error);
  const tableHint = tableName ? message.includes(tableName) : true;

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
    if (metaColumn.includes(columnName)) {
      return true;
    }
  }

  const message = extractErrorMessage(error);
  const columnHint = columnName ? message.includes(columnName) : true;

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
