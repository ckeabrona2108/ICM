import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { markUserReportAsAgreed, markUserReportAsRejected } from "@/lib/report-service";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const financeReportAgreementSchema = z.object({
  reportId: z.string().trim().min(1),
  decision: z.enum(["agree", "reject"]).optional().default("agree"),
  comment: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = financeReportAgreementSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректный запрос." },
      { status: 400 }
    );
  }

  const result =
    parsed.data.decision === "reject"
      ? await markUserReportAsRejected({
          prisma,
          reportId: parsed.data.reportId,
          userId: session.user.id,
          userComment: parsed.data.comment
        })
      : await markUserReportAsAgreed({
          prisma,
          reportId: parsed.data.reportId,
          userId: session.user.id
        });

  if (!result.ok) {
    const status = result.error === "Report not found" ? 404 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(
    {
      ok: true,
      reportId: parsed.data.reportId,
      nextStatus: parsed.data.decision === "reject" ? "changes_requested" : "agreed",
      message:
        parsed.data.decision === "reject"
          ? "Отчет отправлен администратору на доработку."
          : "Отчет согласован, баланс обновлен."
    },
    { status: 200 }
  );
}

export async function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
