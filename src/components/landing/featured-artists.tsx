import Link from "next/link";

import { ArtistAvatar } from "@/components/landing/artist-avatar";
import type { PublicArtistProfileCard } from "@/lib/artist-profile-service";
import { artistProfileTypeLabel } from "@/lib/artist-profile-type";

export function FeaturedArtists({ artists }: { artists: PublicArtistProfileCard[] }) {
  if (artists.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {artists.map((artist) => (
        <Link
          key={artist.slug}
          href={`/artists/${artist.slug}`}
          className="group flex min-w-0 items-center gap-4 rounded-[26px] border border-white/[0.09] bg-white/[0.025] p-4 transition hover:-translate-y-0.5 hover:border-[#7b61ff]/45 hover:bg-white/[0.045]"
        >
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
            <ArtistAvatar name={artist.displayName} avatarUrl={artist.avatarUrl} />
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-white">{artist.displayName}</h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8cebc7]">
              {artistProfileTypeLabel(artist.profileType)}
            </p>
            <p className="mt-2 truncate text-sm text-white/45">
              {artist.releaseCount} {artist.releaseCount === 1 ? "релиз" : "релизов"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
