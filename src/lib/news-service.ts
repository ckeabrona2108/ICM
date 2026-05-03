import { NewsPostStatus, type PrismaClient } from "@prisma/client";

const MAX_COVER_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=\s]+)$/;

export interface AdminNewsPostDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  status: "draft" | "published" | "archived";
  category: string | null;
  is_pinned: boolean;
  published_at: string | null;
  created_by_admin_id: string;
  created_at: string;
  updated_at: string;
}

export interface PublicNewsCardDto {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image: string | null;
  category: string | null;
  is_pinned: boolean;
  published_at: string;
  is_new: boolean;
}

export interface PublicNewsPostDto extends PublicNewsCardDto {
  content: string;
}

export interface UpsertNewsInput {
  title?: string;
  slug?: string;
  excerpt?: string | null;
  content?: string;
  cover_image?: string | null;
  category?: string | null;
  is_pinned?: boolean;
  status?: "draft" | "published" | "archived";
  published_at?: string | null;
}

export class NewsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsValidationError";
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const text = normalizeWhitespace(String(value));
  return text.length > 0 ? text : null;
}

function sanitizePublicContent(content: string): string {
  return content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\u0000/g, "")
    .trim();
}

function mapStatusToApi(status: NewsPostStatus): "draft" | "published" | "archived" {
  if (status === NewsPostStatus.PUBLISHED) return "published";
  if (status === NewsPostStatus.ARCHIVED) return "archived";
  return "draft";
}

function mapApiStatusToDb(status: string | undefined): NewsPostStatus | undefined {
  if (!status) return undefined;
  if (status === "published") return NewsPostStatus.PUBLISHED;
  if (status === "archived") return NewsPostStatus.ARCHIVED;
  if (status === "draft") return NewsPostStatus.DRAFT;
  throw new NewsValidationError("Некорректный status. Ожидается draft/published/archived.");
}

function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `news-${Date.now()}`;
}

async function ensureUniqueSlug(
  prisma: PrismaClient,
  requestedSlug: string,
  excludeId?: string
): Promise<string> {
  const root = slugify(requestedSlug);
  let candidate = root;
  let suffix = 2;

  while (true) {
    const existing = await prisma.newsPost.findUnique({
      where: { slug: candidate },
      select: { id: true }
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return candidate;
    }

    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

function parsePublishedAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new NewsValidationError("Некорректная дата published_at.");
  }
  return date;
}

function resolveCoverImage(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const match = raw.match(IMAGE_DATA_URL_RE);
  if (!match) {
    throw new NewsValidationError(
      "cover_image должен быть data URL изображения jpg/png/webp."
    );
  }

  const base64 = match[2].replace(/\s+/g, "");
  const bytes = Buffer.byteLength(base64, "base64");
  if (bytes <= 0) {
    throw new NewsValidationError("cover_image пустой.");
  }
  if (bytes > MAX_COVER_IMAGE_BYTES) {
    throw new NewsValidationError("cover_image превышает лимит 5MB.");
  }

  return `${raw.slice(0, raw.indexOf(",") + 1)}${base64}`;
}

function requireAdminWritableFields(input: UpsertNewsInput) {
  if (!input.title || !normalizeWhitespace(input.title)) {
    throw new NewsValidationError("title обязателен.");
  }
  if (!input.content || !normalizeWhitespace(input.content)) {
    throw new NewsValidationError("content обязателен.");
  }
}

function mapAdminPost(post: {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  coverImage: string | null;
  status: NewsPostStatus;
  category: string | null;
  isPinned: boolean;
  publishedAt: Date | null;
  createdByAdminId: string;
  createdAt: Date;
  updatedAt: Date;
}): AdminNewsPostDto {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    content: post.content,
    cover_image: post.coverImage,
    status: mapStatusToApi(post.status),
    category: post.category,
    is_pinned: post.isPinned,
    published_at: post.publishedAt ? post.publishedAt.toISOString() : null,
    created_by_admin_id: post.createdByAdminId,
    created_at: post.createdAt.toISOString(),
    updated_at: post.updatedAt.toISOString()
  };
}

function isNewPost(publishedAt: Date): boolean {
  const now = Date.now();
  const diffMs = now - publishedAt.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function mapPublicCard(post: {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage: string | null;
  category: string | null;
  isPinned: boolean;
  publishedAt: Date | null;
  content?: string;
}): PublicNewsCardDto {
  if (!post.publishedAt) {
    throw new NewsValidationError("Published news must have publishedAt");
  }

  return {
    id: post.id,
    title: sanitizePublicContent(post.title),
    slug: post.slug,
    excerpt: post.excerpt ? sanitizePublicContent(post.excerpt) : null,
    cover_image: post.coverImage,
    category: post.category ? sanitizePublicContent(post.category) : null,
    is_pinned: post.isPinned,
    published_at: post.publishedAt.toISOString(),
    is_new: isNewPost(post.publishedAt)
  };
}

export async function listAdminNewsPosts(prisma: PrismaClient): Promise<AdminNewsPostDto[]> {
  const rows = await prisma.newsPost.findMany({
    orderBy: [{ createdAt: "desc" }]
  });

  return rows.map(mapAdminPost);
}

export async function createAdminNewsPost(params: {
  prisma: PrismaClient;
  adminId: string;
  input: UpsertNewsInput;
}): Promise<AdminNewsPostDto> {
  requireAdminWritableFields(params.input);

  const title = normalizeWhitespace(params.input.title as string);
  const slugSource = normalizeOptionalText(params.input.slug) ?? title;
  const slug = await ensureUniqueSlug(params.prisma, slugSource);
  const excerpt = normalizeOptionalText(params.input.excerpt);
  const content = normalizeWhitespace(params.input.content as string);
  const coverImage = resolveCoverImage(params.input.cover_image);
  const category = normalizeOptionalText(params.input.category);
  const isPinned = Boolean(params.input.is_pinned ?? false);
  const requestedStatus = mapApiStatusToDb(params.input.status) ?? NewsPostStatus.DRAFT;
  let publishedAt = parsePublishedAt(params.input.published_at);

  if (requestedStatus === NewsPostStatus.PUBLISHED && !publishedAt) {
    publishedAt = new Date();
  }

  const created = await params.prisma.newsPost.create({
    data: {
      title,
      slug,
      excerpt,
      content,
      coverImage: coverImage ?? null,
      status: requestedStatus,
      category,
      isPinned,
      publishedAt: publishedAt ?? null,
      createdByAdminId: params.adminId
    }
  });

  return mapAdminPost(created);
}

export async function getAdminNewsPostById(
  prisma: PrismaClient,
  id: string
): Promise<AdminNewsPostDto | null> {
  const post = await prisma.newsPost.findUnique({ where: { id } });
  return post ? mapAdminPost(post) : null;
}

export async function updateAdminNewsPost(params: {
  prisma: PrismaClient;
  id: string;
  input: UpsertNewsInput;
}): Promise<AdminNewsPostDto> {
  const existing = await params.prisma.newsPost.findUnique({ where: { id: params.id } });
  if (!existing) {
    throw new NewsValidationError("Новость не найдена.");
  }

  const nextTitle =
    params.input.title !== undefined ? normalizeWhitespace(String(params.input.title)) : existing.title;
  const nextContent =
    params.input.content !== undefined
      ? normalizeWhitespace(String(params.input.content))
      : existing.content;

  if (!nextTitle) {
    throw new NewsValidationError("title обязателен.");
  }
  if (!nextContent) {
    throw new NewsValidationError("content обязателен.");
  }

  const requestedSlugRaw =
    params.input.slug !== undefined
      ? normalizeOptionalText(params.input.slug) ?? nextTitle
      : existing.slug;
  const nextSlug = await ensureUniqueSlug(params.prisma, requestedSlugRaw, existing.id);

  const requestedStatus = mapApiStatusToDb(params.input.status);
  const nextStatus = requestedStatus ?? existing.status;

  const requestedPublishedAt = parsePublishedAt(params.input.published_at);
  let nextPublishedAt =
    requestedPublishedAt === undefined ? existing.publishedAt : requestedPublishedAt;

  if (nextStatus === NewsPostStatus.PUBLISHED && !nextPublishedAt) {
    nextPublishedAt = new Date();
  }

  const updated = await params.prisma.newsPost.update({
    where: { id: existing.id },
    data: {
      title: nextTitle,
      slug: nextSlug,
      excerpt:
        params.input.excerpt !== undefined
          ? normalizeOptionalText(params.input.excerpt)
          : existing.excerpt,
      content: nextContent,
      coverImage:
        params.input.cover_image !== undefined
          ? (resolveCoverImage(params.input.cover_image) ?? null)
          : existing.coverImage,
      category:
        params.input.category !== undefined
          ? normalizeOptionalText(params.input.category)
          : existing.category,
      isPinned:
        params.input.is_pinned !== undefined ? Boolean(params.input.is_pinned) : existing.isPinned,
      status: nextStatus,
      publishedAt: nextPublishedAt
    }
  });

  return mapAdminPost(updated);
}

export async function deleteAdminNewsPost(prisma: PrismaClient, id: string): Promise<boolean> {
  const result = await prisma.newsPost.deleteMany({ where: { id } });
  return result.count > 0;
}

export async function setAdminNewsPostPublished(params: {
  prisma: PrismaClient;
  id: string;
  published: boolean;
}): Promise<AdminNewsPostDto> {
  const existing = await params.prisma.newsPost.findUnique({ where: { id: params.id } });
  if (!existing) throw new NewsValidationError("Новость не найдена.");

  const updated = await params.prisma.newsPost.update({
    where: { id: existing.id },
    data: params.published
      ? {
          status: NewsPostStatus.PUBLISHED,
          publishedAt: existing.publishedAt ?? new Date()
        }
      : {
          status: NewsPostStatus.DRAFT,
          publishedAt: null
        }
  });

  return mapAdminPost(updated);
}

export async function setAdminNewsPostPinned(params: {
  prisma: PrismaClient;
  id: string;
  pinned: boolean;
}): Promise<AdminNewsPostDto> {
  const updated = await params.prisma.newsPost.update({
    where: { id: params.id },
    data: { isPinned: params.pinned }
  });
  return mapAdminPost(updated);
}

export async function archiveAdminNewsPost(prisma: PrismaClient, id: string): Promise<AdminNewsPostDto> {
  const updated = await prisma.newsPost.update({
    where: { id },
    data: { status: NewsPostStatus.ARCHIVED }
  });
  return mapAdminPost(updated);
}

export async function listPublicNews(prisma: PrismaClient): Promise<PublicNewsCardDto[]> {
  const rows = await prisma.newsPost.findMany({
    where: {
      status: NewsPostStatus.PUBLISHED,
      publishedAt: { not: null }
    },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }]
  });

  return rows.map((post) => mapPublicCard(post));
}

export async function getPublicNewsBySlug(
  prisma: PrismaClient,
  slug: string
): Promise<PublicNewsPostDto | null> {
  const post = await prisma.newsPost.findUnique({
    where: { slug }
  });

  if (!post || post.status !== NewsPostStatus.PUBLISHED || !post.publishedAt) {
    return null;
  }

  return {
    ...mapPublicCard(post),
    content: sanitizePublicContent(post.content)
  };
}
