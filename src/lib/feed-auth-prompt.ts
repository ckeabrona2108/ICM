import type { FeedCollaborationFilter, FeedPersonProfileType, FeedScope, FeedType } from "@/lib/feed-contract";
import type { CollaborationIntent, CollaborationPreference, CollaborationRole, CollaborationStatus, CollaborationWorkflow } from "@/lib/collaboration";
import type { FeedSort } from "@/lib/feed-query-state";

export type FeedAuthReason = "following_tab" | "follow" | "reaction" | "comment" | "reply" | "publish" | "contact" | "profile";

export type FeedIntendedAction =
  | "open_following"
  | "follow_author"
  | "react"
  | "comment"
  | "reply"
  | "publish"
  | "contact"
  | "view_profile";

export type FeedAuthContext = {
  reason: FeedAuthReason;
  intendedAction: FeedIntendedAction;
  callbackUrl: string;
  path: string;
  scrollY: number;
  scope: FeedScope;
  type: FeedType;
  collaborationFilter: FeedCollaborationFilter;
  collaborationIntent: CollaborationIntent | null;
  collaborationRole: CollaborationRole | null;
  collaborationWorkflow: CollaborationWorkflow | null;
  collaborationPreference: CollaborationPreference | null;
  collaborationCity: string | null;
  collaborationStatus: CollaborationStatus | null;
  sort: FeedSort;
  profileType: FeedPersonProfileType | null;
  search: string;
  targetId?: string | null;
  targetSlug?: string | null;
  anchorId?: string | null;
  focusTargetId?: string | null;
  drafts?: Record<string, string>;
  at: number;
};

export const FEED_AUTH_RETURN_KEY = "icm:feed-auth-return";

const AUTH_PROMPT_TITLES: Record<FeedAuthReason, string> = {
  following_tab: "Войдите, чтобы открыть ленту подписок",
  follow: "Войдите, чтобы подписаться",
  reaction: "Войдите, чтобы оставить реакцию",
  comment: "Войдите, чтобы написать комментарий",
  reply: "Войдите, чтобы ответить",
  publish: "Войдите, чтобы создать публикацию",
  contact: "Войдите, чтобы связаться",
  profile: "Войдите, чтобы открыть профиль"
};

export function getFeedAuthPromptCopy(reason: FeedAuthReason) {
  return {
    title: AUTH_PROMPT_TITLES[reason],
    description: "Публичная лента открыта для чтения",
    body: "Смотреть посты, релизы, новости и комментарии можно без входа. Для лайков, реакций, комментариев и публикаций нужен аккаунт.",
    loginLabel: "Войти",
    registerLabel: "Создать аккаунт"
  };
}

export function sanitizeInternalCallbackUrl(value: string | null | undefined, fallback = "/feed") {
  const next = (value ?? "").trim();
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/\\")) return fallback;
  try {
    const url = new URL(next, "https://icecreammusic.local");
    if (url.origin !== "https://icecreammusic.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}` || fallback;
  } catch {
    return fallback;
  }
}

export function buildFeedAuthCallbackUrl(path: string, anchorId?: string | null) {
  const safePath = sanitizeInternalCallbackUrl(path, "/feed");
  if (!anchorId || safePath.includes("#")) return safePath;
  return `${safePath}#${encodeURIComponent(anchorId)}`;
}

export function buildAuthRouteHref(basePath: "/login" | "/register", callbackUrl: string) {
  return `${basePath}?callbackUrl=${encodeURIComponent(sanitizeInternalCallbackUrl(callbackUrl, "/feed"))}`;
}

export function serializeFeedAuthContext(context: FeedAuthContext) {
  return JSON.stringify(context);
}

export function parseFeedAuthContext(raw: string | null | undefined): FeedAuthContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FeedAuthContext;
    return {
      ...parsed,
      callbackUrl: sanitizeInternalCallbackUrl(parsed.callbackUrl, "/feed"),
      path: sanitizeInternalCallbackUrl(parsed.path, "/feed"),
      collaborationWorkflow: parsed.collaborationWorkflow ?? null,
      collaborationCity: parsed.collaborationCity ?? null,
      targetId: parsed.targetId ?? null,
      targetSlug: parsed.targetSlug ?? null,
      anchorId: parsed.anchorId ?? null,
      focusTargetId: parsed.focusTargetId ?? null,
      drafts: parsed.drafts ?? {}
    };
  } catch {
    return null;
  }
}
