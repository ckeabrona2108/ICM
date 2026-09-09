"use client";

import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { ExternalLink, Music2, UserMinus, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { readJsonResponse } from "@/lib/client-json-response";
import { artistProfileTypeLabel, type ArtistProfileType } from "@/lib/artist-profile-type";

type Subscription = {
  id: string;
  followedAt: string;
  artist: {
    slug: string;
    displayName: string;
    profileType: "user" | ArtistProfileType;
    avatarUrl: string | null;
  };
  latestReleases: Array<{
    id: string;
    title: string;
    releaseDate: string;
    genre: string;
    coverUrl: string | null;
    sceneHref: string | null;
  }>;
};

type SubscriptionsPayload = { subscriptions: Subscription[]; error?: string };
type FollowPayload = { following?: boolean; error?: string };

export function ArtistSubscriptionsPanel() {
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busySlug, setBusySlug] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/user/artist-profile/subscriptions", { cache: "no-store" });
      const payload = await readJsonResponse<SubscriptionsPayload>(response, "Не удалось загрузить подписки");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить подписки");
      setSubscriptions(payload.subscriptions);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить подписки");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function unsubscribe(slug: string) {
    setBusySlug(slug);
    setError(null);
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/follow`, { method: "POST" });
      const payload = await readJsonResponse<FollowPayload>(response, "Не удалось отписаться");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось отписаться");
      if (payload.following !== false) throw new Error("Подписка не была отключена");
      setSubscriptions((current) => current.filter((item) => item.artist.slug !== slug));
    } catch (unsubscribeError) {
      setError(unsubscribeError instanceof Error ? unsubscribeError.message : "Не удалось отписаться");
    } finally {
      setBusySlug(null);
    }
  }

  if (loading) {
    return <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-7 text-sm text-white/45">Загружаем ваши подписки...</div>;
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-[28px] border border-white/10 bg-white/[0.025] p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a99bff]">Ваша музыка</p>
        <h2 className="mt-2 text-2xl font-bold text-white">Мои подписки</h2>
        <p className="mt-2 text-sm text-white/48">Новые релизы этих артистов появятся в колокольчике и PWA-уведомлениях.</p>
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>

      {subscriptions.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
          <UsersRound className="mx-auto h-7 w-7 text-white/30" />
          <h3 className="mt-4 text-lg font-bold text-white">Подписок пока нет</h3>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/45">Откройте публичный профиль артиста и нажмите «Подписаться», чтобы следить за новыми релизами.</p>
          <Link href="/artists" className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-[#7b61ff] px-6 text-sm font-bold text-white transition-colors hover:bg-[#8b73ff]">Найти артистов</Link>
        </div>
      ) : subscriptions.map((subscription) => (
        <article key={subscription.id} className="overflow-hidden rounded-[28px] border border-white/10 bg-[#11131b]">
          <div className="flex flex-col gap-4 border-b border-white/8 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="flex min-w-0 items-center gap-4">
              <ArtistAvatar name={subscription.artist.displayName} url={subscription.artist.avatarUrl} />
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8cebc7]">{subscription.artist.profileType === "user" ? "Пользователь" : artistProfileTypeLabel(subscription.artist.profileType)}</p>
                <Link href={`/artists/${subscription.artist.slug}`} className="mt-1 block truncate text-xl font-bold text-white hover:text-[#c4b5fd]">{subscription.artist.displayName}</Link>
                <p className="mt-1 text-xs text-white/35">Вы подписаны с {new Date(subscription.followedAt).toLocaleDateString("ru-RU")}</p>
              </div>
            </div>
            <Button type="button" variant="outline" disabled={busySlug === subscription.artist.slug} onClick={() => void unsubscribe(subscription.artist.slug)} className="rounded-full border-rose-400/25 text-rose-200 hover:bg-rose-500/10 hover:text-rose-100">
              <UserMinus className="mr-2 h-4 w-4" />{busySlug === subscription.artist.slug ? "Отписываем..." : "Отписаться"}
            </Button>
          </div>

          <div className="p-5 sm:p-6">
            <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-white/48">Последние релизы</h3>
            {subscription.latestReleases.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {subscription.latestReleases.map((release) => (
                  <Link key={release.id} href={release.sceneHref ?? `/artists/${subscription.artist.slug}`} className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/8 bg-black/20 p-3 transition-colors hover:border-[#7b61ff]/40 hover:bg-[#7b61ff]/[0.07]">
                    <ReleaseCover title={release.title} url={release.coverUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{release.title}</p>
                      <p className="mt-1 truncate text-xs text-white/40">{release.genre} · {new Date(release.releaseDate).toLocaleDateString("ru-RU")}</p>
                      <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#c4b5fd]">{release.sceneHref ? "Открыть релиз" : "Профиль артиста"}<ExternalLink className="h-3 w-3" /></span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-white/38">У артиста пока нет опубликованных релизов.</p>}
          </div>
        </article>
      ))}
    </section>
  );
}

function ArtistAvatar({ name, url }: { name: string; url: string | null }) {
  const [imageFailed, setImageFailed] = React.useState(false);

  React.useEffect(() => {
    setImageFailed(false);
  }, [url]);

  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#211b3d] text-xl font-bold text-white">
      <Image
        src={url && !imageFailed ? url : DEFAULT_USER_AVATAR_URL}
        alt={`Аватар ${name}`}
        fill
        unoptimized
        className="object-cover"
        onError={() => {
          if (url) setImageFailed(true);
        }}
      />
    </div>
  );
}

function ReleaseCover({ title, url }: { title: string; url: string | null }) {
  return <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/8 bg-white/[0.04]">{url ? <Image src={url} alt="" fill unoptimized className="object-cover" /> : <Music2 className="h-5 w-5 text-white/25" />}<span className="sr-only">{title}</span></div>;
}
