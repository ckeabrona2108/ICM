"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { CalendarDays, CheckCircle2, ChevronDown, ExternalLink, Music2, Upload } from "lucide-react";

import { ReleaseSceneSettingsClient } from "@/components/releases/release-scene-settings-client";
import type { CabinetRelease } from "@/lib/cabinet-types";
import { resolveRenderableStoredFileUrl } from "@/lib/s3";

interface Props {
  releases: CabinetRelease[];
  highlightReleaseId?: string;
}

function ReleaseCover({ release }: { release: CabinetRelease }) {
  const [failed, setFailed] = React.useState(false);
  const primaryCoverCandidate =
    release.coverUrlCandidates?.find((candidate) => candidate.trim().length > 0) ?? "";
  const src = failed
    ? null
    : resolveRenderableStoredFileUrl({
        url: release.coverUrl || primaryCoverCandidate || release.cover,
        storageKey: null
      });

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-[radial-gradient(circle_at_30%_20%,rgba(110,231,183,0.18),transparent_42%),#0c0e14]">
      {src ? (
        <Image
          src={src}
          alt={`Обложка релиза ${release.title || "Без названия"}`}
          fill
          unoptimized
          sizes="(max-width: 640px) 96px, 128px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-white/25">
          <Music2 className="h-8 w-8" strokeWidth={1.4} />
        </div>
      )}
    </div>
  );
}

function ShowcaseReleaseCard({
  release,
  highlighted
}: {
  release: CabinetRelease;
  highlighted: boolean;
}) {
  const enabled = Boolean(release.sceneShowcase?.enabled);
  const [expanded, setExpanded] = React.useState(highlighted);

  React.useEffect(() => {
    if (highlighted) setExpanded(true);
  }, [highlighted]);

  return (
    <article
      id={`showcase-release-${release.id}`}
      className={`scroll-mt-28 rounded-[24px] border bg-[#11131a]/95 p-4 transition sm:p-5 ${
        highlighted
          ? "border-emerald-300/45 shadow-[0_0_0_1px_rgba(110,231,183,0.08),0_24px_70px_-45px_rgba(110,231,183,0.55)]"
          : "border-white/[0.08]"
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`showcase-settings-${release.id}`}
          onClick={() => setExpanded((current) => !current)}
          className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-center gap-4 rounded-2xl text-left outline-none transition hover:bg-white/[0.025] focus-visible:ring-2 focus-visible:ring-[#7b3df5]/70 sm:grid-cols-[112px_minmax(0,1fr)]"
        >
          <ReleaseCover release={release} />
          <div className="min-w-0 py-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                enabled
                  ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-200"
                  : "border-amber-300/25 bg-amber-300/10 text-amber-100"
              }`}>
                {enabled ? <CheckCircle2 className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                {enabled ? "На витрине" : "Нужен фрагмент"}
              </span>
            </div>
            <h2 className="mt-2 truncate text-xl font-bold tracking-[-0.02em] text-white">
              {release.title || "Без названия"}
            </h2>
            <p className="mt-1 truncate text-sm text-white/52">{release.artist || "Исполнитель не указан"}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-white/40">
              <CalendarDays className="h-3.5 w-3.5" /> Дата выхода: {release.releaseDate}
            </p>
          </div>
        </button>
        <div className="flex flex-col items-end gap-2">
          <ChevronDown className={`h-5 w-5 text-white/40 transition-transform ${expanded ? "rotate-180" : ""}`} />
          <Link
            href={`/dashboard/releases/${encodeURIComponent(release.id)}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#7b3df5]/35 bg-[#7b3df5]/10 px-4 text-sm font-semibold text-[#d8ccff] transition hover:border-[#7b3df5]/60 hover:bg-[#7b3df5]/20 hover:text-white"
          >
            <span className="hidden sm:inline">Открыть релиз</span><ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {expanded ? (
        <div id={`showcase-settings-${release.id}`}>
          <ReleaseSceneSettingsClient
            releaseId={release.id}
            tracks={release.tracks}
            initialState={release.sceneShowcase!}
          />
        </div>
      ) : null}
    </article>
  );
}

export function ReleaseShowcaseDashboardClient({ releases, highlightReleaseId }: Props) {
  React.useEffect(() => {
    if (!highlightReleaseId) return;
    document.getElementById(`showcase-release-${highlightReleaseId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }, [highlightReleaseId]);

  return (
    <div className="grid gap-4">
      {releases.map((release) => (
        <ShowcaseReleaseCard
          key={release.id}
          release={release}
          highlighted={release.id === highlightReleaseId}
        />
      ))}
    </div>
  );
}
