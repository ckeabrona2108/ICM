"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  FileAudio,
  Heart,
  ImagePlus,
  MessageCircle,
  Music2,
  Send,
  Share2,
  Star,
  Trash2,
  Video,
  X
} from "lucide-react";

import { FeedAudioPlayer } from "@/components/feed/feed-audio-player";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import { readJsonResponse } from "@/lib/client-json-response";
import { normalizeSocialPostMediaItems, type SocialPostMediaItem } from "@/lib/social-post-media";

type ErrorPayload = { error?: string };
type Media = { mediaType: "image" | "audio" | "video"; mediaKey: string; mediaName: string; mediaUrl: string };
type OwnedProfile = {
  artistKey: string;
  sourceName: string;
  profileType: "user" | "artist" | "producer" | "group" | "label";
  slug: string;
  avatarUrl: string | null;
  settings: {
    displayName: string;
    profileType: "user" | "artist" | "producer" | "group" | "label";
    catalogReleaseIds: string[];
    autoPublishApprovedReleases: boolean;
  };
};
type ReleaseOption = { id: string; title: string; artistNames: string[]; releaseDate: string };
type FeedAuthor = { slug: string; displayName: string; profileType: "user" | "artist" | "producer" | "group" | "label"; avatarUrl: string | null };
type FeedComment = {
  id: string;
  content: string;
  createdAt: string;
  ownedByViewer: boolean;
  author: { name: string; avatarUrl: string | null; isVerified: boolean };
};
type LinkedRelease = { id: string; title: string; releaseDate: string; href: string };
type FeedPost = {
  id: string;
  kind: "post";
  createdAt: string;
  content: string;
  mediaType: "image" | "audio" | "video" | null;
  mediaUrl: string | null;
  mediaName: string | null;
  mediaItems?: SocialPostMediaItem[];
  likes: number;
  liked: boolean;
  commentsCount: number;
  comments: FeedComment[];
  author: FeedAuthor;
  linkedRelease: LinkedRelease | null;
};
type FeedRelease = {
  id: string;
  kind: "release";
  createdAt: string;
  releaseId: string;
  title: string;
  coverUrl: string | null;
  audioUrl: string | null;
  playCount: number;
  likes: number;
  liked: boolean;
  commentsCount: number;
  comments: Array<FeedComment & { mediaUrl?: string | null; mediaName?: string | null }>;
  sceneHref: string | null;
  author: FeedAuthor;
};
type FeedItem = FeedPost | FeedRelease;
type CreatedPostPayload = {
  id: string;
  content: string;
  media_type: "image" | "audio" | "video" | null;
  media_key: string | null;
  media_name: string | null;
  created_at: string;
  author?: { name: string; avatar?: string | null; isVerifiedAuthor?: boolean } | null;
  release?: { id: string; title: string; date: string } | null;
};
type Payload = {
  scope: "all" | "following";
  filter: "all" | "releases" | "video" | "news" | "media";
  viewerAuthenticated: boolean;
  feed: FeedItem[];
  ownedProfiles: OwnedProfile[];
  releaseOptions: ReleaseOption[];
  newReleases: FeedRelease[];
  popularPosts: FeedPost[];
};

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "releases", label: "Релизы" },
  { key: "video", label: "Видео" },
  { key: "news", label: "Новости" },
  { key: "media", label: "Медиа" }
] as const;

export function ArtistCommunityDashboard({
  publicView = false,
  hideComposer = false
}: {
  publicView?: boolean;
  hideComposer?: boolean;
}) {
  const currentPathname = typeof window !== "undefined"
    ? window.location.pathname
    : publicView
      ? "/community"
      : "/dashboard/community";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(currentPathname)}`;

  const [scope, setScope] = React.useState<"all" | "following">("all");
  const [filter, setFilter] = React.useState<"all" | "releases" | "video" | "news" | "media">("all");
  const [payload, setPayload] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authPromptVisible, setAuthPromptVisible] = React.useState(false);
  const [artistKey, setArtistKey] = React.useState("");
  const [content, setContent] = React.useState("");
  const [releaseId, setReleaseId] = React.useState("");
  const [mediaItems, setMediaItems] = React.useState<Media[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [releaseDrafts, setReleaseDrafts] = React.useState<Record<string, string>>({});
  const [expandedPostComments, setExpandedPostComments] = React.useState<Record<string, boolean>>({});
  const [expandedReleaseComments, setExpandedReleaseComments] = React.useState<Record<string, boolean>>({});
  const mediaInput = React.useRef<HTMLInputElement>(null);

  const activeProfile = payload?.ownedProfiles.find((profile) => profile.artistKey === artistKey) ?? null;
  const scopedReleases = React.useMemo(() => {
    if (!payload?.releaseOptions.length) return [];
    const allowedIds = new Set(activeProfile?.settings.catalogReleaseIds ?? []);
    return payload.releaseOptions.filter((release) => allowedIds.has(release.id));
  }, [activeProfile?.settings.catalogReleaseIds, payload?.releaseOptions]);
  const viewerAuthenticated = payload?.viewerAuthenticated ?? false;
  const canPublish = viewerAuthenticated && Boolean(payload?.ownedProfiles.length);

  const promptAuth = React.useCallback((message = "Войдите, чтобы продолжить") => {
    setError(message);
    setAuthPromptVisible(true);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/dashboard/community?scope=${encodeURIComponent(scope)}&filter=${encodeURIComponent(filter)}`);
      const next = await readJsonResponse<Payload & ErrorPayload>(response, "Не удалось загрузить сообщество");
      if (!response.ok) throw new Error(next.error ?? "Не удалось загрузить сообщество");
      const data = next as Payload;
      setPayload(data);
      setScope(data.scope);
      setArtistKey((current) => current || data.ownedProfiles[0]?.artistKey || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить сообщество");
    } finally {
      setLoading(false);
    }
  }, [filter, scope]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function upload(files: File[]) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы прикреплять файлы");
    if (!files.length) return;
    const currentVideos = mediaItems.filter((item) => item.mediaType === "video").length;
    const currentAudios = mediaItems.filter((item) => item.mediaType === "audio").length;
    const nextVideos = files.filter((file) => file.type.startsWith("video/")).length;
    const nextAudios = files.filter((file) => file.type.startsWith("audio/")).length;
    if (mediaItems.length + files.length > 8) return setError("Можно прикрепить до 8 медиафайлов");
    if (currentVideos + nextVideos > 1) return setError("К публикации можно прикрепить только одно видео");
    if (currentAudios + nextAudios > 1) return setError("К публикации можно прикрепить только одно аудио");
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        form.set("target", "post");
        const response = await fetch("/api/user/artist-profile/media", { method: "POST", body: form });
        const next = await readJsonResponse<Media & ErrorPayload>(response, "Не удалось загрузить файл");
        if (!response.ok) throw new Error(next.error ?? "Не удалось загрузить файл");
        setMediaItems((current) => [...current, next as Media]);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл");
    } finally {
      setBusy(false);
      if (mediaInput.current) mediaInput.current.value = "";
    }
  }

  async function publish() {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы публиковать записи");
    if (!artistKey || (!content.trim() && mediaItems.length === 0 && !releaseId)) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/user/artist-profile/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artistKey,
          content,
          releaseId,
          mediaItems: mediaItems.map((item) => ({
            mediaType: item.mediaType,
            mediaKey: item.mediaKey,
            mediaName: item.mediaName,
            role: item.mediaType === "audio" ? "demo" : "standard"
          })),
          mediaType: mediaItems[0]?.mediaType,
          mediaKey: mediaItems[0]?.mediaKey,
          mediaName: mediaItems[0]?.mediaName
        })
      });
      const next = await readJsonResponse<CreatedPostPayload & ErrorPayload>(response, "Не удалось опубликовать запись");
      if (!response.ok) throw new Error(next.error ?? "Не удалось опубликовать запись");
      const currentProfile = payload?.ownedProfiles.find((profile) => profile.artistKey === artistKey) ?? payload?.ownedProfiles[0] ?? null;
      const optimisticPost: FeedPost | null = currentProfile ? {
        id: next.id,
        kind: "post",
        createdAt: next.created_at,
        content,
        mediaType: mediaItems[0]?.mediaType ?? next.media_type ?? null,
        mediaUrl: mediaItems[0]?.mediaUrl ?? null,
        mediaName: mediaItems[0]?.mediaName ?? next.media_name ?? null,
        mediaItems: mediaItems.map((item) => ({
          id: item.mediaKey,
          mediaType: item.mediaType,
          mediaUrl: item.mediaUrl,
          mediaName: item.mediaName,
          role: item.mediaType === "audio" ? "demo" : "standard",
          width: null,
          height: null,
          posterUrl: null
        })),
        likes: 0,
        liked: false,
        commentsCount: 0,
        comments: [],
        author: {
          slug: currentProfile.slug,
          displayName: currentProfile.settings.displayName,
          profileType: currentProfile.settings.profileType,
          avatarUrl: currentProfile.avatarUrl
        },
        linkedRelease: next.release ? {
          id: next.release.id,
          title: next.release.title,
          releaseDate: next.release.date,
          href: `/feed/release_${next.release.id}`
        } : null
      } : null;
      if (optimisticPost) {
        setPayload((current) => current ? ({
          ...current,
          feed: [optimisticPost, ...current.feed],
          popularPosts: [optimisticPost, ...current.popularPosts].slice(0, 3)
        }) : current);
      }
      setContent("");
      setReleaseId("");
      setMediaItems([]);
      void load();
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Не удалось опубликовать запись");
    } finally {
      setBusy(false);
    }
  }

  async function likePost(postId: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы ставить лайки");
    let rollbackFeed: { liked: boolean; likes: number } | null = null;
    let rollbackPopular: { liked: boolean; likes: number } | null = null;
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => {
        if (item.kind !== "post" || item.id !== postId) return item;
        rollbackFeed = { liked: item.liked, likes: item.likes };
        return { ...item, liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) };
      }),
      popularPosts: current.popularPosts.map((item) => {
        if (item.id !== postId) return item;
        rollbackPopular = { liked: item.liked, likes: item.likes };
        return { ...item, liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) };
      })
    }) : current);
    const response = await fetch(`/api/artists/posts/${postId}/like`, { method: "POST" });
    const next = await readJsonResponse<{ liked: boolean; likes: number } & ErrorPayload>(response, "Не удалось поставить лайк");
    if (!response.ok) {
      setPayload((current) => current ? ({
        ...current,
        feed: current.feed.map((item) => item.kind === "post" && item.id === postId && rollbackFeed ? { ...item, ...rollbackFeed } : item),
        popularPosts: current.popularPosts.map((item) => item.id === postId && rollbackPopular ? { ...item, ...rollbackPopular } : item)
      }) : current);
      return setError(next.error ?? "Не удалось поставить лайк");
    }
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "post" && item.id === postId ? { ...item, liked: next.liked, likes: next.likes } : item),
      popularPosts: current.popularPosts.map((item) => item.id === postId ? { ...item, liked: next.liked, likes: next.likes } : item)
    }) : current);
  }

  async function likeRelease(releaseIdValue: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы ставить лайки");
    let rollbackFeed: { liked: boolean; likes: number } | null = null;
    let rollbackNewRelease: { liked: boolean; likes: number } | null = null;
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => {
        if (item.kind !== "release" || item.releaseId !== releaseIdValue) return item;
        rollbackFeed = { liked: item.liked, likes: item.likes };
        return { ...item, liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) };
      }),
      newReleases: current.newReleases.map((item) => {
        if (item.releaseId !== releaseIdValue) return item;
        rollbackNewRelease = { liked: item.liked, likes: item.likes };
        return { ...item, liked: !item.liked, likes: Math.max(0, item.likes + (item.liked ? -1 : 1)) };
      }),
    }) : current);
    const response = await fetch(`/api/scene/releases/${releaseIdValue}/like`, { method: "POST" });
    const next = await readJsonResponse<{ liked: boolean; likes: number } & ErrorPayload>(response, "Не удалось поставить лайк");
    if (!response.ok) {
      setPayload((current) => current ? ({
        ...current,
        feed: current.feed.map((item) => item.kind === "release" && item.releaseId === releaseIdValue && rollbackFeed ? { ...item, ...rollbackFeed } : item),
        newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue && rollbackNewRelease ? { ...item, ...rollbackNewRelease } : item),
      }) : current);
      return setError(next.error ?? "Не удалось поставить лайк");
    }
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "release" && item.releaseId === releaseIdValue ? { ...item, liked: next.liked, likes: next.likes } : item),
      newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue ? { ...item, liked: next.liked, likes: next.likes } : item),
    }) : current);
  }

  function updateReleasePlayCount(releaseIdValue: string, playCount: number) {
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "release" && item.releaseId === releaseIdValue ? { ...item, playCount } : item),
      newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue ? { ...item, playCount } : item)
    }) : current);
  }

  async function commentPost(postId: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы оставлять комментарии");
    const value = drafts[postId]?.trim() ?? "";
    if (!value) return;
    const response = await fetch(`/api/artists/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: value })
    });
    const next = await readJsonResponse<FeedComment & ErrorPayload>(response, "Не удалось добавить комментарий");
    if (!response.ok) return setError(next.error ?? "Не удалось добавить комментарий");
    setDrafts((current) => ({ ...current, [postId]: "" }));
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "post" && item.id === postId
        ? { ...item, comments: [next as FeedComment, ...item.comments], commentsCount: item.commentsCount + 1 }
        : item),
      popularPosts: current.popularPosts.map((item) => item.id === postId
        ? { ...item, comments: [next as FeedComment, ...item.comments], commentsCount: item.commentsCount + 1 }
        : item)
    }) : current);
  }

  async function commentRelease(releaseIdValue: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы оставлять комментарии");
    const value = releaseDrafts[releaseIdValue]?.trim() ?? "";
    if (!value) return;
    const response = await fetch(`/api/scene/releases/${releaseIdValue}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: value })
    });
    const next = await readJsonResponse<FeedComment & ErrorPayload>(response, "Не удалось добавить комментарий");
    if (!response.ok) return setError(next.error ?? "Не удалось добавить комментарий");
    setReleaseDrafts((current) => ({ ...current, [releaseIdValue]: "" }));
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "release" && item.releaseId === releaseIdValue
        ? { ...item, comments: [next as FeedComment, ...item.comments], commentsCount: item.commentsCount + 1 }
        : item),
      newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue
        ? { ...item, comments: [next as FeedComment, ...item.comments], commentsCount: item.commentsCount + 1 }
        : item)
    }) : current);
  }

  async function deletePostComment(postId: string, commentId: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы удалять свои комментарии");
    const response = await fetch(`/api/artists/posts/${postId}/comments?commentId=${encodeURIComponent(commentId)}`, { method: "DELETE" });
    const next = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить комментарий");
    if (!response.ok) return setError(next.error ?? "Не удалось удалить комментарий");
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "post" && item.id === postId
        ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId), commentsCount: Math.max(0, item.commentsCount - 1) }
        : item),
      popularPosts: current.popularPosts.map((item) => item.id === postId
        ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId), commentsCount: Math.max(0, item.commentsCount - 1) }
        : item)
    }) : current);
  }

  async function deleteReleaseComment(releaseIdValue: string, commentId: string) {
    if (!viewerAuthenticated) return promptAuth("Войдите, чтобы удалять свои комментарии");
    const response = await fetch(`/api/scene/releases/${releaseIdValue}/comments?commentId=${encodeURIComponent(commentId)}`, { method: "DELETE" });
    const next = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить комментарий");
    if (!response.ok) return setError(next.error ?? "Не удалось удалить комментарий");
    setPayload((current) => current ? ({
      ...current,
      feed: current.feed.map((item) => item.kind === "release" && item.releaseId === releaseIdValue
        ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId), commentsCount: Math.max(0, item.commentsCount - 1) }
        : item),
      newReleases: current.newReleases.map((item) => item.releaseId === releaseIdValue
        ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId), commentsCount: Math.max(0, item.commentsCount - 1) }
        : item)
    }) : current);
  }

  async function removePost(postId: string) {
    setError(null);
    try {
      const response = await fetch(`/api/user/artist-profile/posts/${postId}`, { method: "DELETE" });
      const next = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить запись");
      if (!response.ok) throw new Error(next.error ?? "Не удалось удалить запись");
      setPayload((current) => current ? ({
        ...current,
        feed: current.feed.filter((item) => !(item.kind === "post" && item.id === postId)),
        popularPosts: current.popularPosts.filter((item) => item.id !== postId)
      }) : current);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить запись");
    }
  }

  function handleScopeChange(nextScope: "all" | "following") {
    if (nextScope === "following" && !viewerAuthenticated) {
      promptAuth("Войдите, чтобы открыть ленту подписок");
      return;
    }
    setScope(nextScope);
  }

  const postOfWeek = React.useMemo(() => {
    const candidate = [...(payload?.popularPosts ?? [])].sort((left, right) => {
      if (right.likes !== left.likes) return right.likes - left.likes;
      return right.commentsCount - left.commentsCount;
    })[0] ?? null;
    return candidate && candidate.likes > 1 ? candidate : null;
  }, [payload?.popularPosts]);

  if (loading && !payload) return <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 text-sm text-white/55">Загружаем сообщество...</div>;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-6">
        <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(135deg,rgba(123,97,255,0.18),rgba(10,10,16,0.92))] p-6 sm:p-7">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#c9beff]">Сообщество</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.04em] text-white sm:text-4xl">Общая музыкальная лента</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/68">Публикации артистов, групп и лейблов, новые релизы и контент подписок в одном месте.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <ScopeButton active={scope === "all"} onClick={() => handleScopeChange("all")}>Все</ScopeButton>
            <ScopeButton active={scope === "following"} disabled={!viewerAuthenticated} onClick={() => handleScopeChange("following")}>Подписки</ScopeButton>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {FILTERS.map((item) => (
              <FilterButton key={item.key} active={filter === item.key} onClick={() => setFilter(item.key)}>{item.label}</FilterButton>
            ))}
          </div>
        </section>

        {authPromptVisible ? (
          <section className="rounded-[28px] border border-[#7b61ff]/20 bg-[#100f19] p-5 sm:p-6">
            <h3 className="text-xl font-bold text-white">Публичная лента открыта для всех</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">Читать посты, релизы и комментарии можно без входа. Чтобы лайкать, комментировать, подписываться и публиковать записи, нужен аккаунт.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={loginHref} className="inline-flex h-11 items-center justify-center rounded-full bg-[#7b61ff] px-6 text-sm font-bold text-white transition hover:bg-[#6a4ff0]">Войти</Link>
              <Link href="/register" className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 px-6 text-sm font-bold text-white/80 transition hover:border-white/20 hover:text-white">Создать аккаунт</Link>
            </div>
          </section>
        ) : null}

        {canPublish && !hideComposer ? (
          <section className="rounded-[28px] border border-[#7b61ff]/20 bg-[#100f19] p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-bold text-white">Что нового?</h3>
                <p className="mt-1 text-sm text-white/48">Пост можно опубликовать с текстом, медиа и привязанным релизом.</p>
              </div>
              <select value={artistKey} onChange={(event) => setArtistKey(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white outline-none">
                {payload?.ownedProfiles.map((profile) => <option key={profile.artistKey} value={profile.artistKey}>{`${profile.settings.displayName} · ${profileTypeLabel(profile.profileType)}`}</option>)}
              </select>
            </div>
            <Textarea value={content} onChange={(event) => setContent(event.target.value)} className="mt-4 min-h-28" maxLength={1500} placeholder="Написать пост" />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <select value={releaseId} onChange={(event) => setReleaseId(event.target.value)} className="h-11 rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none">
                <option value="">Без привязки релиза</option>
                {scopedReleases.map((release) => <option key={release.id} value={release.id}>{release.title}</option>)}
              </select>
              <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/55">
                {activeProfile?.settings.autoPublishApprovedReleases
                  ? "Для этого профиля включена автопубликация одобренных релизов."
                  : "Автопубликация одобренных релизов сейчас отключена в настройках профиля."}
              </div>
            </div>
            {mediaItems.length ? <div className="grid gap-3">{mediaItems.map((media) => <MediaPreview key={media.mediaKey} media={media} onRemove={() => setMediaItems((current) => current.filter((item) => item.mediaKey !== media.mediaKey))} />)}</div> : null}
            <input ref={mediaInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,audio/*,video/mp4,video/webm,video/quicktime" className="hidden" onChange={(event) => { const files = Array.from(event.target.files ?? []); if (files.length) void upload(files); }} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <ActionChip onClick={() => mediaInput.current?.click()}><ImagePlus className="h-4 w-4" /> Добавить фото</ActionChip>
                <ActionChip onClick={() => mediaInput.current?.click()}><Video className="h-4 w-4" /> Добавить видео</ActionChip>
                <ActionChip onClick={() => mediaInput.current?.click()}><FileAudio className="h-4 w-4" /> Добавить аудио</ActionChip>
              </div>
              <Button type="button" className="rounded-full px-6" disabled={busy || (!content.trim() && mediaItems.length === 0 && !releaseId)} onClick={() => void publish()}>
                <Send className="mr-2 h-4 w-4" /> {busy ? "Публикация..." : "Опубликовать"}
              </Button>
            </div>
          </section>
        ) : null}

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <section className="grid gap-4">
          {payload?.feed.length ? payload.feed.map((item) => item.kind === "post"
            ? <PostCard key={item.id} item={item} canInteract={viewerAuthenticated} canDelete={Boolean(payload.ownedProfiles.some((profile) => profile.slug === item.author.slug))} draft={drafts[item.id] ?? ""} expandedComments={Boolean(expandedPostComments[item.id])} onDraftChange={(value) => setDrafts((current) => ({ ...current, [item.id]: value }))} onLike={() => void likePost(item.id)} onComment={() => void commentPost(item.id)} onDeleteComment={(commentId) => void deletePostComment(item.id, commentId)} onToggleComments={() => setExpandedPostComments((current) => ({ ...current, [item.id]: !current[item.id] }))} onDelete={() => void removePost(item.id)} onRequireAuth={() => promptAuth("Войдите, чтобы взаимодействовать с публикациями")} />
            : <ReleaseCard key={item.id} item={item} canInteract={viewerAuthenticated} draft={releaseDrafts[item.releaseId] ?? ""} expandedComments={Boolean(expandedReleaseComments[item.releaseId])} onDraftChange={(value) => setReleaseDrafts((current) => ({ ...current, [item.releaseId]: value }))} onLike={() => void likeRelease(item.releaseId)} onPlayCountChange={(count) => updateReleasePlayCount(item.releaseId, count)} onComment={() => void commentRelease(item.releaseId)} onDeleteComment={(commentId) => void deleteReleaseComment(item.releaseId, commentId)} onToggleComments={() => setExpandedReleaseComments((current) => ({ ...current, [item.releaseId]: !current[item.releaseId] }))} onRequireAuth={() => promptAuth("Войдите, чтобы ставить лайки и комментировать релизы")} />) : <EmptyState scope={scope} />}
        </section>
      </div>

      <aside className="grid content-start gap-6">
        <Panel title="Новые релизы">
          {payload?.newReleases.length ? payload.newReleases.map((item) => <MiniReleaseRow key={item.id} item={item} />) : <Muted>Пока пусто.</Muted>}
        </Panel>
        <Panel title="Популярные публикации">
          {payload?.popularPosts.length ? payload.popularPosts.slice(0, 3).map((item) => <MiniPostRow key={item.id} item={item} />) : <Muted>Пока пусто.</Muted>}
        </Panel>
        <Panel title="Пост недели">
          {postOfWeek ? <MiniPostRow item={postOfWeek} featured /> : <Muted>Пока нет кандидата.</Muted>}
        </Panel>
      </aside>
    </div>
  );
}

function ScopeButton({ active, disabled = false, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-full px-5 py-2.5 text-sm font-bold transition ${active ? "bg-white text-[#120f1d]" : "border border-white/10 bg-white/5 text-white/65 hover:text-white"} ${disabled ? "cursor-not-allowed opacity-55" : ""}`}>{children}</button>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-[#7b61ff] text-white" : "border border-white/10 bg-black/20 text-white/60 hover:text-white"}`}>{children}</button>;
}

function ActionChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-4 py-2.5 text-sm font-semibold text-white/78 hover:text-white">{children}</button>;
}

function MediaPreview({ media, onRemove }: { media: Media; onRemove: () => void }) {
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-3">
      <button type="button" onClick={onRemove} className="absolute right-2 top-2 z-10 rounded-full bg-black/70 p-1.5 text-white"><X className="h-4 w-4" /></button>
      {media.mediaType === "image" ? <div className="relative h-56 rounded-xl bg-black/20"><Image src={media.mediaUrl} alt="Вложение" fill unoptimized className="rounded-xl object-contain" /></div> : null}
      {media.mediaType === "audio" ? <FeedAudioPlayer src={media.mediaUrl} title={media.mediaName} compact /> : null}
      {media.mediaType === "video" ? <video controls src={media.mediaUrl} className="max-h-[420px] w-full rounded-xl" /> : null}
    </div>
  );
}

function PostMediaItems({ item }: { item: FeedPost }) {
  const mediaItems = normalizeSocialPostMediaItems({
    mediaItems: item.mediaItems,
    mediaType: item.mediaType,
    mediaUrl: item.mediaUrl,
    mediaName: item.mediaName
  });
  return mediaItems.map((media) => {
    if (media.mediaType === "image") {
      return <div key={media.id} className="relative aspect-[4/3] bg-black/20"><Image src={media.mediaUrl} alt={media.mediaName ?? "Публикация"} fill unoptimized className="object-contain" /></div>;
    }
    if (media.mediaType === "audio") {
      return <div key={media.id} className="px-5 pb-5"><FeedAudioPlayer src={media.mediaUrl} title={media.mediaName ?? item.author.displayName} compact /></div>;
    }
    return <video key={media.id} controls playsInline poster={media.posterUrl ?? undefined} src={media.mediaUrl} className="max-h-[620px] w-full bg-black" />;
  });
}

function PostCard({ item, canInteract, canDelete, draft, expandedComments, onDraftChange, onLike, onComment, onDeleteComment, onToggleComments, onDelete, onRequireAuth }: { item: FeedPost; canInteract: boolean; canDelete: boolean; draft: string; expandedComments: boolean; onDraftChange: (value: string) => void; onLike: () => void; onComment: () => void; onDeleteComment: (commentId: string) => void; onToggleComments: () => void; onDelete: () => void; onRequireAuth: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <AuthorHeader author={item.author} date={item.createdAt} />
          </div>
          {canDelete ? (
            <button type="button" onClick={onDelete} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/55 transition hover:text-rose-200" aria-label="Удалить пост">
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {item.content ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/78 sm:text-base">{item.content}</p> : null}
        {item.linkedRelease ? <LinkedReleaseCard release={item.linkedRelease} /> : null}
      </div>
      <PostMediaItems item={item} />
      <div className="flex items-center gap-2 border-t border-white/10 px-5 py-3">
        <button type="button" onClick={canInteract ? onLike : onRequireAuth} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold ${item.liked ? "bg-rose-400/10 text-rose-200" : "text-white/60 hover:bg-white/5 hover:text-white"}`}><Heart className={`h-4 w-4 ${item.liked ? "fill-current" : ""}`} /> {item.likes}</button>
        <button type="button" onClick={canInteract ? onToggleComments : onRequireAuth} className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white/45 hover:text-white"><MessageCircle className="h-4 w-4" /> {item.commentsCount}</button>
        <ShareButton href={`/feed/post_${item.id}`} />
      </div>
      {expandedComments ? (
        <div className="grid gap-3 border-t border-white/10 p-5">
          {item.comments.map((comment) => <CommentRow key={comment.id} comment={comment} onDelete={comment.ownedByViewer ? () => onDeleteComment(comment.id) : undefined} />)}
          <form onSubmit={(event) => { event.preventDefault(); if (canInteract) onComment(); else onRequireAuth(); }} className="flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 focus-within:border-[#7b61ff]/55">
            <input value={draft} onChange={(event) => canInteract ? onDraftChange(event.target.value) : onRequireAuth()} onFocus={() => { if (!canInteract) onRequireAuth(); }} readOnly={!canInteract} maxLength={800} placeholder="Напишите комментарий" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/30" />
            <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7b61ff] text-white"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

function ReleaseCard({ item, canInteract, draft, expandedComments, onDraftChange, onLike, onPlayCountChange, onComment, onDeleteComment, onToggleComments, onRequireAuth }: { item: FeedRelease; canInteract: boolean; draft: string; expandedComments: boolean; onDraftChange: (value: string) => void; onLike: () => void; onPlayCountChange: (count: number) => void; onComment: () => void; onDeleteComment: (commentId: string) => void; onToggleComments: () => void; onRequireAuth: () => void }) {
  return (
    <article className="overflow-hidden rounded-[28px] border border-[#8cebc7]/15 bg-[linear-gradient(180deg,rgba(18,19,27,0.95),rgba(10,11,18,0.98))]">
      <div className="grid gap-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="relative aspect-square bg-black/40">
          {item.coverUrl ? <Image src={item.coverUrl} alt={item.title} fill unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center text-white/35"><Music2 className="h-10 w-10" /></div>}
        </div>
        <div className="flex flex-col p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#8cebc7]/30 bg-[#8cebc7]/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-[#8cebc7]">Новый релиз</span>
            <span className="text-xs text-white/38">{formatReleaseDate(item.createdAt)}</span>
          </div>
          <div className="mt-4"><AuthorHeader author={item.author} date={item.createdAt} compact releaseDateOnly /></div>
          <h3 className="mt-4 text-2xl font-bold text-white">{item.title}</h3>
          {item.audioUrl ? <div className="mt-4"><FeedAudioPlayer src={item.audioUrl} title={item.title} releaseId={item.releaseId} onPlayCountChange={onPlayCountChange} /></div> : null}
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-white/55">
            <span className="rounded-full border border-white/10 px-3 py-2">Прослушивания · {item.playCount}</span>
            <button type="button" onClick={canInteract ? onLike : onRequireAuth} className={`inline-flex items-center gap-2 rounded-full px-3 py-2 ${item.liked ? "bg-rose-400/10 text-rose-200" : "border border-white/10 text-white/70"}`}><Heart className={`h-4 w-4 ${item.liked ? "fill-current" : ""}`} /> {item.likes}</button>
            <button type="button" onClick={canInteract ? onToggleComments : onRequireAuth} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2"><MessageCircle className="h-4 w-4" /> {item.commentsCount}</button>
            {item.sceneHref ? <Link href={item.sceneHref} className="inline-flex items-center gap-2 rounded-full bg-[#7b61ff] px-4 py-2 font-semibold text-white"><Music2 className="h-4 w-4" /> Слушать фрагмент</Link> : null}
            <ShareButton href={`/feed/release_${item.releaseId}`} />
          </div>
          {expandedComments ? (
            <div className="mt-5 grid gap-3">
              {item.comments.length ? item.comments.slice(0, 3).map((comment) => <CommentRow key={comment.id} comment={comment} onDelete={comment.ownedByViewer ? () => onDeleteComment(comment.id) : undefined} />) : <Muted>Комментариев пока нет.</Muted>}
              <form onSubmit={(event) => { event.preventDefault(); if (canInteract) onComment(); else onRequireAuth(); }} className="flex gap-2 rounded-2xl border border-white/10 bg-black/20 p-2 focus-within:border-[#7b61ff]/55">
                <input value={draft} onChange={(event) => canInteract ? onDraftChange(event.target.value) : onRequireAuth()} onFocus={() => { if (!canInteract) onRequireAuth(); }} readOnly={!canInteract} maxLength={800} placeholder="Напишите комментарий к релизу" className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/30" />
                <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7b61ff] text-white"><Send className="h-4 w-4" /></button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function LinkedReleaseCard({ release }: { release: LinkedRelease }) {
  return (
    <Link href={release.href} className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 transition hover:border-[#7b61ff]/40 hover:bg-[#7b61ff]/10">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8cebc7]">Привязанный релиз</p>
        <p className="mt-2 text-sm font-semibold text-white">{release.title}</p>
      </div>
      <ExternalLink className="h-4 w-4 shrink-0 text-white/55" />
    </Link>
  );
}

function AuthorHeader({ author, date, compact = false, releaseDateOnly = false }: { author: FeedAuthor; date: string; compact?: boolean; releaseDateOnly?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={author.displayName} avatarUrl={author.avatarUrl} compact={compact} />
      <div className="min-w-0">
        <Link href={`/dashboard/community?author=${encodeURIComponent(author.slug)}`} className="block truncate text-sm font-semibold text-white hover:text-[#c9beff]">{author.displayName}</Link>
        <p className="text-xs text-white/35">{releaseDateOnly ? formatReleaseDate(date) : formatDate(date)}</p>
      </div>
      <span className="ml-auto rounded-full border border-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/40">{profileTypeLabel(author.profileType)}</span>
    </div>
  );
}

function CommentRow({ comment, onDelete }: { comment: FeedComment | (FeedComment & { mediaUrl?: string | null; mediaName?: string | null }); onDelete?: () => void }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-white/8 bg-black/20 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={comment.author.name} avatarUrl={comment.author.avatarUrl} compact />
        <div>
          <p className="text-sm font-semibold text-white/78">{comment.author.name}</p>
          <p className="text-xs text-white/35">{formatDate(comment.createdAt)}</p>
        </div>
        {comment.author.isVerified ? <Star className="ml-auto h-4 w-4 fill-current text-[#7b61ff]" /> : null}
        {onDelete ? (
          <button type="button" onClick={onDelete} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20 text-white/45 transition hover:text-rose-200" aria-label="Удалить комментарий">
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {comment.content ? <p className="mt-2 text-sm leading-relaxed text-white/68">{comment.content}</p> : null}
      {"mediaUrl" in comment && comment.mediaUrl ? <div className="relative mt-3 h-40 overflow-hidden rounded-xl bg-black/20"><Image src={comment.mediaUrl} alt={comment.mediaName ?? "Комментарий"} fill unoptimized className="object-contain" /></div> : null}
    </article>
  );
}

function ShareButton({ href }: { href: string }) {
  return <Link href={href} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-white/55 hover:text-white"><Share2 className="h-4 w-4" /> Поделиться</Link>;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5"><h3 className="text-lg font-bold text-white">{title}</h3><div className="mt-4 grid gap-3">{children}</div></section>;
}

function MiniReleaseRow({ item, large = false }: { item: FeedRelease; large?: boolean }) {
  return (
    <Link href={item.sceneHref ?? `/dashboard/community?author=${encodeURIComponent(item.author.slug)}`} className={`grid gap-3 ${large ? "" : "grid-cols-[52px_minmax(0,1fr)] items-center"}`}>
      <div className={`relative overflow-hidden rounded-2xl border border-white/10 ${large ? "aspect-[4/3]" : "h-[52px] w-[52px]"}`}>
        {item.coverUrl ? <Image src={item.coverUrl} alt={item.title} fill unoptimized className="object-cover" /> : <div className="flex h-full items-center justify-center bg-black/20 text-white/35"><Music2 className="h-5 w-5" /></div>}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-white">{item.title}</p>
        <p className="mt-1 truncate text-xs text-white/45">{item.author.displayName}</p>
      </div>
    </Link>
  );
}

function MiniPostRow({ item, featured = false }: { item: FeedPost; featured?: boolean }) {
  return <Link href={`/feed/post_${item.id}`} className={`rounded-2xl border p-3 ${featured ? "border-[#8cebc7]/28 bg-[#8cebc7]/8" : "border-white/8 bg-black/20"}`}><div className="flex items-center gap-2">{featured ? <span className="rounded-full border border-[#8cebc7]/30 bg-[#8cebc7]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[#8cebc7]">Пост недели</span> : null}</div><p className="mt-2 text-sm font-semibold text-white">{item.author.displayName}</p><p className="mt-2 line-clamp-3 text-sm text-white/58">{item.content || item.linkedRelease?.title || "Медиа-публикация"}</p><p className="mt-2 text-xs text-white/35">{item.likes} лайков · {item.commentsCount} комментариев</p></Link>;
}

function EmptyState({ scope }: { scope: "all" | "following" }) {
  return <div className="rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] p-8 text-sm text-white/45">{scope === "following" ? "Подписки пока пусты. Подпишитесь на артистов из публичных профилей, и здесь появится их контент." : "Пока нет публикаций для выбранного фильтра."}</div>;
}

function Avatar({ name, avatarUrl, compact = false }: { name: string; avatarUrl: string | null; compact?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  const src = avatarUrl && !failed ? avatarUrl : DEFAULT_USER_AVATAR_URL;
  return <span className={`relative block overflow-hidden rounded-full border border-white/10 bg-[#211a42] ${compact ? "h-10 w-10" : "h-12 w-12"}`}><Image src={src} alt={name} fill unoptimized className={`object-cover ${src === DEFAULT_USER_AVATAR_URL ? "scale-[1.08]" : ""}`} onError={() => setFailed(true)} /></span>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-white/42">{children}</p>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatReleaseDate(value: string) {
  const iso = value.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  const base = iso ? new Date(`${iso}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(base);
}

function profileTypeLabel(value: "user" | "artist" | "producer" | "group" | "label") {
  if (value === "label") return "Лейбл";
  if (value === "group") return "Группа";
  if (value === "producer") return "Продюсер";
  if (value === "user") return "Автор";
  return "Артист";
}
