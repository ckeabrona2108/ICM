export type SocialPostMediaType = "image" | "audio" | "video";
export type SocialPostMediaRole = "standard" | "demo";

export function isOwnedArtistSocialMediaKey(userId: string, mediaKey: string): boolean {
  const normalizedUserId = userId.trim();
  const normalizedKey = mediaKey.trim();
  if (!normalizedUserId || !normalizedKey || normalizedKey.includes("..") || normalizedKey.includes("\\")) return false;
  return normalizedKey.startsWith(`artist-social/${normalizedUserId}/`)
    && normalizedKey.length > `artist-social/${normalizedUserId}/`.length;
}

export type SocialPostMediaItem = {
  id: string;
  mediaType: SocialPostMediaType;
  mediaUrl: string;
  mediaName: string | null;
  role: SocialPostMediaRole;
  width: number | null;
  height: number | null;
  posterUrl: string | null;
};

type SocialPostMediaInput = {
  mediaItems?: Array<Partial<SocialPostMediaItem> & Pick<SocialPostMediaItem, "mediaType" | "mediaUrl">> | null;
  mediaType: SocialPostMediaType | null;
  mediaUrl: string | null;
  mediaName: string | null;
};

export function normalizeSocialPostMediaItems(input: SocialPostMediaInput): SocialPostMediaItem[] {
  const structured = (input.mediaItems ?? []).flatMap((item, index) => {
    const mediaUrl = item.mediaUrl.trim();
    if (!mediaUrl) return [];
    return [{
      id: item.id?.trim() || `${item.mediaType}:${mediaUrl}:${index}`,
      mediaType: item.mediaType,
      mediaUrl,
      mediaName: item.mediaName ?? null,
      role: item.role ?? "standard",
      width: item.width ?? null,
      height: item.height ?? null,
      posterUrl: item.posterUrl ?? null
    }];
  });
  if (structured.length) return structured;

  const mediaUrl = input.mediaUrl?.trim();
  if (!input.mediaType || !mediaUrl) return [];
  return [{
    id: mediaUrl,
    mediaType: input.mediaType,
    mediaUrl,
    mediaName: input.mediaName,
    role: "standard",
    width: null,
    height: null,
    posterUrl: null
  }];
}
