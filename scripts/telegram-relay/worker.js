// Cloudflare Worker that forwards admin notifications to the Telegram Bot API.
// The production server cannot reach api.telegram.org, but it can reach Cloudflare.
// Only POST /bot<token>/sendMessage is forwarded, and only with the right X-Relay-Secret.

const TELEGRAM_API_BASE = "https://api.telegram.org";
const ALLOWED_PATH = /^\/bot\d+:[A-Za-z0-9_-]+\/sendMessage$/;

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || !ALLOWED_PATH.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }
    if (!env.RELAY_SECRET || !timingSafeEqual(request.headers.get("X-Relay-Secret"), env.RELAY_SECRET)) {
      return new Response("Forbidden", { status: 403 });
    }

    const upstream = await fetch(`${TELEGRAM_API_BASE}${url.pathname}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: await request.text()
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/json" }
    });
  }
};
