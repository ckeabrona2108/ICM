import { NextResponse } from "next/server";

import { normalizeDeviceId, normalizeDeviceName, verifyPluginToken } from "@/lib/plugin-license";
import {
  getUserPasswordFingerprint,
  issuePluginSession,
  pluginErrorResponse,
  readJsonBody
} from "@/lib/plugin-license-service";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Плагин обновляет лицензию своим ключом устройства (при запуске и раз в несколько часов). */
export async function POST(request: Request) {
  const limited = enforceRateLimit({ key: `plugins:license:${getRequestIp(request)}`, limit: 120, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const body = await readJsonBody(request);
  const deviceId = normalizeDeviceId(body.deviceId);
  const signedOut = NextResponse.json({ error: "Please sign in again.", signedOut: true }, { status: 401 });

  try {
    const token = verifyPluginToken(body.token);
    if (!token || !deviceId || token.did !== deviceId) return signedOut;

    // смена пароля на сайте выкидывает плагины на всех устройствах
    const fingerprint = await getUserPasswordFingerprint(token.uid);
    if (!fingerprint || fingerprint !== token.pv) return signedOut;

    const session = await issuePluginSession(token.uid, deviceId, normalizeDeviceName(body.product));
    if (!session) return signedOut;
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return pluginErrorResponse(error);
  }
}
