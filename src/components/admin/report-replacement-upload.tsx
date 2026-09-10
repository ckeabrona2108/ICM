"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";

import { formatRubCurrency } from "@/lib/currency-format";

type ReplacementPreview = {
  fileName: string;
  oldAmount: number;
  newAmount: number;
  rows: number;
  skippedRows: number;
  periodStart: string;
  periodEnd: string;
};

export function ReportReplacementUpload({
  userId,
  reportId
}: {
  userId: string;
  reportId: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<ReplacementPreview | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setSelectedFile(file);
    setPreview(null);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(`/api/admin/users/${userId}/reports/${reportId}/replace?preview=1`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось подготовить замену отчёта.");
      }

      setPreview(payload.preview as ReplacementPreview);
    } catch (uploadError) {
      setSelectedFile(null);
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось подготовить замену отчёта.");
    } finally {
      setBusy(false);
    }
  }

  async function applyReplacement() {
    if (!selectedFile || !preview) return;

    setApplying(true);
    setMessage(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("file", selectedFile);
      const response = await fetch(`/api/admin/users/${userId}/reports/${reportId}/replace`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось заменить отчёт.");
      }

      setMessage(
        `Отчёт заменён: ${payload.rows} строк, ${formatRubCurrency(payload.amount)}. Пользователь увидит новую версию.`
      );
      setSelectedFile(null);
      setPreview(null);
      router.refresh();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Не удалось заменить отчёт.");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-4 rounded-2xl border border-sky-300/14 bg-sky-400/[0.045] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-sky-100/70">
            Персональная замена
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/58">
            Загрузите исправленный CSV/XLSX только для этого пользователя. Старый отчёт будет заменён новой версией.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          className="hidden"
          onChange={(event) => {
            void handleFileChange(event);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200/30 bg-sky-400/12 px-4 py-2.5 text-[13px] font-semibold text-sky-50 transition-colors hover:bg-sky-400/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          {busy ? "Считаем..." : preview ? "Выбрать другой файл" : "Подготовить замену"}
        </button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Файл</p>
              <p className="mt-1 truncate text-[13px] font-semibold text-white">{preview.fileName}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Было</p>
              <p className="mt-1 text-[14px] font-semibold text-white">{formatRubCurrency(preview.oldAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Станет</p>
              <p className="mt-1 text-[14px] font-semibold text-emerald-100">{formatRubCurrency(preview.newAmount)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Строки</p>
              <p className="mt-1 text-[14px] font-semibold text-white">
                {preview.rows} принято · {preview.skippedRows} пропущено
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={applying}
              onClick={() => {
                void applyReplacement();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2.5 text-[13px] font-semibold text-[#04110b] transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {applying ? "Применяем..." : "Применить замену"}
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => {
                setSelectedFile(null);
                setPreview(null);
                setError(null);
                setMessage(null);
              }}
              className="inline-flex items-center justify-center rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] font-semibold text-white/72 transition-colors hover:bg-white/[0.08]"
            >
              Отменить
            </button>
          </div>
        </div>
      ) : null}
      {message ? <p className="mt-3 text-[13px] font-medium text-emerald-200">{message}</p> : null}
      {error ? <p className="mt-3 text-[13px] font-medium text-rose-200">{error}</p> : null}
    </div>
  );
}

export function ReportReworkDeleteButton({
  userId,
  reportId
}: {
  userId: string;
  reportId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function deleteRework() {
    const confirmed = window.confirm(
      "Удалить эту доработку? Отчёт пропадёт у пользователя и из списка отчётов на доработке."
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}/reports/${reportId}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Не удалось удалить доработку.");
      }
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить доработку.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          void deleteRework();
        }}
        className="inline-flex items-center justify-center rounded-2xl border border-rose-300/24 bg-rose-500/10 px-4 py-2.5 text-[13px] font-semibold text-rose-100 transition-colors hover:bg-rose-500/18 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Удаляем..." : "Удалить доработку"}
      </button>
      {error ? <p className="mt-2 text-[13px] font-medium text-rose-200">{error}</p> : null}
    </div>
  );
}
