function stripInvisible(value: string): string {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
}

function normalizeNumericLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Excel/CSV exporters sometimes serialize integer-like UPC as "12345.0"
  if (/^\d+\.0+$/u.test(trimmed)) {
    return trimmed.split(".")[0] ?? "";
  }

  return trimmed;
}

export function normalizeAnalyticsUpc(value: unknown): string {
  if (value == null) return "";
  const asString = String(value);
  const withoutInvisible = stripInvisible(asString);
  const withoutWhitespace = withoutInvisible.replace(/\s+/g, "");
  return normalizeNumericLike(withoutWhitespace);
}

