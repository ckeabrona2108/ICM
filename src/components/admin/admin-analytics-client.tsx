"use client";

import Link from "next/link";
import * as React from "react";

interface ImportJobItem {
  id: string;
  sourceFileName: string;
  reportDate: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL" | "FAILED";
  totalRows: number;
  importedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  affectedUsersCount: number;
  affectedReleasesCount: number;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  storedFilePath: string | null;
}

interface ImportResultView {
  source_file_name: string;
  report_date: string;
  total_rows: number;
  imported_rows: number;
  matched_rows: number;
  unmatched_rows: number;
  affected_users_count: number;
  affected_releases_count: number;
  status: "success" | "partial" | "failed";
}

function statusLabel(status: ImportJobItem["status"]): string {
  if (status === "PENDING") return "pending";
  if (status === "PROCESSING") return "processing";
  if (status === "SUCCESS") return "success";
  if (status === "PARTIAL") return "partial";
  return "failed";
}

function statusTone(status: ImportJobItem["status"]): string {
  if (status === "SUCCESS") return "text-emerald-200 bg-emerald-500/15 border-emerald-500/25";
  if (status === "PARTIAL") return "text-amber-200 bg-amber-500/15 border-amber-500/25";
  if (status === "FAILED") return "text-rose-200 bg-rose-500/15 border-rose-500/25";
  return "text-white/75 bg-white/10 border-white/20";
}

export function AdminAnalyticsClient() {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [jobs, setJobs] = React.useState<ImportJobItem[]>([]);
  const [lastResult, setLastResult] = React.useState<ImportResultView | null>(null);

  const loadJobs = React.useCallback(async () => {
    const response = await fetch("/api/admin/analytics/imports?limit=200", { method: "GET" });
    const payload = (await response.json().catch(() => null)) as
      | { items?: ImportJobItem[]; error?: string }
      | null;

    if (!response.ok || !payload?.items) {
      throw new Error(payload?.error ?? "Не удалось загрузить историю импортов");
    }

    setJobs(payload.items);
  }, []);

  React.useEffect(() => {
    void loadJobs().catch((e) => {
      setError(e instanceof Error ? e.message : "Не удалось загрузить историю импортов");
    });

    const timer = setInterval(() => {
      void loadJobs().catch(() => undefined);
    }, 5000);

    return () => {
      clearInterval(timer);
    };
  }, [loadJobs]);

  async function submitImport() {
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);

      const response = await fetch("/api/admin/analytics/import", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            mode?: "inline" | "background";
            job_id?: string;
            result?: {
              sourceFileName: string;
              reportDate: string;
              totalCsvRows: number;
              importedRows: number;
              matchedRows: number;
              unmatchedRows: number;
              touchedUsersCount: number;
              touchedReleasesCount: number;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Ошибка импорта CSV");
      }

      if (payload.result) {
        const status: ImportResultView["status"] =
          payload.result.matchedRows > 0 && payload.result.unmatchedRows > 0
            ? "partial"
            : payload.result.matchedRows > 0
              ? "success"
              : "failed";

        setLastResult({
          source_file_name: payload.result.sourceFileName,
          report_date: payload.result.reportDate,
          total_rows: payload.result.totalCsvRows,
          imported_rows: payload.result.importedRows,
          matched_rows: payload.result.matchedRows,
          unmatched_rows: payload.result.unmatchedRows,
          affected_users_count: payload.result.touchedUsersCount,
          affected_releases_count: payload.result.touchedReleasesCount,
          status
        });
      }

      await loadJobs();
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setUploading(false);
    }
  }

  async function reprocess(jobId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics/imports/${jobId}/reprocess`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось запустить reprocess");
      }
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить reprocess");
    }
  }

  async function recalc(jobId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics/imports/${jobId}/recalculate`, {
        method: "POST"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось пересчитать summaries");
      }
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось пересчитать summaries");
    }
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[20px] font-semibold text-white">Upload CSV</h2>
        <p className="mt-1 text-[13px] text-white/60">
          Загрузите CSV вида report_summary_YYYY-MM-DD_HH-mm-ss.csv
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="max-w-full text-[13px] text-white/85 file:mr-3 file:rounded-lg file:border file:border-white/15 file:bg-white/10 file:px-3 file:py-1.5 file:text-[12px] file:font-semibold file:text-white"
          />
          <button
            type="button"
            disabled={!file || uploading}
            onClick={() => {
              void submitImport();
            }}
            className="rounded-lg border border-white/20 bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Импортируем..." : "Импортировать"}
          </button>
          <Link
            href="/admin/analytics/unmatched"
            className="rounded-lg border border-white/20 bg-transparent px-3.5 py-2 text-[13px] font-semibold text-white/85 hover:bg-white/10"
          >
            Unmatched UPC
          </Link>
        </div>

        {lastResult ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-[13px] text-white/80">
            <div>source_file_name: {lastResult.source_file_name}</div>
            <div>report_date: {lastResult.report_date}</div>
            <div>total_rows: {lastResult.total_rows}</div>
            <div>imported_rows: {lastResult.imported_rows}</div>
            <div>matched_rows: {lastResult.matched_rows}</div>
            <div>unmatched_rows: {lastResult.unmatched_rows}</div>
            <div>affected_users_count: {lastResult.affected_users_count}</div>
            <div>affected_releases_count: {lastResult.affected_releases_count}</div>
            <div>status: {lastResult.status}</div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[20px] font-semibold text-white">Import History</h2>

        {error ? (
          <div className="mt-3 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">
            {error}
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-[13px]">
            <thead className="text-white/55">
              <tr>
                <th className="px-2 py-2">date</th>
                <th className="px-2 py-2">file name</th>
                <th className="px-2 py-2">report_date</th>
                <th className="px-2 py-2">status</th>
                <th className="px-2 py-2">total rows</th>
                <th className="px-2 py-2">matched</th>
                <th className="px-2 py-2">unmatched</th>
                <th className="px-2 py-2">affected users</th>
                <th className="px-2 py-2">affected releases</th>
                <th className="px-2 py-2">created_at</th>
                <th className="px-2 py-2">actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-white/10">
                  <td className="px-2 py-2">{job.createdAt.slice(0, 10)}</td>
                  <td className="px-2 py-2">{job.sourceFileName}</td>
                  <td className="px-2 py-2">{job.reportDate.slice(0, 10)}</td>
                  <td className="px-2 py-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusTone(job.status)}`}>
                      {statusLabel(job.status)}
                    </span>
                  </td>
                  <td className="px-2 py-2">{job.totalRows}</td>
                  <td className="px-2 py-2">{job.matchedRows}</td>
                  <td className="px-2 py-2">{job.unmatchedRows}</td>
                  <td className="px-2 py-2">{job.affectedUsersCount}</td>
                  <td className="px-2 py-2">{job.affectedReleasesCount}</td>
                  <td className="px-2 py-2">{new Date(job.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/admin/analytics/imports/${job.id}`}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        view details
                      </Link>
                      {job.storedFilePath ? (
                        <a
                          href={`/api/admin/analytics/imports/${job.id}/file`}
                          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                        >
                          download CSV
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          void reprocess(job.id);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        reprocess
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void recalc(job.id);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        recalculate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2 py-6 text-center text-white/60">
                    История импортов пока пустая.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
