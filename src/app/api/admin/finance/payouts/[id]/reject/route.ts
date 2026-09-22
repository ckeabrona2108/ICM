import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handlePayoutTransition } from "@/lib/payout-transition-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const rejectionReason = typeof body?.reason === "string" ? body.reason : "";
  return handlePayoutTransition({
    session: await getServerSession(authOptions), prisma, id: params.id, status: "REJECTED", rejectionReason
  });
}
