/**
 * Types and pure helpers for the /guides articles.
 *
 * Text in paragraphs, list items, tips and FAQ answers may contain inline
 * links written as `[link text](/guides/some-slug)`.
 */

export type GuideBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "tip"; title: string; text: string }
  | { type: "cta"; title: string; text: string };

export type GuideCategory = "release" | "prep" | "promo" | "money";

export type Guide = {
  slug: string;
  category: GuideCategory;
  title: string;
  /** <title> and search snippet headline, under ~60 characters. */
  seoTitle: string;
  description: string;
  kicker: string;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  /** Slugs shown first in "Читайте также". */
  related?: string[];
  blocks: GuideBlock[];
  faq: Array<{ q: string; a: string }>;
};

export const GUIDE_CATEGORIES: Array<{ id: GuideCategory; title: string; description: string }> = [
  {
    id: "release",
    title: "Выпуск релиза",
    description: "Как выпустить трек на площадки, оформить фит, кавер и карточку артиста."
  },
  {
    id: "prep",
    title: "Подготовка трека",
    description: "Обложка, мастеринг, коды ISRC и UPC — всё, что проверяют до релиза."
  },
  {
    id: "promo",
    title: "Плейлисты и продвижение",
    description: "Питчинг, подборки площадок, ВКонтакте, Telegram, TikTok и сниппеты."
  },
  {
    id: "money",
    title: "Деньги и права",
    description: "Роялти, налоги, авторские права, лицензии на биты и выбор дистрибьютора."
  }
];

export type GuideInlinePart = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const INLINE_LINK = /\[([^\]]+)\]\((\/[^)\s]*)\)/g;

export function parseGuideInline(text: string): GuideInlinePart[] {
  const parts: GuideInlinePart[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_LINK)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: text.slice(last, index) });
    parts.push({ type: "link", text: match[1], href: match[2] });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** Plain text without link markup, for JSON-LD and other non-HTML output. */
export function stripGuideLinks(text: string): string {
  return text.replace(INLINE_LINK, "$1");
}

/** Every inline link href used anywhere in a guide's body and FAQ. */
export function collectGuideLinks(guide: Guide): string[] {
  const texts: string[] = [];
  for (const block of guide.blocks) {
    if (block.type === "p" || block.type === "tip") texts.push(block.text);
    if (block.type === "list") texts.push(...block.items);
  }
  for (const item of guide.faq) texts.push(item.a);
  return texts.flatMap((text) =>
    parseGuideInline(text).flatMap((part) => (part.type === "link" ? [part.href] : []))
  );
}

/** Explicit related guides first, then the same category, then the rest. */
export function pickRelatedGuides(guide: Guide, all: Guide[], limit = 3): Guide[] {
  const others = all.filter((item) => item.slug !== guide.slug);
  const explicit = (guide.related ?? [])
    .map((slug) => others.find((item) => item.slug === slug))
    .filter((item): item is Guide => Boolean(item));
  const sameCategory = others.filter((item) => item.category === guide.category);
  const ordered = [...explicit, ...sameCategory, ...others];
  return ordered.filter((item, index) => ordered.indexOf(item) === index).slice(0, limit);
}
