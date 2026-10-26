import Link from "next/link";
import { CreditCard, FilePenLine, Plus } from "lucide-react";

import type { ReleaseResumeCandidate } from "@/lib/release-resume-candidates";

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow"
  });
}

export function ReleaseResumeChooser({ candidates }: { candidates: ReleaseResumeCandidate[] }) {
  return (
    <div className="mx-auto max-w-2xl pb-10">
      <h1 className="text-[24px] font-semibold tracking-tight text-white">У вас есть незавершённые релизы</h1>
      <p className="mt-2 text-[14px] text-white/65">
        Продолжите начатый релиз, чтобы не создавать дубль. Новый релиз можно создать в любой момент.
      </p>

      <div className="mt-6 space-y-3">
        {candidates.map((candidate) => {
          const updatedAt = formatUpdatedAt(candidate.updatedAt);
          const isDraft = candidate.kind === "draft";
          return (
            <div
              key={candidate.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#15161d]/90 p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold text-white">{candidate.title}</p>
                <p className="mt-1 text-[12.5px] text-white/55">
                  {isDraft ? "Черновик" : "Отправлен, ждёт оплаты"}
                  {` · треков: ${candidate.tracksCount}`}
                  {updatedAt ? ` · изменён ${updatedAt}` : ""}
                </p>
              </div>
              <Link
                href={isDraft ? `/dashboard/releases/${candidate.id}/edit` : `/dashboard/releases/${candidate.id}?pay=1`}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#7b3df5] px-3 text-[13px] font-semibold text-white transition hover:bg-[#8f5bf7]"
              >
                {isDraft ? <FilePenLine className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
                {isDraft ? "Продолжить" : "Оплатить"}
              </Link>
            </div>
          );
        })}
      </div>

      <Link
        href="/dashboard/releases/new?fresh=1"
        className="mt-5 inline-flex h-10 items-center gap-1.5 rounded-lg border border-white/[0.14] bg-white/[0.04] px-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.08]"
      >
        <Plus className="h-4 w-4" />
        Создать новый релиз
      </Link>
    </div>
  );
}
