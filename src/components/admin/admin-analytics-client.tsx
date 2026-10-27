"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  CloudUpload,
  FileSpreadsheet,
  Loader2,
  X
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { SpotlightCard } from "@/components/plugins/spotlight-card";
import {
  ANALYTICS_PERIOD_OPTIONS,
  getAnalyticsPeriodLabel,
  type AnalyticsPeriodDays
} from "@/lib/analytics-period";
import { cn } from "@/lib/utils";

interface ImportJobItem {
  id: string;
  sourceFileName: string;
  reportDate: string;
  periodDays: number;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "PARTIAL" | "FAILED";
  totalRows: number;
  importedRows: number;
  matchedRows: number;
  unmatchedRows: number;
  affectedUsersCount: number;
  affectedReleasesCount: number;
  errorMessage: string | null;
  progressPercent: number;
  progressStage: string | null;
  startedAt: string | null;
  createdAt: string;
  finishedAt: string | null;
  storedFilePath: string | null;
}

// Файл, который ещё едет на сервер: у него пока нет задачи импорта.
interface LocalUpload {
  key: string;
  fileName: string;
  sizeBytes: number;
  periodDays: AnalyticsPeriodDays;
  percent: number;
  error: string | null;
}

function normalizeImportJob(input: Record<string, unknown>): ImportJobItem {
  const readString = (...keys: string[]): string => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "string") return value;
      if (value instanceof Date) return value.toISOString();
    }
    return "";
  };

  const readNumber = (...keys: string[]): number => {
    for (const key of keys) {
      const value = input[key];
      if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return 0;
  };

  const statusRaw = readString("status");
  const status: ImportJobItem["status"] =
    statusRaw === "PENDING" ||
    statusRaw === "PROCESSING" ||
    statusRaw === "SUCCESS" ||
    statusRaw === "PARTIAL" ||
    statusRaw === "FAILED"
      ? statusRaw
      : "FAILED";

  return {
    id: readString("id"),
    sourceFileName: readString("sourceFileName", "source_file_name"),
    reportDate: readString("reportDate", "report_date"),
    periodDays: readNumber("periodDays", "period_days") || 30,
    status,
    totalRows: readNumber("totalRows", "total_rows"),
    importedRows: readNumber("importedRows", "imported_rows"),
    matchedRows: readNumber("matchedRows", "matched_rows"),
    unmatchedRows: readNumber("unmatchedRows", "unmatched_rows"),
    affectedUsersCount: readNumber("affectedUsersCount", "affected_users_count"),
    affectedReleasesCount: readNumber("affectedReleasesCount", "affected_releases_count"),
    errorMessage: readString("errorMessage", "error_message") || null,
    progressPercent: readNumber("progressPercent", "progress_percent"),
    progressStage: readString("progressStage", "progress_stage") || null,
    startedAt: readString("startedAt", "started_at") || null,
    createdAt: readString("createdAt", "created_at"),
    finishedAt: readString("finishedAt", "finished_at") || null,
    storedFilePath: readString("storedFilePath", "stored_file_path") || null
  };
}

type OrphanSource = {
  source_file_name: string;
  rows: number;
  streams: number;
  from: string | null;
  to: string | null;
};

const PERIOD_CARDS: Record<
  AnalyticsPeriodDays,
  { title: string; hint: string; icon: React.ComponentType<{ className?: string }>; accent: string; glow: string }
> = {
  7: {
    title: "Неделя",
    hint: "Отчёт за последние 7 дней",
    icon: CalendarDays,
    accent: "text-sky-300 bg-sky-400/10 border-sky-400/25",
    glow: "from-sky-400/70"
  },
  30: {
    title: "30 дней",
    hint: "Отчёт за последний месяц",
    icon: CalendarRange,
    accent: "text-violet-300 bg-violet-400/10 border-violet-400/25",
    glow: "from-violet-400/70"
  },
  180: {
    title: "6 месяцев",
    hint: "Отчёт за последние полгода",
    icon: CalendarClock,
    accent: "text-amber-300 bg-amber-400/10 border-amber-400/25",
    glow: "from-amber-400/70"
  },
  365: {
    title: "Год",
    hint: "Отчёт за последние 12 месяцев",
    icon: Calendar,
    accent: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25",
    glow: "from-emerald-400/70"
  }
};

function statusLabel(status: ImportJobItem["status"]): string {
  if (status === "PENDING") return "В очереди";
  if (status === "PROCESSING") return "Обрабатывается";
  if (status === "SUCCESS") return "Готово";
  if (status === "PARTIAL") return "Частично";
  return "Ошибка";
}

function statusTone(status: ImportJobItem["status"]): string {
  if (status === "SUCCESS") return "text-emerald-200 bg-emerald-500/15 border-emerald-500/25";
  if (status === "PARTIAL") return "text-amber-200 bg-amber-500/15 border-amber-500/25";
  if (status === "FAILED") return "text-rose-200 bg-rose-500/15 border-rose-500/25";
  return "text-sky-200 bg-sky-500/15 border-sky-500/25";
}

function isActiveJob(job: ImportJobItem): boolean {
  return job.status === "PENDING" || job.status === "PROCESSING";
}

function formatBytes(value: number): string {
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(value / 1024))} КБ`;
}

function formatElapsed(fromIso: string | null, toIso: string | null): string | null {
  if (!fromIso) return null;
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const seconds = Math.max(0, Math.round((to - from) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} мин ${seconds % 60} с` : `${seconds} с`;
}

// fetch не умеет сообщать, сколько файла уже отправлено, поэтому загрузка идёт через XHR.
function uploadWithProgress(
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ ok: boolean; payload: { ok?: boolean; job_id?: string; error?: string } | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/analytics/import");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress((event.loaded / event.total) * 100);
    };
    xhr.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status === 413) {
        resolve({ ok: false, payload: { error: "Файл слишком большой для сервера: увеличьте лимит загрузки в прокси." } });
        return;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, payload });
    };
    xhr.onerror = () => reject(new Error("Не удалось отправить файл: соединение прервалось."));
    xhr.send(formData);
  });
}

function PeriodUploadCard({
  periodDays,
  lastJob,
  busy,
  onUpload
}: {
  periodDays: AnalyticsPeriodDays;
  lastJob: ImportJobItem | null;
  busy: boolean;
  onUpload: (file: File, periodDays: AnalyticsPeriodDays) => void;
}) {
  const config = PERIOD_CARDS[periodDays];
  const Icon = config.icon;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [file, setFile] = React.useState<File | null>(null);

  const pick = (next: File | null | undefined) => {
    if (!next) return;
    setFile(next);
  };

  return (
    <SpotlightCard className="flex min-w-0 flex-col rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
      <div className={cn("absolute inset-x-6 top-0 h-px bg-gradient-to-r to-transparent", config.glow)} aria-hidden />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl border", config.accent)}>
            <Icon className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-[16px] font-semibold text-white">{config.title}</h3>
            <p className="text-[12.5px] text-white/55">{config.hint}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files?.[0]);
        }}
        className={cn(
          "mt-4 flex min-h-[112px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
          dragging ? "border-white/45 bg-white/[0.07]" : "border-white/15 bg-black/20 hover:border-white/30 hover:bg-white/[0.04]",
          busy && "cursor-not-allowed opacity-60"
        )}
      >
        {file ? (
          <>
            <FileSpreadsheet className="h-6 w-6 text-white/80" />
            <span className="max-w-full truncate text-[13px] font-medium text-white">{file.name}</span>
            <span className="text-[12px] text-white/50">{formatBytes(file.size)} · нажмите, чтобы выбрать другой</span>
          </>
        ) : (
          <>
            <CloudUpload className="h-6 w-6 text-white/55" />
            <span className="text-[13px] font-medium text-white/85">Перетащите CSV сюда</span>
            <span className="text-[12px] text-white/45">или нажмите, чтобы выбрать файл</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(event) => {
          pick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      <button
        type="button"
        disabled={!file || busy}
        onClick={() => {
          if (!file) return;
          onUpload(file, periodDays);
          setFile(null);
        }}
        className="mt-3 h-10 rounded-xl bg-white text-[13px] font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
      >
        {busy ? "Файл обрабатывается…" : `Загрузить «${config.title}»`}
      </button>

      <div className="mt-4 border-t border-white/[0.06] pt-3 text-[12px] text-white/55">
        {lastJob ? (
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate" title={lastJob.sourceFileName}>
              Последний: {lastJob.sourceFileName}
            </span>
            <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[11px]", statusTone(lastJob.status))}>
              {statusLabel(lastJob.status)}
            </span>
          </div>
        ) : (
          <span>Отчётов за этот период ещё нет</span>
        )}
      </div>
    </SpotlightCard>
  );
}

function ProgressBar({ value, tone }: { value: number; tone: "active" | "success" | "warning" | "error" }) {
  const color =
    tone === "success"
      ? "from-emerald-400 to-emerald-300"
      : tone === "warning"
        ? "from-amber-400 to-amber-300"
        : tone === "error"
          ? "from-rose-500 to-rose-400"
          : "from-sky-400 via-blue-500 to-violet-500";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-r", color)}
        initial={false}
        animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}

function StepDot({ state, label }: { state: "done" | "active" | "idle" | "error"; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-full border text-[9px]",
          state === "done" && "border-emerald-400/50 bg-emerald-400/20 text-emerald-200",
          state === "active" && "border-sky-400/60 bg-sky-400/20 text-sky-100",
          state === "error" && "border-rose-400/60 bg-rose-400/20 text-rose-100",
          state === "idle" && "border-white/15 bg-white/5 text-white/40"
        )}
      >
        {state === "done" ? "✓" : state === "error" ? "!" : ""}
      </span>
      <span className={cn(state === "idle" ? "text-white/40" : "text-white/75")}>{label}</span>
    </span>
  );
}

function UploadProgressItem({
  title,
  periodDays,
  uploadState,
  processState,
  percent,
  tone,
  stage,
  meta,
  onDismiss
}: {
  title: string;
  periodDays: number;
  uploadState: "done" | "active" | "error";
  processState: "done" | "active" | "idle" | "error";
  percent: number;
  tone: "active" | "success" | "warning" | "error";
  stage: string;
  meta: string | null;
  onDismiss?: () => void;
}) {
  const running = tone === "active";
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24 }}
      className="rounded-xl border border-white/[0.08] bg-black/25 p-3.5"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0">
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin text-sky-300" />
          ) : tone === "error" ? (
            <AlertTriangle className="h-4 w-4 text-rose-300" />
          ) : tone === "warning" ? (
            <AlertTriangle className="h-4 w-4 text-amber-300" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-medium text-white" title={title}>
              {title}
            </span>
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80"
                aria-label="Скрыть"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="mt-0.5 text-[11.5px] text-white/45">{getAnalyticsPeriodLabel(periodDays)}</div>
        </div>
        <span className="shrink-0 text-[13px] font-semibold tabular-nums text-white/85">{Math.round(percent)}%</span>
      </div>

      <div className="mt-3">
        <ProgressBar value={percent} tone={tone} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
        <StepDot state={uploadState} label="Загрузка файла" />
        <span className="h-px w-3 bg-white/15" aria-hidden />
        <StepDot state={processState} label="Обработка" />
      </div>
      <div className="mt-2 text-[12px] leading-snug text-white/65">{stage}</div>
      {meta ? <div className="mt-1 text-[11.5px] text-white/40">{meta}</div> : null}
    </motion.li>
  );
}

export function AdminAnalyticsClient() {
  const [error, setError] = React.useState<string | null>(null);
  const [jobs, setJobs] = React.useState<ImportJobItem[]>([]);
  const [uploads, setUploads] = React.useState<LocalUpload[]>([]);
  // Задачи, которые админ запустил на этой странице: держим их в панели и после окончания, пока не скроет.
  const [watchedJobIds, setWatchedJobIds] = React.useState<string[]>([]);
  const [orphans, setOrphans] = React.useState<OrphanSource[]>([]);
  const [cleaning, setCleaning] = React.useState(false);
  const [, forceTick] = React.useState(0);

  const loadOrphans = React.useCallback(async () => {
    const response = await fetch("/api/admin/analytics/imports/orphans", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { orphans?: OrphanSource[] } | null;
    if (response.ok && payload?.orphans) setOrphans(payload.orphans);
  }, []);

  React.useEffect(() => {
    void loadOrphans().catch(() => undefined);
  }, [loadOrphans]);

  async function cleanupOrphans() {
    const totalStreams = orphans.reduce((sum, item) => sum + item.streams, 0);
    const confirmed = window.confirm(
      `Удалить из аналитики данные ${orphans.length} удалённых отчётов (${totalStreams.toLocaleString("ru-RU")} прослушиваний)? Это действие нельзя отменить.`
    );
    if (!confirmed) return;

    setCleaning(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/analytics/imports/orphans", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Не удалось очистить данные удалённых отчётов");
      await loadOrphans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось очистить данные удалённых отчётов");
    } finally {
      setCleaning(false);
    }
  }

  const loadJobs = React.useCallback(async () => {
    const response = await fetch("/api/admin/analytics/imports?limit=200", { method: "GET", cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as
      | { items?: Array<Record<string, unknown>>; error?: string }
      | null;

    if (!response.ok || !payload?.items) {
      throw new Error(payload?.error ?? "Не удалось загрузить историю импортов");
    }

    setJobs(payload.items.map(normalizeImportJob));
  }, []);

  const hasActiveWork = uploads.length > 0 || jobs.some(isActiveJob);

  React.useEffect(() => {
    void loadJobs().catch((e) => {
      setError(e instanceof Error ? e.message : "Не удалось загрузить историю импортов");
    });
  }, [loadJobs]);

  // Пока что-то обрабатывается, опрашиваем чаще, чтобы полоса двигалась плавно.
  React.useEffect(() => {
    const timer = setInterval(
      () => {
        void loadJobs().catch(() => undefined);
        forceTick((value) => value + 1);
      },
      hasActiveWork ? 1500 : 5000
    );
    return () => clearInterval(timer);
  }, [loadJobs, hasActiveWork]);

  async function startUpload(file: File, periodDays: AnalyticsPeriodDays) {
    const key = `${Date.now()}-${file.name}`;
    setError(null);
    setUploads((current) => [
      ...current,
      { key, fileName: file.name, sizeBytes: file.size, periodDays, percent: 0, error: null }
    ]);

    const update = (patch: Partial<LocalUpload>) =>
      setUploads((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("period_days", String(periodDays));

      const { ok, payload } = await uploadWithProgress(formData, (percent) => update({ percent }));
      if (!ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Сервер не принял файл");
      }

      if (payload.job_id) {
        const jobId = payload.job_id;
        setWatchedJobIds((current) => [jobId, ...current.filter((id) => id !== jobId)]);
      }
      await loadJobs().catch(() => undefined);
      setUploads((current) => current.filter((item) => item.key !== key));
    } catch (e) {
      update({ error: e instanceof Error ? e.message : "Не удалось загрузить файл" });
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
        throw new Error(payload?.error ?? "Не удалось запустить повторную обработку");
      }
      setWatchedJobIds((current) => [jobId, ...current.filter((id) => id !== jobId)]);
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось запустить повторную обработку");
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
        throw new Error(payload?.error ?? "Не удалось пересчитать итоги");
      }
      await loadJobs();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось пересчитать итоги");
    }
  }

  async function removeJob(jobId: string, fileName: string) {
    const confirmed = window.confirm(
      `Удалить импорт «${fileName}» из истории и убрать связанную аналитику этого отчёта?`
    );
    if (!confirmed) return;

    setError(null);
    try {
      const response = await fetch(`/api/admin/analytics/imports/${jobId}`, {
        method: "DELETE"
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить импорт");
      }
      setWatchedJobIds((current) => current.filter((id) => id !== jobId));
      await loadJobs();
      await loadOrphans();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить импорт");
    }
  }

  const lastJobByPeriod = React.useMemo(() => {
    const map = new Map<number, ImportJobItem>();
    for (const job of jobs) {
      if (!map.has(job.periodDays)) map.set(job.periodDays, job);
    }
    return map;
  }, [jobs]);

  const busyPeriods = new Set<number>([
    ...uploads.filter((item) => !item.error).map((item) => item.periodDays),
    ...jobs.filter(isActiveJob).map((job) => job.periodDays)
  ]);

  const panelJobs = jobs.filter((job) => isActiveJob(job) || watchedJobIds.includes(job.id));

  return (
    <div className="space-y-6 pb-10">
      {orphans.length > 0 ? (
        <section className="rounded-2xl border border-amber-400/30 bg-amber-500/[0.08] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[17px] font-semibold text-amber-100">
                В аналитике остались данные удалённых отчётов: {orphans.length}
              </h2>
              <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-amber-100/75">
                Эти файлы удалены из истории импортов, но их прослушивания всё ещё видны артистам. Раньше удаление
                убирало данные только за дату из названия файла.
              </p>
            </div>
            <button
              type="button"
              disabled={cleaning}
              onClick={() => {
                void cleanupOrphans();
              }}
              className="rounded-lg border border-amber-300/40 bg-amber-400/15 px-3.5 py-2 text-[13px] font-semibold text-amber-50 hover:bg-amber-400/25 disabled:opacity-50"
            >
              {cleaning ? "Удаляем..." : "Убрать эти данные из аналитики"}
            </button>
          </div>
          <ul className="mt-3 grid gap-1.5 text-[12.5px] text-amber-50/80 sm:grid-cols-2">
            {orphans.map((item) => (
              <li key={item.source_file_name} className="truncate">
                {item.source_file_name} · {item.from} → {item.to} · {item.streams.toLocaleString("ru-RU")} прослушиваний
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2.5 text-[13px] text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-[20px] font-semibold text-white">Загрузка отчётов</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/55">
                Выберите карточку под период отчёта — артисты увидят его на одноимённой вкладке аналитики. Подходит
                CSV с русскими или английскими столбцами, разделитель — запятая или точка с запятой.
              </p>
            </div>
            <Link
              href="/admin/analytics/unmatched"
              className="rounded-lg border border-white/15 px-3 py-1.5 text-[12.5px] font-medium text-white/80 hover:bg-white/10"
            >
              Ненайденные UPC
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ANALYTICS_PERIOD_OPTIONS.map((option) => (
              <PeriodUploadCard
                key={option.days}
                periodDays={option.days}
                lastJob={lastJobByPeriod.get(option.days) ?? null}
                busy={busyPeriods.has(option.days)}
                onUpload={(file, days) => {
                  void startUpload(file, days);
                }}
              />
            ))}
          </div>
        </section>

        <aside className="order-first min-w-0 xl:sticky xl:top-6 xl:order-none xl:self-start">
          <div className="rounded-2xl border border-white/[0.08] bg-[#161720] p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-white">Ход загрузки</h2>
              {hasActiveWork ? (
                <span className="flex items-center gap-1.5 text-[11.5px] text-sky-200/80">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
                  идёт обработка
                </span>
              ) : null}
            </div>

            {uploads.length === 0 && panelJobs.length === 0 ? (
              <p className="mt-3 text-[12.5px] leading-relaxed text-white/45">
                Здесь появится загрузка файла и ход его обработки — с процентами и текущим этапом.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                <AnimatePresence initial={false}>
                  {uploads.map((item) => (
                    <UploadProgressItem
                      key={item.key}
                      title={item.fileName}
                      periodDays={item.periodDays}
                      uploadState={item.error ? "error" : "active"}
                      processState="idle"
                      percent={item.percent}
                      tone={item.error ? "error" : "active"}
                      stage={item.error ?? `Отправляем файл на сервер · ${formatBytes(item.sizeBytes)}`}
                      meta={null}
                      onDismiss={
                        item.error
                          ? () => setUploads((current) => current.filter((upload) => upload.key !== item.key))
                          : undefined
                      }
                    />
                  ))}
                  {panelJobs.map((job) => {
                    const active = isActiveJob(job);
                    const tone =
                      job.status === "FAILED"
                        ? "error"
                        : job.status === "PARTIAL"
                          ? "warning"
                          : active
                            ? "active"
                            : "success";
                    const stage = active
                      ? job.status === "PENDING"
                        ? "В очереди на обработку"
                        : job.progressStage ?? "Обрабатываем"
                      : job.status === "FAILED"
                        ? job.errorMessage ?? "Обработка завершилась с ошибкой"
                        : `Записано ${job.matchedRows.toLocaleString("ru-RU")} строк · ${job.affectedReleasesCount} релизов` +
                          (job.unmatchedRows > 0
                            ? ` · без релиза: ${job.unmatchedRows.toLocaleString("ru-RU")}`
                            : "");
                    const elapsed = formatElapsed(job.startedAt ?? job.createdAt, active ? null : job.finishedAt);
                    return (
                      <UploadProgressItem
                        key={job.id}
                        title={job.sourceFileName}
                        periodDays={job.periodDays}
                        uploadState="done"
                        processState={job.status === "FAILED" ? "error" : active ? "active" : "done"}
                        percent={active ? job.progressPercent : job.status === "FAILED" ? job.progressPercent : 100}
                        tone={tone}
                        stage={stage}
                        meta={elapsed ? `${active ? "Идёт" : "Заняло"} ${elapsed}` : null}
                        onDismiss={
                          active
                            ? undefined
                            : () => setWatchedJobIds((current) => current.filter((id) => id !== job.id))
                        }
                      />
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </aside>
      </div>

      <section className="rounded-2xl border border-white/[0.08] bg-[#161720] p-5">
        <h2 className="text-[18px] font-semibold text-white">История импортов</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-[13px] text-white/85">
            <thead className="text-[12px] text-white/45">
              <tr>
                <th className="px-2 py-2 font-medium">Загружен</th>
                <th className="px-2 py-2 font-medium">Файл</th>
                <th className="px-2 py-2 font-medium">Период</th>
                <th className="px-2 py-2 font-medium">Статус</th>
                <th className="px-2 py-2 text-right font-medium">Строк</th>
                <th className="px-2 py-2 text-right font-medium">Записано</th>
                <th className="px-2 py-2 text-right font-medium">Без релиза</th>
                <th className="px-2 py-2 text-right font-medium">Артистов</th>
                <th className="px-2 py-2 text-right font-medium">Релизов</th>
                <th className="px-2 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-white/[0.06]">
                  <td className="whitespace-nowrap px-2 py-2.5 text-white/60">
                    {new Date(job.createdAt).toLocaleString("ru-RU", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </td>
                  <td className="max-w-[260px] truncate px-2 py-2.5" title={job.sourceFileName}>
                    {job.sourceFileName}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">{getAnalyticsPeriodLabel(job.periodDays)}</td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] ${statusTone(job.status)}`}>
                      {statusLabel(job.status)}
                      {job.status === "PROCESSING" ? ` · ${job.progressPercent}%` : ""}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{job.totalRows.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{job.matchedRows.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{job.unmatchedRows.toLocaleString("ru-RU")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{job.affectedUsersCount}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{job.affectedReleasesCount}</td>
                  <td className="px-2 py-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Link
                        href={`/admin/analytics/imports/${job.id}`}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                      >
                        Подробнее
                      </Link>
                      {job.storedFilePath ? (
                        <a
                          href={`/api/admin/analytics/imports/${job.id}/file`}
                          className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10"
                        >
                          Скачать CSV
                        </a>
                      ) : null}
                      <button
                        type="button"
                        disabled={isActiveJob(job)}
                        onClick={() => {
                          void reprocess(job.id);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10 disabled:opacity-40"
                      >
                        Обработать заново
                      </button>
                      <button
                        type="button"
                        disabled={isActiveJob(job)}
                        onClick={() => {
                          void recalc(job.id);
                        }}
                        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white/85 hover:bg-white/10 disabled:opacity-40"
                      >
                        Пересчитать итоги
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void removeJob(job.id, job.sourceFileName);
                        }}
                        className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/15"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-2 py-6 text-center text-white/50">
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
