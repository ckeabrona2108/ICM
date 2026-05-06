import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { createContractSignature, validateContractSignerData } from "@/lib/contract-verification";
import { CONTRACT_VERSION } from "@/lib/contract-verification-shared";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  signatureImage: z.string().min(16),
  contractVersion: z.string().trim().min(1).default(CONTRACT_VERSION),
  signerData: z.object({
    fullName: z.string().trim().min(2),
    birthDate: z.string().trim().optional().nullable(),
    passportNumber: z.string().trim().optional().nullable(),
    passportIssuedBy: z.string().trim().optional().nullable(),
    passportCode: z.string().trim().optional().nullable(),
    passportIssueDate: z.string().trim().optional().nullable(),
    address: z.string().trim().optional().nullable(),
    ogrnip: z.string().trim().optional().nullable(),
    inn: z.string().trim().optional().nullable(),
    snils: z.string().trim().optional().nullable(),
    confirmationAccepted: z.boolean()
  })
});

function readIpAddress(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Некорректные данные подписи договора.",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const issues = validateContractSignerData(parsed.data.signerData);
  if (issues.length > 0) {
    return NextResponse.json(
      { error: issues[0]?.message ?? "Проверьте корректность данных договора.", issues },
      { status: 422 }
    );
  }

  const email = session.user.email?.trim();
  if (!email) {
    return NextResponse.json({ error: "Не удалось определить email пользователя." }, { status: 400 });
  }

  try {
    const result = await createContractSignature({
      prisma,
      userId: session.user.id,
      userEmail: email,
      userName: session.user.name ?? null,
      contractVersion: parsed.data.contractVersion || CONTRACT_VERSION,
      signatureImage: parsed.data.signatureImage,
      signerData: parsed.data.signerData,
      ipAddress: readIpAddress(request),
      userAgent: request.headers.get("user-agent")?.trim() || null
    });

    return NextResponse.json({
      success: true,
      status: result.status,
      isVerified: result.isVerified,
      canSubmitReleases: result.canSubmitReleases,
      canCreateRelease: result.canCreateRelease,
      signedAt: result.signedAt,
      contractVersion: result.contractVersion,
      reason: result.reason,
      rejectionReason: result.rejectionReason,
      rejectionKind: result.rejectionKind,
      verificationId: result.verificationId
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подписать договор.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
