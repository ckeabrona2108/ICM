export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function getStatusTone(status: string) {
  const normalized = status.toLowerCase();

  if (normalized.includes("distributed") || normalized.includes("live") || normalized.includes("approved")) {
    return "success";
  }

  if (
    normalized.includes("moderation") ||
    normalized.includes("review") ||
    normalized.includes("pending") ||
    normalized.includes("changes_required")
  ) {
    return "warning";
  }

  if (normalized.includes("rejected") || normalized.includes("failed")) {
    return "danger";
  }

  return "muted";
}
