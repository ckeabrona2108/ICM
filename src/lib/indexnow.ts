import { SITE_URL } from "@/lib/site-metadata";

// IndexNow tells Yandex (and Bing) about new public pages right away instead of waiting for a crawl.
// Turned on by INDEXNOW_KEY; the key is served at /indexnow-key.txt for the search engine to verify.

export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";
const INDEXNOW_ENDPOINT = "https://yandex.com/indexnow";
const INDEXNOW_TIMEOUT_MS = 5000;

export function getIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  // IndexNow keys are 8-128 characters of letters, digits and dashes.
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null;
}

export function buildIndexNowPayload(urls: string[], key: string) {
  const host = new URL(SITE_URL).host;
  const sameHost = [...new Set(urls)].filter((url) => {
    try {
      return new URL(url).host === host;
    } catch {
      return false;
    }
  });
  return {
    host,
    key,
    keyLocation: `${SITE_URL}${INDEXNOW_KEY_PATH}`,
    urlList: sameHost
  };
}

/** Never throws: a failed ping only means the page waits for the regular crawl. */
export async function pingIndexNow(urls: string[]): Promise<void> {
  const key = getIndexNowKey();
  if (!key || process.env.NODE_ENV !== "production") return;
  const payload = buildIndexNowPayload(urls, key);
  if (!payload.urlList.length) return;

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(INDEXNOW_TIMEOUT_MS)
    });
    if (!response.ok && response.status !== 202) {
      console.error("[indexnow] ping rejected", response.status);
    }
  } catch (error) {
    console.error("[indexnow] ping failed", error);
  }
}
