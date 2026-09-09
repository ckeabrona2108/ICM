"use client";

import * as React from "react";
import Link from "next/link";
import { Search, UsersRound } from "lucide-react";

import { ArtistAvatar } from "@/components/landing/artist-avatar";
import type { PublicArtistProfileCard } from "@/lib/artist-profile-service";
import { artistProfileTypeLabel } from "@/lib/artist-profile-type";
import { readJsonResponse } from "@/lib/client-json-response";

type ArtistSearchPayload = {
  artists?: PublicArtistProfileCard[];
  error?: string;
};

export function ArtistDirectory() {
  const [query, setQuery] = React.useState("");
  const deferredQuery = React.useDeferredValue(query);
  const [artists, setArtists] = React.useState<PublicArtistProfileCard[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/artists/search?q=${encodeURIComponent(deferredQuery)}&limit=15`, {
      signal: controller.signal
    }).then(async (response) => {
      const payload = await readJsonResponse<ArtistSearchPayload>(response, "Не удалось найти артистов");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось найти артистов");
      setArtists(payload.artists ?? []);
      setError(null);
    }).catch((loadError) => {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Не удалось найти артистов");
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, [deferredQuery]);

  return (
    <div>
      <label className="mx-auto flex h-16 max-w-2xl items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-5 shadow-[0_24px_70px_-40px_rgba(123,97,255,0.8)] focus-within:border-[#7b61ff]/60">
        <Search className="h-5 w-5 shrink-0 text-[#8cebc7]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Артист или релиз"
          className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/32"
          autoComplete="off"
        />
      </label>

      {error ? <p className="mt-6 text-center text-sm text-rose-300">{error}</p> : null}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {artists.map((artist) => (
          <Link
            key={artist.slug}
            href={`/artists/${artist.slug}`}
            className="group flex min-w-0 items-center gap-4 rounded-[26px] border border-white/[0.09] bg-white/[0.025] p-4 transition hover:-translate-y-0.5 hover:border-[#7b61ff]/40 hover:bg-white/[0.045]"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
              <ArtistAvatar name={artist.displayName} avatarUrl={artist.avatarUrl} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold text-white">{artist.displayName}</h2>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#8cebc7]">
                {artistProfileTypeLabel(artist.profileType)}
              </p>
              <p className="mt-2 truncate text-sm text-white/45">
                {artist.releaseTitles.join(" · ") || `${artist.releaseCount} релизов`}
              </p>
            </div>
          </Link>
        ))}
      </div>
      {!loading && artists.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-[28px] border border-dashed border-white/10 p-10 text-center text-white/45">
          <UsersRound className="h-8 w-8" />
          <p className="mt-3">По этому запросу артистов не найдено.</p>
        </div>
      ) : null}
      {loading ? <p className="mt-8 text-center text-sm text-white/35">Ищем артистов...</p> : null}
    </div>
  );
}
