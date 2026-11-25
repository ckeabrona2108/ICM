import { NextResponse } from "next/server";

import { authorizeUserCredentials } from "@/lib/auth";
import { normalizeDeviceId, normalizeDeviceName } from "@/lib/plugin-license";
import { issuePluginSession, pluginErrorResponse, readJsonBody } from "@/lib/plugin-license-service";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** Вход из плагина по почте (или имени) и паролю от аккаунта на сайте. */
export async function POST(request: Request) {
  const limited = enforceRateLimit({ key: `plugins:login:${getRequestIp(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (limited) return limited;

  const body = await readJsonBody(request);
  const deviceId = normalizeDeviceId(body.deviceId);
  if (!deviceId) return NextResponse.json({ error: "The plugin did not send a device ID. Please update the plugin." }, { status: 400 });

  try {
    const user = await authorizeUserCredentials({ email: body.email, password: body.password });
    if (!user) {
      return NextResponse.json(
        { error: "Wrong email or password. Signed up with VK, Telegram or Yandex? Use \"Continue in browser\"." },
        { status: 401 }
      );
    }

    const session = await issuePluginSession(user.id, deviceId, normalizeDeviceName(body.product));
    if (!session) return NextResponse.json({ error: "Account not found." }, { status: 401 });
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return pluginErrorResponse(error);
  }
}
