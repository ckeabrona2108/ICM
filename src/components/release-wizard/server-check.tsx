"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import type { ReleaseServerCheckResult } from "@/lib/release-server-check";

export type ServerCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "done"; result: ReleaseServerCheckResult }
  | { status: "error"; message: string };

/** "Не закрывайте страницу" plate while the wizard talks to the server. */
export function ServerBusyNotice({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-6 z-[80] w-[calc(100%-32px)] max-w-[420px] -translate-x-1/2 rounded-[20px] border border-white/10 bg-[#161722]/95 px-5 py-4 text-white shadow-[0_24px_60px_-24px_rgba(0,0,0,0.85)] backdrop-blur"
    >
      <div className="flex items-center gap-4">
        <span
          aria-hidden="true"
          className="h-10 w-10 shrink-0 animate-spin rounded-full border-[5px] border-[#fbbf24]/25 border-t-[#fbbf24]"
        />
        <div>
          <p className="text-[15px] font-semibold">Внимание!</p>
          <p className="mt-0.5 text-[13.5px] leading-5 text-white/70">
            Отправляем данные на сервер.
            <br />
            Не закрывайте страницу.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Result of the server re-check, shown at the top of the review step. */
export function ServerCheckSummary({ state, onRetry }: { state: ServerCheckState; onRetry: () => void }) {
  if (state.status === "idle" || state.status === "checking") return null;

  if (state.status === "error") {
    return (
      <div className="rounded-[20px] border border-amber-400/35 bg-amber-500/[0.08] px-4 py-3.5 text-[13.5px] text-amber-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div>
            <p>{state.message}</p>
            <button type="button" onClick={onRetry} className="mt-1 font-semibold text-amber-200 underline-offset-2 hover:underline">
              Проверить ещё раз
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { result } = state;
  if (!result.ok) {
    return (
      <div className="rounded-[20px] border border-rose-400/45 bg-[linear-gradient(180deg,rgba(127,29,29,0.22),rgba(32,18,20,0.92))] px-4 py-3.5 text-[13.5px] text-rose-50">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div className="min-w-0">
            <p className="font-semibold">Сервер нашёл, что поправить перед отправкой</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-rose-100/90">
              {result.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
            <button type="button" onClick={onRetry} className="mt-2 font-semibold text-rose-200 underline-offset-2 hover:underline">
              Проверить ещё раз
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[20px] border border-emerald-400/35 bg-[linear-gradient(180deg,rgba(6,78,59,0.24),rgba(14,22,24,0.92))] px-4 py-3.5 text-[13.5px] text-emerald-50">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
        <div className="min-w-0">
          <p className="font-semibold">Данные проверены на сервере — всё на месте</p>
          <p className="mt-1 leading-5 text-emerald-100/80">
            Убедитесь, что с релизом всё в порядке: название, артисты, обложка, даты и треки. После отправки
            их можно изменить только через повторную модерацию.
          </p>
          {result.payment ? <p className="mt-1.5 leading-5 text-white/85">{result.payment.note}</p> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The artist is sending a new release that looks like a paid one sent back for changes. Fixing the
 * paid release is the usual way; a new release with the same UPC takes its payment over.
 */
export function PaidTwinNotice({ twin }: { twin: { id: string; title: string; match: "upc" | "title" } | null }) {
  if (!twin) return null;
  return (
    <div className="rounded-[20px] border border-amber-400/40 bg-amber-500/[0.08] px-4 py-3.5 text-[13.5px] text-amber-50">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
        <div className="min-w-0">
          <p className="font-semibold">У вас уже есть оплаченный релиз «{twin.title}», он ждёт исправлений</p>
          <p className="mt-1 leading-5 text-amber-100/85">
            {twin.match === "upc"
              ? "Если отправите этот релиз, оплата перенесётся с него, а старый релиз закроется. Но проще исправить оплаченный релиз: там уже есть замечание модератора."
              : "Платить второй раз не нужно: откройте оплаченный релиз и исправьте то, что отметил модератор. Новый релиз с другим UPC будет оплачиваться отдельно."}
          </p>
          <a
            href={`/dashboard/releases/${encodeURIComponent(twin.id)}/edit`}
            className="mt-2 inline-flex font-semibold text-amber-200 underline-offset-2 hover:underline"
          >
            Исправить «{twin.title}»
          </a>
        </div>
      </div>
    </div>
  );
}
