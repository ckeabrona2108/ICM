"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Headphones, Heart, MessageCircle, Send, Share2, UsersRound } from "lucide-react";

import { readJsonResponse } from "@/lib/client-json-response";
import { ArtistReleaseCatalog } from "@/components/landing/artist-release-catalog";
import { DEFAULT_USER_AVATAR_URL } from "@/lib/avatar";
import type { PublicArtistRelease } from "@/lib/artist-profile-service";
import type { CollaborationProfile } from "@/lib/collaboration";
import { collaborationIntentLabel, collaborationPreferenceLabel, collaborationRoleLabel } from "@/lib/collaboration";
import { normalizeSocialPostMediaItems, type SocialPostMediaItem } from "@/lib/social-post-media";
import { VerifiedBadge } from "@/components/uitripled/native-verified-badge-shadcnui";
import { TripledProfilePageHero } from "@/components/uitripled/profile-page-shadcnui";

type SocialAuthor = { id: string; name: string; avatarUrl: string | null; isVerified: boolean };
type PostComment = { id: string; content: string; createdAt: string; author: SocialAuthor };
type Post = { id: string; content: string; mediaType: "image" | "audio" | "video" | null; mediaUrl: string | null; mediaName: string | null; mediaItems?: SocialPostMediaItem[]; createdAt: string; likes: number; liked: boolean; author: SocialAuthor; comments: PostComment[] };
type Comment = { id: string; content: string; mediaUrl: string | null; mediaName: string | null; createdAt: string; author: SocialAuthor };
type ReleaseState = { likes: number; liked: boolean; comments: Comment[] };
type Snapshot = { posts: Post[]; releases: Record<string, ReleaseState>; stats: { followers: number; likes: number; following: boolean; authenticated: boolean; ownProfile: boolean }; socialUnavailable?: boolean };
type ReleaseOption = { id: string; title: string };
type UploadedMedia = { mediaKey: string; mediaName: string; mediaUrl: string };
type ErrorPayload = { error?: string };

type ArtistProfileSocialContextValue = {
  slug: string;
  snapshot: Snapshot | null;
  releases: ReleaseOption[];
  selectedReleaseId: string;
  setSelectedReleaseId: React.Dispatch<React.SetStateAction<string>>;
  comment: string;
  setComment: React.Dispatch<React.SetStateAction<string>>;
  commentMedia: UploadedMedia | null;
  setCommentMedia: React.Dispatch<React.SetStateAction<UploadedMedia | null>>;
  emojiOpen: boolean;
  setEmojiOpen: React.Dispatch<React.SetStateAction<boolean>>;
  error: string | null;
  authPromptVisible: boolean;
  submitting: boolean;
  followSubmitting: boolean;
  imageInput: React.RefObject<HTMLInputElement>;
  promptAuth: (message?: string) => void;
  follow: () => Promise<void>;
  likePost: (postId: string) => Promise<void>;
  commentPost: (postId: string, content: string) => Promise<boolean>;
  likeRelease: () => Promise<void>;
  uploadCommentImage: (file: File) => Promise<void>;
  submitComment: (event: React.FormEvent) => Promise<void>;
};

const ArtistProfileSocialContext = React.createContext<ArtistProfileSocialContextValue | null>(null);

function useArtistProfileSocial() {
  const context = React.useContext(ArtistProfileSocialContext);
  if (!context) throw new Error("ArtistProfileSocialProvider is missing");
  return context;
}

export function ArtistProfileSocialProvider({
  slug,
  releases,
  initialAuthenticated = false,
  children
}: {
  slug: string;
  releases: ReleaseOption[];
  initialAuthenticated?: boolean;
  children: React.ReactNode;
}) {
  const currentPathname = typeof window !== "undefined" ? window.location.pathname : `/artists/${slug}`;
  const [snapshot, setSnapshot] = React.useState<Snapshot | null>(null);
  const [selectedReleaseId, setSelectedReleaseId] = React.useState(releases[0]?.id ?? "");
  const [comment, setComment] = React.useState("");
  const [commentMedia, setCommentMedia] = React.useState<UploadedMedia | null>(null);
  const [emojiOpen, setEmojiOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authPromptVisible, setAuthPromptVisible] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [followSubmitting, setFollowSubmitting] = React.useState(false);
  const imageInput = React.useRef<HTMLInputElement>(null);
  const [loginHref, setLoginHref] = React.useState(`/login?callbackUrl=${encodeURIComponent(currentPathname)}`);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    setLoginHref(`/login?callbackUrl=${encodeURIComponent(currentPath || `/artists/${slug}`)}`);
  }, [slug]);

  const promptAuth = React.useCallback((message = "Войдите, чтобы продолжить") => {
    setError(message);
    setAuthPromptVisible(true);
  }, []);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/social`, { signal });
    const payload = await readJsonResponse<Snapshot & ErrorPayload>(response, "Не удалось загрузить ленту");
    if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить ленту");
    setSnapshot(payload as Snapshot);
  }, [slug]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal).catch((loadError) => {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ленту");
    });
    return () => controller.abort();
  }, [load]);

  async function follow() {
    if (followSubmitting) return;
    setFollowSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/follow`, { method: "POST" });
      const payload = await readJsonResponse<Partial<Snapshot["stats"]> & ErrorPayload>(response, "Не удалось подписаться");
      if (response.status === 401) {
        promptAuth(payload.error ?? "Войдите, чтобы подписаться на профиль");
        return;
      }
      if (!response.ok) return setError(payload.error ?? "Не удалось подписаться");
      setSnapshot((current) => current
        ? ({ ...current, stats: { ...current.stats, ...payload } })
        : ({
            posts: [],
            releases: Object.fromEntries(releases.map((release) => [release.id, { likes: 0, liked: false, comments: [] } satisfies ReleaseState])),
            stats: {
              followers: typeof payload.followers === "number" ? payload.followers : 0,
              likes: 0,
              following: Boolean(payload.following),
              authenticated: true,
              ownProfile: false
            }
          }));
    } catch (followError) {
      setError(followError instanceof Error ? followError.message : "Не удалось подписаться");
    } finally {
      setFollowSubmitting(false);
    }
  }

  async function likePost(postId: string) {
    const response = await fetch(`/api/artists/posts/${postId}/like`, { method: "POST" });
    const payload = await readJsonResponse<Partial<Post> & ErrorPayload>(response, "Не удалось поставить лайк");
    if (response.status === 401) {
      promptAuth(payload.error ?? "Войдите, чтобы ставить лайки");
      return;
    }
    if (!response.ok) return setError(payload.error ?? "Не удалось поставить лайк");
    setSnapshot((current) => current ? ({ ...current, posts: current.posts.map((post) => post.id === postId ? { ...post, ...payload } : post), stats: { ...current.stats, likes: current.stats.likes + (payload.liked ? 1 : -1) } }) : current);
  }

  async function commentPost(postId: string, content: string) {
    if (!content.trim()) return false;
    setError(null);
    try {
      const response = await fetch(`/api/artists/posts/${postId}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content })
      });
      const payload = await readJsonResponse<PostComment & ErrorPayload>(response, "Не удалось добавить комментарий");
      if (response.status === 401) {
        promptAuth(payload.error ?? "Войдите, чтобы комментировать публикации");
        return false;
      }
      if (!response.ok) {
        setError(payload.error ?? "Не удалось добавить комментарий");
        return false;
      }
      setSnapshot((current) => current ? ({
        ...current,
        posts: current.posts.map((post) => post.id === postId
          ? { ...post, comments: [payload as PostComment, ...post.comments] }
          : post)
      }) : current);
      return true;
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Не удалось добавить комментарий");
      return false;
    }
  }

  async function likeRelease() {
    if (!selectedReleaseId) return;
    const response = await fetch(`/api/scene/releases/${selectedReleaseId}/like`, { method: "POST" });
    const payload = await readJsonResponse<Partial<ReleaseState> & ErrorPayload>(response, "Не удалось поставить лайк");
    if (response.status === 401) {
      promptAuth(payload.error ?? "Войдите, чтобы ставить лайки");
      return;
    }
    if (!response.ok) return setError(payload.error ?? "Не удалось поставить лайк");
    setSnapshot((current) => current ? ({ ...current, releases: { ...current.releases, [selectedReleaseId]: { ...current.releases[selectedReleaseId], ...payload } }, stats: { ...current.stats, likes: current.stats.likes + (payload.liked ? 1 : -1) } }) : current);
  }

  async function uploadCommentImage(file: File) {
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("target", "comment");
      const response = await fetch("/api/user/artist-profile/media", { method: "POST", body: form });
      const payload = await readJsonResponse<UploadedMedia & ErrorPayload>(response, "Не удалось загрузить фото");
      if (response.status === 401) {
        promptAuth(payload.error ?? "Войдите, чтобы добавлять изображения к комментариям");
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить фото");
      setCommentMedia(payload as UploadedMedia);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фото");
    } finally {
      setSubmitting(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedReleaseId || (!comment.trim() && !commentMedia)) return;
    setSubmitting(true);
    setError(null);
    const response = await fetch(`/api/scene/releases/${selectedReleaseId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: comment, mediaKey: commentMedia?.mediaKey, mediaName: commentMedia?.mediaName })
    });
    const payload = await readJsonResponse<Comment & ErrorPayload>(response, "Не удалось добавить комментарий");
    setSubmitting(false);
    if (response.status === 401) {
      promptAuth(payload.error ?? "Войдите, чтобы комментировать релизы");
      return;
    }
    if (!response.ok) return setError(payload.error ?? "Не удалось добавить комментарий");
    setComment("");
    setCommentMedia(null);
    setSnapshot((current) => current ? ({ ...current, releases: { ...current.releases, [selectedReleaseId]: { ...(current.releases[selectedReleaseId] ?? { likes: 0, liked: false, comments: [] }), comments: [payload as Comment, ...(current.releases[selectedReleaseId]?.comments ?? [])] } } }) : current);
  }

  const effectiveSnapshot = React.useMemo<Snapshot | null>(() => {
    if (!snapshot) return initialAuthenticated
      ? {
          posts: [],
          releases: Object.fromEntries(releases.map((release) => [release.id, { likes: 0, liked: false, comments: [] } satisfies ReleaseState])),
          stats: { followers: 0, likes: 0, following: false, authenticated: true, ownProfile: false }
        }
      : null;
    if (snapshot.stats.authenticated || !initialAuthenticated) return snapshot;
    return { ...snapshot, stats: { ...snapshot.stats, authenticated: true } };
  }, [initialAuthenticated, releases, snapshot]);

  return (
    <ArtistProfileSocialContext.Provider value={{ slug, snapshot: effectiveSnapshot, releases, selectedReleaseId, setSelectedReleaseId, comment, setComment, commentMedia, setCommentMedia, emojiOpen, setEmojiOpen, error, authPromptVisible, submitting, followSubmitting, imageInput, promptAuth, follow, likePost, commentPost, likeRelease, uploadCommentImage, submitComment }}>
      <div className="grid gap-4">
        {children}
        <AuthNotice visible={authPromptVisible} loginHref={loginHref} registerHref="/register" />
      </div>
    </ArtistProfileSocialContext.Provider>
  );
}

export function ArtistProfileCollaborationPanel({
  slug,
  collaboration
}: {
  slug: string;
  collaboration: CollaborationProfile;
}) {
  const { snapshot, promptAuth } = useArtistProfileSocial();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  if (!collaboration.open) return null;

  async function requestContact() {
    if (!snapshot?.stats.authenticated) {
      promptAuth("Войдите, чтобы связаться с автором");
      return;
    }
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(slug)}/collaboration-contact`, { method: "POST" });
      const payload = await readJsonResponse<{ ok?: boolean; error?: string }>(response, "Не удалось отправить запрос");
      if (!response.ok) {
        setError(payload.error ?? "Не удалось отправить запрос");
        return;
      }
      router.push(`/dashboard/messages?recipientSlug=${encodeURIComponent(slug)}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось отправить запрос");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ux-surface mt-8 rounded-[30px] p-6 sm:p-7">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a99bff]">Collaboration</p>
          <h2 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-white sm:text-4xl">Открыт к сотрудничеству</h2>
          {collaboration.bio ? <p className="mt-3 max-w-2xl text-sm leading-7 text-white/64 sm:text-base">{collaboration.bio}</p> : null}
        </div>
        {!snapshot?.stats.ownProfile ? (
          snapshot?.stats.authenticated ? (
            <button
              type="button"
              onClick={() => void requestContact()}
              disabled={busy}
              className="ux-button-primary inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-white transition disabled:cursor-wait disabled:opacity-60"
            >
              {busy ? "Отправка..." : "Безопасно связаться"}
            </button>
          ) : (
            <button type="button" onClick={() => promptAuth("Войдите, чтобы связаться с автором")} className="ux-button-primary inline-flex h-12 items-center justify-center rounded-full px-6 text-sm font-semibold text-white">
              Войти, чтобы связаться
            </button>
          )
        ) : (
          <div className="ux-pill inline-flex rounded-full px-4 py-2 text-sm text-white/58">
            Это ваш публичный collaboration-профиль
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <span className="ux-pill-active rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[#d7d0ff]">
          {collaborationRoleLabel(collaboration.role)}
        </span>
        <span className="ux-pill rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-white/64">
          {collaborationPreferenceLabel(collaboration.preference)}
        </span>
        {collaboration.intents.map((intent) => (
          <span key={intent} className="ux-pill rounded-full px-3 py-1.5 text-xs font-semibold text-white/64">
            {collaborationIntentLabel(intent)}
          </span>
        ))}
        {collaboration.genres.map((genre) => (
          <span key={genre} className="ux-pill rounded-full px-3 py-1.5 text-xs font-semibold text-white/64">
            {genre}
          </span>
        ))}
      </div>

      {message ? <p className="mt-4 text-sm text-emerald-300">{message}</p> : null}
      {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
    </section>
  );
}

export function ArtistProfileSocialSummary({ plays = 0 }: { plays?: number }) {
  const { slug, snapshot, follow, followSubmitting, promptAuth } = useArtistProfileSocial();
  return (
    <section className="mt-7 flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="flex flex-wrap gap-3">
        <Stat icon={UsersRound} value={snapshot?.stats.followers ?? null} label="подписчиков" />
        <Stat icon={Headphones} value={plays} label="прослушиваний" />
        <Stat icon={Heart} value={snapshot?.stats.likes ?? null} label="лайков" />
      </div>
      {snapshot && !snapshot.stats.ownProfile ? (
        snapshot.stats.authenticated ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={followSubmitting} onClick={() => void follow()} className={`w-fit rounded-full px-6 py-3 text-sm font-bold text-white transition disabled:cursor-wait disabled:opacity-60 ${snapshot.stats.following ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>
              {followSubmitting ? "..." : snapshot.stats.following ? "Отписаться" : "Подписаться"}
            </button>
            <Link href={`/dashboard/messages?recipientSlug=${encodeURIComponent(slug)}`} className="ux-control-compact inline-flex w-fit rounded-full px-6 py-3 text-sm font-bold text-white/78 transition hover:text-white">
              Связаться
            </Link>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => promptAuth("Войдите, чтобы подписаться на профиль")} className="ux-button-primary w-fit rounded-full px-6 py-3 text-sm font-bold text-white">
              Войти, чтобы подписаться
            </button>
            <button type="button" onClick={() => promptAuth("Войдите, чтобы связаться с автором")} className="ux-control-compact w-fit rounded-full px-6 py-3 text-sm font-bold text-white/78 transition hover:text-white">
              Войти, чтобы связаться
            </button>
          </div>
        )
      ) : null}
    </section>
  );
}

export function ArtistProfileHero({
  displayName,
  isVerified,
  slug,
  avatarUrl,
  backgroundUrl,
  joinedAt,
  bio,
  city,
  websiteUrl,
  vkUrl,
  telegramUrl,
  releaseCount,
  plays
}: {
  displayName: string;
  isVerified: boolean;
  slug: string;
  avatarUrl: string | null;
  backgroundUrl: string | null;
  joinedAt: string | null;
  bio: string;
  city: string;
  profileTypeLabel: string;
  websiteUrl: string;
  vkUrl: string;
  telegramUrl: string;
  releaseCount: number;
  plays: number;
}) {
  const { snapshot, follow, followSubmitting, promptAuth } = useArtistProfileSocial();
  const router = useRouter();
  const profileLinks = [
    { href: websiteUrl, label: websiteUrl.replace(/^https?:\/\//iu, "").replace(/\/$/u, ""), icon: "site" as const },
    { href: vkUrl, label: "VK", icon: "external" as const },
    { href: telegramUrl, label: "Telegram", icon: "telegram" as const }
  ].filter((link) => /^https:\/\//iu.test(link.href));
  const postsCount = snapshot?.posts.length ?? "—";
  const viewerAuthenticated = Boolean(snapshot?.stats.authenticated);

  return (
    <TripledProfilePageHero
      name={displayName}
      isVerified={isVerified}
      handle={`@${slug}`}
      avatarUrl={avatarUrl}
      backgroundUrl={backgroundUrl}
      bio={bio}
      location={city}
      joinedAt={joinedAt}
      links={profileLinks}
      stats={[
        { label: "Подписчики", value: snapshot?.stats.followers ?? "—" },
        { label: "Релизы", value: releaseCount },
        { label: "Посты", value: postsCount },
        { label: "Прослушивания", value: plays },
        { label: "Лайки", value: snapshot?.stats.likes ?? "—" },
      ]}
      following={Boolean(snapshot?.stats.following)}
      showActions={!snapshot?.stats.ownProfile}
      onFollow={() => {
        if (viewerAuthenticated) {
          void follow();
          return;
        }
        promptAuth("Войдите, чтобы подписаться на профиль");
      }}
      followLabel={
        followSubmitting
          ? "..."
          : viewerAuthenticated
          ? snapshot?.stats.following
            ? "Отписаться"
            : "Подписаться"
          : "Войти и подписаться"
      }
      onMessage={() => {
        if (viewerAuthenticated) {
          router.push(`/dashboard/messages?recipientSlug=${encodeURIComponent(slug)}`);
          return;
        }
        promptAuth("Войдите, чтобы связаться с автором");
      }}
      messageLabel={viewerAuthenticated ? "Сообщение" : "Войти и написать"}
      moreActions={[
        {
          label: "Поделиться профилем",
          icon: "share",
          onClick: () => {
            const url = `${window.location.origin}/artists/${slug}`;
            if (navigator.share) {
              void navigator.share({ title: displayName, url }).catch(() => null);
              return;
            }
            void navigator.clipboard.writeText(url).catch(() => null);
          }
        },
        {
          label: "Скопировать ссылку",
          icon: "copy",
          onClick: () => {
            const url = `${window.location.origin}/artists/${slug}`;
            void navigator.clipboard.writeText(url).catch(() => null);
          }
        },
        ...(profileLinks[0]
          ? [{
            label: "Открыть основную ссылку",
            icon: "open" as const,
            onClick: () => window.open(profileLinks[0]!.href, "_blank", "noopener,noreferrer")
          }]
          : [])
      ]}
    />
  );
}

export function ArtistProfileSocialContent({ catalogReleases }: { catalogReleases: PublicArtistRelease[] }) {
  const { snapshot, error } = useArtistProfileSocial();
  const [tab, setTab] = React.useState<"catalog" | "feed">("catalog");

  return (
    <section className="mt-12 overflow-hidden rounded-[32px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(24,27,40,0.96),rgba(15,18,29,0.96))] shadow-[0_28px_90px_-48px_rgba(0,0,0,0.88)]">
      <div className="px-6 pb-8 pt-6 sm:px-7 sm:pb-9 sm:pt-7">
        <div className="flex flex-wrap gap-2 border-b border-white/[0.09] pb-4">
          <TabButton active={tab === "catalog"} onClick={() => setTab("catalog")}>Каталог · Релизы</TabButton>
          <TabButton active={tab === "feed"} onClick={() => setTab("feed")}>Новости артиста · Лента</TabButton>
        </div>

        {tab === "catalog" ? (
          <div className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-white/38">Каталог</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Релизы</h2></div>
              <span className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/48">{catalogReleases.length}</span>
            </div>
            {catalogReleases.length ? <ArtistReleaseCatalog releases={catalogReleases} /> : <div className="ux-empty mt-7 rounded-[28px] border-dashed p-8 text-white/48">Опубликованных релизов пока нет.</div>}
          </div>
        ) : (
          <ArtistFeed />
        )}
        {snapshot?.socialUnavailable ? <p className="mt-5 text-sm text-amber-200/75">Лента временно недоступна. Публичный каталог продолжает работать.</p> : null}
        {error ? <p className="mt-4 text-sm text-rose-300">{error}</p> : null}
      </div>
    </section>
  );
}

function ArtistFeed() {
  const { snapshot, likePost, commentPost, promptAuth } = useArtistProfileSocial();
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});

  async function share(postId: string) {
    const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
    if (navigator.share) await navigator.share({ title: "Новости артиста", url });
    else await navigator.clipboard.writeText(url);
  }

  return (
    <div className="mx-auto mt-8 max-w-3xl">
      <div className="mb-6"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a99bff]">Новости артиста</p><h2 className="mt-2 text-3xl font-bold tracking-[-0.03em] sm:text-4xl">Лента</h2></div>
      <div className="grid gap-5">
        {snapshot?.posts.length ? snapshot.posts.map((post) => (
          <article id={`post-${post.id}`} key={post.id} className="ux-surface overflow-hidden rounded-[28px]">
            <div className="p-5 sm:p-6"><Author author={post.author} date={post.createdAt} />{post.content ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-white/78 sm:text-base">{post.content}</p> : null}</div>
            <ArtistPostMediaItems post={post} />
            <div className="flex items-center gap-2 border-t border-white/[0.07] px-5 py-3">
              <button type="button" onClick={() => void likePost(post.id)} className={`ux-control-compact inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${post.liked ? "ux-pill-active text-white" : "text-white/55 hover:text-white"}`}><Heart className={`h-4 w-4 ${post.liked ? "fill-current" : ""}`} /> {post.likes}</button>
              <span className="inline-flex items-center gap-2 px-3 py-2 text-sm text-white/45"><MessageCircle className="h-4 w-4" /> {post.comments.length}</span>
              <button type="button" onClick={() => void share(post.id)} className="shrink-0 rounded-full p-2.5 text-white/45 transition hover:bg-white/[0.05] hover:text-white" aria-label="Поделиться"><Share2 className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 border-t border-white/[0.07] p-5">
              {post.comments.map((item) => <article key={item.id} className="ux-surface-soft overflow-hidden rounded-2xl p-4"><Author author={item.author} date={item.createdAt} compact /><p className="mt-2 text-sm leading-relaxed text-white/68">{item.content}</p></article>)}
              {snapshot.stats.authenticated ? <form onSubmit={async (event) => { event.preventDefault(); const value = drafts[post.id] ?? ""; if (await commentPost(post.id, value)) setDrafts((current) => ({ ...current, [post.id]: "" })); }} className="flex items-center gap-2"><input value={drafts[post.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [post.id]: event.target.value }))} maxLength={800} placeholder="Напишите комментарий" className="min-w-0 flex-1 rounded-[22px] border border-white/8 bg-[rgba(255,255,255,0.04)] px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-[#7b61ff]/50 focus:bg-[rgba(255,255,255,0.06)]" /><button disabled={!(drafts[post.id] ?? "").trim()} className="ux-button-primary flex h-10 w-10 items-center justify-center rounded-xl text-white disabled:opacity-40" aria-label="Отправить"><Send className="h-4 w-4" /></button></form> : <button type="button" onClick={() => promptAuth("Войдите, чтобы комментировать публикации")} className="text-sm font-semibold text-[#a99bff]">Войти, чтобы комментировать</button>}
            </div>
          </article>
        )) : <div className="ux-empty rounded-[28px] border-dashed p-8 text-sm text-white/42">Публикаций пока нет.</div>}
      </div>
    </div>
  );
}

function ArtistPostMediaItems({ post }: { post: Post }) {
  const mediaItems = normalizeSocialPostMediaItems({
    mediaItems: post.mediaItems,
    mediaType: post.mediaType,
    mediaUrl: post.mediaUrl,
    mediaName: post.mediaName
  });
  return mediaItems.map((media) => {
    if (media.mediaType === "image") {
      return <div key={media.id} className="relative aspect-[4/3] overflow-hidden bg-black/20"><Image src={media.mediaUrl} alt={media.mediaName ?? "Фото"} fill unoptimized className="object-contain" /></div>;
    }
    if (media.mediaType === "audio") {
      return <div key={media.id} className="px-5 pb-5"><audio controls src={media.mediaUrl} className="w-full" /></div>;
    }
    return <video key={media.id} controls playsInline poster={media.posterUrl ?? undefined} src={media.mediaUrl} className="max-h-[620px] w-full bg-black" />;
  });
}

function Author({ author, date, compact = false }: { author: SocialAuthor; date: string; compact?: boolean }) {
  return <div className="flex items-center gap-3"><span className="relative shrink-0"><AuthorAvatar author={author} compact={compact} />{author.isVerified ? <span className="absolute -bottom-0.5 -right-0.5"><VerifiedBadge variant="blue" size="sm" tooltip="Верифицированный профиль" /></span> : null}</span><span className="min-w-0"><span className="flex items-center gap-2"><span className="block truncate text-sm font-semibold text-white/85">{author.name}</span>{author.isVerified ? <VerifiedBadge variant="blue" size="sm" tooltip="Верифицированный профиль" className="shrink-0 sm:hidden" /> : null}</span><time className="block text-xs text-white/32">{formatDateTime(date)}</time></span></div>;
}

function AuthorAvatar({ author, compact }: { author: SocialAuthor; compact: boolean }) {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [author.avatarUrl]);

  return (
    <span className={`relative block overflow-hidden rounded-full border border-white/10 bg-[#211a42] ${compact ? "h-8 w-8" : "h-11 w-11"}`}>
      <Image
        src={author.avatarUrl && !failed ? author.avatarUrl : DEFAULT_USER_AVATAR_URL}
        alt={`Аватар ${author.name}`}
        fill
        unoptimized
        className="object-cover"
        onError={() => {
          if (author.avatarUrl) setFailed(true);
        }}
      />
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`ux-control-compact rounded-full px-5 py-3 text-sm font-bold transition ${active ? "ux-pill-active text-white" : "text-white/55 hover:text-white"}`}>{children}</button>;
}

function Stat({ icon: Icon, value, label }: { icon: React.ComponentType<{ className?: string }>; value: number | null; label: string }) {
  return <span className="ux-pill inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-white/60"><Icon className="h-4 w-4 text-[#a99bff]" /><strong className={value === null ? "inline-block h-4 w-6 animate-pulse rounded bg-white/12 text-transparent" : "text-white"} aria-label={value === null ? "Загрузка" : undefined}>{value ?? "—"}</strong> {label}</span>;
}

function AuthNotice({ visible, loginHref, registerHref }: { visible: boolean; loginHref: string; registerHref: string }) {
  if (!visible) return null;
  return (
    <section className="ux-surface rounded-[24px] p-5">
      <h3 className="text-base font-semibold text-white">Для этого действия нужен аккаунт</h3>
      <p className="mt-2 text-sm leading-6 text-white/54">
        Читать профиль, релизы, посты и комментарии можно без входа. Для реакций, подписки и сообщений нужен аккаунт.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={loginHref} className="ux-button-primary inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white">
          Войти
        </Link>
        <Link href={registerHref} className="ux-control-compact inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white/78 transition hover:text-white">
          Создать аккаунт
        </Link>
      </div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
