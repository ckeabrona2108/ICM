"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";

import type { FeedPersonCard } from "@/lib/feed-contract";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";

const PROFILE_TYPE_LABELS: Record<FeedPersonCard["profileType"], string> = {
  artist: "Артист",
  producer: "Продюсер",
  group: "Группа",
  label: "Лейбл"
};

const GENERIC_GENRE_LABELS = new Set(["другое", "other"]);

function getUsefulGenres(genres: string[]) {
  return genres.filter((genre) => {
    const normalized = genre.trim().toLowerCase();
    return normalized.length > 0 && !GENERIC_GENRE_LABELS.has(normalized);
  });
}

function getReadableRole(person: FeedPersonCard) {
  if (person.collaborationRole && person.collaborationRole !== "other" && person.displayRole) {
    return person.displayRole;
  }
  return null;
}

function PersonAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const [failed, setFailed] = React.useState(!avatarUrl);

  React.useEffect(() => {
    setFailed(!avatarUrl);
  }, [avatarUrl]);

  const src = avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL;

  return (
    <span className="relative block h-14 w-14 overflow-hidden rounded-full border border-white/10 bg-[#211a42]">
      <Image src={src} alt={name} fill unoptimized className="object-cover" onError={() => setFailed(true)} />
    </span>
  );
}

function formatReleaseDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function releaseCountLabel(value: number) {
  const lastTwo = value % 100;
  const last = value % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${value} релизов`;
  if (last === 1) return `${value} релиз`;
  if (last >= 2 && last <= 4) return `${value} релиза`;
  return `${value} релизов`;
}

export function PersonCard({ person }: { person: FeedPersonCard }) {
  const usefulGenres = getUsefulGenres(person.genres);
  const readableRole = getReadableRole(person);

  return (
    <article className="glass-card grid gap-4 rounded-[28px] p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <PersonAvatar name={person.displayName} avatarUrl={person.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-white">{person.displayName}</h3>
            <span className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/62">
              {PROFILE_TYPE_LABELS[person.profileType]}
            </span>
            {person.collaborationOpen ? (
              <span className="inline-flex items-center rounded-full border border-emerald-400/18 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                Открыт к коллабу
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/55">
            <span>Профиль: {PROFILE_TYPE_LABELS[person.profileType]}</span>
            {readableRole ? <span className="text-white/20">•</span> : null}
            {readableRole ? <span>{readableRole}</span> : null}
            {person.city ? <span className="text-white/20">•</span> : null}
            {person.city ? <span>{person.city}</span> : null}
          </div>
        </div>
      </div>

      {person.bio ? <p className="text-sm leading-6 text-white/72">{person.bio}</p> : null}

      {usefulGenres.length ? (
        <div className="flex flex-wrap gap-2">
          {usefulGenres.slice(0, 4).map((genre) => (
            <span key={`${person.slug}-${genre}`} className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs text-white/58">
              {genre}
            </span>
          ))}
        </div>
      ) : null}

      <div className="rounded-[22px] border border-white/8 bg-white/[0.025] p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">Портфолио</p>
          <span className="text-xs text-white/45">{releaseCountLabel(person.releaseCount)}</span>
        </div>
        <div className="mt-3 grid gap-2">
          {person.portfolio.map((release) => (
            <div key={release.id} className="flex items-center justify-between gap-3 rounded-[16px] border border-white/6 bg-white/[0.03] px-3 py-2.5">
              <span className="min-w-0 truncate text-sm text-white/80">{release.title}</span>
              <span className="shrink-0 text-xs text-white/42">{formatReleaseDate(release.releaseDate)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href={`/artists/${encodeURIComponent(person.slug)}`}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#7b61ff]/28 bg-[#7b61ff]/14 px-5 text-sm font-semibold text-white transition hover:border-[#7b61ff]/48 hover:bg-[#7b61ff]/20"
        >
          Посмотреть профиль
        </Link>
      </div>
    </article>
  );
}
