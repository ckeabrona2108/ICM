import { FinanceReportStatus } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import type {
  FinanceReportAgreementRequest,
  FinanceReportAgreementResponse
} from "@/lib/api/contracts";
import { prisma } from "@/lib/prisma";
import { isPrismaTableMissingError } from "@/lib/prisma-errors";

const agreeReportSchema = z.object({
  reportId: z.string().trim().min(1)
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = agreeReportSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }

  const body: FinanceReportAgreementRequest = parsed.data;

  let report;
  try {
    report = await prisma.financeReport.findFirst({
      where: {
        id: body.reportId,
        userId: session.user.id
      },
      select: { id: true, status: true }
    });
  } catch (error) {
    if (isPrismaTableMissingError(error, "FinanceReport")) {
      return NextResponse.json(
        { error: "Finance module is not initialized. Apply database migrations." },
        { status: 503 }
      );
    }
    throw error;
  }

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  if (report.status === FinanceReportStatus.AGREED) {
    const response: FinanceReportAgreementResponse = {
      ok: true,
      reportId: body.reportId,
      nextStatus: "agreed"
    };
    return NextResponse.json(response, { status: 200 });
  }

  try {
    await prisma.financeReport.update({
      where: { id: body.reportId },
      data: {
        status: FinanceReportStatus.AGREED,
        agreedAt: new Date()
      }
    });
  } catch (error) {
    if (isPrismaTableMissingError(error, "FinanceReport")) {
      return NextResponse.json(
        { error: "Finance module is not initialized. Apply database migrations." },
        { status: 503 }
      );
    }
    throw error;
  }

  const response: FinanceReportAgreementResponse = {
    ok: true,
    reportId: body.reportId,
    nextStatus: "agreed"
  };

  return NextResponse.json(response, { status: 200 });
}
