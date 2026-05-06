import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import type { ContractStatusPayload } from "@/lib/contract-verification-shared";
import { getUserContractStatus } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await Promise.race([
    getUserContractStatus({
      prisma,
      userId: session.user.id
    }),
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            status: "not_signed",
            signed: false,
            isVerified: false,
            canSubmitReleases: false,
            canCreateRelease: false,
            signedAt: null,
            contractVersion: null,
            reason: "Для выпуска релизов необходимо пройти верификацию и подписать договор.",
            rejectionReason: null,
            rejectionKind: null,
            verificationId: null
          } satisfies ContractStatusPayload),
        4500
      )
    )
  ]);

  return NextResponse.json(status);
}
