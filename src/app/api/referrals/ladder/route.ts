import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { activateLadderReward } from "@/lib/referrals";

export const dynamic = "force-dynamic";

// "Активировать": switches on an earned month of PRO or ENTERPRISE from the ladder.
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({ key: `referrals:ladder:${session.user.id}`, limit: 5, windowMs: 60_000 });
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { step?: number };
  const step = Number(body.step);
  if (!Number.isInteger(step)) return NextResponse.json({ error: "Неверная ступень" }, { status: 400 });
  try {
    const result = await activateLadderReward(prisma, { userId: session.user.id, step });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === "already_active" ? "Этот месяц уже активирован" : "Эта ступень ещё не открыта" },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true, plan: result.plan });
  } catch (error) {
    console.error("[referrals] ladder activation failed", error);
    return NextResponse.json({ error: "Не удалось активировать. Попробуйте ещё раз." }, { status: 500 });
  }
}
