"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Download, Heart, MessageCircle, Music2, Pause, Pencil, Play, Reply, Share2, ShoppingBag, Trash2 } from "lucide-react";

import { FeedAudioPlayer, FeedStickyReleasePlayer, type FeedAudioPlaybackCommand } from "@/components/feed/feed-audio-player";
import {
  CollaborationResponseDialog,
  EditPostDialog,
  hasPostEditWindowExpired
} from "@/components/feed/feed-shared-dialogs";
import {
  NativeLikesCounter,
  TripledCommentAction,
  TripledCommentNode,
  TripledComposer,
  TripledIdentity,
  TripledThreadHeader
} from "@/components/ui/tripled-social";
import { readJsonResponse } from "@/lib/client-json-response";
import { ClientMutationKeyStore, socialCommentFingerprint, socialCommentMutationSlot } from "@/lib/social-client-idempotency";
import type {
  FeedPostItem,
  FeedReaction,
  FeedReactionSummary,
  FeedReleaseOption,
  FeedReleaseItem,
  PublicFeedComment,
  PublicFeedItem
} from "@/lib/feed-contract";
import { collaborationIntentLabel, collaborationRoleLabel } from "@/lib/collaboration";

type ErrorPayload = { error?: string };
type CommentPayload = {
  comments: PublicFeedComment[];
  total: number;
  nextOffset: number | null;
  hasMore: boolean;
};

type DetailProps = {
  initialItem: PublicFeedItem;
  releaseOptions: FeedReleaseOption[];
  viewerAuthenticated: boolean;
  viewerId: string | null;
  loginHref: string;
};

type PostEditDialogState = {
  item: FeedPostItem;
  draft: string;
};

type CollaborationResponseRecord = {
  id: string;
  message: string;
  createdAt: string;
  linkedRelease: FeedPostItem["linkedRelease"];
  sender: {
    id: string;
    slug: string | null;
    displayName: string;
    avatarUrl: string | null;
    profileType: "user" | "artist" | "producer" | "group" | "label";
    verified: boolean;
  };
};

type CollaborationResponseDialogState = {
  item: FeedPostItem;
  message: string;
  linkedReleaseId: string;
};

const REACTION_STYLES: Array<{ key: FeedReaction; emoji: string; tone: string }> = [
  { key: "heart", emoji: "❤️", tone: "text-[#d8d0ff]" },
  { key: "fire", emoji: "🔥", tone: "text-[#b8adff]" },
  { key: "laugh", emoji: "😂", tone: "text-[#c9c0ff]" },
  { key: "wow", emoji: "😮", tone: "text-[#efe9ff]" },
  { key: "sad", emoji: "😢", tone: "text-cyan-200" },
  { key: "thumbs", emoji: "👍", tone: "text-[#efe9ff]" },
  { key: "party", emoji: "🎉", tone: "text-fuchsia-200" },
  { key: "diamond", emoji: "💎", tone: "text-sky-200" }
];

export function FeedDetailPage({ initialItem, releaseOptions, viewerAuthenticated, viewerId, loginHref }: DetailProps) {
  const router = useRouter();
  const [item, setItem] = React.useState(initialItem);
  const [comments, setComments] = React.useState<PublicFeedComment[]>(isCommentable(initialItem) ? initialItem.comments : []);
  const [commentsTotal, setCommentsTotal] = React.useState(isCommentable(initialItem) ? initialItem.commentsCount : 0);
  const [nextOffset, setNextOffset] = React.useState<number | null>(null);
  const [hasMoreComments, setHasMoreComments] = React.useState(false);
  const [commentsLoading, setCommentsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authPromptVisible, setAuthPromptVisible] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [replyDrafts, setReplyDrafts] = React.useState<Record<string, string>>({});
  const [replyTargetId, setReplyTargetId] = React.useState<string | null>(null);
  const [selectedReaction, setSelectedReaction] = React.useState<FeedReaction | null>(getViewerReaction(initialItem));
  const [followBusy, setFollowBusy] = React.useState(false);
  const [deletingCommentIds, setDeletingCommentIds] = React.useState<Record<string, boolean>>({});
  const [releasePlayerVisible, setReleasePlayerVisible] = React.useState(false);
  const [releasePlaybackCommand, setReleasePlaybackCommand] = React.useState<FeedAudioPlaybackCommand | null>(null);
  const [releasePlaying, setReleasePlaying] = React.useState(false);
  const [postEditDialog, setPostEditDialog] = React.useState<PostEditDialogState | null>(null);
  const [postEditBusy, setPostEditBusy] = React.useState(false);
  const [responseDialog, setResponseDialog] = React.useState<CollaborationResponseDialogState | null>(null);
  const [responseBusy, setResponseBusy] = React.useState(false);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const [responsesOpen, setResponsesOpen] = React.useState(false);
  const [responsesLoading, setResponsesLoading] = React.useState(false);
  const [responses, setResponses] = React.useState<CollaborationResponseRecord[]>([]);
  const [responded, setResponded] = React.useState(false);
  const [closeBusy, setCloseBusy] = React.useState(false);
  const mutationKeysRef = React.useRef(new ClientMutationKeyStore());

  React.useEffect(() => {
    if (!isCommentable(initialItem)) return;
    void loadComments(true);
    // The detail identifier is the intended reload boundary; draft and paging state must not retrigger it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItem.id]);

  const requireAuth = React.useCallback((message = "Войдите, чтобы продолжить") => {
    setError(message);
    setAuthPromptVisible(true);
  }, []);

  const isOwnedByViewer = item.author.ownedByViewer || Boolean(viewerId && item.author.id === viewerId);

  async function loadComments(reset = false) {
    if (!isCommentable(item)) return;
    setCommentsLoading(true);
    setError(null);
    try {
      const url = new URL(commentEndpoint(item), window.location.origin);
      url.searchParams.set("limit", "20");
      if (!reset && nextOffset !== null) {
        url.searchParams.set("offset", String(nextOffset));
      }
      const response = await fetch(`${url.pathname}${url.search}`);
      const payload = await readJsonResponse<CommentPayload & ErrorPayload>(response, "Не удалось загрузить комментарии");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить комментарии");
      setComments((current) => reset ? payload.comments : [...current, ...payload.comments]);
      setCommentsTotal(payload.total);
      setNextOffset(payload.nextOffset);
      setHasMoreComments(payload.hasMore);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить комментарии");
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitReaction(reaction: FeedReaction) {
    if (!isSocialItem(item)) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы ставить реакции");
    const endpoint = item.kind === "post" ? `/api/artists/posts/${item.sourceId}/like` : `/api/scene/releases/${item.releaseId}/like`;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reaction })
    });
    const payload = await readJsonResponse<{ liked: boolean; likes: number; viewerReaction: FeedReaction | null; reactionSummary: FeedReactionSummary } & ErrorPayload>(response, "Не удалось поставить реакцию");
    if (!response.ok) {
      setError(payload.error ?? "Не удалось поставить реакцию");
      return;
    }
    setSelectedReaction(payload.viewerReaction);
    setItem((current) => isSocialItem(current)
      ? { ...current, likedByViewer: payload.liked, likesCount: payload.likes, viewerReaction: payload.viewerReaction, reactionSummary: payload.reactionSummary }
      : current);
  }

  async function submitComment(parentId?: string | null) {
    if (!isCommentable(item)) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы оставлять комментарии");
    const content = (parentId ? replyDrafts[parentId] : draft).trim();
    if (!content) return;
    const kind = item.kind === "post" ? "post" : "release";
    const sourceId = item.kind === "post" ? item.sourceId : item.releaseId;
    const mutationSlot = socialCommentMutationSlot(kind, sourceId, parentId);
    const idempotencyKey = mutationKeysRef.current.acquire(mutationSlot, socialCommentFingerprint(content));
    try {
      const response = await fetch(commentEndpoint(item), {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ content, parentId: parentId ?? null })
      });
      const payload = await readJsonResponse<PublicFeedComment & ErrorPayload>(response, "Не удалось добавить комментарий");
      if (!response.ok) return setError(payload.error ?? "Не удалось добавить комментарий");
      mutationKeysRef.current.complete(mutationSlot, idempotencyKey);
      const comment = payload as PublicFeedComment;
      setComments((current) => parentId ? insertReply(current, parentId, comment) : [comment, ...current]);
      setCommentsTotal((current) => current + 1);
      setItem((current) => isCommentable(current) ? { ...current, commentsCount: current.commentsCount + 1 } : current);
      if (parentId) {
        setReplyDrafts((current) => ({ ...current, [parentId]: "" }));
        setReplyTargetId(null);
      } else setDraft("");
    } catch (commentError) {
      setError(commentError instanceof Error ? commentError.message : "Не удалось добавить комментарий");
    }
  }

  async function deleteComment(commentId: string) {
    if (!isCommentable(item)) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы удалить комментарий");
    const ok = window.confirm("Удалить комментарий?");
    if (!ok) return;
    setDeletingCommentIds((current) => ({ ...current, [commentId]: true }));
    try {
      const response = await fetch(`${commentEndpoint(item)}?commentId=${encodeURIComponent(commentId)}`, { method: "DELETE" });
      const payload = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить комментарий");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось удалить комментарий");
      await loadComments(true);
      setItem((current) => isCommentable(current) ? { ...current, commentsCount: Math.max(0, current.commentsCount - 1) } : current);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить комментарий");
    } finally {
      setDeletingCommentIds((current) => ({ ...current, [commentId]: false }));
    }
  }

  async function editComment(comment: PublicFeedComment) {
    if (!isCommentable(item) || !comment.ownedByViewer || comment.deletedAt) return;
    const content = window.prompt("Изменить комментарий", comment.content);
    if (content === null || content.trim() === comment.content.trim()) return;
    const response = await fetch(commentEndpoint(item), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ commentId: comment.id, content }) });
    const payload = await readJsonResponse<ErrorPayload>(response, "Не удалось изменить комментарий");
    if (!response.ok) return setError(payload.error ?? "Не удалось изменить комментарий");
    await loadComments(true);
  }

  async function reactToComment(comment: PublicFeedComment) {
    if (!isCommentable(item) || comment.deletedAt) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы ставить реакции");
    const sourceId = item.kind === "post" ? item.sourceId : item.releaseId;
    const endpoint = item.kind === "post" ? `/api/artists/posts/${sourceId}/comments/${comment.id}/like` : `/api/scene/releases/${sourceId}/comments/${comment.id}/like`;
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reaction: "heart" }) });
    const payload = await readJsonResponse<ErrorPayload>(response, "Не удалось поставить реакцию");
    if (!response.ok) return setError(payload.error ?? "Не удалось поставить реакцию");
    await loadComments(true);
  }

  async function editOwnedPost() {
    if (item.kind !== "post" || !isOwnedByViewer) return;
    setPostEditDialog({
      item,
      draft: item.content
    });
  }

  async function confirmEditPost() {
    if (!viewerAuthenticated || !postEditDialog || postEditBusy) return;
    const { item: target, draft: nextDraft } = postEditDialog;
    const nextContent = nextDraft.trim();
    if (hasPostEditWindowExpired(target.publishedAt)) {
      setError("Прошло 24 часа, и, к сожалению, отредактировать данную публикацию нельзя.");
      return;
    }
    if (nextContent === target.content.trim()) {
      setPostEditDialog(null);
      return;
    }
    setPostEditBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/artist-profile/posts/${target.sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: nextContent })
      });
      const payload = await readJsonResponse<{ content?: string; updatedAt?: string; editedAt?: string } & ErrorPayload>(response, "Не удалось изменить публикацию");
      if (!response.ok) {
        setError(payload.error ?? "Не удалось изменить публикацию");
        return;
      }
      setItem((current) => current.kind === "post"
        ? {
            ...current,
            content: payload.content ?? nextContent,
            updatedAt: payload.updatedAt ?? current.updatedAt,
            editedAt: payload.editedAt ?? current.editedAt
          }
        : current);
      setPostEditDialog(null);
    } finally {
      setPostEditBusy(false);
    }
  }

  async function deleteOwnedPost() {
    if (item.kind !== "post" || !isOwnedByViewer) return;
    if (!window.confirm("Удалить публикацию?")) return;
    const response = await fetch(`/api/user/artist-profile/posts/${item.sourceId}`, { method: "DELETE" });
    const payload = await readJsonResponse<ErrorPayload>(response, "Не удалось удалить публикацию");
    if (!response.ok) {
      setError(payload.error ?? "Не удалось удалить публикацию");
      return;
    }
    router.push("/feed");
    router.refresh();
  }

  async function share() {
    const absolute = `${window.location.origin}${item.permalink}`;
    try {
      if (navigator.share) {
        await navigator.share({ url: absolute });
        return;
      }
      await navigator.clipboard.writeText(absolute);
    } catch {
      setError("Не удалось поделиться публикацией");
    }
  }

  async function toggleFollow() {
    if (!item.author.slug || item.author.profileType === "platform" || isOwnedByViewer) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы подписаться");
    const previous = item.author.followingByViewer;
    setFollowBusy(true);
    setItem((current) => ({ ...current, author: { ...current.author, followingByViewer: !previous } }));
    try {
      const response = await fetch(`/api/artists/${encodeURIComponent(item.author.slug)}/follow`, { method: "POST" });
      const payload = await readJsonResponse<{ following?: boolean; error?: string }>(response, "Не удалось обновить подписку");
      if (!response.ok || typeof payload.following !== "boolean") {
        setItem((current) => ({ ...current, author: { ...current.author, followingByViewer: previous } }));
        setError(payload.error ?? "Не удалось обновить подписку");
        return;
      }
      setItem((current) => ({ ...current, author: { ...current.author, followingByViewer: payload.following! } }));
    } catch (followError) {
      setItem((current) => ({ ...current, author: { ...current.author, followingByViewer: previous } }));
      setError(followError instanceof Error ? followError.message : "Не удалось обновить подписку");
    } finally {
      setFollowBusy(false);
    }
  }

  function openReleasePlayer() {
    if (item.kind !== "release" || !item.audioUrl) return;
    setReleasePlayerVisible(true);
    setReleasePlaybackCommand({
      releaseId: item.releaseId,
      action: "toggle",
      nonce: Date.now() + Math.random()
    });
  }

  async function loadCollaborationResponses(target: FeedPostItem) {
    setResponsesLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/artists/posts/${target.sourceId}/responses`);
      const payload = await readJsonResponse<CollaborationResponseRecord[] & ErrorPayload>(response, "Не удалось загрузить отклики");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось загрузить отклики");
      setResponses(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить отклики");
    } finally {
      setResponsesLoading(false);
    }
  }

  async function toggleCollaborationResponses() {
    if (item.kind !== "post" || !item.collaboration || !isOwnedByViewer) return;
    const nextOpen = !responsesOpen;
    setResponsesOpen(nextOpen);
    if (nextOpen && responses.length === 0) {
      await loadCollaborationResponses(item);
    }
  }

  function openCollaborationResponseDialog() {
    if (item.kind !== "post" || !item.collaboration || isOwnedByViewer) return;
    if (item.collaboration.status === "closed" || responded) return;
    if (!viewerAuthenticated) return requireAuth("Войдите, чтобы откликнуться на объявление");
    setResponseError(null);
    setResponseDialog({
      item,
      message: "",
      linkedReleaseId: ""
    });
  }

  async function submitCollaborationResponse() {
    if (!responseDialog || responseBusy) return;
    setResponseBusy(true);
    setResponseError(null);
    try {
      const response = await fetch(`/api/artists/posts/${responseDialog.item.sourceId}/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: responseDialog.message,
          linkedReleaseId: responseDialog.linkedReleaseId || null
        })
      });
      const payload = await readJsonResponse<CollaborationResponseRecord & ErrorPayload>(response, "Не удалось отправить отклик");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось отправить отклик");
      setResponded(true);
      setResponseDialog(null);
      setItem((current) => current.kind === "post"
        ? { ...current, responsesCount: current.responsesCount + 1 }
        : current);
      setResponses((current) => current.length ? [payload as CollaborationResponseRecord, ...current] : current);
    } catch (submitError) {
      setResponseError(submitError instanceof Error ? submitError.message : "Не удалось отправить отклик");
    } finally {
      setResponseBusy(false);
    }
  }

  async function closeCollaborationAnnouncement() {
    if (item.kind !== "post" || !item.collaboration || closeBusy) return;
    setCloseBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/user/artist-profile/posts/${item.sourceId}/collaboration-status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "closed" })
      });
      const payload = await readJsonResponse<{ status: "open" | "closed" } & ErrorPayload>(response, "Не удалось закрыть объявление");
      if (!response.ok) throw new Error(payload.error ?? "Не удалось закрыть объявление");
      setItem((current) => current.kind === "post" && current.collaboration
        ? { ...current, collaboration: { ...current.collaboration, status: payload.status ?? "closed" } }
        : current);
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : "Не удалось закрыть объявление");
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <div className={`feed-skin mx-auto grid w-full max-w-[920px] gap-5 ${releasePlayerVisible && item.kind === "release" && item.audioUrl ? "pb-[176px] sm:pb-[188px]" : ""}`}>
      <section className="ux-surface overflow-hidden rounded-[28px] px-5 py-6 sm:px-7 sm:py-7">
        <button type="button" onClick={() => router.push("/feed")} className="ux-control-compact inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium text-white/72 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Назад к ленте
        </button>
        <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.24em] text-white/38">ICECREAMMUSIC</p>
        <h1 className="mt-3 text-[28px] font-bold leading-[1.04] tracking-[-0.02em] text-white/95 sm:text-[36px]">Публикация сообщества</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/56">Полный просмотр публикации, реакций и всей ветки комментариев без перехода в кабинет.</p>
      </section>

      {error ? <div className="ux-error rounded-[22px] px-4 py-3 text-sm text-[#e2dcff]">{error}</div> : null}
      {authPromptVisible && !viewerAuthenticated ? <AuthNotice loginHref={loginHref} registerHref="/register" /> : null}

      <article className="ux-surface overflow-hidden rounded-[28px]">
        <div className="px-5 py-5 sm:px-7 sm:py-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <AuthorHeader
                author={item.author}
                date={item.publishedAt}
                action={item.author.slug && item.author.profileType !== "platform" && !isOwnedByViewer ? <FollowButton following={item.author.followingByViewer} busy={followBusy} onClick={() => void toggleFollow()} /> : null}
              />
            </div>
            <Badge>{item.kind === "post" ? "Публикация" : item.kind === "release" ? "Релиз" : "Новости"}</Badge>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-white/38">
            <span className="text-sm">{formatReleaseDate(item.publishedAt)}</span>
            {item.kind === "post" && item.mediaItems.length ? <Badge>Медиа</Badge> : null}
            {item.kind === "post" && item.linkedRelease ? <Badge>Release</Badge> : null}
            {item.kind === "post" && item.collaboration ? <span className="inline-flex min-h-10 items-center rounded-full border border-[#8f7cff]/42 bg-[linear-gradient(135deg,rgba(123,97,255,0.28),rgba(123,97,255,0.14))] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f3efff] shadow-[0_18px_44px_-28px_rgba(123,97,255,0.88)]">{item.collaboration.displayIntent}</span> : null}
            {item.kind === "post" && item.collaboration ? <Badge>{item.collaboration.displayRole}</Badge> : null}
            {item.kind === "post" && item.collaboration ? <span className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] ${item.collaboration.status === "closed" ? "border-[#7b61ff]/24 bg-[#7b61ff]/10 text-[#d8d0ff]" : "border-emerald-400/28 bg-emerald-400/10 text-emerald-100"}`}>{item.collaboration.status === "closed" ? "Закрыто" : "Открыто"}</span> : null}
          </div>

          {item.kind === "post" ? <h2 className="mt-4 max-w-[42rem] whitespace-pre-wrap text-[20px] font-medium leading-[1.68] tracking-[-0.014em] text-white/90">{item.content || "Публикация без текста"}</h2> : null}
          {item.kind === "release" ? <>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#d4cbff]">Release story</p>
            <h2 className="mt-3 text-[28px] font-semibold leading-[1.08] tracking-[-0.026em] text-white/95 sm:text-[36px]">{item.title}</h2>
          </> : null}
          {item.kind === "news" ? <>
            <h2 className="mt-4 text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-white">{item.title}</h2>
            {item.excerpt ? <p className="mt-3 max-w-[42rem] text-[16px] leading-7 text-white/66">{item.excerpt}</p> : null}
          </> : null}

          <div className="mt-5 grid gap-4">
            {item.kind === "post" && item.mediaItems.length ? <DetailPostMediaStack mediaItems={item.mediaItems} fallbackTitle={item.mediaName ?? item.author.displayName} /> : null}
            {item.kind === "post" && item.linkedRelease ? <LinkedReleaseCard release={item.linkedRelease} /> : null}
            {item.kind === "post" && item.collaboration ? (
              <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4 sm:p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">Collaboration</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/58">
                  <span>{item.collaboration.displayRole}</span>
                  <span>•</span>
                  <span>{item.collaboration.preference === "hybrid" ? "Remote / Local" : item.collaboration.preference === "remote" ? "Remote" : "Local"}</span>
                  {item.collaboration.preference === "local" && item.collaboration.city ? (
                    <>
                      <span>•</span>
                      <span>{item.collaboration.city}</span>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
            {item.kind === "release" ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(320px,360px)_minmax(0,1fr)]">
                <button
                  type="button"
                  onClick={item.audioUrl ? openReleasePlayer : undefined}
                  className={`group relative aspect-square w-full max-w-[360px] overflow-hidden rounded-[24px] border border-white/[0.08] bg-[radial-gradient(circle_at_50%_0%,rgba(123,97,255,0.18),transparent_44%),rgba(18,20,33,0.72)] text-left shadow-[0_22px_70px_-42px_rgba(0,0,0,0.72)] ring-1 ring-white/[0.06] ${item.audioUrl ? "cursor-pointer" : "cursor-default"}`}
                  aria-label={item.audioUrl ? `${releasePlaying ? "Пауза" : "Слушать"} ${item.title}` : item.title}
                >
                  <SafeImage src={item.coverUrl} alt={item.title} fill className="object-cover transition duration-300 group-hover:scale-[1.02]" fallback={<div className="flex h-full items-center justify-center text-white/24"><Music2 className="h-10 w-10" /></div>} />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,10,18,0.08),rgba(8,10,16,0.5)_62%,rgba(8,10,16,0.84))]" />
                  {item.audioUrl ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/12 bg-black/38 text-white shadow-[0_24px_50px_-28px_rgba(0,0,0,0.88)] transition group-hover:scale-105">
                        {releasePlaying ? <Pause className="h-8 w-8" /> : <Play className="ml-1 h-8 w-8" />}
                      </span>
                    </div>
                  ) : null}
                </button>

                <MediaSurface label="Релиз" title={item.title}>
                  <div className="grid gap-3 sm:max-w-[420px] sm:grid-cols-[minmax(0,1fr)_64px]">
                    <button
                      type="button"
                      onClick={item.audioUrl ? openReleasePlayer : undefined}
                      disabled={!item.audioUrl}
                      className={`inline-flex h-16 items-center justify-center gap-3 rounded-[18px] border px-5 text-[18px] font-semibold transition ${item.audioUrl ? "border-[#2d6dff] text-white shadow-[0_16px_44px_-24px_rgba(20,115,255,0.72)] hover:bg-[#101c36]" : "border-white/10 text-white/40"}`}
                    >
                      <ShoppingBag className="h-5 w-5" />
                      <span className="truncate">{releasePlaying ? "Pause Preview" : item.audioUrl ? "Play Preview" : "Preview Unavailable"}</span>
                    </button>
                    <Link href={item.permalink} className="inline-flex h-16 items-center justify-center rounded-[18px] border border-white/10 text-white/68 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white" aria-label={`Открыть ${item.title}`}>
                      <Download className="h-5 w-5" />
                    </Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill>Дата релиза · {formatReleaseDate(item.publishedAt)}</Pill>
                    <Pill>Прослушивания · {item.playCount}</Pill>
                  </div>
                </MediaSurface>
              </div>
            ) : null}
            {item.kind === "news" && item.coverUrl ? <FeedImage src={item.coverUrl} alt={item.title} ratio="wide" /> : null}
            {item.kind === "news" && item.content ? <div className="max-w-[44rem] whitespace-pre-wrap text-[16px] leading-8 text-white/74">{item.content}</div> : null}
          </div>

          {(item.kind === "post" || item.kind === "release") && isOwnedByViewer ? <div className="mt-5"><OwnerMetrics item={item} commentsTotal={commentsTotal} /></div> : null}
        </div>

        <div className="border-t border-white/8 px-5 py-4 sm:px-7 sm:py-5">
          {isSocialItem(item) ? (
            <div className="grid gap-3">
              {item.kind === "post" && item.collaboration ? (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm text-white/46">
                    <button type="button" onClick={() => void submitReaction("heart")} className="inline-flex items-center gap-2 transition hover:text-white">
                      <Heart className={`h-[17px] w-[17px] ${selectedReaction === "heart" ? "fill-current text-[#7b61ff]" : ""}`} />
                      <span>{item.reactionSummary.total}</span>
                    </button>
                    <button type="button" onClick={() => viewerAuthenticated ? document.getElementById("feed-detail-comment-form")?.scrollIntoView({ behavior: "smooth", block: "center" }) : requireAuth("Войдите, чтобы оставлять комментарии")} className="inline-flex items-center gap-2 transition hover:text-white">
                      <MessageCircle className="h-[17px] w-[17px]" />
                      <span>{commentsTotal}</span>
                    </button>
                    <span className="inline-flex items-center gap-2">
                      <Reply className="h-[17px] w-[17px]" />
                      <span>{item.responsesCount}</span>
                    </span>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {isOwnedByViewer ? (
                      <>
                        <ActionPill onClick={() => void toggleCollaborationResponses()}>{`Отклики · ${item.responsesCount}`}</ActionPill>
                        {item.collaboration.status === "open" ? (
                          <ActionPill onClick={() => void closeCollaborationAnnouncement()}>
                            {closeBusy ? "Закрываем..." : "Закрыть объявление"}
                          </ActionPill>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={item.collaboration.status === "closed" || responded}
                        onClick={() => void openCollaborationResponseDialog()}
                        className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition ${
                          item.collaboration.status === "closed" || responded
                            ? "border border-white/8 bg-white/[0.03] text-white/38"
                            : "border border-[#7b61ff]/28 bg-[#7b61ff]/16 text-[#efe9ff] hover:border-[#7b61ff]/44 hover:bg-[#7b61ff]/22"
                        }`}
                      >
                        {item.collaboration.status === "closed" ? "Объявление закрыто" : responded ? "Уже откликнулись" : "Откликнуться"}
                      </button>
                    )}
                    <ShareButton onClick={share} compact />
                    {item.kind === "post" && isOwnedByViewer ? <><ActionPill onClick={() => void editOwnedPost()}><Pencil className="h-4 w-4" /> Изменить</ActionPill><ActionPill onClick={() => void deleteOwnedPost()}><Trash2 className="h-4 w-4" /> Удалить</ActionPill></> : null}
                  </div>
                </div>
              ) : (
                <>
                  <ReactionBar reactionSummary={item.reactionSummary} selectedReaction={selectedReaction} canInteract={viewerAuthenticated} onSelect={submitReaction} onRequireAuth={() => requireAuth("Войдите, чтобы ставить реакции")} compact={item.kind === "release"} />
                  <div className="flex flex-wrap items-center gap-2">
                    <ActionPill onClick={() => viewerAuthenticated ? document.getElementById("feed-detail-comment-form")?.scrollIntoView({ behavior: "smooth", block: "center" }) : requireAuth("Войдите, чтобы оставлять комментарии")}><MessageCircle className="h-4 w-4" /> {commentsTotal} Комментарии</ActionPill>
                    <ShareButton onClick={share} compact />
                    {item.kind === "post" && isOwnedByViewer ? <><ActionPill onClick={() => void editOwnedPost()}><Pencil className="h-4 w-4" /> Изменить публикацию</ActionPill><ActionPill onClick={() => void deleteOwnedPost()}><Trash2 className="h-4 w-4" /> Удалить публикацию</ActionPill></> : null}
                  </div>
                </>
              )}
            </div>
          ) : <ShareButton onClick={share} compact />}

          {item.kind === "post" && item.collaboration && isOwnedByViewer && responsesOpen ? (
            <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/42">Отклики</p>
                {responsesLoading ? <span className="text-xs text-white/38">Загрузка...</span> : null}
              </div>
              {responses.length ? (
                <div className="grid gap-3">
                  {responses.map((response) => (
                    <div key={response.id} className="rounded-[18px] border border-white/8 bg-[#141826] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">{response.sender.displayName}</span>
                            {response.sender.verified ? <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#05a6e8] text-[10px] text-white">✓</span> : null}
                          </div>
                          <p className="mt-1 text-xs text-white/42">{formatActivityTime(response.createdAt)}</p>
                        </div>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/78">{response.message}</p>
                      {response.linkedRelease ? (
                        <div className="mt-3">
                          <LinkedReleaseCard release={response.linkedRelease} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : !responsesLoading ? (
                <p className="text-sm text-white/46">Откликов пока нет.</p>
              ) : null}
            </div>
          ) : null}

          {isCommentable(item) ? (
            <>
              <CommentComposer
                id="feed-detail-comment-form"
                className="mt-4"
                draft={draft}
                canInteract={viewerAuthenticated}
                pending={false}
                placeholder="Напишите комментарий"
                onDraftChange={(value) => {
                  const kind = item.kind === "post" ? "post" : "release";
                  const sourceId = item.kind === "post" ? item.sourceId : item.releaseId;
                  mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot(kind, sourceId), socialCommentFingerprint(value));
                  setDraft(value);
                }}
                onRequireAuth={() => requireAuth("Войдите, чтобы оставлять комментарии")}
                onSubmit={() => void submitComment()}
              />
              <div className="mt-6 border-t border-white/8 pt-5">
                <TripledThreadHeader count={commentsTotal} caption="Чтение доступно всем, отвечать можно после входа." />
                <div className="grid gap-3">
                  {comments.map((comment) => (
                    <CommentThread
                      key={comment.id}
                      comment={comment}
                      viewerAuthenticated={viewerAuthenticated}
                      activeReplyId={replyTargetId}
                      onRequireAuth={() => requireAuth("Войдите, чтобы оставлять комментарии")}
                      onReplyDraftChange={(commentId, value) => {
                        const kind = item.kind === "post" ? "post" : "release";
                        const sourceId = item.kind === "post" ? item.sourceId : item.releaseId;
                        mutationKeysRef.current.invalidateIfChanged(socialCommentMutationSlot(kind, sourceId, commentId), socialCommentFingerprint(value));
                        setReplyDrafts((current) => ({ ...current, [commentId]: value }));
                      }}
                      onReplyToggle={(commentId) => setReplyTargetId((current) => current === commentId ? null : commentId)}
                      onReplySubmit={(commentId) => void submitComment(commentId)}
                      replyDrafts={replyDrafts}
                      onDelete={(commentId) => void deleteComment(commentId)}
                      onEdit={(target) => void editComment(target)}
                      onReact={(target) => void reactToComment(target)}
                      deletingById={deletingCommentIds}
                    />
                  ))}
                  {!comments.length && !commentsLoading ? <p className="text-sm text-white/40">Комментариев пока нет.</p> : null}
                </div>
                {hasMoreComments ? <button type="button" onClick={() => void loadComments(false)} disabled={commentsLoading} className="ux-control-compact mt-4 inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm text-white/70 transition hover:text-white disabled:opacity-50"><ChevronDown className="h-4 w-4" /> {commentsLoading ? "Загрузка..." : "Показать все комментарии"}</button> : null}
              </div>
            </>
          ) : null}
        </div>
      </article>

      {releasePlayerVisible && item.kind === "release" && item.audioUrl ? (
        <FeedStickyReleasePlayer
          src={item.audioUrl}
          title={item.title}
          artist={item.author.displayName}
          coverUrl={item.coverUrl}
          releaseId={item.releaseId}
          playbackCommand={releasePlaybackCommand}
          onPlayingChange={setReleasePlaying}
          onPlayCountChange={(count) => setItem((current) => current.kind === "release" ? { ...current, playCount: count } : current)}
          onLoadError={() => undefined}
          onOpenRelease={() => {
            if (typeof window === "undefined") return;
            window.location.assign(item.permalink);
          }}
          onClose={() => {
            setReleasePlaying(false);
            setReleasePlayerVisible(false);
            setReleasePlaybackCommand(null);
          }}
        />
      ) : null}

      <EditPostDialog
        open={Boolean(postEditDialog)}
        busy={postEditBusy}
        expired={postEditDialog ? hasPostEditWindowExpired(postEditDialog.item.publishedAt) : false}
        value={postEditDialog?.draft ?? ""}
        onChange={(value) => setPostEditDialog((current) => current ? { ...current, draft: value } : current)}
        onClose={() => !postEditBusy && setPostEditDialog(null)}
        onConfirm={() => void confirmEditPost()}
      />

      <CollaborationResponseDialog
        open={Boolean(responseDialog)}
        busy={responseBusy}
        error={responseError}
        releases={releaseOptions}
        summary={responseDialog?.item.collaboration ? {
          intent: collaborationIntentLabel(responseDialog.item.collaboration.rawIntent),
          role: responseDialog.item.collaboration.rawRole === "other" ? "Роль не указана" : collaborationRoleLabel(responseDialog.item.collaboration.rawRole),
          format: responseDialog.item.collaboration.preference === "remote"
            ? "🌐 Remote"
            : responseDialog.item.collaboration.preference === "local"
              ? "📍 Local"
              : "🌐 Remote / 📍 Local"
        } : null}
        linkedReleaseId={responseDialog?.linkedReleaseId ?? ""}
        message={responseDialog?.message ?? ""}
        onReleaseChange={(value) => setResponseDialog((current) => current ? { ...current, linkedReleaseId: value } : current)}
        onMessageChange={(value) => setResponseDialog((current) => current ? { ...current, message: value } : current)}
        onClose={() => !responseBusy && setResponseDialog(null)}
        onConfirm={() => void submitCollaborationResponse()}
      />
    </div>
  );
}

function CommentThread({
  comment,
  viewerAuthenticated,
  activeReplyId,
  replyDrafts,
  onRequireAuth,
  onReplyDraftChange,
  onReplyToggle,
  onReplySubmit,
  onDelete,
  onEdit,
  onReact,
  deletingById,
  nested = false
}: {
  comment: PublicFeedComment;
  viewerAuthenticated: boolean;
  activeReplyId: string | null;
  replyDrafts: Record<string, string>;
  onRequireAuth: () => void;
  onReplyDraftChange: (commentId: string, value: string) => void;
  onReplyToggle: (commentId: string) => void;
  onReplySubmit: (commentId: string) => void;
  onDelete: (commentId: string) => void;
  onEdit: (comment: PublicFeedComment) => void;
  onReact: (comment: PublicFeedComment) => void;
  deletingById: Record<string, boolean>;
  nested?: boolean;
}) {
  return (
    <TripledCommentNode
      id={comment.id}
      authorName={comment.author.name}
      authorAvatarUrl={comment.author.avatarUrl}
      authorVerified={comment.author.isVerified}
      timeLabel={`${formatActivityTime(comment.createdAt)}${comment.editedAt ? " · изменено" : ""}`}
      body={comment.content ? <p className="whitespace-pre-wrap">{comment.content}</p> : null}
      media={comment.mediaUrl ? <div className="mt-1"><FeedImage src={comment.mediaUrl} alt={comment.mediaName ?? "Комментарий"} ratio="wide" /></div> : undefined}
      nested={nested}
      repliesCount={comment.repliesCount}
      actions={
        <>
          {!comment.deletedAt ? <TripledCommentAction icon={<Heart className={`h-3.5 w-3.5 ${comment.viewerReaction === "heart" ? "fill-current" : ""}`} />} onClick={() => onReact(comment)}>{comment.reactionSummary.total || "Нравится"}</TripledCommentAction> : null}
          {!comment.deletedAt ? <TripledCommentAction icon={<Reply className="h-3.5 w-3.5" />} onClick={viewerAuthenticated ? () => onReplyToggle(comment.id) : onRequireAuth}>Ответить</TripledCommentAction> : null}
          {comment.ownedByViewer && !comment.deletedAt ? <><TripledCommentAction icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(comment)}>Изменить</TripledCommentAction><TripledCommentAction icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => onDelete(comment.id)} destructive>Удалить</TripledCommentAction></> : null}
        </>
      }
      composer={activeReplyId === comment.id ? <TripledComposer value={replyDrafts[comment.id] ?? ""} onChange={(value) => viewerAuthenticated ? onReplyDraftChange(comment.id, value) : onRequireAuth()} onSubmit={() => void onReplySubmit(comment.id)} placeholder="Ответить на комментарий" disabled={!viewerAuthenticated} /> : undefined}
    >
      {comment.replies.map((reply) => <CommentThread key={reply.id} comment={reply} viewerAuthenticated={viewerAuthenticated} activeReplyId={activeReplyId} replyDrafts={replyDrafts} onRequireAuth={onRequireAuth} onReplyDraftChange={onReplyDraftChange} onReplyToggle={onReplyToggle} onReplySubmit={onReplySubmit} onDelete={onDelete} onEdit={onEdit} onReact={onReact} deletingById={deletingById} nested />)}
    </TripledCommentNode>
  );
}

function CommentComposer({
  id,
  draft,
  canInteract,
  pending,
  placeholder,
  className,
  onDraftChange,
  onRequireAuth,
  onSubmit
}: {
  id?: string;
  draft: string;
  canInteract: boolean;
  pending: boolean;
  placeholder: string;
  className?: string;
  onDraftChange: (value: string) => void;
  onRequireAuth: () => void;
  onSubmit: () => void;
}) {
  return (
    <div id={id} className={className}>
      <TripledComposer
        value={draft}
        onChange={(value) => canInteract ? onDraftChange(value) : onRequireAuth()}
        onSubmit={canInteract ? onSubmit : onRequireAuth}
        placeholder={placeholder}
        disabled={pending || !canInteract}
      />
    </div>
  );
}

function MediaSurface({ label, title, badge, hideHeader = false, children }: { label: string; title: string; badge?: string; hideHeader?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-[24px] border border-white/8 bg-white/[0.032] p-3.5 sm:p-4">
      {!hideHeader ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/38">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-white/88">{title}</p>
          </div>
          {badge ? <Badge>{badge}</Badge> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function LinkedReleaseCard({ release }: { release: FeedPostItem["linkedRelease"] }) {
  if (!release) return null;
  const musicPlatformLinks = (release.platformLinks ?? []).filter((platform) => {
    const label = platform.label.toLowerCase();
    const code = platform.code.toLowerCase();
    return label.includes("яндекс") || label.includes("yandex") || label.includes("vk") || label.includes("вк") || code.includes("yandex") || code.includes("vk");
  });
  const preview = release.coverUrl ? (
    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[16px] border border-white/10 bg-transparent">
      <Image src={release.coverUrl} alt={release.title} fill unoptimized className="object-cover" />
    </div>
  ) : (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] border border-white/10 bg-white/[0.03] text-white/36">
      <Music2 className="h-5 w-5" />
    </div>
  );
  return (
    <div className="ux-surface-soft mt-4 rounded-[24px] px-4 py-4">
      <div className="flex items-start gap-3">
        {preview}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/38">Привязанный релиз</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">{release.title}</p>
          <p className="mt-1 text-xs text-white/52">
            {[release.artistName, formatReleaseDate(release.releaseDate)].filter(Boolean).join(" • ")}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {musicPlatformLinks.length ? (
          <>
            {musicPlatformLinks.slice(0, 3).map((platform) => (
              <a key={platform.code} href={platform.href} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-full border border-white/10 bg-white/[0.03] px-4 text-sm text-white/72 transition hover:border-white/18 hover:text-white">
                {platform.label}
              </a>
            ))}
          </>
        ) : (
          <span className="text-sm text-white/48">Ссылки на площадки пока не найдены.</span>
        )}
      </div>
    </div>
  );
}

function AuthorHeader({ author, date, action }: { author: PublicFeedItem["author"]; date: string; action?: React.ReactNode }) {
  const identity = (
    <TripledIdentity
      name={author.displayName}
      avatarUrl={author.avatarUrl}
      verified={author.verified}
      meta={formatActivityTime(date)}
    />
  );
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        {identity}
      </div>
      <div className="ml-auto flex items-center gap-2">
        {action}
      </div>
    </div>
  );
}

function FollowButton({ following, busy, onClick }: { following: boolean; busy: boolean; onClick: () => void }) {
  const className = `inline-flex h-9 items-center rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.14em] transition ${following ? "border border-[#7b61ff]/34 bg-[#7b61ff]/14 text-[#efe9ff] shadow-[0_18px_34px_-24px_rgba(123,97,255,0.7)] hover:border-[#9d8dff]/60 hover:bg-[#7b61ff]/20 hover:text-white" : "ux-button-primary text-white"} ${busy ? "cursor-wait opacity-60" : ""}`;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={className}
    >
      {busy ? "..." : following ? "Отписаться" : "Подписаться"}
    </button>
  );
}

function OwnerMetrics({ item, commentsTotal }: { item: FeedPostItem | FeedReleaseItem; commentsTotal: number }) {
  return (
    <div className="ux-surface-soft rounded-[22px] p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/38">Метрики автора</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Pill>Реакции · {item.reactionSummary.total}</Pill>
        <Pill>Комментарии · {commentsTotal}</Pill>
        {item.kind === "release" ? <Pill>Прослушивания · {item.playCount}</Pill> : null}
      </div>
    </div>
  );
}

function ReactionBar({ reactionSummary, selectedReaction, canInteract, onSelect, onRequireAuth, compact = false }: { reactionSummary: FeedReactionSummary; selectedReaction: FeedReaction | null; canInteract: boolean; onSelect: (reaction: FeedReaction) => void; onRequireAuth: () => void; compact?: boolean }) {
  const counts = reactionSummary.counts;
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const visibleReactions = React.useMemo(() => {
    const base = REACTION_STYLES.filter((reaction) => !["party", "diamond"].includes(reaction.key));
    if (!selectedReaction || base.some((reaction) => reaction.key === selectedReaction)) return base;
    const active = REACTION_STYLES.find((reaction) => reaction.key === selectedReaction);
    return active ? [...base, active] : base;
  }, [selectedReaction]);
  const heartCount = counts.heart ?? 0;

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  const handleSelect = (reaction: FeedReaction) => {
    if (!canInteract) {
      onRequireAuth();
      return;
    }
    onSelect(reaction);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative w-full">
      <div className={`flex flex-wrap items-center ${compact ? "gap-1.5 pr-12" : "gap-2 pr-14"}`}>
        <NativeLikesCounter
          count={heartCount}
          active={selectedReaction === "heart"}
          onClick={() => handleSelect("heart")}
          className="h-9"
        />
        {visibleReactions.filter((reaction) => reaction.key !== "heart").map((reaction) => <ReactionChip key={reaction.key} emoji={reaction.emoji} tone={reaction.tone} count={counts[reaction.key]} active={selectedReaction === reaction.key} onClick={() => handleSelect(reaction.key)} />)}
      </div>
      <button type="button" aria-label="Открыть реакции" aria-expanded={open} onClick={() => {
        if (!canInteract) {
          onRequireAuth();
          return;
        }
        setOpen((current) => !current);
      }} className={`ux-control-compact absolute right-0 top-1/2 inline-flex ${compact ? "h-9 w-9 text-sm" : "h-10 w-10 text-base"} -translate-y-1/2 items-center justify-center rounded-full transition ${open ? "text-white" : "text-white/48 hover:text-white"}`}>☺️</button>
      {open ? <div role="menu" aria-label="Выбор реакции" className={`ux-floating absolute right-0 z-20 flex max-w-[min(100vw-3rem,420px)] items-center gap-2 overflow-x-auto rounded-[22px] px-4 py-2 ${compact ? "top-[-58px]" : "top-[-64px]"}`}>{REACTION_STYLES.map((reaction) => <button key={reaction.key} type="button" role="menuitemradio" aria-checked={selectedReaction === reaction.key} onClick={() => handleSelect(reaction.key)} className={`${compact ? "text-[20px]" : "text-[24px]"} leading-none transition hover:scale-110 ${selectedReaction === reaction.key ? "scale-110" : "opacity-95"}`}>{reaction.emoji}</button>)}</div> : null}
    </div>
  );
}

function ReactionChip({ emoji, tone, count, active, onClick }: { emoji: string; tone: string; count: number; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`ux-control-compact inline-flex h-9 min-w-[58px] items-center gap-1.5 rounded-full px-3 text-xs transition ${active ? "ux-pill-active text-white" : "text-white/74 hover:bg-white/[0.05]"}`}><span className={`text-[15px] leading-none ${tone}`}>{emoji}</span><span className="text-xs font-semibold leading-none">{count}</span></button>;
}

function ActionPill({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="ux-control-compact inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm text-white/62 transition hover:text-white">{children}</button>;
}

function ShareButton({ onClick, compact = false, block = false }: { onClick: () => void; compact?: boolean; block?: boolean }) {
  return <button type="button" onClick={onClick} className={`${compact ? "h-10 px-3 text-xs" : "h-10 px-4 text-sm"} ${block ? "w-full justify-center" : ""} ux-control-compact inline-flex items-center gap-2 rounded-xl text-white/60 transition hover:text-white`}><Share2 className="h-4 w-4" /> Поделиться</button>;
}

function DetailPostMediaStack({ mediaItems, fallbackTitle }: { mediaItems: FeedPostItem["mediaItems"]; fallbackTitle: string }) {
  const images = mediaItems.filter((item) => item.mediaType === "image");
  const videos = mediaItems.filter((item) => item.mediaType === "video");
  const audioItems = mediaItems.filter((item) => item.mediaType === "audio");
  return (
    <div className="grid gap-4">
      {images.length ? <DetailFeedImageGallery items={images} fallbackTitle={fallbackTitle} /> : null}
      {videos.map((item) => <DetailFeedInlineVideo key={item.id} item={item} />)}
      {audioItems.map((item) => (
        <MediaSurface key={item.id} label={item.role === "demo" ? "Demo audio" : "Аудио"} title={item.mediaName ?? fallbackTitle} badge={item.role === "demo" ? "Demo" : undefined} hideHeader>
          <FeedAudioPlayer src={item.mediaUrl} title={item.mediaName ?? fallbackTitle} compact />
        </MediaSurface>
      ))}
    </div>
  );
}

function DetailFeedInlineVideo({ item }: { item: FeedPostItem["mediaItems"][number] }) {
  const ratio = item.width && item.height ? `${item.width} / ${item.height}` : undefined;
  return (
    <MediaSurface label="Видео" title={item.mediaName ?? "Видео публикации"}>
      <div className="overflow-hidden rounded-[20px] border border-white/8 bg-black/80">
        <div className="relative w-full bg-black" style={ratio ? { aspectRatio: ratio } : { aspectRatio: "16 / 9" }}>
          <video controls playsInline controlsList="nodownload" preload="metadata" poster={item.posterUrl ?? undefined} src={item.mediaUrl} className="absolute inset-0 h-full w-full object-cover" />
        </div>
      </div>
    </MediaSurface>
  );
}

function DetailFeedImageGallery({ items, fallbackTitle }: { items: FeedPostItem["mediaItems"]; fallbackTitle: string }) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const columnClass = items.length === 1 ? "grid-cols-1" : items.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3";
  return (
    <>
      <div className={`grid gap-3 ${columnClass}`}>
        {items.map((item, index) => {
          const ratio = item.width && item.height ? `${item.width} / ${item.height}` : "1 / 1";
          return (
            <button key={item.id} type="button" onClick={() => setActiveIndex(index)} className="group relative overflow-hidden rounded-[22px] border border-white/10 bg-transparent text-left">
              <div className="relative w-full" style={{ aspectRatio: ratio }}>
                <SafeImage src={item.mediaUrl} alt={item.mediaName ?? fallbackTitle} fill className="object-cover transition duration-300 group-hover:scale-[1.02]" fallback={<div className="flex h-full items-center justify-center text-white/24"><Music2 className="h-8 w-8" /></div>} />
              </div>
            </button>
          );
        })}
      </div>
      {activeIndex !== null ? <DetailFeedImageLightbox items={items} activeIndex={activeIndex} fallbackTitle={fallbackTitle} onClose={() => setActiveIndex(null)} onNavigate={setActiveIndex} /> : null}
    </>
  );
}

function DetailFeedImageLightbox({ items, activeIndex, fallbackTitle, onClose, onNavigate }: { items: FeedPostItem["mediaItems"]; activeIndex: number; fallbackTitle: string; onClose: () => void; onNavigate: (index: number) => void }) {
  const item = items[activeIndex];
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onNavigate(activeIndex === 0 ? items.length - 1 : activeIndex - 1);
      if (event.key === "ArrowRight") onNavigate(activeIndex === items.length - 1 ? 0 : activeIndex + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, items.length, onClose, onNavigate]);
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#05060c]/88 p-4 backdrop-blur-md" onClick={onClose}>
      <button type="button" onClick={onClose} className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88">×</button>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(activeIndex === 0 ? items.length - 1 : activeIndex - 1); }} className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88">‹</button> : null}
      <div className="relative mx-auto flex max-h-[90vh] w-full max-w-[min(96vw,1100px)] items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <div className="relative w-full overflow-hidden rounded-[28px] border border-white/12 bg-[#0b0d16]" style={{ aspectRatio: item.width && item.height ? `${item.width} / ${item.height}` : "1 / 1" }}>
          <SafeImage src={item.mediaUrl} alt={item.mediaName ?? fallbackTitle} fill className="object-contain" fallback={<div className="flex h-full items-center justify-center text-white/24"><Music2 className="h-10 w-10" /></div>} />
        </div>
      </div>
      {items.length > 1 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(activeIndex === items.length - 1 ? 0 : activeIndex + 1); }} className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/12 bg-black/50 text-white/88">›</button> : null}
    </div>
  );
}

function AuthNotice({ loginHref, registerHref }: { loginHref: string; registerHref: string }) {
  return (
    <section className="ux-surface rounded-[22px] p-5">
      <h3 className="text-lg font-semibold text-white">Для этого действия нужен аккаунт</h3>
      <p className="mt-2 text-sm leading-6 text-white/52">Читать посты, слушать релизы и смотреть комментарии можно без входа. Для реакций, комментариев и ответов нужно авторизоваться.</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={loginHref} className="ux-button-primary inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-white">Войти</Link>
        <Link href={registerHref} className="ux-control-compact inline-flex h-11 items-center justify-center rounded-full px-6 text-sm font-semibold text-white/82">Создать аккаунт</Link>
      </div>
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="ux-pill inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{children}</span>;
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="ux-pill inline-flex h-10 items-center rounded-xl px-4 text-sm text-white/68">{children}</span>;
}

function FeedImage({ src, alt, ratio }: { src: string | null; alt: string; ratio: "square" | "wide" | "video" | "thumb" }) {
  const ratioClass = ratio === "square" ? "aspect-square" : ratio === "wide" ? "aspect-[16/10]" : ratio === "thumb" ? "aspect-square h-[56px] w-[56px]" : "aspect-[4/3]";
  return <div className={`relative overflow-hidden bg-transparent ${ratioClass}`}><SafeImage src={src} alt={alt} fill className="object-cover" fallback={<div className="flex h-full w-full items-center justify-center bg-white/[0.035] text-white/24"><Music2 className="h-9 w-9" /></div>} /></div>;
}

function SafeImage({ src, alt, fill = false, className, fallback }: { src: string | null; alt: string; fill?: boolean; className?: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = React.useState(!src);
  React.useEffect(() => setFailed(!src), [src]);
  if (!src || failed) return <>{fallback}</>;
  return <Image src={src} alt={alt} fill={fill} unoptimized className={className} onError={() => setFailed(true)} />;
}

function formatActivityTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatReleaseDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) {
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
  }
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function isSocialItem(item: PublicFeedItem): item is FeedPostItem | FeedReleaseItem {
  return item.kind === "post" || item.kind === "release";
}

function isCommentable(item: PublicFeedItem): item is FeedPostItem | FeedReleaseItem {
  return item.kind === "post" || item.kind === "release";
}

function getViewerReaction(item: PublicFeedItem) {
  return isSocialItem(item) ? item.viewerReaction ?? (item.likedByViewer ? "heart" : null) : null;
}

function commentEndpoint(item: FeedPostItem | FeedReleaseItem) {
  return item.kind === "post" ? `/api/artists/posts/${item.sourceId}/comments` : `/api/scene/releases/${item.releaseId}/comments`;
}

function insertReply(comments: PublicFeedComment[], parentId: string, reply: PublicFeedComment): PublicFeedComment[] {
  return comments.map((comment) => {
    if (comment.id === parentId) {
      return {
        ...comment,
        replies: [reply, ...comment.replies],
        repliesCount: comment.repliesCount + 1
      };
    }
    if (!comment.replies.length) return comment;
    return {
      ...comment,
      replies: insertReply(comment.replies, parentId, reply)
    };
  });
}
