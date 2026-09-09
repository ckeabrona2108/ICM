import { buildStoredFileRouteUrl } from "@/lib/file-resolver";
import {
  buildArtistProfileSlug,
  extractArtistPublicNames,
  normalizeArtistProfileKey
} from "@/lib/artist-profile-shared";
import { prisma } from "@/lib/prisma";
import { isReleaseVisibleOnScene, normalizeSceneGenre } from "@/lib/scene-policy";
import {
  getSceneShowcaseState,
  type SceneShowcaseState
} from "@/lib/scene-showcase-state";
import { objectExists } from "@/lib/s3";

export interface SceneRelease {
  id: string;
  title: string;
  artist: string;
  artistSlug: string | null;
  genre: string;
  releaseDate: string;
  coverUrl: string | null;
  audioUrl: string | null;
  previewStart: string;
  isShowcaseReady: boolean;
  yandexMusicUrl: string | null;
  vkMusicUrl: string | null;
}

interface SceneQueryOptions {
  limit?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function isLikelyLegalPersonName(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  const withoutAliases = normalized.replace(/\([^()]*\)/gu, "").split("/")[0]?.trim() ?? normalized;
  const words = withoutAliases.split(/\s+/gu).filter(Boolean);
  if (words.length < 3) return false;

  return words.some((word) =>
    /(?:ович|евич|ич|овна|евна|ична|инична)$/iu.test(word)
  );
}

export function resolveSceneArtistNames(params: {
  performer: string | null;
  roles: unknown;
  trackRoles?: unknown[];
  fallbackArtistName?: string | null;
}): string[] {
  const root = asRecord(params.roles);
  const submission = asRecord(root?.submissionData);
  const persons = Array.isArray(submission?.persons) ? submission.persons : [];
  const tracks = Array.isArray(submission?.tracks) ? submission.tracks : [];
  const isPerformerRole = (value: unknown) => {
    const role = asString(value)?.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ");
    return role === "исполнитель"
      || role === "соисполнитель"
      || role === "performer"
      || role === "main artist"
      || role === "primary artist"
      || role === "feat"
      || role === "feat."
      || role === "featuring"
      || role === "remixer";
  };
  const trackPerformerNames = tracks.flatMap((track) => {
    const trackRecord = asRecord(track);
    const trackPersons = Array.isArray(trackRecord?.trackPersons) ? trackRecord.trackPersons : [];
    return trackPersons
      .map((person) => asRecord(person))
      .filter((person) => isPerformerRole(person?.role))
      .map((person) => asString(person?.name))
      .filter((name): name is string => Boolean(name));
  });
  const storedTrackPerformerNames = (params.trackRoles ?? []).flatMap((value) => {
    const records = Array.isArray(value)
      ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
      : (() => {
          const record = asRecord(value);
          if (!record) return [];
          const nested = ["trackPersons", "track_persons", "persons", "contributors"]
            .flatMap((key) => Array.isArray(record[key]) ? record[key] as unknown[] : []);
          return nested.length > 0
            ? nested.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
            : [record];
        })();

    return records
      .filter((person) => isPerformerRole(person.role))
      .map((person) => asString(person.name) ?? asString(person.person))
      .filter((name): name is string => Boolean(name));
  });
  const performerNames = persons
    .map((person) => asRecord(person))
    .filter((person) => isPerformerRole(person?.role))
    .map((person) => asString(person?.name))
    .filter((name): name is string => Boolean(name));
  const isPlaceholder = (name: string) =>
    /^(?:артист|исполнитель)?\s*icecreammusic$/iu.test(name);

  const trackNames = [...trackPerformerNames, ...storedTrackPerformerNames];
  const publicTrackNames = trackNames.flatMap((name) => {
    const extracted = extractArtistPublicNames(name);
    const hasExplicitAlias = extracted.some(
      (artistName) => normalizeArtistProfileKey(artistName) !== normalizeArtistProfileKey(name)
    );
    return hasExplicitAlias || !isLikelyLegalPersonName(name) ? extracted : [];
  });
  const sourceGroups = [
    publicTrackNames,
    [asString(submission?.artist), asString(submission?.performer)].filter(
      (name): name is string => Boolean(name)
    ),
    performerNames,
    asString(params.performer) ? [asString(params.performer)!] : [],
    trackNames,
  ];

  for (const sourceNames of sourceGroups) {
    const resolvedNames = Array.from(new Set(sourceNames.flatMap(extractArtistPublicNames)))
      .filter((name) => !isPlaceholder(name));
    if (resolvedNames.length > 0) return resolvedNames;
  }

  const fallbackNames = asString(params.fallbackArtistName)
    ? extractArtistPublicNames(params.fallbackArtistName!)
    : [];
  return fallbackNames.length > 0 ? fallbackNames : ["Исполнитель ICECREAMMUSIC"];
}

export function resolveSceneArtistName(params: {
  performer: string | null;
  roles: unknown;
}): string {
  return resolveSceneArtistNames(params).join(", ");
}

function resolveSceneArtistSlug(params: {
  userId: string;
  artistNames: string[];
  roles: unknown;
}): string | null {
  const root = asRecord(params.roles);
  const artist = params.artistNames[0];
  if (!artist) return null;
  const artistKey = normalizeArtistProfileKey(artist);
  const profiles = asRecord(root?.artistPublicProfiles);
  const keyedProfile = asRecord(profiles?.[artistKey]);
  const legacyProfile = asRecord(root?.artistPublicProfile);
  const legacyName = asString(legacyProfile?.displayName);
  const profile = keyedProfile ?? (
    legacyName && normalizeArtistProfileKey(legacyName) === artistKey
      ? legacyProfile
      : null
  );
  if (profile?.enabled === false) return null;
  return buildArtistProfileSlug(artist, params.userId);
}

function normalizePlatformUrl(value: unknown, allowedHosts: RegExp): string | null {
  const raw = asString(value);
  if (!raw) return null;

  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !allowedHosts.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveScenePlatformLinks(roles: unknown): {
  yandexMusicUrl: string | null;
  vkMusicUrl: string | null;
} {
  const root = asRecord(roles);
  const smartLink = asRecord(root?.smartLink);
  const platformLinks = asRecord(smartLink?.platformLinks);
  const yandexMusic = asRecord(platformLinks?.yandex_music);
  const vkMusic = asRecord(platformLinks?.vk_music);

  return {
    yandexMusicUrl: normalizePlatformUrl(yandexMusic?.url, /^(?:www\.)?music\.yandex\.ru$/iu),
    vkMusicUrl: normalizePlatformUrl(vkMusic?.url, /^(?:www\.)?(?:vk\.com|vk\.ru)$/iu)
  };
}

export function resolveSceneCoverUrl(params: {
  id: string;
  preview: string;
  roles: unknown;
}): string | null {
  const root = asRecord(params.roles);
  const submission = asRecord(root?.submissionData);
  const candidates = [
    submission?.coverUpload,
    submission?.cover,
    root?.coverImage,
    root?.cover,
    params.preview
  ];

  for (const candidate of candidates) {
    const url = buildStoredFileRouteUrl(candidate);
    if (url) return url;
  }

  const extension = params.preview.trim().replace(/^\./u, "").toLowerCase();
  if (/^(?:avif|jpe?g|png|webp)$/u.test(extension)) {
    return buildStoredFileRouteUrl(`previews/${params.id}.${extension}`);
  }

  return null;
}

export async function resolveScenePreviewAudioUrl(
  state: SceneShowcaseState,
  probeObject: (storageKey: string) => Promise<boolean | null> = objectExists
): Promise<string | null> {
  if (!state.enabled || !state.previewAsset) return null;
  const audioUrl = buildStoredFileRouteUrl(state.previewAsset.storageKey);
  if (!audioUrl) return null;

  // The shared media resolver caches negative probes. A freshly uploaded S3
  // object can therefore stay hidden after a short consistency delay.
  const exists = await probeObject(state.previewAsset.storageKey);
  return exists === false ? null : audioUrl;
}

export async function getSceneReleases(options: SceneQueryOptions = {}): Promise<SceneRelease[]> {
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 48);

  try {
    const releases = await prisma.release.findMany({
      orderBy: [{ date: "desc" }, { startDate: "desc" }],
      take: Math.min(limit * 5, 120),
      select: {
        id: true,
        userId: true,
        title: true,
        date: true,
        upc: true,
        performer: true,
        genre: true,
        preview: true,
        status: true,
        confirmed: true,
        roles: true,
        user: {
          select: { name: true }
        },
        track: {
          orderBy: {
            index: "asc"
          },
          take: 1,
          select: {
            id: true,
            index: true,
            title: true,
            track: true,
            roles: true,
            preview_start: true
          }
        }
      }
    });

    const visibleReleases = releases
      .filter((release) => {
        return isReleaseVisibleOnScene({
          status: release.status,
          confirmed: release.confirmed,
          upc: release.upc,
          roles: release.roles,
          releaseDate: release.date
        });
      })
      .slice(0, Math.min(limit * 4, 48));
    const resolvedReleases = await Promise.all(
      visibleReleases.map(async (release) => {
        const platformLinks = resolveScenePlatformLinks(release.roles);
        const audioUrl = await resolveScenePreviewAudioUrl(
          getSceneShowcaseState(release.roles)
        );
        const artistNames = resolveSceneArtistNames({
          performer: release.performer,
          roles: release.roles,
          trackRoles: release.track.map((track) => track.roles),
          fallbackArtistName: release.user.name
        });
        const artist = artistNames.join(", ");
        return {
          id: release.id,
          title: release.title,
          artist,
          artistSlug: resolveSceneArtistSlug({
            userId: release.userId,
            artistNames,
            roles: release.roles
          }),
          genre: normalizeSceneGenre(release.genre),
          releaseDate: release.date.toISOString(),
          coverUrl: resolveSceneCoverUrl({
            id: release.id,
            preview: release.preview,
            roles: release.roles
          }),
          audioUrl,
          previewStart: "00:00",
          isShowcaseReady: Boolean(audioUrl && resolveSceneCoverUrl({
            id: release.id,
            preview: release.preview,
            roles: release.roles
          })),
          ...platformLinks
        } satisfies SceneRelease;
      })
    );

    return resolvedReleases
      .slice(0, limit);
  } catch (error) {
    console.error("[scene] Failed to load public releases", error);
    return [];
  }
}
