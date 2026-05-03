"use client";

import { AlertTriangle } from "lucide-react";

import type { ModerationRemark } from "@/lib/cabinet-types";

export function ReleaseChangesNotice({
  status = "changes_required",
  reason,
  remarks = [],
  returnedAt
}: {
  status?: "changes_required" | "rejected";
  reason?: string;
  remarks?: ModerationRemark[];
  returnedAt?: string;
}) {
  const isRejected = status === "rejected";
  return (
    <div
      className={
        isRejected
          ? "mt-3 rounded-lg border border-rose-500/22 bg-rose-500/[0.08] px-2.5 py-2"
          : "mt-3 rounded-lg border border-amber-500/18 bg-amber-500/[0.05] px-2.5 py-2"
      }
    >
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={
            isRejected
              ? "mt-0.5 h-3 w-3 shrink-0 text-rose-300/90"
              : "mt-0.5 h-3 w-3 shrink-0 text-amber-400/90"
          }
          strokeWidth={2}
        />
        <div>
          <p
            className={
              isRejected
                ? "text-[10px] leading-snug text-rose-100/90 sm:text-[11px]"
                : "text-[10px] leading-snug text-amber-100/85 sm:text-[11px]"
            }
          >
            {isRejected
              ? "Релиз отклонён."
              : "Запрошены правки. Исправьте замечания и отправьте релиз повторно на модерацию."}
          </p>
          {reason ? (
            <p
              className={
                isRejected
                  ? "mt-1 text-[10px] text-rose-100/80 sm:text-[11px]"
                  : "mt-1 text-[10px] text-amber-100/80 sm:text-[11px]"
              }
            >
              Причина: {reason}
            </p>
          ) : null}
          {returnedAt ? (
            <p
              className={
                isRejected
                  ? "mt-1 text-[10px] text-rose-100/65 sm:text-[11px]"
                  : "mt-1 text-[10px] text-amber-100/65 sm:text-[11px]"
              }
            >
              Возврат с модерации: {returnedAt}
            </p>
          ) : null}
        </div>
      </div>

      {remarks.length > 0 ? (
        <ul
          className={
            isRejected
              ? "mt-2 space-y-1 text-[10px] text-rose-100/80 sm:text-[11px]"
              : "mt-2 space-y-1 text-[10px] text-amber-100/80 sm:text-[11px]"
          }
        >
          {remarks.map((remark, index) => (
            <li key={`${remark.field}-${index}`}>
              • {remark.section ? `${remark.section}: ` : ""}
              {remark.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
