import { randomBytes } from "node:crypto";

// "We miss you" letters for artists who went quiet. Two soft versions: one for those who released
// with us before, one for those who registered and never released. Every letter carries a one-click
// unsubscribe link; unsubscribed artists never get another campaign letter (account mail stays).

export type ComebackCampaign = "comeback-released" | "comeback-first-release";
export const COMEBACK_CAMPAIGNS: readonly ComebackCampaign[] = ["comeback-released", "comeback-first-release"];

export function isComebackCampaign(value: unknown): value is ComebackCampaign {
  return typeof value === "string" && (COMEBACK_CAMPAIGNS as readonly string[]).includes(value);
}

export const SITE_URL = "https://www.icecreammusic.net";

// ---- Unsubscribe links ----------------------------------------------------------------------
// Each sent letter has its own random token stored with the send (email_campaign_sends.token), so
// the link works on the site whatever secrets the sending machine has.

export function newUnsubscribeToken(): string {
  return randomBytes(18).toString("base64url");
}

export function isUnsubscribeTokenShape(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/u.test(value);
}

/** The page with an "Unsubscribe" button, for the link in the letter. */
export function buildUnsubscribeUrl(token: string, baseUrl: string = SITE_URL): string {
  return `${baseUrl}/unsubscribe?t=${encodeURIComponent(token)}`;
}

/** The one-click address mail apps POST to from their own "Unsubscribe" button. */
export function buildOneClickUnsubscribeUrl(token: string, baseUrl: string = SITE_URL): string {
  return `${baseUrl}/api/unsubscribe?t=${encodeURIComponent(token)}`;
}

// ---- Letters --------------------------------------------------------------------------------

interface LetterCopy {
  subject: string;
  paragraphs: string[];
  button: { label: string; path: string };
  closing: string;
}

const LETTERS: Record<ComebackCampaign, LetterCopy> = {
  "comeback-released": {
    subject: "Привет от ICECREAMMUSIC 👋",
    paragraphs: [
      "Привет!",
      "Давно не виделись, решили написать.",
      "Мы немного обновились: отправить релиз теперь быстрее, смарт-ссылки сами находят твои треки на площадках, а выплаты стали ещё надёжнее защищены.",
      "Если пишешь что-то новое, будем рады помочь выпустить. А если просто интересно, как дела у старых релизов, статистика ждёт в кабинете."
    ],
    button: { label: "Заглянуть в кабинет", path: "/dashboard" },
    closing: "Хорошего дня и вдохновения!"
  },
  "comeback-first-release": {
    subject: "Как там твой первый трек? 🎵",
    paragraphs: [
      "Привет!",
      "Ты когда-то заглядывал к нам, но так и не выпустил первый релиз. Ничего страшного, всё ещё впереди.",
      "Если захочешь попробовать: первый сингл можно выпустить бесплатно. Мастер релиза стал проще, а если что-то непонятно, поддержка поможет прямо в кабинете.",
      "Будем рады услышать твою музыку на площадках."
    ],
    button: { label: "Попробовать", path: "/dashboard/releases/new" },
    closing: "Хорошего дня!"
  }
};

export interface ComebackLetter {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

export function buildComebackLetter(
  campaign: ComebackCampaign,
  params: { unsubscribeToken: string; baseUrl?: string }
): ComebackLetter {
  const copy = LETTERS[campaign];
  const baseUrl = params.baseUrl ?? SITE_URL;
  // The campaign mark lets the site analytics see who came back from the letter.
  const buttonUrl = `${baseUrl}${copy.button.path}?utm_source=email&utm_medium=letter&utm_campaign=${campaign}`;
  const unsubscribeUrl = buildUnsubscribeUrl(params.unsubscribeToken, baseUrl);

  const text = [
    ...copy.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    `${copy.button.label}: ${buttonUrl}`,
    "",
    copy.closing,
    "Команда ICECREAMMUSIC",
    "",
    `Не хочешь получать такие письма? Отписаться: ${unsubscribeUrl}`
  ].join("\n");

  const paragraphsHtml = copy.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2330;">${escapeHtml(paragraph)}</p>`)
    .join("");

  const html =
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(copy.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f1fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f1fb;padding:32px 12px;"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;padding:32px 28px;">` +
    `<tr><td>` +
    `<p style="margin:0 0 24px;font-size:13px;font-weight:700;letter-spacing:2px;color:#7b61ff;">ICECREAMMUSIC</p>` +
    paragraphsHtml +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:12px;background:#7b61ff;">` +
    `<a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(copy.button.label)}</a>` +
    `</td></tr></table>` +
    `<p style="margin:0;font-size:16px;line-height:1.6;color:#1f2330;">${escapeHtml(copy.closing)}<br>Команда ICECREAMMUSIC</p>` +
    `</td></tr></table>` +
    `<p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.5;color:#8a8799;text-align:center;">` +
    `Не хочешь получать такие письма? <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8799;">Отписаться</a></p>` +
    `</td></tr></table></body></html>`;

  return {
    subject: copy.subject,
    text,
    html,
    // Mail apps show their own "Unsubscribe" button from these; the POST variant unsubscribes in one click.
    headers: {
      "List-Unsubscribe": `<${buildOneClickUnsubscribeUrl(params.unsubscribeToken, baseUrl)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    }
  };
}
