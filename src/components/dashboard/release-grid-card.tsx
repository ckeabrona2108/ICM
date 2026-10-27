"use client";

import * as React from "react";
import Link from "next/link";
import { CreditCard, Music2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CabinetRelease, CabinetReleaseStatus } from "@/lib/cabinet-types";
import { getReleaseStatusDescriptor } from "@/lib/release-status-ui";
import { getReleaseTimelineState } from "@/lib/release-timeline-state";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

const STATUS_TONE: Partial<Record<CabinetReleaseStatus, string>> = {
  approved: "text-emerald-300",
  distributed: "text-emerald-300",
  dsp_confirmed: "text-emerald-300",
  moderation: "text-[#c4b5fd]",
  pending_verification: "text-sky-300",
  changes_required: "text-amber-300",
  rejected: "text-rose-300",
  draft: "text-white/70",
  archived: "text-white/55"
};

/** Cover-first card for the grid view of the releases list. */
export function ReleaseGridCard({ release }: { release: CabinetRelease }) {
  const [coverBroken, setCoverBroken] = React.useState(false);
  const coverSource =
    release.coverUrl ||
    release.coverUrlCandidates?.find((candidate) => candidate.trim().length > 0) ||
    release.cover ||
    "";
  const coverSrc = !coverBroken ? resolveRenderableStoredFileUrl({ url: coverSource, storageKey: null }) : null;
  const status = getReleaseStatusDescriptor(release.status);
  // Неоплаченный релиз на модерации: по клику открывается страница релиза с оплатой.
  const awaitingPayment = getReleaseTimelineState(release.status, release.paid).showPayButton;
  const href =
    release.status === "draft" ? `/dashboard/releases/${release.id}/edit` : `/dashboard/releases/${release.id}`;

  return (
    <Link
      href={href}
      className="group block rounded-[18px] border border-white/[0.08] bg-[#13151d] p-2.5 transition hover:-translate-y-0.5 hover:border-[#7b61ff]/40 hover:shadow-[0_30px_70px_-40px_rgba(123,97,255,0.9)]"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-[#1a1b26]">
        {coverSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverSrc}
            alt=""
            loading="lazy"
            onError={() => setCoverBroken(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgba(123,61,245,0.35),transparent_60%),linear-gradient(135deg,#1a1b26,#101118)]">
            <Music2 className="h-9 w-9 text-white/25" strokeWidth={1.5} />
          </div>
        )}
        {status ? (
          <span
            className={cn(
              "absolute left-2 top-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 truncate rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-bold backdrop-blur-md",
              STATUS_TONE[release.status] ?? "text-white/75"
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {status.label}
          </span>
        ) : null}
        {awaitingPayment ? (
          <span className="absolute inset-x-2 bottom-2 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-2 py-1.5 text-[11.5px] font-bold text-[#1a1300]">
            <CreditCard className="h-3.5 w-3.5" />
            Ждёт оплаты — оплатить
          </span>
        ) : null}
      </div>
      <div className="px-1 pb-0.5 pt-2.5">
        <p className="truncate text-[14px] font-semibold text-white">{release.title?.trim() || "Без названия"}</p>
        <p className="truncate text-[12px] text-white/50">{release.artist?.trim() || "Исполнитель не указан"}</p>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-white/45">
          <span className="truncate">{release.releaseDate?.trim() || "Дата не выбрана"}</span>
          {release.upc?.trim() ? <span className="truncate tabular-nums">UPC {release.upc.trim()}</span> : null}
        </div>
      </div>
    </Link>
  );
}
