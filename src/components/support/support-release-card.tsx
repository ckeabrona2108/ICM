"use client";

import * as React from "react";
import { Check, Copy, Disc3 } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getSupportReleaseRequestType,
  supportReleaseLinksLabel,
  type SupportReleaseContext
} from "@/lib/support-release-request";

export function SupportReleaseCover({
  src,
  className
}: {
  src: string | null | undefined;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl bg-white/[0.06]", className)}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <Disc3 className="h-1/2 w-1/2 text-white/30" />
      )}
    </span>
  );
}

export function CopyValueButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-white/45 transition hover:bg-white/[0.08] hover:text-white"
      aria-label={label}
      title={label}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/** Release a support ticket is about: shown on top of the chat (artist) and the ticket page (admin). */
export function SupportReleaseCard({
  context,
  adminReleaseHref,
  detailed = false,
  className
}: {
  context: SupportReleaseContext;
  /** Admin only: link to the release page. */
  adminReleaseHref?: string;
  /** Show platforms and links (admin ticket page). */
  detailed?: boolean;
  className?: string;
}) {
  const type = getSupportReleaseRequestType(context.requestType);
  const { release } = context;
  const labels = supportReleaseLinksLabel(context.requestType);
  const linkGroups = context.platformLinks.filter((group) => group.cardUrl || group.releaseUrls.length);

  return (
    <div className={cn("rounded-[18px] border border-white/[0.08] bg-white/[0.03] p-3", className)}>
      <div className="flex items-center gap-3">
        <SupportReleaseCover src={release.coverUrl} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold text-white">{release.title || "Без названия"}</p>
          <p className="truncate text-[12.5px] text-white/50">{release.artist || "Артист не указан"}</p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-[#7b61ff]/16 px-2.5 py-1 text-[11.5px] font-semibold text-[#c4b5fd] sm:inline-flex">
          {type?.title ?? "Вопрос по релизу"}
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-white/60">
        <span className="inline-flex items-center gap-1">
          UPC:{" "}
          <span className="font-mono text-white/85">{release.upc || "ещё не присвоен"}</span>
          {release.upc ? <CopyValueButton value={release.upc} label="Скопировать UPC" /> : null}
        </span>
        <span className="sm:hidden">{type?.title}</span>
        {context.platforms.length ? <span>Площадки: {context.platforms.join(", ")}</span> : null}
        {adminReleaseHref ? (
          <a href={adminReleaseHref} className="font-semibold text-[#c4b5fd] hover:text-white">
            Открыть релиз →
          </a>
        ) : null}
      </div>

      {detailed && linkGroups.length ? (
        <div className="mt-3 grid gap-3 border-t border-white/[0.07] pt-3 text-[13px] sm:grid-cols-2">
          {linkGroups.map((group) => (
            <div key={group.platform} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="text-[13px] font-semibold text-white">{group.platform}</p>
              <div className="mt-2 space-y-2">
                {group.cardUrl ? <LinkRow label={labels.card} urls={[group.cardUrl]} /> : null}
                {group.releaseUrls.length ? <LinkRow label={labels.release} urls={group.releaseUrls} /> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LinkRow({ label, urls }: { label: string; urls: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {urls.map((url) => (
          <li key={url} className="flex items-center gap-1">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="min-w-0 truncate text-sky-300 hover:text-sky-200"
            >
              {url}
            </a>
            <CopyValueButton value={url} label="Скопировать ссылку" />
          </li>
        ))}
      </ul>
    </div>
  );
}
