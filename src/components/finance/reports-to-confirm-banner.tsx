"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet, X } from "lucide-react";

import { formatRubCurrency } from "@/lib/currency-format";
import { pluralReports } from "@/lib/report-confirm-reminder";

const DISMISS_KEY = "icm:reports-to-confirm-dismissed";

/**
 * Banner on every cabinet page while reports wait for the artist's confirmation: their money
 * reaches the balance only after it. Hidden on the finance page, where the reports are; closing
 * it hides it until the browser tab is closed, and a new report brings it back.
 */
export function ReportsToConfirmBanner({
  count,
  amount,
  quarterLabels
}: {
  count: number;
  amount: number;
  quarterLabels: string[];
}) {
  const pathname = usePathname();
  const signature = `${count}:${amount}`;
  const [dismissed, setDismissed] = React.useState(true);

  React.useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === signature);
    } catch {
      setDismissed(false);
    }
  }, [signature]);

  if (count === 0 || dismissed || pathname?.startsWith("/dashboard/finance")) return null;

  const periods = quarterLabels.length > 0 && quarterLabels.length <= 3 ? quarterLabels.join(", ") : null;

  return (
    <div className="relative mb-5 mt-1 flex flex-col gap-3 overflow-hidden rounded-[22px] border border-amber-300/25 bg-[linear-gradient(110deg,rgba(251,191,36,0.13),rgba(123,97,255,0.10)_70%)] p-4 pr-12 sm:flex-row sm:items-center sm:gap-4 sm:p-5 sm:pr-14">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-300/15 text-amber-200">
        <FileSpreadsheet className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-white">
          {count === 1 ? "Отчёт ждёт подтверждения" : `${count} ${pluralReports(count)} ждут подтверждения`}
          {" · "}
          <span className="tabular-nums text-amber-200">{formatRubCurrency(amount)}</span>
        </p>
        <p className="mt-1 text-[13px] leading-5 text-white/60">
          {periods ? `${periods}. ` : ""}{count === 1 ? "Подтвердите отчёт" : "Подтвердите отчёты"} — деньги попадут на баланс, и можно будет заказать выплату.
        </p>
      </div>
      <Link
        href="/dashboard/finance"
        className="inline-flex h-11 shrink-0 items-center justify-center rounded-2xl bg-amber-300 px-6 text-[14px] font-semibold text-[#1a1407] transition hover:brightness-105"
      >
        Подтвердить
      </Link>
      <button
        type="button"
        aria-label="Скрыть"
        onClick={() => {
          setDismissed(true);
          try {
            window.sessionStorage.setItem(DISMISS_KEY, signature);
          } catch {
            // Nothing to remember without storage: the banner is back on the next page.
          }
        }}
        className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
