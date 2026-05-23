import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canManageUsers } from "@/lib/admin-user-service";
import { approveContractSignatureByAdmin } from "@/lib/contract-verification";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: Request,
  context: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canManageUsers(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const verificationId = context.params.id?.trim();
  if (!verificationId) {
    return NextResponse.json({ error: "Verification id is required" }, { status: 400 });
  }

  let result;
  try {
    result = await approveContractSignatureByAdmin({
      prisma,
      verificationId,
      adminId: session.user.id
    });
  } catch (error) {
    console.error("[admin:verification:approve] failed", error);
    return NextResponse.json(
      { error: "Не удалось подтвердить верификацию. Проверьте серверные логи." },
      { status: 500 }
    );
  }

  if (!result.ok) {
    if (result.error === "Verification not found") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error === "STATUS_TRANSITION_NOT_ALLOWED") {
      return NextResponse.json(
        { error: "Подтвердить можно только верификацию со статусом «Ожидает проверки»." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: result.error ?? "Не удалось подтвердить верификацию." }, { status: 400 });
  }

  return NextResponse.json(
    {
      ok: true,
      verificationId,
      movedReleaseIds: result.movedReleaseIds ?? []
    },
    { status: 200 }
  );
}
