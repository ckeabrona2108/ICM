import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin-api-auth";
import {
  listArtistCommissionRates,
  parseCommissionPercent,
  rateToPercent,
  readGlobalCommissionRate,
  removeArtistCommissionRate,
  setArtistCommissionRate,
  writeGlobalCommissionRate
} from "@/lib/commission-settings";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function readState() {
  const [globalRate, artists] = await Promise.all([readGlobalCommissionRate(prisma), listArtistCommissionRates(prisma)]);
  return { globalPercent: rateToPercent(globalRate), artists };
}

export async function GET() {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ ok: true, state: await readState() });
}

/** Global rate: { percent } */
export async function PUT(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as { percent?: unknown } | null;
  const parsed = parseCommissionPercent(body?.percent);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  await writeGlobalCommissionRate({ prisma, adminId: auth.session.user.id, rate: parsed.rate });
  return NextResponse.json({ ok: true, state: await readState() });
}

/** Artist's individual rate: { userId, percent, notes? } */
export async function POST(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const body = (await request.json().catch(() => null)) as
    | { userId?: unknown; percent?: unknown; notes?: unknown }
    | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  if (!userId) return NextResponse.json({ error: "Выберите артиста." }, { status: 400 });
  const parsed = parseCommissionPercent(body?.percent);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await setArtistCommissionRate({
      prisma,
      adminId: auth.session.user.id,
      userId,
      rate: parsed.rate,
      notes: typeof body?.notes === "string" ? body.notes : null
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось сохранить ставку." },
      { status: 400 }
    );
  }
  return NextResponse.json({ ok: true, state: await readState() });
}

/** Removes an artist's individual rate: ?userId= */
export async function DELETE(request: Request) {
  const auth = await requireAdminSession();
  if ("error" in auth) return auth.error;

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  await removeArtistCommissionRate({ prisma, adminId: auth.session.user.id, userId });
  return NextResponse.json({ ok: true, state: await readState() });
}
