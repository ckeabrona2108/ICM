import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { confirmPluginLink, getPluginLink, normalizeLinkCode } from "@/lib/plugin-license";
import { readJsonBody } from "@/lib/plugin-license-service";

export const dynamic = "force-dynamic";

/** Сведения о заявке для страницы подтверждения (какое устройство просит вход). */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const code = normalizeLinkCode(new URL(request.url).searchParams.get("code"));
  const link = code ? getPluginLink(code) : null;
  if (!link) return NextResponse.json({ error: "Код устарел. Нажмите «Continue in browser» в плагине ещё раз." }, { status: 404 });

  return NextResponse.json({
    code: link.code,
    deviceName: link.deviceName,
    product: link.product,
    confirmed: link.userId === session.user.id
  });
}

/** Пользователь, вошедший на сайте, подтверждает вход в плагине. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(request);
  const code = normalizeLinkCode(body.code);
  const link = code ? confirmPluginLink(code, session.user.id) : null;
  if (!link) return NextResponse.json({ error: "Код устарел. Нажмите «Continue in browser» в плагине ещё раз." }, { status: 404 });

  return NextResponse.json({ ok: true });
}
