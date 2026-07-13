"use client";

import * as React from "react";

type SmartKind = "catalog" | "finance";

type ImportSummary = {
  total_rows?: number;
  matched_rows?: number;
  update_rows?: number;
  create_rows?: number;
  conflict_rows?: number;
  skipped_rows?: number;
  error_rows?: number;
};

type CatalogRow = {
  id: string;
  row_number: number;
  action: string;
  confidence_score: number;
  detected_match_rule?: string | null;
  error_message?: string | null;
  matched_release_id?: string | null;
  matched_track_id?: string | null;
  user_id?: string | null;
  gross_amount?: string | number | null;
  commission_amount?: string | number | null;
  commission_rate?: string | number | null;
  net_amount?: string | number | null;
  normalized_data?: Record<string, unknown> | null;
  matched_release?: {
    id: string;
    title?: string | null;
    upc?: string | null;
    performer?: string | null;
  } | null;
  matched_track?: {
    id: string;
    title?: string | null;
    isrc?: string | null;
    index?: number | null;
  } | null;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

type CatalogConflict = {
  id: string;
  field_name: string;
  existing_value?: string | null;
  incoming_value?: string | null;
  resolution_status: string;
};

type ImportItem = {
  id: string;
  source_file_name: string;
  status: string;
  file_format: string;
  detected_encoding?: string | null;
  detected_delimiter?: string | null;
  created_at: string;
  confirmed_at?: string | null;
  rolled_back_at?: string | null;
  total_rows: number;
  matched_rows: number;
  update_rows: number;
  create_rows: number;
  conflict_rows: number;
  skipped_rows: number;
  error_rows: number;
  gross_amount_total?: string | number | null;
  net_amount_total?: string | number | null;
  commission_total?: string | number | null;
  summary?: ImportSummary | null;
  rows?: CatalogRow[];
  conflicts?: CatalogConflict[];
  matching_logs?: Array<{ id: string; rule_name: string; matched: boolean; confidence_score: number }>;
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
}

function formatNumber(value?: string | number | null) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("ru-RU");
}

function parseEditableAmount(value: string) {
  const normalized = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveQuarterYear(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    quarter: Math.floor(safeDate.getUTCMonth() / 3) + 1,
    year: safeDate.getUTCFullYear()
  };
}

function isLikelyUpc(value?: string | null) {
  if (!value) return false;
  const normalized = value.trim().replace(/\s+/g, "");
  return /^\d{8,18}$/.test(normalized);
}

function normalizedText(row: CatalogRow, key: string) {
  const value = row.normalized_data?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function rowUserLabel(row: CatalogRow) {
  return row.user?.email?.trim() || row.user?.name?.trim() || row.user_id || "—";
}

function rowUserMetaLabel(row: CatalogRow) {
  const name = row.user?.name?.trim() || "";
  const email = row.user?.email?.trim() || "";
  if (name && email) {
    return `${name}`;
  }
  return "";
}

function rowReleaseLabel(row: CatalogRow) {
  return row.matched_release?.title?.trim() || normalizedText(row, "title") || "—";
}

function rowTrackLabel(row: CatalogRow) {
  return row.matched_track?.title?.trim() || normalizedText(row, "title") || "—";
}

function rowUpcLabel(row: CatalogRow) {
  return normalizedText(row, "upc") || row.matched_release?.upc?.trim() || "—";
}

function rowPlatformLabel(row: CatalogRow) {
  return normalizedText(row, "platform") || "—";
}

function rowInternalCodeLabel(row: CatalogRow) {
  return normalizedText(row, "internal_code") || normalizedText(row, "code") || "—";
}

function rowRuleLabel(row: CatalogRow) {
  switch (row.detected_match_rule) {
    case "NOT_FOUND":
      return "Не найдено";
    case "CREATE_MISSING":
      return "Новый релиз";
    case "FINANCIAL_UPC":
      return "Финансы по UPC";
    case "MISSING_UPC":
      return "Нет UPC";
    case "UPC":
      return "Совпадение по UPC";
    case "ISRC":
      return "Совпадение по ISRC";
    case "TITLE_ARTIST":
      return "Название + артист";
    default:
      return row.detected_match_rule ?? "—";
  }
}

type FinancePreviewUserSummary = {
  userId: string;
  label: string;
  metaLabel: string;
  releases: Set<string>;
  upcs: Set<string>;
  releaseTotals: Map<string, number>;
  grossAmount: number;
  commissionAmount: number;
  netAmount: number;
};

function computeFinanceEffectiveValues(row: CatalogRow, editedNetAmount?: string) {
  const grossAmount = typeof row.gross_amount === "number" ? row.gross_amount : Number(row.gross_amount ?? 0);
  const safeGrossAmount = Number.isFinite(grossAmount) ? grossAmount : 0;
  const currentNetAmount = typeof row.net_amount === "number" ? row.net_amount : Number(row.net_amount ?? 0);
  const parsedEditedNet = typeof editedNetAmount === "string" ? parseEditableAmount(editedNetAmount) : null;
  const resolvedNetAmount = parsedEditedNet ?? currentNetAmount ?? 0;
  const netAmount = Number(Math.min(safeGrossAmount, Math.max(0, resolvedNetAmount)).toFixed(2));
  const commissionAmount = Number((safeGrossAmount - netAmount).toFixed(2));
  const commissionRate = safeGrossAmount > 0 ? Number((commissionAmount / safeGrossAmount).toFixed(4)) : 0;

  return {
    grossAmount: safeGrossAmount,
    netAmount,
    commissionAmount,
    commissionRate
  };
}

function collectFinanceProgress(rows: CatalogRow[]) {
  const identifiersInFile = new Set<string>();
  const matchedReleaseIds = new Set<string>();
  const matchedIdentifiers = new Set<string>();
  const unmatchedUpcs = new Set<string>();
  const unmatchedCodes = new Set<string>();
  const unmatchedAmountByIdentifier = new Map<string, number>();
  let unmatchedNetAmount = 0;
  let matchedRows = 0;
  let hasRealUpc = false;

  for (const row of rows) {
    const rawUpc = normalizedText(row, "upc");
    const validUpc = isLikelyUpc(rawUpc) ? rawUpc : null;
    const rowNet = typeof row.net_amount === "number" ? row.net_amount : Number(row.net_amount ?? 0);
    const rowGross = typeof row.gross_amount === "number" ? row.gross_amount : Number(row.gross_amount ?? 0);
    const effectiveAmount = Number.isFinite(rowNet) && rowNet > 0 ? rowNet : Number.isFinite(rowGross) ? rowGross : 0;
    const identifier = validUpc;
    const isMatched = Boolean(row.matched_release?.id || row.matched_release_id);

    if (validUpc) {
      hasRealUpc = true;
      identifiersInFile.add(validUpc);
    }

    if (isMatched) {
      matchedRows += 1;
      if (row.matched_release?.id) {
        matchedReleaseIds.add(row.matched_release.id);
      } else if (row.matched_release_id) {
        matchedReleaseIds.add(row.matched_release_id);
      }
      if (identifier) {
        matchedIdentifiers.add(identifier);
      }
    } else {
      if (validUpc) {
        unmatchedUpcs.add(validUpc);
        unmatchedAmountByIdentifier.set(validUpc, (unmatchedAmountByIdentifier.get(validUpc) ?? 0) + effectiveAmount);
      }
      unmatchedNetAmount += effectiveAmount;
    }
  }

  const unmatchedItems = [...unmatchedAmountByIdentifier.entries()]
    .map(([identifier, amount]) => ({ identifier, amount }))
    .sort((left, right) => right.amount - left.amount || left.identifier.localeCompare(right.identifier));

  return {
    hasRealUpc,
    uniqueUpcTotal: identifiersInFile.size,
    uniqueMatchedUpcTotal: matchedIdentifiers.size,
    uniqueMatchedReleaseTotal: matchedReleaseIds.size,
    matchedRows,
    uniqueUnmatchedUpcTotal: unmatchedUpcs.size,
    uniqueUnmatchedCodeTotal: unmatchedCodes.size,
    unmatchedIdentifiers: (hasRealUpc ? [...unmatchedUpcs] : [...unmatchedCodes]).slice(0, 24),
    unmatchedAmountTotal: unmatchedNetAmount,
    unmatchedItems
  };
}

function statusTone(status: string) {
  if (status === "CONFIRMED") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
  if (status === "ROLLED_BACK") return "border-amber-500/30 bg-amber-500/10 text-amber-100";
  if (status === "FAILED") return "border-rose-500/30 bg-rose-500/10 text-rose-100";
  return "border-white/15 bg-white/[0.06] text-white/80";
}

async function readJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

export function AdminCatalogSyncClient() {
  const PREVIEW_ROW_LIMITS = [100, 250, 500, 1000, -1] as const;
  const [activeKind, setActiveKind] = React.useState<SmartKind>("catalog");
  const [file, setFile] = React.useState<File | null>(null);
  const [createMissing, setCreateMissing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadingImports, setLoadingImports] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [catalogImports, setCatalogImports] = React.useState<ImportItem[]>([]);
  const [financeImports, setFinanceImports] = React.useState<ImportItem[]>([]);
  const [selectedImport, setSelectedImport] = React.useState<ImportItem | null>(null);
  const [selectedKind, setSelectedKind] = React.useState<SmartKind>("catalog");
  const [financeNetEdits, setFinanceNetEdits] = React.useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [actionBusy, setActionBusy] = React.useState<"apply" | "rollback" | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [previewRowLimit, setPreviewRowLimit] = React.useState<number>(500);
  const defaultQuarterYear = React.useMemo(() => resolveQuarterYear(), []);
  const [financeReportQuarter, setFinanceReportQuarter] = React.useState<number>(defaultQuarterYear.quarter);
  const [financeReportYear, setFinanceReportYear] = React.useState<number>(defaultQuarterYear.year);

  const imports = activeKind === "catalog" ? catalogImports : financeImports;
  const financeProgress = React.useMemo(() => {
    if (selectedKind !== "finance" || !selectedImport?.rows?.length) {
      return null;
    }
    return collectFinanceProgress(selectedImport.rows);
  }, [selectedImport, selectedKind]);
  const visibleRows = React.useMemo(() => {
    const rows = selectedImport?.rows ?? [];
    if (previewRowLimit < 0) {
      return rows;
    }
    return rows.slice(0, previewRowLimit);
  }, [previewRowLimit, selectedImport?.rows]);

  const financeDistribution = React.useMemo(() => {
    if (selectedKind !== "finance" || !selectedImport?.rows?.length) {
      return null;
    }

    const userSummaries = new Map<string, FinancePreviewUserSummary>();
    let grossAmountTotal = 0;
    let commissionAmountTotal = 0;
    let netAmountTotal = 0;
    let matchedUserCount = 0;

    for (const row of selectedImport.rows) {
      if (!row.user?.id) {
        continue;
      }
      if (!["MATCH", "UPDATE", "NEEDS_REVIEW"].includes(row.action)) {
        continue;
      }

      matchedUserCount += 1;
      const effective = computeFinanceEffectiveValues(row, financeNetEdits[row.id]);
      grossAmountTotal += effective.grossAmount;
      commissionAmountTotal += effective.commissionAmount;
      netAmountTotal += effective.netAmount;

      const userId = row.user.id;
      const summary = userSummaries.get(userId) ?? {
        userId,
        label: rowUserLabel(row),
        metaLabel: rowUserMetaLabel(row),
        releases: new Set<string>(),
        upcs: new Set<string>(),
        releaseTotals: new Map<string, number>(),
        grossAmount: 0,
        commissionAmount: 0,
        netAmount: 0
      };

      summary.grossAmount += effective.grossAmount;
      summary.commissionAmount += effective.commissionAmount;
      summary.netAmount += effective.netAmount;
      const releaseLabel = rowReleaseLabel(row);
      const upcLabel = rowUpcLabel(row);
      if (releaseLabel !== "—") {
        summary.releases.add(releaseLabel);
        summary.releaseTotals.set(
          releaseLabel,
          Number(((summary.releaseTotals.get(releaseLabel) ?? 0) + effective.netAmount).toFixed(2))
        );
      }
      if (upcLabel !== "—") {
        summary.upcs.add(upcLabel);
      }

      userSummaries.set(userId, summary);
    }

    return {
      matchedUserCount,
      grossAmountTotal: Number(grossAmountTotal.toFixed(2)),
      commissionAmountTotal: Number(commissionAmountTotal.toFixed(2)),
      netAmountTotal: Number(netAmountTotal.toFixed(2)),
      userSummaries: [...userSummaries.values()]
        .sort((left, right) => right.netAmount - left.netAmount || left.label.localeCompare(right.label))
        .map((item) => ({
          ...item,
          releaseCount: item.releases.size,
          upcCount: item.upcs.size,
          releases: [...item.releases].slice(0, 3),
          releaseBreakdown: [...item.releaseTotals.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ru"))
            .slice(0, 3)
            .map(([release, amount]) => ({ release, amount: Number(amount.toFixed(2)) })),
          upcs: [...item.upcs].slice(0, 3),
          grossAmount: Number(item.grossAmount.toFixed(2)),
          commissionAmount: Number(item.commissionAmount.toFixed(2)),
          netAmount: Number(item.netAmount.toFixed(2))
        }))
    };
  }, [financeNetEdits, selectedImport?.rows, selectedKind]);

  React.useEffect(() => {
    setFinanceNetEdits({});
  }, [selectedImport?.id, selectedKind]);

  React.useEffect(() => {
    if (selectedKind !== "finance") {
      return;
    }
    const nextQuarterYear = resolveQuarterYear(selectedImport?.created_at);
    setFinanceReportQuarter(nextQuarterYear.quarter);
    setFinanceReportYear(nextQuarterYear.year);
  }, [selectedImport?.id, selectedImport?.created_at, selectedKind]);

  const loadImports = React.useCallback(async () => {
    setLoadingImports(true);
    try {
      const response = await fetch("/api/admin/catalog-sync/imports?limit=250");
      const payload = await readJson<{ ok?: boolean; catalog?: ImportItem[]; finance?: ImportItem[]; error?: string }>(
        response
      );

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось загрузить импорты Smart Catalog Sync");
      }

      setCatalogImports(payload.catalog ?? []);
      setFinanceImports(payload.finance ?? []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить импорты");
    } finally {
      setLoadingImports(false);
    }
  }, []);

  const loadDetails = React.useCallback(async (kind: SmartKind, id: string) => {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/catalog-sync/imports/${kind}/${id}`);
      const payload = await readJson<{ ok?: boolean; item?: ImportItem; error?: string }>(response);

      if (!response.ok || !payload?.ok || !payload.item) {
        throw new Error(payload?.error ?? "Не удалось загрузить детали импорта");
      }

      setSelectedKind(kind);
      setSelectedImport(payload.item);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось загрузить детали импорта");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  React.useEffect(() => {
    void loadImports();
  }, [loadImports]);

  async function handlePreview() {
    if (!file) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      if (activeKind === "catalog") {
        formData.set("createMissing", String(createMissing));
      }

      const response = await fetch(
        activeKind === "catalog"
          ? "/api/admin/catalog-sync/catalog/preview"
          : "/api/admin/catalog-sync/finance/preview",
        {
          method: "POST",
          body: formData
        }
      );
      const payload = await readJson<{ ok?: boolean; preview?: ImportItem; error?: string }>(response);

      if (!response.ok || !payload?.ok || !payload.preview) {
        throw new Error(payload?.error ?? "Не удалось создать preview");
      }

      setSelectedKind(activeKind);
      setSelectedImport(payload.preview);
      setSuccess("Preview создан. Проверьте совпадения и затем примените импорт.");
      setFile(null);
      await loadImports();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать preview");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAction(action: "apply" | "rollback") {
    if (!selectedImport) return;

    setActionBusy(action);
    setError(null);
    setSuccess(null);

    try {
      const allocations =
        selectedKind === "finance"
          ? (selectedImport.rows ?? [])
              .map((row) => {
                const rawGross = typeof row.gross_amount === "number" ? row.gross_amount : Number(row.gross_amount ?? 0);
                const grossAmount = Number.isFinite(rawGross) ? rawGross : 0;
                const editValue = financeNetEdits[row.id];
                const parsed = typeof editValue === "string" ? parseEditableAmount(editValue) : null;
                if (parsed === null) return null;
                const nextNet = Math.min(grossAmount, Math.max(0, parsed));
                const currentNet = typeof row.net_amount === "number" ? row.net_amount : Number(row.net_amount ?? 0);
                if (Math.abs(nextNet - currentNet) < 0.005) {
                  return null;
                }
                return { rowId: row.id, netAmount: Number(nextNet.toFixed(2)) };
              })
              .filter(Boolean)
          : [];
      const response = await fetch(
        `/api/admin/catalog-sync/imports/${selectedKind}/${selectedImport.id}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "apply" && selectedKind === "finance"
              ? {
                  allocations,
                  reportQuarter: financeReportQuarter,
                  reportYear: financeReportYear
                }
              : {}
          )
        }
      );
      const payload = await readJson<{ ok?: boolean; item?: ImportItem; error?: string }>(response);

      if (!response.ok || !payload?.ok || !payload.item) {
        throw new Error(payload?.error ?? `Не удалось выполнить ${action}`);
      }

      setSelectedImport(payload.item);
      setSuccess(action === "apply" ? "Импорт применён." : "Импорт откатан.");
      await loadImports();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось выполнить действие");
    } finally {
      setActionBusy(null);
    }
  }

  async function handleDelete(kind: SmartKind, id: string) {
    setDeletingId(id);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/admin/catalog-sync/imports/${kind}/${id}`, {
        method: "DELETE"
      });
      const payload = await readJson<{ ok?: boolean; error?: string }>(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить импорт");
      }

      if (selectedImport?.id === id && selectedKind === kind) {
        setSelectedImport(null);
      }

      setSuccess("Импорт удалён из истории.");
      await loadImports();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось удалить импорт");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <div className="flex flex-wrap gap-2">
          {(["catalog", "finance"] as SmartKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                setActiveKind(kind);
                setSuccess(null);
                setError(null);
              }}
              className={cn(
                "rounded-full border px-4 py-2 text-[13px] font-medium transition-colors",
                activeKind === kind
                  ? "border-[#7b3df5]/50 bg-[#7b3df5]/20 text-white"
                  : "border-white/10 bg-white/[0.04] text-white/65 hover:text-white"
              )}
            >
              {kind === "catalog" ? "Catalog import" : "Finance import"}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
          <input
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
            }}
            className="block w-full text-[13px] text-white/75 file:mr-4 file:rounded-full file:border-0 file:bg-[#7b3df5] file:px-4 file:py-2 file:text-[13px] file:font-medium file:text-white"
          />

          {activeKind === "catalog" ? (
            <label className="flex items-center gap-2 text-[13px] text-white/70">
              <input
                type="checkbox"
                checked={createMissing}
                onChange={(event) => setCreateMissing(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent"
              />
              Create missing releases/tracks
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void handlePreview();
            }}
            disabled={!file || submitting}
            className="rounded-full bg-[#7b3df5] px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Обработка..." : "Загрузить и сделать preview"}
          </button>
        </div>

        {error ? <p className="mt-3 text-[13px] text-rose-300">{error}</p> : null}
        {success ? <p className="mt-3 text-[13px] text-emerald-300">{success}</p> : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[18px] font-semibold text-white">История импортов</h2>
              <p className="mt-1 text-[13px] text-white/55">
                {activeKind === "catalog"
                  ? "Каталог: обновления релизов и треков"
                  : "Финансы: роялти, комиссия и баланс"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadImports();
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[12px] text-white/70 transition-colors hover:text-white"
            >
              {loadingImports ? "..." : "Обновить"}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {imports.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-[13px] text-white/45">
                Пока нет импортов.
              </div>
            ) : null}

            {imports.map((item) => {
              const selected = selectedImport?.id === item.id && selectedKind === activeKind;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border p-4 transition-colors",
                    selected
                      ? "border-[#7b3df5]/45 bg-[#7b3df5]/12"
                      : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      void loadDetails(activeKind, item.id);
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[14px] font-semibold text-white">{item.source_file_name}</div>
                        <div className="mt-1 text-[12px] text-white/50">{formatDate(item.created_at)}</div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                          statusTone(item.status)
                        )}
                      >
                        {item.status}
                      </span>
                    </div>
 
                    <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] text-white/60">
                      <span>Rows: {formatNumber(item.total_rows)}</span>
                      <span>Matched: {formatNumber(item.matched_rows)}</span>
                      <span>Update: {formatNumber(item.update_rows)}</span>
                      <span>Create: {formatNumber(item.create_rows)}</span>
                      <span>Conflict: {formatNumber(item.conflict_rows)}</span>
                      <span>Errors: {formatNumber(item.error_rows)}</span>
                    </div>
                  </button>

                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        void handleDelete(activeKind, item.id);
                      }}
                      disabled={deletingId === item.id}
                      className="rounded-full border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[12px] font-medium text-rose-200 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {deletingId === item.id ? "Удаление..." : "Удалить"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
          {!selectedImport ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-[13px] text-white/45">
              Выберите импорт слева, чтобы открыть preview, конфликты и действия.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-[18px] font-semibold text-white">{selectedImport.source_file_name}</h2>
                  <p className="mt-1 text-[13px] text-white/55">
                    {selectedKind === "catalog" ? "Catalog preview" : "Financial preview"} ·{" "}
                    {selectedImport.file_format.toUpperCase()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedKind === "finance" ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
                      <span className="text-[12px] font-medium text-white/58">Отчет пользователям</span>
                      <select
                        value={financeReportQuarter}
                        onChange={(event) => setFinanceReportQuarter(Number(event.target.value))}
                        className="h-9 rounded-xl border border-white/[0.12] bg-[#11131a] px-3 text-[13px] text-white outline-none focus:border-[#7b3df5]/60"
                      >
                        <option value={1}>1 квартал</option>
                        <option value={2}>2 квартал</option>
                        <option value={3}>3 квартал</option>
                        <option value={4}>4 квартал</option>
                      </select>
                      <input
                        type="number"
                        min={2020}
                        max={3000}
                        value={financeReportYear}
                        onChange={(event) => setFinanceReportYear(Number(event.target.value))}
                        className="h-9 w-[110px] rounded-xl border border-white/[0.12] bg-[#11131a] px-3 text-[13px] text-white outline-none focus:border-[#7b3df5]/60"
                      />
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      void loadDetails(selectedKind, selectedImport.id);
                    }}
                    className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[13px] text-white/70 transition-colors hover:text-white"
                  >
                    {loadingDetail ? "..." : "Обновить preview"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAction("apply");
                    }}
                    disabled={actionBusy !== null || selectedImport.status === "CONFIRMED"}
                    className="rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === "apply" ? "Применение..." : "Применить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleAction("rollback");
                    }}
                    disabled={actionBusy !== null || selectedImport.status === "ROLLED_BACK"}
                    className="rounded-full bg-amber-500 px-4 py-2 text-[13px] font-semibold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionBusy === "rollback" ? "Откат..." : "Откатить"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  ["Всего строк", selectedImport.total_rows],
                  [
                    "Сопоставлено",
                    selectedKind === "finance" && financeProgress
                      ? financeProgress.matchedRows
                      : selectedImport.matched_rows
                  ],
                  ["Обновление", selectedImport.update_rows],
                  ["Создание", selectedImport.create_rows],
                  ["Конфликты", selectedImport.conflict_rows],
                  ["Пропущено", selectedImport.skipped_rows],
                  ["Ошибки", selectedImport.error_rows],
                  [
                    selectedKind === "finance" ? "К начислению артистам" : "Encoding",
                    selectedKind === "finance"
                      ? formatNumber(selectedImport.net_amount_total)
                      : selectedImport.detected_encoding ?? "—"
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">{label}</div>
                    <div className="mt-2 text-[18px] font-semibold text-white">{String(value)}</div>
                  </div>
                ))}
              </div>

              {selectedKind === "finance" ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      Вознаграждение Лицензиара
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(selectedImport.gross_amount_total)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Комиссия ICECREAMMUSIC</div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(selectedImport.commission_total)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">К начислению артистам</div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(selectedImport.net_amount_total)}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedKind === "finance" && financeProgress ? (
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      {financeProgress.hasRealUpc ? "UPC в файле" : "Кодов в файле"}
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(financeProgress.uniqueUpcTotal)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      {financeProgress.hasRealUpc ? "UPC сопоставлено" : "Кодов сопоставлено"}
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(financeProgress.uniqueMatchedUpcTotal)} / {formatNumber(financeProgress.uniqueUpcTotal)}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                      {financeProgress.hasRealUpc ? "UPC не учтено" : "Кодов не учтено"}
                    </div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(
                        financeProgress.hasRealUpc
                          ? financeProgress.uniqueUnmatchedUpcTotal
                          : financeProgress.uniqueUnmatchedCodeTotal
                      )}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-violet-500/15 bg-violet-500/[0.05] px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Релизов найдено</div>
                    <div className="mt-2 text-[18px] font-semibold text-white">
                      {formatNumber(financeProgress.uniqueMatchedReleaseTotal)} / {formatNumber(financeProgress.uniqueUpcTotal)}
                    </div>
                  </div>
                </div>
              ) : null}

              {selectedKind === "finance" && financeProgress && financeProgress.unmatchedIdentifiers.length > 0 ? (
                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-white">
                        {financeProgress.hasRealUpc ? "UPC не учтены" : "Неучтённые коды"}
                      </div>
                      <div className="mt-1 text-[13px] text-white/65">
                        {financeProgress.hasRealUpc
                          ? `Уникальных UPC без сопоставления: ${formatNumber(financeProgress.uniqueUnmatchedUpcTotal)}`
                          : `Уникальных кодов без сопоставления: ${formatNumber(financeProgress.uniqueUnmatchedCodeTotal)}`}
                      </div>
                    </div>
                    <div className="rounded-full border border-amber-400/20 bg-amber-400/10 px-4 py-2 text-[13px] font-semibold text-amber-200">
                      Не учтено: {formatNumber(financeProgress.unmatchedAmountTotal)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {financeProgress.unmatchedIdentifiers.map((identifier) => (
                      <span
                        key={identifier}
                        className="rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-[12px] text-white/80"
                      >
                        {identifier}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {selectedKind === "finance" && financeProgress && financeProgress.unmatchedItems.length > 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-white">
                        {financeProgress.hasRealUpc ? "Неучтённые UPC" : "Неучтённые коды"}
                      </div>
                      <div className="mt-1 text-[13px] text-white/55">
                        Уникальные идентификаторы без сопоставленного релиза и сумма, которая пока не попадёт в начисление.
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-[12px] text-white/70">
                      Всего: {formatNumber(financeProgress.unmatchedItems.length)}
                    </div>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-[12px] text-white/70">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-white/45">
                          <th className="px-3 py-2 font-medium">{financeProgress.hasRealUpc ? "UPC" : "Код"}</th>
                          <th className="px-3 py-2 font-medium">Не учтено</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financeProgress.unmatchedItems.map((item) => (
                          <tr key={item.identifier} className="border-b border-white/[0.05]">
                            <td className="px-3 py-2 text-white">{item.identifier}</td>
                            <td className="px-3 py-2 text-amber-300">{formatNumber(item.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {selectedKind === "finance" ? (
                <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.05] p-4">
                  <div className="text-[15px] font-semibold text-white">Финансовый preview</div>
                  <div className="mt-2 text-[13px] text-white/65">
                    Сейчас проверяется, какие строки сматчились с релизами, какая комиссия ICECREAMMUSIC будет удержана
                    и какая сумма будет начислена артистам. До нажатия{" "}
                    <span className="font-semibold text-white">«Применить»</span> баланс пользователей не меняется.
                  </div>
                  <div className="mt-3 rounded-xl border border-white/[0.08] bg-[#11131a] px-3 py-2 text-[12px] text-white/62">
                    После применения пользователям сразу будет создан отчет за{" "}
                    <span className="font-semibold text-white">
                      {financeReportQuarter} квартал {financeReportYear}
                    </span>
                    .
                  </div>
                  <div className="mt-3 text-[12px] text-white/55">
                    `Сопоставлено` выше показывает строки файла. Блоки по UPC и кодам показывают уникальные найденные и
                    неучтённые идентификаторы без дублей.
                  </div>
                </div>
              ) : null}

              {selectedKind === "finance" && financeDistribution ? (
                <div className="space-y-4 rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.05] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[15px] font-semibold text-white">Распределение до отправки</div>
                      <div className="mt-1 text-[13px] text-white/60">
                        Сводка по пользователям и отдельный итог сервиса с учётом ручных правок в колонке начисления.
                      </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-[12px] text-white/75">
                      Пользователей: {formatNumber(financeDistribution.userSummaries.length)}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/[0.08] bg-[#11131a] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Всего по отчёту</div>
                      <div className="mt-2 text-[18px] font-semibold text-white">
                        {formatNumber(financeDistribution.grossAmountTotal)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.06] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Итого сервиса</div>
                      <div className="mt-2 text-[18px] font-semibold text-amber-200">
                        {formatNumber(financeDistribution.commissionAmountTotal)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3">
                      <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">Итого пользователям</div>
                      <div className="mt-2 text-[18px] font-semibold text-emerald-200">
                        {formatNumber(financeDistribution.netAmountTotal)}
                      </div>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-[12px] text-white/70">
                      <thead>
                        <tr className="border-b border-white/[0.08] text-white/45">
                          <th className="px-3 py-2 font-medium">Пользователь</th>
                          <th className="px-3 py-2 font-medium">Релизов</th>
                          <th className="px-3 py-2 font-medium">UPC</th>
                          <th className="px-3 py-2 font-medium">Всего по отчёту</th>
                          <th className="px-3 py-2 font-medium">Сервис</th>
                          <th className="px-3 py-2 font-medium">Пользователю</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financeDistribution.userSummaries.map((item) => (
                          <tr key={item.userId} className="border-b border-white/[0.05] align-top">
                            <td className="px-3 py-2">
                              <div className="font-medium text-white">{item.label}</div>
                              {item.metaLabel ? (
                                <div className="mt-1 text-[11px] text-white/45">{item.metaLabel}</div>
                              ) : null}
                              <div className="mt-2 space-y-1 text-[11px] text-white/55">
                                {item.releaseBreakdown.length > 0 ? (
                                  item.releaseBreakdown.map((releaseItem) => (
                                    <div key={`${item.userId}-${releaseItem.release}`} className="flex items-start justify-between gap-3">
                                      <span className="min-w-0 flex-1 truncate">{releaseItem.release}</span>
                                      <span className="shrink-0 text-emerald-300">{formatNumber(releaseItem.amount)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <div>—</div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-white">{formatNumber(item.releaseCount)}</td>
                            <td className="px-3 py-2 text-white/75">{item.upcs.join(", ") || "—"}</td>
                            <td className="px-3 py-2 text-white">{formatNumber(item.grossAmount)}</td>
                            <td className="px-3 py-2 text-amber-300">{formatNumber(item.commissionAmount)}</td>
                            <td className="px-3 py-2 font-medium text-emerald-300">{formatNumber(item.netAmount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {selectedKind === "catalog" && (selectedImport.conflicts?.length ?? 0) > 0 ? (
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <div className="text-[15px] font-semibold text-white">Конфликты</div>
                  <div className="mt-3 space-y-3">
                    {selectedImport.conflicts?.slice(0, 20).map((conflict) => (
                      <div key={conflict.id} className="rounded-xl border border-white/[0.08] bg-[#11131a] p-3">
                        <div className="text-[13px] font-medium text-white">{conflict.field_name}</div>
                        <div className="mt-1 text-[12px] text-white/55">Current: {conflict.existing_value ?? "—"}</div>
                        <div className="mt-1 text-[12px] text-white/55">Incoming: {conflict.incoming_value ?? "—"}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[15px] font-semibold text-white">
                    {selectedKind === "finance" ? "Финансовая детализация" : "Preview rows"}
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-white/60">
                    <span>Показывать</span>
                    <select
                      value={previewRowLimit}
                      onChange={(event) => setPreviewRowLimit(Number(event.target.value))}
                      className="rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-[12px] text-white outline-none"
                    >
                      {PREVIEW_ROW_LIMITS.map((limit) => (
                        <option key={limit} value={limit}>
                          {limit < 0 ? "Все строки" : `${limit} строк`}
                        </option>
                      ))}
                    </select>
                    <span className="text-white/40">из {formatNumber(selectedImport.rows?.length ?? 0)}</span>
                  </label>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px] text-white/70">
                    <thead>
                      <tr className="border-b border-white/[0.08] text-white/45">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Действие" : "Action"}</th>
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Уверенность" : "Confidence"}</th>
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Правило" : "Rule"}</th>
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">Пользователь</th> : null}
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">UPC</th> : null}
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Релиз" : "Release"}</th>
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Трек" : "Track"}</th>
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">Площадка</th> : null}
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">Вознаграждение Лицензиара</th> : null}
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">Комиссия ICECREAMMUSIC</th> : null}
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">Комиссия %</th> : null}
                        {selectedKind === "finance" ? <th className="px-3 py-2 font-medium">К начислению артисту</th> : null}
                        <th className="px-3 py-2 font-medium">{selectedKind === "finance" ? "Ошибка" : "Error"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => (
                        <tr key={row.id} className="border-b border-white/[0.05] align-top">
                          <td className="px-3 py-2">{row.row_number}</td>
                          <td className="px-3 py-2">{row.action}</td>
                          <td className="px-3 py-2">{formatNumber(row.confidence_score)}</td>
                          <td className="px-3 py-2">{selectedKind === "finance" ? rowRuleLabel(row) : row.detected_match_rule ?? "—"}</td>
                          {selectedKind === "finance" ? <td className="px-3 py-2">{rowUserLabel(row)}</td> : null}
                          {selectedKind === "finance" ? <td className="px-3 py-2">{rowUpcLabel(row)}</td> : null}
                          <td className="px-3 py-2">{selectedKind === "finance" ? rowReleaseLabel(row) : row.matched_release_id ?? "—"}</td>
                          <td className="px-3 py-2">{selectedKind === "finance" ? rowTrackLabel(row) : row.matched_track_id ?? "—"}</td>
                          {selectedKind === "finance" ? <td className="px-3 py-2">{rowPlatformLabel(row)}</td> : null}
                          {selectedKind === "finance" ? (
                            <td className="px-3 py-2 text-white">{formatNumber(row.gross_amount)}</td>
                          ) : null}
                          {selectedKind === "finance" ? (
                            <td className="px-3 py-2 text-amber-300">{formatNumber(row.commission_amount)}</td>
                          ) : null}
                          {selectedKind === "finance" ? (
                            <td className="px-3 py-2 text-white/80">{formatNumber((Number(row.commission_rate ?? 0) * 100).toFixed(2))}%</td>
                          ) : null}
                          {selectedKind === "finance" ? (
                            <td className="px-3 py-2">
                              {row.user?.id ? (
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={String(row.gross_amount ?? 0)}
                                  value={financeNetEdits[row.id] ?? String(row.net_amount ?? 0)}
                                  onChange={(event) => {
                                    const nextValue = event.target.value;
                                    setFinanceNetEdits((current) => ({
                                      ...current,
                                      [row.id]: nextValue
                                    }));
                                  }}
                                  className="w-28 rounded-full border border-white/10 bg-[#11131a] px-3 py-1.5 text-[12px] font-medium text-emerald-300 outline-none"
                                />
                              ) : (
                                <span className="font-medium text-emerald-300">{formatNumber(row.net_amount)}</span>
                              )}
                            </td>
                          ) : null}
                          <td className="px-3 py-2 text-rose-300">{row.error_message ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
