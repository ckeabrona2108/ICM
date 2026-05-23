import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

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

type NewsRow = {
  id: string;
  title: string;
  content: string;
  preview: string;
  createdAt: Date | null;
};

type NewsRepo = {
  findMany: (args?: unknown) => Promise<NewsRow[]>;
  findUnique: (args: unknown) => Promise<NewsRow | null>;
  create: (args: unknown) => Promise<NewsRow>;
  update: (args: unknown) => Promise<NewsRow>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
};

function getNewsRepo(prisma: PrismaClient): NewsRepo {
  const repo = (prisma as unknown as { news?: NewsRepo }).news;
  if (!repo) {
    throw new Error("Prisma model news is unavailable. Run prisma generate for the current schema.");
  }
  return repo;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\u0000/g, "").trim();
}

function normalizeOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = normalizeWhitespace(String(value));
  return text.length > 0 ? text : null;
}

function sanitizePublicContent(content: string): string {
  return content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\u0000/g, "")
    .trim();
}

function slugify(input: string): string {
  const base = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "news";
}

function buildSlug(row: Pick<NewsRow, "id" | "title">): string {
  return `${slugify(row.title)}-${row.id.slice(0, 8)}`;
}

function parseSlugId(slug: string): string | null {
  const normalized = slug.trim();
  const maybeUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if (maybeUuid.test(normalized)) return normalized;
  const suffix = /-([0-9a-f]{8})$/iu.exec(normalized)?.[1];
  return suffix ?? null;
}

function requireWritableFields(input: UpsertNewsInput) {
  if (!input.title || !normalizeWhitespace(input.title)) {
    throw new NewsValidationError("title обязателен.");
  }
  if (!input.content || !normalizeWhitespace(input.content)) {
    throw new NewsValidationError("content обязателен.");
  }
}

function parseNewsDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const raw = normalizeWhitespace(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new NewsValidationError("Некорректная дата published_at.");
  }
  return date;
}

function resolvePreview(input: UpsertNewsInput, fallback = ""): string {
  return (
    normalizeOptionalText(input.excerpt) ??
    normalizeOptionalText(input.cover_image) ??
    normalizeOptionalText(input.category) ??
    fallback
  );
}

function toCreatedAt(row: NewsRow): Date {
  return row.createdAt ?? new Date(0);
}

function mapAdminPost(row: NewsRow): AdminNewsPostDto {
  const createdAt = toCreatedAt(row).toISOString();
  return {
    id: row.id,
    title: row.title,
    slug: buildSlug(row),
    excerpt: row.preview || null,
    content: row.content,
    cover_image: null,
    status: "published",
    category: null,
    is_pinned: false,
    published_at: createdAt,
    created_by_admin_id: "",
    created_at: createdAt,
    updated_at: createdAt
  };
}

function isNewPost(publishedAt: Date): boolean {
  const diffMs = Date.now() - publishedAt.getTime();
  return diffMs >= 0 && diffMs <= 7 * 24 * 60 * 60 * 1000;
}

function mapPublicCard(row: NewsRow): PublicNewsCardDto {
  const publishedAt = toCreatedAt(row);
  return {
    id: row.id,
    title: sanitizePublicContent(row.title),
    slug: buildSlug(row),
    excerpt: row.preview ? sanitizePublicContent(row.preview) : null,
    cover_image: null,
    category: null,
    is_pinned: false,
    published_at: publishedAt.toISOString(),
    is_new: isNewPost(publishedAt)
  };
}

export async function listAdminNewsPosts(prisma: PrismaClient): Promise<AdminNewsPostDto[]> {
  const rows = await getNewsRepo(prisma).findMany({
    orderBy: { createdAt: "desc" }
  });
  return rows.map(mapAdminPost);
}

export async function createAdminNewsPost(params: {
  prisma: PrismaClient;
  adminId: string;
  input: UpsertNewsInput;
}): Promise<AdminNewsPostDto> {
  requireWritableFields(params.input);
  const publishedAt = parseNewsDate(params.input.published_at) ?? new Date();

  const row = await getNewsRepo(params.prisma).create({
    data: {
      id: randomUUID(),
      title: normalizeWhitespace(params.input.title as string),
      content: normalizeWhitespace(params.input.content as string),
      preview: resolvePreview(params.input),
      createdAt: publishedAt
    }
  });

  return mapAdminPost(row);
}

export async function getAdminNewsPostById(
  prisma: PrismaClient,
  id: string
): Promise<AdminNewsPostDto | null> {
  const row = await getNewsRepo(prisma).findUnique({ where: { id } });
  return row ? mapAdminPost(row) : null;
}

export async function updateAdminNewsPost(params: {
  prisma: PrismaClient;
  id: string;
  input: UpsertNewsInput;
}): Promise<AdminNewsPostDto> {
  const repo = getNewsRepo(params.prisma);
  const existing = await repo.findUnique({ where: { id: params.id } });
  if (!existing) {
    throw new NewsValidationError("Новость не найдена.");
  }

  const nextTitle =
    params.input.title !== undefined ? normalizeWhitespace(String(params.input.title)) : existing.title;
  const nextContent =
    params.input.content !== undefined
      ? normalizeWhitespace(String(params.input.content))
      : existing.content;

  if (!nextTitle) throw new NewsValidationError("title обязателен.");
  if (!nextContent) throw new NewsValidationError("content обязателен.");
  const requestedPublishedAt = parseNewsDate(params.input.published_at);

  const row = await repo.update({
    where: { id: existing.id },
    data: {
      title: nextTitle,
      content: nextContent,
      preview:
        params.input.excerpt !== undefined ||
        params.input.cover_image !== undefined ||
        params.input.category !== undefined
          ? resolvePreview(params.input, existing.preview)
          : existing.preview,
      ...(requestedPublishedAt !== undefined
        ? {
            createdAt: requestedPublishedAt ?? existing.createdAt ?? new Date()
          }
        : {})
    }
  });

  return mapAdminPost(row);
}

export async function deleteAdminNewsPost(prisma: PrismaClient, id: string): Promise<boolean> {
  const result = await getNewsRepo(prisma).deleteMany({ where: { id } });
  return result.count > 0;
}

export async function setAdminNewsPostPublished(params: {
  prisma: PrismaClient;
  id: string;
  published: boolean;
}): Promise<AdminNewsPostDto> {
  const item = await getAdminNewsPostById(params.prisma, params.id);
  if (!item) throw new NewsValidationError("Новость не найдена.");
  return item;
}

export async function setAdminNewsPostPinned(params: {
  prisma: PrismaClient;
  id: string;
  pinned: boolean;
}): Promise<AdminNewsPostDto> {
  const item = await getAdminNewsPostById(params.prisma, params.id);
  if (!item) throw new NewsValidationError("Новость не найдена.");
  return item;
}

export async function archiveAdminNewsPost(prisma: PrismaClient, id: string): Promise<AdminNewsPostDto> {
  const item = await getAdminNewsPostById(prisma, id);
  if (!item) throw new NewsValidationError("Новость не найдена.");
  return item;
}

export async function listPublicNews(prisma: PrismaClient): Promise<PublicNewsCardDto[]> {
  const rows = await getNewsRepo(prisma).findMany({
    orderBy: { createdAt: "desc" }
  });
  return rows.map(mapPublicCard);
}

export async function getPublicNewsBySlug(
  prisma: PrismaClient,
  slug: string
): Promise<PublicNewsPostDto | null> {
  const repo = getNewsRepo(prisma);
  const parsed = parseSlugId(slug);
  let row = parsed?.includes("-") ? await repo.findUnique({ where: { id: parsed } }) : null;

  if (!row) {
    const rows = await repo.findMany({ orderBy: { createdAt: "desc" } });
    row = rows.find((item) => item.id.startsWith(parsed ?? "") || buildSlug(item) === slug) ?? null;
  }

  if (!row) return null;

  return {
    ...mapPublicCard(row),
    content: sanitizePublicContent(row.content)
  };
}
