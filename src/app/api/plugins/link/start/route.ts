import { NextResponse } from "next/server";

import { normalizeDeviceId, normalizeDeviceName, startPluginLink } from "@/lib/plugin-license";
import { readJsonBody } from "@/lib/plugin-license-service";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SITE_URL = "https://www.icecreammusic.net";

/** Плагин просит вход через браузер: получает код и ссылку, которую откроет у пользователя. */
export async function POST(request: Request) {
  const limited = enforceRateLimit({ key: `plugins:link:${getRequestIp(request)}`, limit: 30, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const body = await readJsonBody(request);
  const deviceId = normalizeDeviceId(body.deviceId);
  if (!deviceId) return NextResponse.json({ error: "The plugin did not send a device ID. Please update the plugin." }, { status: 400 });

  try {
    const link = startPluginLink({
      deviceId,
      deviceName: normalizeDeviceName(body.deviceName),
      product: normalizeDeviceName(body.product)
    });
    const origin = process.env.NODE_ENV === "production" ? SITE_URL : new URL(request.url).origin;
    return NextResponse.json(
      {
        code: link.code,
        pollSecret: link.pollSecret,
        url: `${origin}/plugins/connect?code=${encodeURIComponent(link.code)}`,
        expiresIn: Math.round((link.expiresAt - Date.now()) / 1000)
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ error: "The server is busy. Please try again in a minute." }, { status: 503 });
  }
}
