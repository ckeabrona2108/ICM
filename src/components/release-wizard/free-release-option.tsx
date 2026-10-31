"use client";

import * as React from "react";
import Link from "next/link";
import { Gift } from "lucide-react";

import { isFreeReleaseSubmissionAllowed, type FreeReleaseStatus } from "@/lib/free-release-shared";
import { cn } from "@/lib/utils";

import { useWizard } from "./wizard-context";

// The free first single on the review step: shown only to artists who can still use it.
export function FreeReleaseOption({
  enabled,
  onChange
}: {
  enabled: boolean;
  onChange: (value: boolean) => void;
}) {
  const { data, setStep } = useWizard();
  const [status, setStatus] = React.useState<FreeReleaseStatus | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/free-release", { cache: "no-store" })
      .then((response) => (response.ok ? (response.json() as Promise<FreeReleaseStatus>) : null))
      .then((payload) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const available = status?.state === "available";
  const shape = isFreeReleaseSubmissionAllowed({
    releaseType: data.type,
    releaseKind: data.releaseKind,
    trackCount: data.tracks.length
  });
  // On by default, so an eligible artist never lands on the paid path by accident;
  // once the artist flips it, their choice stays.
  const touchedRef = React.useRef(false);
  React.useEffect(() => {
    if ((!available || !shape.ok) && enabled) onChange(false);
    else if (available && shape.ok && !enabled && !touchedRef.current) onChange(true);
  }, [available, shape.ok, enabled, onChange]);

  if (!status || (status.state !== "available" && status.state !== "locked")) return null;

  return (
    <section className="rounded-[26px] border border-[#7b61ff]/30 bg-[linear-gradient(180deg,rgba(60,40,140,0.45),rgba(11,14,25,0.98))] p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#7b61ff]/20 text-[#c4b5fd]">
          <Gift className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[18px] font-semibold tracking-[-0.02em] text-white">Первый сингл — бесплатно</h3>
          <p className="mt-1 text-[13px] leading-6 text-white/60">
            Один сингл с одним треком, караоке-текст включён. Подписка и оплата не понадобятся.
          </p>
        </div>
      </div>

      {available ? (
        <>
          <label
            className={cn(
              "mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-[18px] border px-4 py-3 transition-colors",
              enabled ? "border-[#a78bfa]/40 bg-[#7b61ff]/[0.12]" : "border-white/[0.08] bg-black/20"
            )}
          >
            <span className="text-[13.5px] font-medium text-white">Выпустить этот релиз бесплатно</span>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!shape.ok}
              onChange={(event) => {
                touchedRef.current = true;
                onChange(event.target.checked);
              }}
              className="h-5 w-5 accent-[#7b61ff]"
            />
          </label>
          {!shape.ok ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-amber-400/20 bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] text-amber-100/90">
              <span>{shape.message}</span>
              <button
                type="button"
                onClick={() => setStep(data.type !== "single" || (data.releaseKind && data.releaseKind !== "standard") ? "intro" : "tracks")}
                className="text-[11px] font-medium text-[#b8a8ff] transition hover:text-white"
              >
                Исправить
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-4 rounded-[16px] border border-white/[0.08] bg-black/20 px-4 py-3 text-[12.5px] leading-6 text-white/70">
          {status.reason ?? "Подпишите договор, привяжите ВКонтакте и подпишитесь на нашу группу."}{" "}
          <Link href="/dashboard" className="font-medium text-[#b8a8ff] transition hover:text-white">
            Что осталось сделать
          </Link>
        </p>
      )}
    </section>
  );
}
