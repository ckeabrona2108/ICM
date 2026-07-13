function stripInvisible(value: string): string {
  return value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
}

function expandScientificInteger(value: string): string | null {
  const match = value.match(/^(\d+)(?:\.(\d+))?[eE]\+?(\d+)$/u);
  if (!match) return null;

  const integerPart = match[1] ?? "";
  const fractionPart = match[2] ?? "";
  const exponent = Number(match[3] ?? "");
  if (!Number.isInteger(exponent) || exponent < 0) return null;

  const digits = `${integerPart}${fractionPart}`;
  if (exponent < fractionPart.length) {
    return null;
  }

  return digits + "0".repeat(exponent - fractionPart.length);
}

function normalizeNumericLike(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  // Excel/CSV exporters sometimes serialize integer-like UPC as "12345.0"
  if (/^\d+\.0+$/u.test(trimmed)) {
    return trimmed.split(".")[0] ?? "";
  }

  // Google Sheets / Excel may serialize long UPC values as scientific notation.
  const expandedScientific = expandScientificInteger(trimmed);
  if (expandedScientific) {
    return expandedScientific;
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
