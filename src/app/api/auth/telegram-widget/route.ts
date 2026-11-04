import { NextResponse } from "next/server";

import { getTelegramLoginConfig } from "@/lib/telegram-login";

// Public settings for the Telegram Login Widget: the browser needs the bot id to open the
// Telegram sign-in popup. The token never leaves the server.
export const dynamic = "force-dynamic";

export async function GET() {
  const config = getTelegramLoginConfig();
  if (!config) return NextResponse.json({ available: false }, { status: 404 });
  return NextResponse.json(
    { available: true, botId: config.botId, botUsername: config.botUsername },
    { headers: { "cache-control": "public, max-age=300" } }
  );
}
