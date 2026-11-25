import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { startReleasePayment } from "@/lib/release-payment-start";

export const dynamic = "force-dynamic";

function getAppBaseUrl(request: Request): string {
  const configured = process.env.NEXTAUTH_URL?.trim() || process.env.NEXT_PUBLIC_DOMAIN?.trim();
  if (configured) return configured.replace(/\/+$/u, "");
  return new URL(request.url).origin;
}

export async function POST(request: Request, context: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = enforceRateLimit({
    key: `payment:create:${session.user.id}`,
    limit: 10,
    windowMs: 10 * 60_000
  });
  if (limited) return limited;

  const releaseId = context.params.id?.trim();
  if (!releaseId) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 400 });
  }

  const baseUrl = getAppBaseUrl(request);
  const result = await startReleasePayment({
    prisma,
    userId: session.user.id,
    email: session.user.email ?? null,
    releaseId,
    returnUrlFor: (orderId) => `${baseUrl}/dashboard/releases/${releaseId}?pay_order=${orderId}`
  });
  if (result.kind === "already_paid") return NextResponse.json({ ok: true, alreadyPaid: true }, { status: 200 });
  if (result.kind === "error") return NextResponse.json(result.body, { status: result.status });

  return NextResponse.json(
    {
      ok: true,
      orderId: result.orderId,
      providerPaymentId: result.providerPaymentId,
      confirmationUrl: result.confirmationUrl,
      ...(result.reused ? { reused: true } : {})
    },
    { status: 200 }
  );
}
