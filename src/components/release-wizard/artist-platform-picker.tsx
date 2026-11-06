"use client";

import * as React from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";

import type { PersonPlatformProfile, PersonRole } from "./wizard-context";

const PERFORMER_ROLES = new Set(["исполнитель", "feat.", "remixer", "соисполнитель"]);

interface PlatformProfile {
  platform: string;
  externalId: string;
  name: string;
  url: string;
  imageUrl: string | null;
}

interface ArtistEntry {
  key: string;
  name: string;
  imageUrl: string | null;
  hint: string | null;
  latestRelease: string | null;
  profiles: PlatformProfile[];
}

interface SearchResult {
  known: PlatformProfile[];
  artists: ArtistEntry[];
}

export function isPerformerRole(role: string): boolean {
  return PERFORMER_ROLES.has(role.trim().toLowerCase());
}

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className="grid shrink-0 place-items-center rounded-full bg-white/[0.08] text-[12px] font-semibold text-white/70"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function toPicked(profile: PlatformProfile): PersonPlatformProfile {
  return {
    platform: profile.platform,
    externalId: profile.externalId,
    name: profile.name,
    url: profile.url,
    imageUrl: profile.imageUrl
  };
}

/**
 * Under a performer name in the wizard: the artist found on platforms as one card, "Это он" picks all of
 * its profiles at once. They go with the release, so links are found by this artist and not a namesake.
 */
export function ArtistPlatformPicker({
  person,
  onChange
}: {
  person: PersonRole;
  onChange: (patch: Pick<PersonRole, "platformProfiles" | "isNewArtist">) => void;
}) {
  const name = person.name.trim();
  const picked = React.useMemo(() => person.platformProfiles ?? [], [person.platformProfiles]);
  const [result, setResult] = React.useState<SearchResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [showOthers, setShowOthers] = React.useState(false);
  const autoAppliedFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    setResult(null);
    setFailed(false);
    setShowOthers(false);
    if (name.length < 2 || !isPerformerRole(person.role)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/platform-links/artist-search?name=${encodeURIComponent(name)}`, { signal: controller.signal, cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          setResult((await response.json()) as SearchResult);
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name !== "AbortError") setFailed(true);
        })
        .finally(() => setLoading(false));
    }, 700);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [name, person.role]);

  // The cabinet already knows this artist from earlier releases: use those profiles right away.
  React.useEffect(() => {
    if (!result || result.known.length === 0 || picked.length > 0 || person.isNewArtist) return;
    if (autoAppliedFor.current === name) return;
    autoAppliedFor.current = name;
    onChange({ platformProfiles: result.known.map(toPicked), isNewArtist: false });
  }, [result, picked.length, person.isNewArtist, name, onChange]);

  if (!isPerformerRole(person.role) || name.length < 2) return null;

  if (person.isNewArtist) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-[13px] text-white/70">
        <span className="inline-flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--ux-accent)]" />
          {name} — новый артист. Профили на площадках привяжутся сами после выхода релиза.
        </span>
        <button type="button" onClick={() => onChange({ platformProfiles: [], isNewArtist: false })} className="text-white/50 hover:text-white">
          Отменить
        </button>
      </div>
    );
  }

  if (picked.length > 0 && !showOthers) {
    const fromCabinet = Boolean(result?.known.length) &&
      picked.every((profile) => result!.known.some((known) => known.externalId === profile.externalId));
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[16px] border border-emerald-400/20 bg-emerald-400/[0.05] px-4 py-3">
        <Avatar src={picked.find((profile) => profile.imageUrl)?.imageUrl ?? null} name={picked[0].name} />
        <div className="min-w-0 flex-1">
          <p className="inline-flex items-center gap-1.5 text-[13.5px] text-white">
            <Check className="h-3.5 w-3.5 text-emerald-300" />
            {picked[0].name}
          </p>
          <p className="text-[12px] text-white/50">
            {fromCabinet ? "Ваш артист из прошлых релизов" : "Это он"} — ссылки найдём по этим профилям
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowOthers(true)}
          className="text-[12.5px] text-white/50 transition hover:text-white"
        >
          Это другой артист
        </button>
      </div>
    );
  }

  const artists = result?.artists ?? [];
  return (
    <div className="overflow-hidden rounded-[16px] border border-white/[0.06] bg-white/[0.02]">
      {loading ? (
        <p className="flex items-center gap-2 px-4 py-3 text-[13px] text-white/60">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ищем «{name}» на площадках…
        </p>
      ) : failed ? (
        <p className="px-4 py-3 text-[13px] text-white/60">Поиск на площадках сейчас недоступен — ссылки можно будет вставить после выхода.</p>
      ) : result && artists.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-white/60">На площадках не нашли артиста «{name}».</p>
      ) : artists.length > 0 ? (
        <>
          <p className="px-4 pb-1 pt-3 text-[12px] text-white/45">Это он? Выберите артиста — по нему найдём ссылки после выхода</p>
          <ul className="divide-y divide-white/[0.05]">
            {artists.map((artist) => (
              <li key={artist.key}>
                <button
                  type="button"
                  onClick={() => {
                    setShowOthers(false);
                    onChange({ platformProfiles: artist.profiles.map(toPicked), isNewArtist: false });
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.04]"
                >
                  <Avatar src={artist.imageUrl} name={artist.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-white">{artist.name}</span>
                    <span className="block truncate text-[12px] text-white/45">
                      {[artist.hint, artist.latestRelease ? `последний: ${artist.latestRelease}` : null].filter(Boolean).join(" · ") || " "}
                    </span>
                  </span>
                  <span className="hidden h-8 shrink-0 items-center gap-1 rounded-[10px] bg-white px-3 text-[12.5px] font-medium text-black sm:inline-flex">
                    <Check className="h-3.5 w-3.5" /> Это он
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-white/[0.05] px-4 py-2.5">
        <button
          type="button"
          onClick={() => {
            setShowOthers(false);
            onChange({ platformProfiles: [], isNewArtist: true });
          }}
          className="rounded-[10px] border border-white/[0.12] bg-white/[0.05] px-3 py-1.5 text-[12.5px] font-medium text-white/85 transition hover:border-white/[0.2] hover:bg-white/[0.09] hover:text-white"
        >
          Новый артист, первый релиз
        </button>
        {showOthers ? (
          <button type="button" onClick={() => setShowOthers(false)} className="inline-flex items-center gap-1 text-[12.5px] text-white/45 hover:text-white">
            <X className="h-3 w-3" /> Оставить выбранного
          </button>
        ) : null}
      </div>
    </div>
  );
}
