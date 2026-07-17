import { z } from "zod";
import type { PrismaClient, verification_status } from "@prisma/client";

import { getReleaseCoverAsset } from "@/lib/release-cover";
import { releaseSubmissionDataSchema } from "@/lib/release-policy";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

export const promoSubmissionStatuses = [
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "SENT_TO_PARTNERS",
  "CANCELLED"
] as const;

export type PromoSubmissionStatus = (typeof promoSubmissionStatuses)[number];
export type PromoSubmissionUserSection = "available" | "sent" | "changes_required" | "history";

const HTTPS_URL_ERROR = "Ссылка должна начинаться с https://";

function isHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const optionalHttpsUrlSchema = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? "")
  .refine((value) => !value || isHttpsUrl(value), HTTPS_URL_ERROR)
  .transform((value) => value || null);

export const promoSubmissionCreateSchema = z
  .object({
    releaseId: z.string().trim().min(1, "Не выбран релиз."),
    email: z.string().trim().email("Укажите корректный email."),
    partnerName: z.string().trim().min(1, "Укажите название партнёра."),
    artistName: z.string().trim().min(1, "Укажите артиста."),
    artistCountry: z.string().trim().min(1, "Укажите страну происхождения артиста."),
    releaseTitle: z.string().trim().min(1, "Укажите название релиза."),
    releaseDate: z.string().trim().min(1, "Укажите дату релиза."),
    genre: z.string().trim().min(1, "Укажите жанр."),
    releaseFormat: z.enum(["Single", "EP", "Album", "Music Video"], {
      errorMap: () => ({ message: "Укажите формат релиза." })
    }),
    releaseLanguage: z.string().trim().min(1, "Укажите язык релиза."),
    upc: z.string().trim().min(1, "Укажите UPC."),
    keyTrackTitle: z.string().trim().min(1, "Укажите название ключевого трека."),
    hasMusicVideo: z.enum(["YES", "NO"]),
    videoPreviewUrl: optionalHttpsUrlSchema,
    label: z.string().trim().min(1, "Укажите лейбл."),
    releaseDescription: z.string().trim().min(1, "Добавьте описание релиза и артиста."),
    artistPhotoUrl: z.string().trim().min(1, "Укажите ссылку на фотографию артиста."),
    listeningLink: z.string().trim().min(1, "Укажите ссылку на прослушивание релиза."),
    promotionPlan: z.string().trim().min(1, "Опишите продвижение релиза."),
    artistSocialLinks: z.string().trim().min(1, "Добавьте ссылки на соцсети артиста."),
    confirmationAccepted: z.boolean().refine((value) => value, {
      message: "Подтвердите корректность материалов."
    })
  })
  .superRefine((value, ctx) => {
    if (value.hasMusicVideo === "YES" && !value.videoPreviewUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["videoPreviewUrl"],
        message: "Добавьте ссылку на предпросмотр клипа или выберите «Нет»."
      });
    }
  });

export type PromoSubmissionCreateInput = z.infer<typeof promoSubmissionCreateSchema>;

export interface PromoFormPrefill {
  email: string;
  partnerName: string;
  artistName: string;
  artistCountry: string;
  releaseTitle: string;
  releaseDate: string;
  genre: string;
  releaseFormat: "Single" | "EP" | "Album" | "Music Video";
  releaseLanguage: string;
  upc: string;
  keyTrackTitle: string;
  hasMusicVideo: "YES" | "NO";
  videoPreviewUrl: string;
  label: string;
  releaseDescription: string;
  artistPhotoUrl: string;
  listeningLink: string;
  promotionPlan: string;
  artistSocialLinks: string;
  confirmationAccepted: boolean;
}

export interface PromoReleaseListItem {
  id: string;
  title: string;
  artist: string;
  releaseDate: string;
  upc: string;
  genre: string;
  coverUrl: string;
  isPromoAvailable: boolean;
  unavailableReason: string | null;
  alreadySubmitted: boolean;
  promoSubmissionId: string | null;
  promoSubmissionStatus: PromoSubmissionStatus | null;
  promoAdminComment: string | null;
  promoEditable: boolean;
  promoDeleteable: boolean;
  promoSection: PromoSubmissionUserSection;
  prefill: PromoFormPrefill;
}

export interface PromoSubmissionListItem {
  id: string;
  releaseId: string;
  status: PromoSubmissionStatus;
  createdAt: string;
  releaseTitle: string;
  artistName: string;
  releaseDate: string;
  upc: string;
  email: string;
  adminComment: string | null;
}

export interface PromoSubmissionDetail {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  releaseId: string;
  releaseTitle: string;
  releaseDate: string;
  status: PromoSubmissionStatus;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByName: string | null;
  adminComment: string | null;
  email: string;
  partnerName: string;
  artistName: string;
  artistCountry: string;
  genre: string;
  releaseFormat: string;
  releaseLanguage: string;
  upc: string;
  keyTrackTitle: string;
  hasMusicVideo: boolean;
  videoPreviewUrl: string | null;
  label: string;
  releaseDescription: string;
  artistPhotoUrl: string;
  listeningLink: string;
  promotionPlan: string;
  artistSocialLinks: string;
  confirmationAccepted: boolean;
}

export interface AdminPromoSubmissionListItem {
  id: string;
  createdAt: string;
  userName: string;
  userEmail: string;
  artistName: string;
  releaseTitle: string;
  releaseDate: string;
  upc: string;
  status: PromoSubmissionStatus;
  email: string;
}

export class PromoValidationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "PromoValidationError";
    this.statusCode = statusCode;
  }
}

interface PromoRepo {
  findMany(args: unknown): Promise<unknown[]>;
  findFirst(args: unknown): Promise<unknown | null>;
  findUnique?(args: unknown): Promise<unknown | null>;
  create(args: unknown): Promise<unknown>;
  update(args: unknown): Promise<unknown>;
}

function getPromoRepo(prisma: PrismaClient): PromoRepo | null {
  return (prisma as unknown as { promo_submissions?: PromoRepo }).promo_submissions ?? null;
}

function ensurePromoRepo(prisma: PrismaClient): PromoRepo {
  const repo = getPromoRepo(prisma);
  if (!repo) {
    throw new PromoValidationError(
      "Хранилище промо-заявок временно недоступно. Перезапустите сервер после prisma generate.",
      503
    );
  }
  return repo;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sanitizeOptionalText(value: string | null | undefined): string {
  const normalized = value?.trim();
  if (!normalized) return "";
  const lowered = normalized.toLowerCase();
  return lowered === "null" || lowered === "undefined" ? "" : normalized;
}


function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date {
  const normalized = value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new PromoValidationError("Укажите корректную дату релиза.");
  }
  return parsed;
}

function getUtcDayNumber(value: Date): number {
  return Math.floor(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / 86_400_000);
}

function startOfTodayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function computePromoAvailability(params: {
  releaseDate: Date | null | undefined;
  alreadySubmitted: boolean;
  upc?: string | null;
  confirmed?: boolean;
  status?: verification_status | string | null;
  roles?: unknown;
  now?: Date;
}): { isPromoAvailable: boolean; unavailableReason: string | null } {
  if (params.alreadySubmitted) {
    return {
      isPromoAvailable: false,
      unavailableReason: "Недоступно: релиз уже отправлен на промо"
    };
  }

  if (!params.upc?.trim()) {
    return {
      isPromoAvailable: false,
      unavailableReason: "Недоступно: у релиза ещё нет UPC"
    };
  }

  if (!params.releaseDate || Number.isNaN(params.releaseDate.getTime())) {
    return {
      isPromoAvailable: true,
      unavailableReason: null
    };
  }

  const todayDay = getUtcDayNumber(startOfTodayUtc(params.now));
  const releaseDay = getUtcDayNumber(params.releaseDate);
  const daysSinceRelease = todayDay - releaseDay;

  if (daysSinceRelease > 7) {
    return {
      isPromoAvailable: false,
      unavailableReason: "Недоступно: после выхода прошло больше 7 дней"
    };
  }

  return {
    isPromoAvailable: true,
    unavailableReason: null
  };
}

function parseSubmissionData(roles: unknown) {
  const root = asRecord(roles);
  const submissionData = root?.submissionData;
  const parsed = releaseSubmissionDataSchema.safeParse(submissionData);
  return parsed.success ? parsed.data : null;
}

function mapReleaseFormat(value: unknown): PromoFormPrefill["releaseFormat"] {
  if (value === "single") return "Single";
  if (value === "ep") return "EP";
  if (value === "album") return "Album";
  return "Single";
}

function resolveArtistName(params: {
  performer: string | null;
  submissionData: ReturnType<typeof parseSubmissionData>;
}): string {
  if (params.performer?.trim()) return params.performer.trim();
  const names = (params.submissionData?.persons ?? [])
    .map((person) => person.name.trim())
    .filter(Boolean);
  return names.join(", ") || "Не указан";
}

function resolveLanguage(params: {
  trackLanguage: string | null | undefined;
  submissionData: ReturnType<typeof parseSubmissionData>;
}): string {
  return params.submissionData?.language?.trim() || params.trackLanguage?.trim() || "Не указан";
}

function resolveUpc(params: { releaseUpc: string | null; submissionData: ReturnType<typeof parseSubmissionData> }): string {
  return params.releaseUpc?.trim() || params.submissionData?.upc?.trim() || "";
}

function resolveKeyTrackTitle(params: {
  trackRows: Array<{ title: string; focus: boolean | null; index: number }>;
  submissionData: ReturnType<typeof parseSubmissionData>;
}): string {
  const focusedSubmissionTrack = params.submissionData?.tracks.find((track) => Boolean(track.focusTrack) && track.title.trim());
  if (focusedSubmissionTrack?.title?.trim()) return focusedSubmissionTrack.title.trim();

  const focusedDbTrack = params.trackRows
    .slice()
    .sort((left, right) => left.index - right.index)
    .find((track) => Boolean(track.focus) && track.title.trim());
  if (focusedDbTrack?.title?.trim()) return focusedDbTrack.title.trim();

  const firstSubmissionTrack = params.submissionData?.tracks.find((track) => track.title.trim());
  if (firstSubmissionTrack?.title?.trim()) return firstSubmissionTrack.title.trim();

  const firstDbTrack = params.trackRows.slice().sort((left, right) => left.index - right.index)[0];
  return firstDbTrack?.title?.trim() || "";
}

function buildSocialLinks(user: {
  personalSiteUrl: string | null;
  telegram: string | null;
  vk: string | null;
  whatsup: string | null;
  viber: string | null;
}): string {
  const lines = [
    sanitizeOptionalText(user.personalSiteUrl),
    sanitizeOptionalText(user.telegram),
    sanitizeOptionalText(user.vk),
    sanitizeOptionalText(user.whatsup),
    sanitizeOptionalText(user.viber)
  ].filter(Boolean);
  return lines.join("\n");
}

function mapPromoStatusLabel(status: PromoSubmissionStatus): string {
  switch (status) {
    case "SUBMITTED":
      return "Отправлено";
    case "IN_REVIEW":
      return "На рассмотрении";
    case "APPROVED":
      return "Одобрено";
    case "REJECTED":
      return "Отклонено";
    case "SENT_TO_PARTNERS":
      return "Передано партнёрам";
    case "CANCELLED":
      return "Отменено";
    default:
      return status;
  }
}

export { mapPromoStatusLabel as formatPromoSubmissionStatusLabel };

export function getPromoSubmissionUserSection(
  status: PromoSubmissionStatus | null | undefined
): PromoSubmissionUserSection {
  switch (status) {
    case "SUBMITTED":
    case "IN_REVIEW":
      return "sent";
    case "REJECTED":
      return "changes_required";
    case "APPROVED":
    case "SENT_TO_PARTNERS":
    case "CANCELLED":
      return "history";
    default:
      return "available";
  }
}

export function canEditPromoSubmissionStatus(status: PromoSubmissionStatus | null | undefined): boolean {
  return status === "REJECTED";
}

export function canDeletePromoSubmissionStatus(status: PromoSubmissionStatus | null | undefined): boolean {
  return status === "SUBMITTED" || status === "REJECTED";
}

interface ExistingPromoSubmissionRow {
  id: string;
  release_id: string;
  status: PromoSubmissionStatus;
  email: string;
  partner_name: string;
  artist_name: string;
  artist_country: string;
  release_title: string;
  release_date: Date;
  genre: string;
  release_format: string;
  release_language: string;
  upc: string;
  key_track_title: string;
  has_music_video: boolean;
  video_preview_url: string | null;
  label: string;
  release_description: string;
  artist_photo_url: string;
  listening_link: string;
  promotion_plan: string;
  artist_social_links: string;
  confirmation_accepted: boolean;
  admin_comment: string | null;
}

async function findExistingSubmissionByReleaseIds(prisma: PrismaClient, userId: string, releaseIds: string[]) {
  const repo = getPromoRepo(prisma);
  if (!repo || releaseIds.length === 0) return new Map<string, { id: string; status: PromoSubmissionStatus }>();

  try {
    const rows = await repo.findMany({
      where: {
        user_id: userId,
        release_id: { in: releaseIds }
      },
      select: {
        id: true,
        release_id: true,
        status: true,
        email: true,
        partner_name: true,
        artist_name: true,
        artist_country: true,
        release_title: true,
        release_date: true,
        genre: true,
        release_format: true,
        release_language: true,
        upc: true,
        key_track_title: true,
        has_music_video: true,
        video_preview_url: true,
        label: true,
        release_description: true,
        artist_photo_url: true,
        listening_link: true,
        promotion_plan: true,
        artist_social_links: true,
        confirmation_accepted: true,
        admin_comment: true
      }
    }) as ExistingPromoSubmissionRow[];

    return new Map(rows.map((row) => [row.release_id, row]));
  } catch (error) {
    if (isPrismaTableMissingError(error, "promo_submissions")) {
      return new Map();
    }
    throw error;
  }
}

function buildPromoFormPrefillFromSubmission(row: ExistingPromoSubmissionRow): PromoFormPrefill {
  return {
    email: row.email,
    partnerName: row.partner_name,
    artistName: row.artist_name,
    artistCountry: row.artist_country,
    releaseTitle: row.release_title,
    releaseDate: formatDateOnly(row.release_date),
    genre: row.genre,
    releaseFormat: (row.release_format === "EP" || row.release_format === "Album" || row.release_format === "Music Video"
      ? row.release_format
      : "Single"),
    releaseLanguage: row.release_language,
    upc: row.upc,
    keyTrackTitle: row.key_track_title,
    hasMusicVideo: row.has_music_video ? "YES" : "NO",
    videoPreviewUrl: row.video_preview_url ?? "",
    label: row.label,
    releaseDescription: row.release_description,
    artistPhotoUrl: row.artist_photo_url,
    listeningLink: row.listening_link,
    promotionPlan: row.promotion_plan,
    artistSocialLinks: row.artist_social_links,
    confirmationAccepted: Boolean(row.confirmation_accepted)
  };
}

export async function getPromoReleasesForUser(prisma: PrismaClient, userId: string): Promise<PromoReleaseListItem[]> {
  const [userProfile, releases] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        name: true,
        country: true,
        label: true,
        personalSiteUrl: true,
        telegram: true,
        vk: true,
        whatsup: true,
        viber: true
      }
    }),
    prisma.release.findMany({
      where: {
        userId,
        status: "approved"
      },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        date: true,
        upc: true,
        genre: true,
        labelName: true,
        preview: true,
        performer: true,
        type: true,
        status: true,
        confirmed: true,
        roles: true,
        userId: true,
        track: {
          select: {
            title: true,
            focus: true,
            index: true,
            language: true
          }
        }
      }
    })
  ]);

  const existingByReleaseId = await findExistingSubmissionByReleaseIds(prisma, userId, releases.map((release) => release.id));

  const items = await Promise.all(
    releases.map(async (release) => {
      const submissionData = parseSubmissionData(release.roles);
      const existing = existingByReleaseId.get(release.id) ?? null;
      const cover = await getReleaseCoverAsset({
        id: release.id,
        preview: release.preview,
        roles: release.roles,
        userId: release.userId,
        title: release.title
      });
      const artist = resolveArtistName({ performer: release.performer, submissionData });
      const trackLanguage = release.track.slice().sort((left, right) => left.index - right.index)[0]?.language ?? null;
      const upc = resolveUpc({ releaseUpc: release.upc, submissionData });
      const keyTrackTitle = resolveKeyTrackTitle({
        trackRows: release.track,
        submissionData
      });
      const promoStatus = existing?.status ?? null;
      const promoSection = getPromoSubmissionUserSection(promoStatus);
      const promoEditable = canEditPromoSubmissionStatus(promoStatus);
      const promoDeleteable = canDeletePromoSubmissionStatus(promoStatus);
      const defaultAvailability = computePromoAvailability({
        releaseDate: release.date,
        alreadySubmitted: false,
        upc,
        confirmed: release.confirmed,
        status: release.status,
        roles: release.roles
      });
      const availability = existing
        ? promoEditable
          ? {
              isPromoAvailable: true,
              unavailableReason: existing.admin_comment?.trim() || "Требуются изменения: обновите материалы и отправьте заявку повторно"
            }
          : {
              isPromoAvailable: false,
              unavailableReason:
                promoSection === "history"
                  ? "Заявка завершена и сохранена в истории"
                  : "Заявка уже отправлена и находится в работе"
            }
        : defaultAvailability;

      return {
        id: release.id,
        title: release.title,
        artist,
        releaseDate: formatDateOnly(release.date),
        upc,
        genre: release.genre,
        coverUrl: cover.url ?? "",
        isPromoAvailable: availability.isPromoAvailable,
        unavailableReason: availability.unavailableReason,
        alreadySubmitted: Boolean(existing),
        promoSubmissionId: existing?.id ?? null,
        promoSubmissionStatus: promoStatus,
        promoAdminComment: existing?.admin_comment ?? null,
        promoEditable,
        promoDeleteable,
        promoSection,
        prefill: existing
          ? buildPromoFormPrefillFromSubmission(existing)
          : {
              email: sanitizeOptionalText(userProfile?.email ?? null),
              partnerName: sanitizeOptionalText(userProfile?.name ?? null) || sanitizeOptionalText(userProfile?.label ?? null) || sanitizeOptionalText(release.labelName) || "",
              artistName: sanitizeOptionalText(artist),
              artistCountry: sanitizeOptionalText(userProfile?.country ?? null),
              releaseTitle: sanitizeOptionalText(release.title),
              releaseDate: formatDateOnly(release.date),
              genre: sanitizeOptionalText(release.genre),
              releaseFormat: mapReleaseFormat(submissionData?.type ?? release.type),
              releaseLanguage: resolveLanguage({ trackLanguage, submissionData }),
              upc,
              keyTrackTitle: sanitizeOptionalText(keyTrackTitle),
              hasMusicVideo: "NO",
              videoPreviewUrl: "",
              label: sanitizeOptionalText(submissionData?.label ?? null) || sanitizeOptionalText(release.labelName) || "ICECREAMMUSIC",
              releaseDescription: "",
              artistPhotoUrl: "",
              listeningLink: "",
              promotionPlan: "",
              artistSocialLinks: buildSocialLinks({
                personalSiteUrl: userProfile?.personalSiteUrl ?? null,
                telegram: userProfile?.telegram ?? null,
                vk: userProfile?.vk ?? null,
                whatsup: userProfile?.whatsup ?? null,
                viber: userProfile?.viber ?? null
              }),
              confirmationAccepted: false
            }
      } satisfies PromoReleaseListItem;
    })
  );

  return items
    .filter((item) => item.isPromoAvailable || item.promoSubmissionId !== null)
    .sort((left, right) => {
      if (left.isPromoAvailable !== right.isPromoAvailable) return left.isPromoAvailable ? -1 : 1;
      return right.releaseDate.localeCompare(left.releaseDate);
    });
}

export async function listPromoSubmissionsForUser(prisma: PrismaClient, userId: string): Promise<PromoSubmissionListItem[]> {
  const repo = getPromoRepo(prisma);
  if (!repo) return [];

  const rows = await repo.findMany({
    where: { user_id: userId },
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      release_id: true,
      status: true,
      created_at: true,
      release_title: true,
      artist_name: true,
      release_date: true,
      upc: true,
      email: true,
      admin_comment: true
    }
  }) as Array<{
    id: string;
    release_id: string;
    status: PromoSubmissionStatus;
    created_at: Date;
    release_title: string;
    artist_name: string;
    release_date: Date;
    upc: string;
    email: string;
    admin_comment: string | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    releaseId: row.release_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    releaseTitle: row.release_title,
    artistName: row.artist_name,
    releaseDate: formatDateOnly(row.release_date),
    upc: row.upc,
    email: row.email,
    adminComment: row.admin_comment ?? null
  }));
}

interface PromoSubmissionRow {
  id: string;
  user_id: string;
  release_id: string;
  status: PromoSubmissionStatus;
  email: string;
  partner_name: string;
  artist_name: string;
  artist_country: string;
  release_title: string;
  release_date: Date;
  genre: string;
  release_format: string;
  release_language: string;
  upc: string;
  key_track_title: string;
  has_music_video: boolean;
  video_preview_url: string | null;
  label: string;
  release_description: string;
  artist_photo_url: string;
  listening_link: string;
  promotion_plan: string;
  artist_social_links: string;
  confirmation_accepted: boolean;
  admin_comment: string | null;
  created_at: Date;
  updated_at: Date;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  user?: {
    name: string | null;
    email: string | null;
  } | null;
  reviewer?: {
    name: string | null;
  } | null;
}

function mapSubmissionDetail(row: PromoSubmissionRow): PromoSubmissionDetail {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user?.name ?? "Пользователь",
    userEmail: row.user?.email ?? row.email,
    releaseId: row.release_id,
    releaseTitle: row.release_title,
    releaseDate: formatDateOnly(row.release_date),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedByName: row.reviewer?.name ?? null,
    adminComment: row.admin_comment ?? null,
    email: row.email,
    partnerName: row.partner_name,
    artistName: row.artist_name,
    artistCountry: row.artist_country,
    genre: row.genre,
    releaseFormat: row.release_format,
    releaseLanguage: row.release_language,
    upc: row.upc,
    keyTrackTitle: row.key_track_title,
    hasMusicVideo: Boolean(row.has_music_video),
    videoPreviewUrl: row.video_preview_url ?? null,
    label: row.label,
    releaseDescription: row.release_description,
    artistPhotoUrl: row.artist_photo_url,
    listeningLink: row.listening_link,
    promotionPlan: row.promotion_plan,
    artistSocialLinks: row.artist_social_links,
    confirmationAccepted: Boolean(row.confirmation_accepted)
  };
}

export async function getPromoSubmissionForUser(
  prisma: PrismaClient,
  userId: string,
  submissionId: string
): Promise<PromoSubmissionDetail | null> {
  const repo = getPromoRepo(prisma);
  if (!repo) return null;

  const row = await repo.findFirst({
    where: {
      id: submissionId,
      user_id: userId
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow | null;

  return row ? mapSubmissionDetail(row) : null;
}

export async function createPromoSubmission(params: {
  prisma: PrismaClient;
  userId: string;
  input: PromoSubmissionCreateInput;
}): Promise<PromoSubmissionDetail> {
  const input = promoSubmissionCreateSchema.parse(params.input);
  const repo = ensurePromoRepo(params.prisma);

  const release = await params.prisma.release.findFirst({
    where: {
      id: input.releaseId,
      userId: params.userId
    },
    select: {
      id: true,
      userId: true,
      title: true,
      date: true,
      upc: true,
      genre: true,
      labelName: true,
      performer: true,
      type: true,
      status: true,
      confirmed: true,
      roles: true,
      track: {
        select: {
          title: true,
          focus: true,
          index: true,
          language: true
        }
      }
    }
  });

  if (!release) {
    throw new PromoValidationError("Нельзя отправить на промо чужой релиз.", 403);
  }

  const existing = await repo.findFirst({
    where: {
      user_id: params.userId,
      release_id: input.releaseId
    },
    select: {
      id: true,
      status: true
    }
  });

  const availability = computePromoAvailability({
    releaseDate: release.date,
    alreadySubmitted: Boolean(existing),
    upc: input.upc,
    confirmed: release.confirmed,
    status: release.status,
    roles: release.roles
  });

  if (!availability.isPromoAvailable) {
    throw new PromoValidationError(availability.unavailableReason ?? "Релиз недоступен для промо.");
  }

  const submissionDate = parseDateOnly(input.releaseDate);
  const created = await repo.create({
    data: {
      user_id: params.userId,
      release_id: input.releaseId,
      status: "SUBMITTED",
      email: input.email,
      partner_name: input.partnerName,
      artist_name: input.artistName,
      artist_country: input.artistCountry,
      release_title: input.releaseTitle,
      release_date: submissionDate,
      genre: input.genre,
      release_format: input.releaseFormat,
      release_language: input.releaseLanguage,
      upc: input.upc,
      key_track_title: input.keyTrackTitle,
      has_music_video: input.hasMusicVideo === "YES",
      video_preview_url: input.videoPreviewUrl,
      label: input.label,
      release_description: input.releaseDescription,
      artist_photo_url: input.artistPhotoUrl,
      listening_link: input.listeningLink,
      promotion_plan: input.promotionPlan,
      artist_social_links: input.artistSocialLinks,
      confirmation_accepted: input.confirmationAccepted
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow;

  return mapSubmissionDetail(created);
}

export async function updatePromoSubmissionForUser(params: {
  prisma: PrismaClient;
  userId: string;
  submissionId: string;
  input: PromoSubmissionCreateInput;
}): Promise<PromoSubmissionDetail> {
  const input = promoSubmissionCreateSchema.parse(params.input);
  const repo = ensurePromoRepo(params.prisma);

  const existing = await repo.findFirst({
    where: {
      id: params.submissionId,
      user_id: params.userId
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow | null;

  if (!existing) {
    throw new PromoValidationError("Заявка не найдена.", 404);
  }

  if (!canEditPromoSubmissionStatus(existing.status)) {
    throw new PromoValidationError("Редактирование доступно только для заявок со статусом «Требуются изменения».", 409);
  }

  if (input.releaseId.trim() !== existing.release_id) {
    throw new PromoValidationError("Нельзя сменить релиз для существующей заявки.", 409);
  }

  const submissionDate = parseDateOnly(input.releaseDate);
  const updated = await repo.update({
    where: {
      id: params.submissionId
    },
    data: {
      status: "SUBMITTED",
      email: input.email,
      partner_name: input.partnerName,
      artist_name: input.artistName,
      artist_country: input.artistCountry,
      release_title: input.releaseTitle,
      release_date: submissionDate,
      genre: input.genre,
      release_format: input.releaseFormat,
      release_language: input.releaseLanguage,
      upc: input.upc,
      key_track_title: input.keyTrackTitle,
      has_music_video: input.hasMusicVideo === "YES",
      video_preview_url: input.videoPreviewUrl,
      label: input.label,
      release_description: input.releaseDescription,
      artist_photo_url: input.artistPhotoUrl,
      listening_link: input.listeningLink,
      promotion_plan: input.promotionPlan,
      artist_social_links: input.artistSocialLinks,
      confirmation_accepted: input.confirmationAccepted,
      admin_comment: null,
      reviewed_at: null,
      reviewed_by: null
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow;

  return mapSubmissionDetail(updated);
}

export async function deletePromoSubmissionForUser(params: {
  prisma: PrismaClient;
  userId: string;
  submissionId: string;
}): Promise<{ releaseId: string }> {
  const repo = ensurePromoRepo(params.prisma);
  const existing = await repo.findFirst({
    where: {
      id: params.submissionId,
      user_id: params.userId
    },
    select: {
      id: true,
      release_id: true,
      status: true
    }
  }) as ExistingPromoSubmissionRow | null;

  if (!existing) {
    throw new PromoValidationError("Заявка не найдена.", 404);
  }

  if (!canDeletePromoSubmissionStatus(existing.status)) {
    throw new PromoValidationError("Удаление доступно только для новых или возвращённых заявок.", 409);
  }

  await params.prisma.$executeRaw`DELETE FROM icecream.promo_submissions WHERE id = ${existing.id}::uuid AND user_id = ${params.userId}::uuid`;

  return { releaseId: existing.release_id };
}

export async function listAdminPromoSubmissions(
  prisma: PrismaClient,
  filters: { status?: string | null; query?: string | null }
): Promise<AdminPromoSubmissionListItem[]> {
  const repo = getPromoRepo(prisma);
  if (!repo) return [];

  const status = filters.status?.trim();
  const query = filters.query?.trim();
  const where: Record<string, unknown> = {};

  if (status && promoSubmissionStatuses.includes(status as PromoSubmissionStatus)) {
    where.status = status;
  }

  if (query) {
    where.OR = [
      { artist_name: { contains: query, mode: "insensitive" } },
      { release_title: { contains: query, mode: "insensitive" } },
      { upc: { contains: query, mode: "insensitive" } },
      { email: { contains: query, mode: "insensitive" } },
      { user: { name: { contains: query, mode: "insensitive" } } },
      { user: { email: { contains: query, mode: "insensitive" } } }
    ];
  }

  const rows = await repo.findMany({
    where,
    orderBy: { created_at: "desc" },
    include: {
      user: {
        select: {
          name: true,
          email: true
        }
      }
    }
  }) as Array<PromoSubmissionRow>;

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at.toISOString(),
    userName: row.user?.name ?? "Пользователь",
    userEmail: row.user?.email ?? row.email,
    artistName: row.artist_name,
    releaseTitle: row.release_title,
    releaseDate: formatDateOnly(row.release_date),
    upc: row.upc,
    status: row.status,
    email: row.email
  }));
}

export async function getAdminPromoSubmissionById(
  prisma: PrismaClient,
  submissionId: string
): Promise<PromoSubmissionDetail | null> {
  const repo = getPromoRepo(prisma);
  if (!repo) return null;

  const row = await repo.findFirst({
    where: { id: submissionId },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow | null;
  return row ? mapSubmissionDetail(row) : null;
}

export async function updatePromoSubmissionStatus(params: {
  prisma: PrismaClient;
  submissionId: string;
  adminId: string;
  status: PromoSubmissionStatus;
}): Promise<PromoSubmissionDetail> {
  if (!promoSubmissionStatuses.includes(params.status)) {
    throw new PromoValidationError("Некорректный статус заявки.");
  }

  const repo = ensurePromoRepo(params.prisma);
  const row = await repo.update({
    where: { id: params.submissionId },
    data: {
      status: params.status,
      reviewed_at: new Date(),
      reviewed_by: params.adminId
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow;
  return mapSubmissionDetail(row);
}

export async function updatePromoSubmissionComment(params: {
  prisma: PrismaClient;
  submissionId: string;
  adminId: string;
  adminComment: string;
}): Promise<PromoSubmissionDetail> {
  const repo = ensurePromoRepo(params.prisma);
  const row = await repo.update({
    where: { id: params.submissionId },
    data: {
      admin_comment: params.adminComment.trim() || null,
      reviewed_at: new Date(),
      reviewed_by: params.adminId
    },
    include: {
      user: { select: { name: true, email: true } },
      reviewer: { select: { name: true } }
    }
  }) as PromoSubmissionRow;
  return mapSubmissionDetail(row);
}
