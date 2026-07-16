const DEFAULT_SITE_URL = "https://www.icecreammusic.net";

function normalizeSiteUrl(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return DEFAULT_SITE_URL;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return DEFAULT_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_NAME = "ICECREAMMUSIC";
export const SITE_URL = normalizeSiteUrl(
  process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL
);
export const SITE_DESCRIPTION =
  "Дистрибуция музыки на 240+ площадок, аналитика, выплаты, продвижение и AI-инструменты для независимых артистов.";

export function absoluteSiteUrl(path = "/"): string {
  return new URL(path, `${SITE_URL}/`).toString();
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
