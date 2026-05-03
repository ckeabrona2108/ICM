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
