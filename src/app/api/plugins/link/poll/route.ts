import { NextResponse } from "next/server";

import { normalizeLinkCode, pollPluginLink } from "@/lib/plugin-license";
import { issuePluginSession, pluginErrorResponse, readJsonBody } from "@/lib/plugin-license-service";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Плагин раз в пару секунд спрашивает, подтвердил ли пользователь вход на сайте. */
export async function POST(request: Request) {
  const limited = enforceRateLimit({ key: `plugins:poll:${getRequestIp(request)}`, limit: 600, windowMs: 10 * 60_000 });
  if (limited) return limited;

  const body = await readJsonBody(request);
  const code = normalizeLinkCode(body.code);
  if (!code) return NextResponse.json({ status: "expired" });

  const result = pollPluginLink(code, body.pollSecret);
  if (result.status !== "confirmed") {
    return NextResponse.json({ status: result.status }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const session = await issuePluginSession(result.link.userId!, result.link.deviceId, result.link.product);
    if (!session) return NextResponse.json({ status: "expired" });
    return NextResponse.json({ status: "confirmed", ...session }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return pluginErrorResponse(error);
  }
}
