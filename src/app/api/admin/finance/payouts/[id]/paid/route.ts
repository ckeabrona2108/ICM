import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { handlePayoutTransition } from "@/lib/payout-transition-route";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  return handlePayoutTransition({
    session: await getServerSession(authOptions), prisma, id: params.id, status: "PAID"
  });
}
